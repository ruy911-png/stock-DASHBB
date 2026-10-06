"""종목분석 '기술적분석' 섹션용 지표를 코드로 계산한다 — 사용자 결정(2026-10-05): 자동 재분석에는 차트가 없으니 숫자는 코드가 만든다.

입력: data/analyses-backup.json의 종목(code, market), 또는 --tickers로 일부만
일봉: yfinance(비공식). 미국 = 티커 그대로('.' → '-'), 국장 = 종목코드.KS(코스피)/.KQ(코스닥). 분할 보정 종가
출력: data/technical/latest.json — 종목별 종가·전일 대비·이동평균 5/20/60/120·RSI(14)·거래량·52주 고저·기간 수익률
      숫자와 그 숫자에서 바로 나오는 배열 상태만 담고, 판단(매수·매도)은 넣지 않는다.
사용: python3 scripts/technical-indicators.py [--tickers 005930,SCHW] [--out data/technical/latest.json]
      python3 scripts/technical-indicators.py --selftest   (네트워크 없이 가짜 일봉으로 계산 검사)
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
BACKUP = ROOT / "data" / "analyses-backup.json"
OUT = ROOT / "data" / "technical" / "latest.json"
MARKET_TZ = {"us": ("America/New_York", 17), "kospi": ("Asia/Seoul", 16), "kosdaq": ("Asia/Seoul", 16)}  # 장 마감 뒤 시각(여유 포함)
MA_WINDOWS = (5, 20, 60, 120)


def candidate_symbols(code: str, market: str) -> list[str]:
    """야후 심볼 후보. 목록의 국장 종목은 적힌 시장을 먼저, 다른 쪽을 예비로 본다(코스닥→코스피 이전 상장 대비).
    market이 'auto'(목록에 없는 신규 종목)면 6자리 숫자는 코스피→코스닥 순으로, 그 외는 미국으로 본다."""
    code = str(code).strip()
    if market == "us":
        return [code.replace(".", "-")]
    if market in ("kospi", "kosdaq"):
        first, second = (".KS", ".KQ") if market == "kospi" else (".KQ", ".KS")
        return [f"{code}{first}", f"{code}{second}"]
    if market == "auto":
        return [f"{code}.KS", f"{code}.KQ"] if code.isdigit() and len(code) == 6 else [code.replace(".", "-")]
    return []  # etc: 어느 거래소인지 몰라 조회하지 않는다


def yahoo_symbol(code: str, market: str) -> str | None:
    c = candidate_symbols(code, market)
    return c[0] if c else None


def market_of_symbol(symbol: str) -> str:
    return "kospi" if symbol.endswith(".KS") else "kosdaq" if symbol.endswith(".KQ") else "us"


def sma(s: pd.Series, n: int) -> pd.Series:
    return s.rolling(n, min_periods=n).mean()


def rsi(close: pd.Series, n: int = 14) -> pd.Series:
    """Wilder RSI: 첫 평균은 n개 변화의 단순평균, 이후 (이전×(n−1) + 오늘) ÷ n."""
    c = close.to_numpy(float)
    out = np.full(len(c), np.nan)
    if len(c) <= n:
        return pd.Series(out, index=close.index)
    d = np.diff(c)
    gain, loss = np.where(d > 0, d, 0.0), np.where(d < 0, -d, 0.0)
    ag, al = gain[:n].mean(), loss[:n].mean()

    def value(g, lo):
        if lo == 0:
            return 50.0 if g == 0 else 100.0
        return 100.0 - 100.0 / (1.0 + g / lo)

    out[n] = value(ag, al)
    for i in range(n + 1, len(c)):
        ag = (ag * (n - 1) + gain[i - 1]) / n
        al = (al * (n - 1) + loss[i - 1]) / n
        out[i] = value(ag, al)
    return pd.Series(out, index=close.index)


def drop_unfinished_session(df: pd.DataFrame, market: str, now: datetime | None = None) -> pd.DataFrame:
    """그 시장의 장 마감 전에 받은 '오늘' 행은 장중 가격이라 뺀다(종가 기준)."""
    tz, close_hour = MARKET_TZ.get(market, ("UTC", 24))
    now = now or datetime.now(ZoneInfo(tz))
    now = now.astimezone(ZoneInfo(tz))
    if len(df) and df.index[-1].date() == now.date() and now.hour < close_hour:
        return df.iloc[:-1]
    return df


def _r(x, digits=2):
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), digits)


def _pct(a, b):
    return None if a is None or b is None or b == 0 or np.isnan(a) or np.isnan(b) else round((a / b - 1.0) * 100.0, 2)


def summarize(df: pd.DataFrame) -> dict:
    """일봉(Close·Volume, 날짜 오름차순) → 지표 사전. 값이 안 나오면 None(미확인)."""
    close, vol = df["Close"].astype(float), df["Volume"].astype(float)
    last = float(close.iloc[-1])
    mas = {n: float(sma(close, n).iloc[-1]) if len(close) >= n else np.nan for n in MA_WINDOWS}
    ma_vals = [mas[n] for n in MA_WINDOWS]
    if all(not np.isnan(v) for v in ma_vals):
        order = "정배열(5>20>60>120)" if ma_vals == sorted(ma_vals, reverse=True) else (
            "역배열(5<20<60<120)" if ma_vals == sorted(ma_vals) else "혼조")
    else:
        order = None
    r = rsi(close, 14)
    hi52 = float(close.tail(252).max()) if len(close) >= 60 else np.nan
    lo52 = float(close.tail(252).min()) if len(close) >= 60 else np.nan
    vol20 = float(vol.iloc[-21:-1].mean()) if len(vol) >= 21 else np.nan

    def ret(days):
        return _pct(last, float(close.iloc[-1 - days])) if len(close) > days else None

    return {
        "as_of": df.index[-1].strftime("%Y-%m-%d"),
        "close": _r(last, 4),
        "chg_1d_pct": ret(1),
        **{f"ma{n}": _r(mas[n], 4) for n in MA_WINDOWS},
        "ma_order": order,
        "pct_vs_ma20": _pct(last, mas[20]),
        "pct_vs_ma120": _pct(last, mas[120]),
        "rsi14": _r(float(r.iloc[-1])),
        "volume": _r(float(vol.iloc[-1]), 0),
        "volume_avg20": _r(vol20, 0),
        "volume_ratio20": _r(float(vol.iloc[-1]) / vol20) if not np.isnan(vol20) and vol20 > 0 else None,
        "high52": _r(hi52, 4), "low52": _r(lo52, 4),
        "pct_from_high52": _pct(last, hi52), "pct_from_low52": _pct(last, lo52),
        "ret_1m_pct": ret(21), "ret_3m_pct": ret(63), "ret_6m_pct": ret(126),
        "bars": int(len(close)),
    }


def load_targets(tickers: str | None) -> list[dict]:
    """목록(backup)의 종목. --tickers에 목록에 없는 코드가 있으면 신규 종목(market='auto')으로 넣는다."""
    entries = json.loads(BACKUP.read_text(encoding="utf-8"))
    known = {str(e.get("code", "")).upper(): e for e in entries}
    if not tickers or tickers.strip().lower() == "all":
        picked = [(str(e["code"]), e) for e in entries]
    else:
        picked = []
        for c in dict.fromkeys(t.strip().upper() for t in tickers.split(",") if t.strip()):
            picked.append((str(known[c]["code"]), known[c]) if c in known else (c, None))
    return [{"code": code, "name": e.get("name", "") if e else "", "market": e.get("market", "") if e else "auto",
             "new": e is None} for code, e in picked]


def fetch(targets: list[dict], period: str = "2y") -> dict[str, tuple[pd.DataFrame, str]]:
    """{code: (일봉, 쓰인 야후 심볼)}. 후보 심볼이 여럿이면(신규 국장 종목) 데이터가 있는 첫 번째를 쓴다."""
    import yfinance as yf

    cands = {t["code"]: candidate_symbols(t["code"], t["market"]) for t in targets}
    symbols = sorted({s for c in cands.values() for s in c})
    if not symbols:
        return {}
    raw = yf.download(symbols, period=period, auto_adjust=False, group_by="ticker",
                      threads=True, progress=False, multi_level_index=True)
    out = {}
    for code, syms in cands.items():
        for sym in syms:
            try:
                df = raw[sym] if isinstance(raw.columns, pd.MultiIndex) else raw
            except KeyError:
                continue
            df = df[["Close", "Volume"]].dropna(subset=["Close"])
            if df.empty:
                continue
            df.index = pd.DatetimeIndex(df.index).tz_localize(None).normalize()
            out[code] = (df, sym)
            break
    return out


def name_hint(symbol: str) -> str | None:
    """신규 종목의 회사명 참고값(야후). 못 받으면 None — 정식 이름은 Claude가 웹검색으로 확인한다."""
    try:
        import yfinance as yf

        info = yf.Ticker(symbol).info or {}
        return info.get("longName") or info.get("shortName") or None
    except Exception:  # noqa: BLE001 — 참고값이라 실패해도 계속
        return None


def build(targets: list[dict], frames: dict[str, tuple[pd.DataFrame, str]], now: datetime | None = None,
          names: dict[str, str | None] | None = None) -> dict:
    items, failed = {}, []
    for t in targets:
        got = frames.get(t["code"])
        if got is None:
            failed.append(t["code"])
            continue
        df, sym = got
        # 국장은 실제로 데이터가 있던 심볼(.KS/.KQ)로 시장을 적는다 — 목록의 시장과 다르면 이전 상장일 수 있다
        market = market_of_symbol(sym) if sym.endswith((".KS", ".KQ")) else (t["market"] if t["market"] != "auto" else "us")
        df = drop_unfinished_session(df, market, now)
        if len(df) < 30:
            failed.append(t["code"])
            continue
        item = {"name": t["name"], "market": market, "symbol": sym, **summarize(df)}
        if t.get("new"):
            item["new"] = True  # 목록에 없던 종목 — Claude가 새 항목을 만든다
            item["name_hint"] = (names or {}).get(t["code"])
        items[t["code"]] = item
    return {"generated_at": (now or datetime.now(timezone.utc)).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "source": "yfinance 일봉(분할 보정 종가), 코드 계산 — 판단 없음", "failed": failed, "items": items}


def merge_into(out_path: Path, fresh: dict) -> dict:
    """같은 파일에 다른 묶음의 결과가 있으면 지금 계산한 종목만 바꿔 끼운다."""
    merged = {"generated_at": fresh["generated_at"], "source": fresh["source"], "failed": [], "items": {}}
    if out_path.exists():
        try:
            old = json.loads(out_path.read_text(encoding="utf-8"))
            merged["items"].update(old.get("items", {}))
            merged["failed"] = [c for c in old.get("failed", []) if c not in fresh["items"]]
        except (json.JSONDecodeError, OSError):
            pass
    merged["items"].update(fresh["items"])
    merged["failed"] = sorted(set(merged["failed"]) | set(fresh["failed"]))
    return merged


def selftest() -> int:
    idx = pd.bdate_range("2025-01-01", periods=300)
    rng = np.random.default_rng(3)
    close = pd.Series(100 * np.exp(np.cumsum(rng.normal(0.0005, 0.015, len(idx)))), index=idx)
    df = pd.DataFrame({"Close": close, "Volume": rng.uniform(1e5, 3e5, len(idx))})
    s = summarize(df)
    assert s["bars"] == 300 and s["close"] == round(float(close.iloc[-1]), 4)
    assert s["ma20"] == round(float(close.tail(20).mean()), 4) and s["ma120"] == round(float(close.tail(120).mean()), 4)
    assert 0 <= s["rsi14"] <= 100 and s["ma_order"] in ("정배열(5>20>60>120)", "역배열(5<20<60<120)", "혼조")
    assert s["high52"] >= s["close"] >= s["low52"] and s["pct_from_high52"] <= 0 <= s["pct_from_low52"]
    assert s["ret_1m_pct"] == round((float(close.iloc[-1]) / float(close.iloc[-22]) - 1) * 100, 2)
    up = pd.Series([1.0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], index=pd.bdate_range("2025-01-01", periods=16))
    assert rsi(up, 14).iloc[-1] == 100.0  # 계속 오르기만 하면 100
    short = summarize(df.iloc[:40])
    assert short["ma120"] is None and short["ma_order"] is None and short["ret_6m_pct"] is None  # 이력 부족 → None
    ny_open = datetime(2026, 10, 5, 11, 0, tzinfo=ZoneInfo("America/New_York"))
    today = pd.DataFrame({"Close": [1.0, 1.0], "Volume": [1.0, 1.0]}, index=pd.DatetimeIndex(["2026-10-02", "2026-10-05"]))
    assert len(drop_unfinished_session(today, "us", ny_open)) == 1       # 장중 오늘 행 제외
    assert len(drop_unfinished_session(today, "us", ny_open.replace(hour=18))) == 2
    assert yahoo_symbol("005930", "kospi") == "005930.KS" and yahoo_symbol("BRK.B", "us") == "BRK-B"
    assert yahoo_symbol("X", "etc") is None
    assert candidate_symbols("035720", "auto") == ["035720.KS", "035720.KQ"] and candidate_symbols("NVDA", "auto") == ["NVDA"]
    assert candidate_symbols("090460", "kosdaq") == ["090460.KQ", "090460.KS"] and candidate_symbols("005930", "kospi")[0] == "005930.KS"
    assert market_of_symbol("035720.KQ") == "kosdaq" and market_of_symbol("NVDA") == "us"
    built = build([{"code": "AAA", "name": "a", "market": "us"}, {"code": "BBB", "name": "b", "market": "us"},
                   {"code": "035720", "name": "", "market": "auto", "new": True}],
                  {"AAA": (df, "AAA"), "035720": (df, "035720.KQ")}, datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc),
                  names={"035720": "Kakao Corp."})
    assert built["failed"] == ["BBB"] and set(built["items"]) == {"AAA", "035720"}
    assert built["items"]["035720"]["market"] == "kosdaq" and built["items"]["035720"]["new"] is True
    assert built["items"]["035720"]["name_hint"] == "Kakao Corp." and "new" not in built["items"]["AAA"]
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
    targets = load_targets(args.tickers)
    if not targets:
        print("대상 종목 없음", file=sys.stderr)
        return 1
    frames = fetch(targets)
    names = {t["code"]: name_hint(frames[t["code"]][1]) for t in targets if t.get("new") and t["code"] in frames}
    fresh = build(targets, frames, names=names)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    merged = merge_into(out_path, fresh)
    out_path.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    new_codes = [c for c, it in fresh["items"].items() if it.get("new")]
    print(f"계산 {len(fresh['items'])}종목(신규 {new_codes}), 실패 {len(fresh['failed'])}종목 {fresh['failed']} → {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
