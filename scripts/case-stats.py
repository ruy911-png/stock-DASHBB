#!/usr/bin/env python3
"""과거사례 Study — 사례 기간의 지수 통계를 코드로 계산한다 (사용자 결정 2026-10-12: 숫자는 코드만, 글은 Claude).

KOSPI(^KS11)·S&P500(^GSPC) 일봉(야후, 분할 보정 없음 = 지수)으로 사례 기간 안의 최대 낙폭(고점→저점), 고점→저점 일수,
저점→고점 회복 일수를 계산해 data/cases.json의 items[id]에 넣는다. 회복은 사례 기간이 끝난 뒤에도 오늘까지 추적한다
(사용자 지적 2026-10-15: 기간을 1주일로 잡은 사례가 "미회복"으로 나옴). 주봉 종가 시리즈(차트용, 시작=100)는 회복일
(미회복이면 기간 끝 + 60일)까지 그린다. 글(summary·tag·timeline·compare)은 Claude 단계(.claude/skills/case-study)가 채우며 이 스크립트는 건드리지 않는다.

사용: python3 scripts/case-stats.py --id c20220501-rate --title "금리 인상기" --start 2022-05-01 [--end 2023-01-31] [--event 2022-06-15]
      python3 scripts/case-stats.py --selftest   (네트워크 없이 가짜 일봉으로 검사)
      python3 scripts/case-stats.py --demo --out .cache/cases-demo.json   (화면 확인용 가짜 사례 — 커밋 금지)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "cases.json"
INDICES = {"KOSPI": "^KS11", "SP500": "^GSPC"}  # 사용자 결정 2026-10-12: 둘 다 계산
TEXT_FIELDS = ("summary", "tag", "timeline", "compare", "period_basis", "period_url", "written_at")  # Claude가 쓰는 칸 — 재계산 때 보존


def make_id(title: str, start: str) -> str:
    h = hashlib.sha1(title.strip().encode("utf-8")).hexdigest()[:6]
    return f"c{start.replace('-', '')}-{h}"


def parse_day(s: str | None) -> date | None:
    if not s or not str(s).strip():
        return None
    s = str(s).strip()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        raise SystemExit(f"날짜 형식 오류(YYYY-MM-DD): {s}")
    return date.fromisoformat(s)


def index_stats(close: pd.Series, start: date, end: date | None, event: date | None) -> dict:
    """close: 날짜 오름차순 종가(사례 시작 전부터 오늘까지). 낙폭은 기간 안 running-max 기준, 회복은 기간 뒤 오늘까지 추적."""
    win = close[(close.index.date >= start) & (close.index.date <= (end or date.max))]
    if len(win) < 5:
        return {"error": "기간 안 일봉 부족", "bars": int(len(win))}
    run_max = win.cummax()
    dd = win / run_max - 1
    bottom_i = int(np.argmin(dd.to_numpy()))
    bottom_date = win.index[bottom_i]
    bottom = float(win.iloc[bottom_i])
    peak = float(run_max.iloc[bottom_i])
    peak_date = win[:bottom_date][win[:bottom_date] == peak].index[0]
    drawdown = float(dd.iloc[bottom_i] * 100)
    after = close[close.index > bottom_date]  # 기간이 끝난 뒤 데이터까지 포함
    rec = after[after >= peak]
    recovery_date = rec.index[0] if len(rec) else None
    period_end = end or close.index[-1].date()
    recovered_after_end = bool(recovery_date is not None and recovery_date.date() > period_end)
    # 차트: 주봉 종가(금요일 기준 마지막 값), 기간 첫 종가 = 100. 회복일(미회복이면 기간 끝 + 60일)까지 연장
    chart_end = recovery_date.date() if recovery_date is not None else period_end + timedelta(days=60)
    chart_end = max(chart_end, period_end)
    span = close[(close.index.date >= start) & (close.index.date <= chart_end)]
    weekly = span.resample("W-FRI").last().dropna()
    base = float(weekly.iloc[0])  # 첫 주 = 100
    series = [{"d": d.strftime("%Y-%m-%d"), "v": round(float(v) / base * 100, 2)} for d, v in weekly.items()]
    ev = event or start
    ev_idx = int(np.argmin([abs((pd.Timestamp(p["d"]).date() - ev).days) for p in series])) if series else 0
    return {
        "bars": int(len(win)),
        "first_date": win.index[0].strftime("%Y-%m-%d"), "last_date": win.index[-1].strftime("%Y-%m-%d"),
        "peak_date": peak_date.strftime("%Y-%m-%d"), "peak": round(peak, 2),
        "bottom_date": bottom_date.strftime("%Y-%m-%d"), "bottom": round(bottom, 2),
        "drawdown_pct": round(drawdown, 2),
        "days_to_bottom": int((bottom_date - peak_date).days),
        "recovery_date": recovery_date.strftime("%Y-%m-%d") if recovery_date is not None else None,
        "days_to_recover": int((recovery_date - bottom_date).days) if recovery_date is not None else None,
        "recovered_after_end": recovered_after_end,
        "chart_end": span.index[-1].strftime("%Y-%m-%d"),
        "series": series, "event_idx": ev_idx,
    }


def fetch_closes(start: date, end: date | None) -> dict[str, pd.Series]:
    import yfinance as yf

    s = (start - timedelta(days=10)).isoformat()
    e = (date.today() + timedelta(days=1)).isoformat()  # 회복 추적을 위해 기간 끝과 무관하게 오늘까지 받는다
    raw = yf.download(list(INDICES.values()), start=s, end=e, auto_adjust=False, group_by="ticker",
                      threads=True, progress=False, multi_level_index=True)
    out = {}
    for name, sym in INDICES.items():
        try:
            df = raw[sym] if isinstance(raw.columns, pd.MultiIndex) else raw
        except KeyError:
            continue
        c = df["Close"].dropna()
        if c.empty:
            continue
        c.index = pd.DatetimeIndex(c.index).tz_localize(None).normalize()
        out[name] = c.astype(float)
    return out


def build_item(case_id: str, title: str, start: date, end: date | None, event: date | None,
               closes: dict[str, pd.Series], now: datetime | None = None) -> dict:
    stamp = (now or datetime.now(timezone.utc)).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    indices = {}
    for name in INDICES:
        indices[name] = index_stats(closes[name], start, end, event) if name in closes else {"error": "일봉 조회 실패"}
    return {
        "id": case_id, "title": title.strip(), "start": start.isoformat(), "end": end.isoformat() if end else None,
        "event": (event or start).isoformat(), "status": "ongoing" if end is None else "closed",
        "source": "yfinance 지수 일봉(^KS11·^GSPC), 코드 계산 — 과거 통계이며 예측·매수·매도 판단 아님",
        "computed_at": stamp, "indices": indices,
    }


def merge_into(out_path: Path, item: dict) -> dict:
    data = {"generated_at": None, "items": {}}
    if out_path.exists():
        data = json.loads(out_path.read_text(encoding="utf-8"))
    old = data["items"].get(item["id"], {})
    for k in TEXT_FIELDS:  # Claude가 쓴 글은 보존
        if k in old:
            item[k] = old[k]
    data["items"][item["id"]] = item
    data["generated_at"] = item["computed_at"]
    return data


def fake_closes(start: date, days: int = 300, seed: int = 7) -> dict[str, pd.Series]:
    rng = np.random.default_rng(seed)
    idx = pd.bdate_range(start - timedelta(days=15), periods=days)
    out = {}
    for name, drop, k in (("KOSPI", 0.30, 60), ("SP500", 0.22, 80)):
        k = min(k, days // 2)
        path = np.concatenate([np.linspace(100, 100 * (1 - drop), k), np.linspace(100 * (1 - drop), 108, days - k)])
        path = path * (1 + rng.normal(0, 0.004, days)).cumprod() ** 0.2
        out[name] = pd.Series(path, index=idx)
    return out


def selftest() -> int:
    start = date(2022, 5, 2)
    closes = fake_closes(start)
    item = build_item("c20220502-test", "자체 검사", start, None, date(2022, 6, 15), closes, datetime(2023, 1, 1, tzinfo=timezone.utc))
    k = item["indices"]["KOSPI"]
    assert -35 < k["drawdown_pct"] < -20, k["drawdown_pct"]
    assert k["days_to_bottom"] > 0 and k["recovery_date"] is not None and k["days_to_recover"] > 0
    assert k["series"][0]["v"] == 100.0 and len(k["series"]) > 20 and 0 <= k["event_idx"] < len(k["series"])
    # 회복 전 구간만 자르면 회복 null(미회복)
    short = {n: s[s.index.date <= date(2022, 9, 1)] for n, s in closes.items()}
    item2 = build_item("x", "진행 중", start, date(2022, 9, 1), None, short)
    assert item2["indices"]["SP500"]["recovery_date"] is None and item2["status"] == "closed"
    assert item2["indices"]["SP500"]["chart_end"] == item2["indices"]["SP500"]["last_date"]  # 데이터가 거기까지뿐
    # 기간을 짧게 잡아도 회복은 기간 뒤 데이터로 추적한다(2026-10-15)
    item3 = build_item("y", "짧은 기간", start, date(2022, 6, 15), None, closes)
    k3 = item3["indices"]["KOSPI"]
    assert k3["recovery_date"] is not None and k3["recovered_after_end"] and k3["recovery_date"] > "2022-06-15", k3
    assert k3["chart_end"] >= k3["recovery_date"] and k3["series"][-1]["v"] >= 99, (k3["chart_end"], k3["series"][-1])
    # 글 보존
    tmp = ROOT / ".cache" / "cases-selftest.json"
    tmp.parent.mkdir(exist_ok=True)
    tmp.write_text(json.dumps({"generated_at": None, "items": {"x": {"id": "x", "summary": "보존", "indices": {}}}}), encoding="utf-8")
    merged = merge_into(tmp, item2)
    assert merged["items"]["x"]["summary"] == "보존" and merged["items"]["x"]["indices"]["KOSPI"]["bars"] > 0
    tmp.unlink()
    assert make_id("금리 인상기", "2022-05-01").startswith("c20220501-")
    print("selftest ok")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--id")
    ap.add_argument("--title")
    ap.add_argument("--start")
    ap.add_argument("--end", default="")
    ap.add_argument("--event", default="")
    ap.add_argument("--out", default=str(OUT))
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--demo", action="store_true", help="가짜 일봉으로 사례 2개를 만든다(화면 확인용, 커밋 금지)")
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    out_path = Path(a.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if a.demo:
        data = {"generated_at": None, "items": {}}
        for title, start, end, ev in (("고금리 환경 (데모)", date(2026, 8, 18), None, date(2026, 9, 14)), ("금리 인상기 (데모)", date(2022, 5, 2), date(2023, 1, 31), date(2022, 6, 15))):
            item = build_item(make_id(title, start.isoformat()), title, start, end, ev, fake_closes(start, 200 if end else 60))
            item["summary"] = "데모 사례입니다. 숫자는 가짜 일봉으로 계산한 값입니다."
            item["tag"] = "데모"
            item["timeline"] = [{"date": start.isoformat(), "sentiment": "악재", "label": "데모 뉴스", "desc": "화면 확인용", "url": "https://example.com"}]
            data["items"][item["id"]] = item
        out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"데모 {len(data['items'])}건 → {out_path}")
        return 0
    if not a.title or not a.start:
        print("--title, --start 필요", file=sys.stderr)
        return 1
    start, end, event = parse_day(a.start), parse_day(a.end), parse_day(a.event)
    if end and end < start:
        raise SystemExit("--end가 --start보다 앞입니다")
    case_id = a.id or make_id(a.title, a.start)
    closes = fetch_closes(start, end)
    item = build_item(case_id, a.title, start, end, event, closes)
    data = merge_into(out_path, item)
    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    ok = [n for n, v in item["indices"].items() if "error" not in v]
    print(f"{case_id} 계산: {', '.join(ok) or '없음'} → {out_path}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
