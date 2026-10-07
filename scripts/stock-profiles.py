"""종목별 가격 행동 특성('종목 특성') — 코드 계산. 사용자 요청(2026-10-06): "상한가 자주 발생, 상승 후 반전, 상승 지속형 등".

입력: data/analyses-backup.json의 종목(code, market) 또는 --tickers. 일봉은 yfinance 2년(OHLCV, 분할 보정 종가).
출력: data/technical/profiles.json — items[code] = { name, market, symbol, as_of, bars, labels[], metrics{}, notes[] }
원칙: 숫자와 유형은 코드만 만든다. 과거 통계이며 예측·매수·매도 판단이 아니다.
      유형 경계값(THRESHOLDS)은 임시값(2026-10-06)이고, 표본이 적으면 유형을 붙이지 않는다(미확인).
사용: python3 scripts/stock-profiles.py [--tickers 005930,NVDA] [--out data/technical/profiles.json]
      python3 scripts/stock-profiles.py --selftest   (네트워크 없이 가짜 일봉으로 검사)
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
OUT = ROOT / "data" / "technical" / "profiles.json"
_spec = importlib.util.spec_from_file_location("technical_indicators", HERE / "technical-indicators.py")
ti = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ti)  # candidate_symbols·market_of_symbol·drop_unfinished_session·load_targets·merge_into 재사용

SURGE = 0.10          # 급등일: 종가 +10% 이상
CRASH = -0.10         # 급락일
LIMIT_UP = 0.295      # 국장 상한가 근사(가격제한폭 ±30%, 호가 단위 미적용)
KR = ("kospi", "kosdaq")
MIN_BARS = 120        # 이보다 짧으면 미확인
YEAR = 252
MIN_SURGES = 5        # 급등 뒤 행동 유형을 붙이는 최소 표본
THRESHOLDS = {  # 임시값. 1차(2026-10-06) 36종목 결과를 보고 2차 조정: 한 유형이 절반 넘게 붙지 않도록. 카드 설명에도 그대로 쓴다
    "급등 빈발형": "급등일(+10% 이상 마감) 연 6회 이상",
    "상한가 빈발형": "국장, 2년간 상한가(+29.5% 이상) 2회 이상",
    "급등 후 반전형": "급등 뒤 5거래일 수익률이 플러스인 비율 40% 미만(표본 5회 이상)",
    "급등 지속형": "급등 뒤 5거래일 수익률이 플러스인 비율 60% 이상(표본 5회 이상)",
    "추세 지속형": "최근 1년 60일선 위 70% 이상이고 1년 수익률 플러스",
    "하락 추세형": "최근 1년 60일선 위 30% 이하이고 1년 수익률 마이너스",
    "박스권형": "추세 유형이 아니면서 1년 수익률 ±15% 안, 60일선 위 비율 35~65%",
    "되돌림형": "하루 수익률 자기상관 -0.13 이하(전날 오르면 다음 날 내리는 경향, 1년치 기준 2σ)",
    "고변동형": "연환산 변동성 70% 이상(하루 평균 ±4.4% 수준)",
    "저변동형": "연환산 변동성 25% 이하",
    "거래량 동반 상승형": "거래량 20일 평균 3배 이상 급증일 연 6회 이상이고 그날 상승 비율 75% 이상",
    "윗꼬리 빈발형": "윗꼬리가 몸통의 2배 이상(종가의 2% 이상)인 날 18% 이상 — 장중 되밀림",
}
# 카드에 보일 대표 유형(사용자 결정 2026-10-07: 태그는 2개 이내). 추세 묶음 → 변동성 묶음 → 나머지는 원래 순서로 채운다
TREND_LABELS = ("추세 지속형", "하락 추세형", "박스권형")
VOL_LABELS = ("고변동형", "저변동형")
MAIN_MAX = 2


def main_labels(labels: list[str]) -> list[str]:
    picked = [x for x in labels if x in TREND_LABELS] + [x for x in labels if x in VOL_LABELS]
    picked += [x for x in labels if x not in picked]
    return picked[:MAIN_MAX]


def _f(x, digits=1, sign=True, suffix="%"):
    if x is None or (isinstance(x, float) and np.isnan(x)):
        return "미확인"
    return f"{x:+.{digits}f}{suffix}" if sign else f"{x:.{digits}f}{suffix}"


def _val(x, digits=2):
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), digits)


def longest_up_streak(r: pd.Series) -> int:
    best = cur = 0
    for up in (r > 0).to_numpy():
        cur = cur + 1 if up else 0
        best = max(best, cur)
    return int(best)


def profile(df: pd.DataFrame, market: str) -> dict:
    """OHLCV 일봉(날짜 오름차순) → bars·labels·metrics·notes. 숫자만 계산하고 판단(권유)은 넣지 않는다."""
    df = df.dropna(subset=["Close"])
    n = len(df)
    if n < MIN_BARS:
        return {"bars": n, "labels": [], "main_labels": [], "metrics": {}, "notes": [f"미확인 — 일봉 {n}개로 이력 부족(최소 {MIN_BARS}개)"]}
    c, o, h, lo, v = (df[k].astype(float) for k in ("Close", "Open", "High", "Low", "Volume"))
    r = c.pct_change()
    ry = r.tail(YEAR)
    years = n / YEAR

    # ① 급등·상한가 빈도 (2년 전체)
    surge_idx = np.flatnonzero((r >= SURGE).to_numpy())
    surge_days = int(len(surge_idx))
    crash_days = int((r <= CRASH).sum())
    limit_up = int((r >= LIMIT_UP).sum()) if market in KR else None
    limit_down = int((r <= -LIMIT_UP).sum()) if market in KR else None

    # ② 급등 뒤 행동: 급등일 종가 → 5·20거래일 뒤
    f5 = np.array([c.iloc[i + 5] / c.iloc[i] - 1 for i in surge_idx if i + 5 < n])
    f20 = np.array([c.iloc[i + 20] / c.iloc[i] - 1 for i in surge_idx if i + 20 < n])
    after_n = int(len(f5))
    after5_mean = float(f5.mean() * 100) if after_n else None
    after5_pos = float((f5 > 0).mean()) if after_n else None
    after20_mean = float(f20.mean() * 100) if len(f20) else None
    after20_pos = float((f20 > 0).mean()) if len(f20) else None

    # ③ 추세 지속성 (최근 1년)
    ma60 = c.rolling(60, min_periods=60).mean()
    above60 = (c > ma60).where(ma60.notna()).tail(YEAR).dropna()
    above60_pct = float(above60.mean()) if len(above60) >= 60 else None
    sign = np.sign((c - ma60).dropna().tail(YEAR))
    cross60 = int((sign.diff().abs() > 0).sum()) if len(sign) >= 60 else None
    ac1 = float(ry.autocorr(1)) if ry.notna().sum() >= 60 else None
    base_i = n - 1 - YEAR if n > YEAR else 0
    ret_1y = float((c.iloc[-1] / c.iloc[base_i] - 1) * 100)
    up_streak = longest_up_streak(r)

    # ④ 변동성 (최근 1년)
    vol_annual = float(ry.std() * np.sqrt(YEAR) * 100)
    cy = c.tail(YEAR)
    mdd = float((cy / cy.cummax() - 1).min() * 100)
    gaps = (o / c.shift(1) - 1).abs().tail(YEAR)
    gap_pct = float((gaps >= 0.03).mean())

    # ⑤ 거래량 (최근 1년)
    v20 = v.shift(1).rolling(20, min_periods=20).mean()
    spike = ((v >= 3 * v20) & v20.notna()).tail(YEAR)
    spike_days = int(spike.sum())
    spike_up = float((ry[spike.reindex(ry.index, fill_value=False)] > 0).mean()) if spike_days else None

    # ⑥ 캔들 (최근 1년)
    body = (c - o).abs()
    upper = h - np.maximum(o, c)
    shadow = ((upper >= 2 * body) & (upper / c >= 0.02)).tail(YEAR)
    upper_pct = float(shadow.mean())
    rng = h - lo
    close_pos = float(((c - lo) / rng.where(rng > 0)).tail(YEAR).mean())
    pos_r = ry[ry > 0]
    top5_share = float(pos_r.nlargest(5).sum() / pos_r.sum() * 100) if pos_r.sum() > 0 else None

    metrics = {
        "years": round(years, 2), "surge_days": surge_days, "surge_per_year": round(surge_days / years, 1),
        "crash_days": crash_days, "limit_up_days": limit_up, "limit_down_days": limit_down,
        "after_surge_n": after_n, "after_surge_5d_mean_pct": _val(after5_mean), "after_surge_5d_pos_rate": _val(after5_pos),
        "after_surge_20d_mean_pct": _val(after20_mean), "after_surge_20d_pos_rate": _val(after20_pos),
        "above_ma60_pct_1y": _val(above60_pct), "ma60_cross_count_1y": cross60, "autocorr_1d_1y": _val(ac1),
        "ret_1y_pct": _val(ret_1y), "longest_up_streak": up_streak,
        "vol_annual_pct_1y": _val(vol_annual), "max_drawdown_1y_pct": _val(mdd), "gap3_days_rate_1y": _val(gap_pct),
        "volume_spike_days_1y": spike_days, "volume_spike_up_rate": _val(spike_up),
        "upper_shadow_days_rate_1y": _val(upper_pct), "close_position_mean_1y": _val(close_pos),
        "top5_gain_share_pct_1y": _val(top5_share),
    }

    labels = []
    if surge_days / years >= 6:
        labels.append("급등 빈발형")
    if limit_up is not None and limit_up >= 2:
        labels.append("상한가 빈발형")
    if after_n >= MIN_SURGES and after5_pos is not None:
        if after5_pos < 0.40:
            labels.append("급등 후 반전형")
        elif after5_pos >= 0.60:
            labels.append("급등 지속형")
    if above60_pct is not None:  # 추세 묶음은 하나만: 지속 > 하락 > 박스권
        if above60_pct >= 0.70 and ret_1y > 0:
            labels.append("추세 지속형")
        elif above60_pct <= 0.30 and ret_1y < 0:
            labels.append("하락 추세형")
        elif abs(ret_1y) < 15 and 0.35 <= above60_pct <= 0.65:
            labels.append("박스권형")
    if ac1 is not None and ac1 <= -0.13:
        labels.append("되돌림형")
    if vol_annual >= 70:
        labels.append("고변동형")
    elif vol_annual <= 25:
        labels.append("저변동형")
    if spike_days >= 6 and spike_up is not None and spike_up >= 0.75:
        labels.append("거래량 동반 상승형")
    if upper_pct >= 0.18:
        labels.append("윗꼬리 빈발형")

    surge_note = f"2년 급등일(+10%↑) {surge_days}회(연 {surge_days / years:.1f}회), 급락일(−10%↓) {crash_days}회"
    if limit_up is not None:
        surge_note += f", 상한가 {limit_up}회·하한가 {limit_down}회"
    after_note = (f"급등 뒤 5거래일 평균 {_f(after5_mean)}, 플러스 비율 {after5_pos * 100:.0f}% · 20거래일 평균 {_f(after20_mean)} (표본 {after_n}회)"
                  if after_n else "급등 뒤 행동: 표본 없음(2년간 +10% 마감일 없음)")
    notes = [
        surge_note, after_note,
        f"최근 1년 60일선 위 {_f(above60_pct * 100 if above60_pct is not None else None, 0, False)}(교차 {cross60 if cross60 is not None else '미확인'}회), "
        f"1년 수익률 {_f(ret_1y)}, 하루 수익률 자기상관 {_f(ac1, 2, True, '')}, 최장 연속 상승 {up_streak}일",
        f"연환산 변동성 {vol_annual:.0f}%, 1년 최대 낙폭 {mdd:.1f}%, 3%↑ 갭 발생일 {gap_pct * 100:.0f}%",
        f"거래량 3배↑ 급증일 {spike_days}회" + (f", 그날 상승 {spike_up * 100:.0f}%" if spike_up is not None else ""),
        f"윗꼬리 긴 날 {upper_pct * 100:.0f}%, 종가의 일중 위치 평균 {close_pos:.2f}(0 저가~1 고가)"
        + (f", 상승분의 상위 5일 집중도 {top5_share:.0f}%" if top5_share is not None else ""),
    ]
    return {"bars": n, "labels": labels, "main_labels": main_labels(labels), "metrics": metrics, "notes": notes}


def fetch_ohlcv(targets: list[dict], period: str = "2y") -> dict[str, tuple[pd.DataFrame, str]]:
    import yfinance as yf

    cands = {t["code"]: ti.candidate_symbols(t["code"], t["market"]) for t in targets}
    symbols = sorted({s for c in cands.values() for s in c})
    if not symbols:
        return {}
    raw = yf.download(symbols, period=period, auto_adjust=False, group_by="ticker", threads=True, progress=False,
                      multi_level_index=True)
    out = {}
    for code, syms in cands.items():
        for sym in syms:
            try:
                df = raw[sym] if isinstance(raw.columns, pd.MultiIndex) else raw
            except KeyError:
                continue
            df = df[["Open", "High", "Low", "Close", "Volume"]].dropna(subset=["Close"])
            if df.empty:
                continue
            df.index = pd.DatetimeIndex(df.index).tz_localize(None).normalize()
            out[code] = (df, sym)
            break
    return out


def build(targets: list[dict], frames: dict[str, tuple[pd.DataFrame, str]], now: datetime | None = None) -> dict:
    items, failed = {}, []
    for t in targets:
        got = frames.get(t["code"])
        if got is None:
            failed.append(t["code"])
            continue
        df, sym = got
        market = ti.market_of_symbol(sym) if sym.endswith((".KS", ".KQ")) else (t["market"] if t["market"] != "auto" else "us")
        df = ti.drop_unfinished_session(df, market, now)
        if df.empty:
            failed.append(t["code"])
            continue
        items[t["code"]] = {"name": t["name"], "market": market, "symbol": sym, "as_of": df.index[-1].strftime("%Y-%m-%d"),
                            "window": "2y", **profile(df, market)}
    stamp = (now or datetime.now(timezone.utc)).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {"generated_at": stamp, "source": "yfinance 일봉 2년(분할 보정), 코드 계산 — 과거 통계이며 예측·매수·매도 판단 아님",
            "failed": failed, "items": items}


def make_ohlcv(closes, volume=None, start="2024-01-01") -> pd.DataFrame:
    """자체 검사용 가짜 일봉: 시가 = 전날 종가, 고가·저가 = 시가·종가의 ±0.5%."""
    c = pd.Series(np.asarray(closes, dtype=float), index=pd.bdate_range(start, periods=len(closes)))
    o = c.shift(1).fillna(c.iloc[0])
    hi, lo = np.maximum(o, c) * 1.005, np.minimum(o, c) * 0.995
    vol = pd.Series(volume if volume is not None else 1e6, index=c.index, dtype=float)
    return pd.DataFrame({"Open": o, "High": hi, "Low": lo, "Close": c, "Volume": vol})


def selftest() -> int:
    rng = np.random.default_rng(11)
    # A. 40일마다 +12% 급등 뒤 5일간 -3%씩 되돌림 → 급등 빈발 + 급등 후 반전
    a = [100.0]
    for i in range(1, 500):
        k = i % 40
        step = 0.12 if k == 0 else (-0.03 if 1 <= k <= 5 else rng.normal(0.0, 0.004))
        a.append(a[-1] * (1 + step))
    pa = profile(make_ohlcv(a), "us")
    assert {"급등 빈발형", "급등 후 반전형"} <= set(pa["labels"]), pa["labels"]
    assert pa["metrics"]["surge_days"] == 12 and pa["metrics"]["limit_up_days"] is None
    assert pa["metrics"]["after_surge_5d_pos_rate"] == 0.0
    # B. 하루 +0.08% 꾸준한 상승, 잡음 0.3% → 추세 지속 + 저변동
    b = 100 * np.cumprod(1 + 0.0008 + rng.normal(0, 0.003, 500))
    pb = profile(make_ohlcv(b), "us")
    assert {"추세 지속형", "저변동형"} <= set(pb["labels"]), pb["labels"]
    assert "급등 빈발형" not in pb["labels"] and pb["metrics"]["ret_1y_pct"] > 0
    # C. 국장: 평탄한데 상한가 2번 → 상한가 빈발형(급등 빈발형은 아님: 연 1회)
    cc = [50.0] * 500
    for i in (200, 400):
        cc[i:] = [x * 1.30 for x in cc[i:]]
    cc = [x * (1 + e) for x, e in zip(cc, rng.normal(0, 0.002, 500))]
    pc = profile(make_ohlcv(cc), "kosdaq")
    assert "상한가 빈발형" in pc["labels"] and "급등 빈발형" not in pc["labels"], pc["labels"]
    assert pc["metrics"]["limit_up_days"] == 2 and pc["metrics"]["after_surge_n"] == 2  # 표본 2회라 급등 뒤 유형은 안 붙음
    assert not ({"급등 후 반전형", "급등 지속형"} & set(pc["labels"]))
    # D. 이력 부족 → 유형 없음, 미확인
    pd_ = profile(make_ohlcv([10.0 + 0.1 * i for i in range(50)]), "us")
    assert pd_["labels"] == [] and pd_["metrics"] == {} and "미확인" in pd_["notes"][0]
    # E. 거래량 급증일이 모두 상승일 → 거래량 동반 상승형
    e = [100.0]
    vol = []
    for i in range(1, 400):
        boom = i % 30 == 0
        e.append(e[-1] * (1 + (0.04 if boom else rng.normal(0, 0.005))))
        vol.append(5e6 if boom else 1e6)
    pe = profile(make_ohlcv(e, [1e6] + vol), "us")
    assert "거래량 동반 상승형" in pe["labels"], pe["labels"]
    # F. 80일 주기 사인파(±10%) → 박스권형만, 추세 유형과 겹치지 않음
    f = 100 + 10 * np.sin(np.arange(500) * 2 * np.pi / 80) + rng.normal(0, 0.05, 500)
    pf = profile(make_ohlcv(f), "us")
    assert "박스권형" in pf["labels"] and not ({"추세 지속형", "하락 추세형"} & set(pf["labels"])), pf["labels"]
    # notes는 모두 문자열이고 권유 표현이 없다
    for p in (pa, pb, pc, pe, pf):
        assert all(isinstance(x, str) for x in p["notes"]) and not any(("매수" in x or "매도" in x) for x in p["notes"])
    built = build([{"code": "AAA", "name": "a", "market": "us"}, {"code": "ZZZ", "name": "z", "market": "us"}],
                  {"AAA": (make_ohlcv(b), "AAA")}, datetime(2026, 10, 6, 12, 0, tzinfo=timezone.utc))
    assert built["failed"] == ["ZZZ"] and built["items"]["AAA"]["as_of"] and built["items"]["AAA"]["labels"]
    assert main_labels(["급등 빈발형", "급등 지속형", "추세 지속형", "고변동형"]) == ["추세 지속형", "고변동형"]
    assert main_labels(["급등 빈발형", "고변동형"]) == ["고변동형", "급등 빈발형"] and main_labels([]) == []
    assert built["items"]["AAA"]["main_labels"] == main_labels(built["items"]["AAA"]["labels"])
    print("selftest ok")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tickers", default="all", help="종목코드/티커 쉼표 구분, 또는 all")
    ap.add_argument("--out", default=str(OUT))
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        return selftest()
    targets = ti.load_targets(args.tickers)
    if not targets:
        print("대상 종목 없음", file=sys.stderr)
        return 1
    fresh = build(targets, fetch_ohlcv(targets))
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    merged = ti.merge_into(out_path, fresh)
    merged["thresholds"] = THRESHOLDS
    for it in merged["items"].values():  # 예전 실행에서 남은 종목도 대표 유형을 맞춘다
        it["main_labels"] = main_labels(it.get("labels", []))
    out_path.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    labeled = sum(1 for it in fresh["items"].values() if it["labels"])
    print(f"계산 {len(fresh['items'])}종목(유형 붙은 종목 {labeled}), 실패 {len(fresh['failed'])}종목 {fresh['failed']} → {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
