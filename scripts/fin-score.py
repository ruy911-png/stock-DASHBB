"""종목분석 카드의 '기본적분석'·'경제적해자' 달 점수 — 사용자 결정(2026-10-30, 2번 안): 기술적처럼 코드가 숫자로 계산한다.

입력: data/analyses-backup.json의 종목(code, market), 또는 --tickers로 일부만
재무: yfinance 분기·연간 재무제표(비공식). 심볼 규칙은 technical-indicators.py와 같다
출력: data/technical/fin.json — 종목별 기본적(5개)·해자 신호(5개) 조건의 충족 여부와 그 근거 숫자
      값이 없거나 의미가 없는 조건(금융업의 매출총이익률·부채비율 등)은 ok=None(확인 못 함)으로 두고 충족 개수에 넣지 않는다.
      해자 신호는 해자를 직접 재는 게 아니라 해자가 있으면 보통 나타나는 숫자다. 과거·현재 상태의 체크리스트이며 매수·매도 판단이 아니다.
사용: python3 scripts/fin-score.py [--tickers 005930,SCHW] [--out data/technical/fin.json]
      python3 scripts/fin-score.py --selftest   (네트워크 없이 가짜 재무제표로 계산 검사)
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "technical" / "fin.json"

_spec = importlib.util.spec_from_file_location("technical_indicators", ROOT / "scripts" / "technical-indicators.py")
ti = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ti)


def _series(df: pd.DataFrame, *names: str) -> pd.Series:
    """재무제표에서 항목 한 줄(최신이 앞). 이름 후보 중 처음 있는 것, 없으면 빈 줄."""
    if df is None or df.empty:
        return pd.Series(dtype=float)
    for n in names:
        if n in df.index:
            s = pd.to_numeric(df.loc[n], errors="coerce")
            s.index = pd.DatetimeIndex(s.index)
            return s.dropna().sort_index(ascending=False)  # 빈 분기는 건너뛴다(값이 있는 최근 결산일 기준)
    return pd.Series(dtype=float)


def _latest(s: pd.Series):
    """가장 최근 결산일의 값(없으면 None)."""
    return None if s.empty or pd.isna(s.iloc[0]) else float(s.iloc[0])


def _year_ago(s: pd.Series):
    """가장 최근 분기와 1년 전 같은 분기(330~400일 전) 값. 둘 중 하나라도 없으면 None."""
    if s.empty or pd.isna(s.iloc[0]):
        return None
    d0 = s.index[0]
    for d, v in s.iloc[1:].items():
        if 330 <= (d0 - d).days <= 400:
            return None if pd.isna(v) else (float(s.iloc[0]), float(v))
    return None


def _ttm(s: pd.Series):
    """최근 4분기 합(최근 12개월). 연속한 4분기(첫 분기~넷째 분기가 300일 안)가 있어야 한다."""
    v = s.iloc[:4]
    return None if len(v) < 4 or (v.index[0] - v.index[3]).days > 300 else float(v.sum())


def _pct(x: float) -> str:
    return f"{x:.1f}%"


def _growth_item(label: str, s: pd.Series) -> dict:
    pair = _year_ago(s)
    if pair is None:
        return {"label": label, "ok": None, "value": None}
    now, before = pair
    if before <= 0:
        if now > 0:
            return {"label": label, "ok": True, "value": "흑자 전환" if before < 0 else "증가"}
        return {"label": label, "ok": now > before, "value": "적자 축소" if now > before else "적자 지속·확대"}
    g = (now / before - 1) * 100
    return {"label": label, "ok": g > 0, "value": ("+" if g > 0 else "") + _pct(g)}


def _score(items: list[dict], as_of) -> dict:
    return {"met": sum(1 for i in items if i["ok"] is True), "total": len(items),
            "unknown": sum(1 for i in items if i["ok"] is None), "items": items,
            "as_of": None if as_of is None else as_of.strftime("%Y-%m-%d")}


def fundamental_score(qi: pd.DataFrame, qc: pd.DataFrame, qb: pd.DataFrame, financial: bool = False) -> dict:
    """기본적분석 5개: 매출·영업이익 전년 동기 대비 증가, 최근 12개월 OCF·FCF 플러스, 부채비율 100% 이하."""
    rev, op = _series(qi, "Total Revenue", "Operating Revenue"), _series(qi, "Operating Income")
    ocf = _series(qc, "Operating Cash Flow", "Cash Flow From Continuing Operating Activities")
    fcf = _series(qc, "Free Cash Flow")
    liab = _series(qb, "Total Liabilities Net Minority Interest")
    eq = _series(qb, "Stockholders Equity", "Common Stock Equity")
    items = [_growth_item("매출 전년 동기 대비 증가", rev), _growth_item("영업이익 전년 동기 대비 증가", op)]
    for label, s in (("영업현금흐름 플러스(최근 12개월)", ocf), ("잉여현금흐름 플러스(최근 12개월)", fcf)):
        v = _ttm(s)
        items.append({"label": label, "ok": None if v is None else v > 0, "value": None if v is None else f"{v:,.0f}"})
    l, e = _latest(liab), _latest(eq)
    if financial or l is None or e is None or e <= 0:  # 금융업은 예금·차입이 영업이라 부채비율이 의미 없다. 자본잠식도 계산 안 함
        items.append({"label": "부채비율 100% 이하", "ok": None, "value": None})
    else:
        items.append({"label": "부채비율 100% 이하", "ok": l / e * 100 <= 100, "value": _pct(l / e * 100)})
    return _score(items, rev.index[0] if not rev.empty else None)


def moat_score(ai: pd.DataFrame, ab: pd.DataFrame, financial: bool = False) -> dict:
    """해자 신호 5개(연간): ROE 15%↑, 영업이익률 15%↑, 매출총이익률 40%↑, 최근 3년 ROE 모두 10%↑, 최근 3년 매출 연속 증가."""
    rev, op, gp = _series(ai, "Total Revenue", "Operating Revenue"), _series(ai, "Operating Income"), _series(ai, "Gross Profit")
    ni = _series(ai, "Net Income", "Net Income Common Stockholders")
    eq = _series(ab, "Stockholders Equity", "Common Stock Equity")

    def roe(d):
        n, e = ni.get(d), eq.get(d)
        return None if n is None or e is None or e <= 0 else float(n) / float(e) * 100

    def ratio(a: pd.Series, label: str, th: float, skip: bool) -> dict:
        x, r = _latest(a), _latest(rev)
        if skip or x is None or r is None or r <= 0:
            return {"label": label, "ok": None, "value": None}
        v = x / r * 100
        return {"label": label, "ok": v >= th, "value": _pct(v)}

    d0 = rev.index[0] if not rev.empty else (ni.index[0] if not ni.empty else None)
    r0 = None if d0 is None else roe(d0)
    items = [{"label": "ROE 15% 이상", "ok": None if r0 is None else r0 >= 15, "value": None if r0 is None else _pct(r0)},
             ratio(op, "영업이익률 15% 이상", 15, financial), ratio(gp, "매출총이익률 40% 이상", 40, financial)]
    years = list(ni.index[:3])
    roes = [roe(d) for d in years]
    if len(years) < 3 or any(v is None for v in roes):
        items.append({"label": "최근 3년 ROE 모두 10% 이상", "ok": None, "value": None})
    else:
        items.append({"label": "최근 3년 ROE 모두 10% 이상", "ok": all(v >= 10 for v in roes), "value": " · ".join(_pct(v) for v in roes)})
    rv = rev.iloc[:3]
    if len(rv) < 3 or rv.isna().any():
        items.append({"label": "최근 3년 매출 연속 증가", "ok": None, "value": None})
    else:
        items.append({"label": "최근 3년 매출 연속 증가", "ok": bool(rv.iloc[0] > rv.iloc[1] > rv.iloc[2]),
                      "value": " → ".join(f"{v:,.0f}" for v in reversed(rv.tolist()))})
    return _score(items, d0)


def _frame(rows: dict, dates: list[str]) -> pd.DataFrame:
    """야후 재무제표 모양(행 = 항목, 열 = 결산일, 최신이 왼쪽)."""
    return pd.DataFrame(rows, index=pd.DatetimeIndex(dates)).T


def selftest() -> int:
    q = ["2026-09-30", "2026-06-30", "2026-03-31", "2025-12-31", "2025-09-30"]
    qi = _frame({"Total Revenue": [120.0, 110, 105, 100, 100], "Operating Income": [24.0, 20, 19, 18, 20]}, q)
    qc = _frame({"Operating Cash Flow": [30.0, 25, 20, 22, 10], "Free Cash Flow": [10.0, 5, -2, 3, 1]}, q)
    qb = _frame({"Total Liabilities Net Minority Interest": [80.0, 0, 0, 0, 0], "Stockholders Equity": [100.0, 0, 0, 0, 0]}, q)
    f = fundamental_score(qi, qc, qb)
    assert (f["met"], f["total"], f["unknown"]) == (5, 5, 0), f
    labels = [i["label"] for i in f["items"]]
    assert labels == ["매출 전년 동기 대비 증가", "영업이익 전년 동기 대비 증가", "영업현금흐름 플러스(최근 12개월)",
                      "잉여현금흐름 플러스(최근 12개월)", "부채비율 100% 이하"], labels
    # 매출 +20%(120 vs 100), 영업이익 +20%(24 vs 20), OCF 합 97, FCF 합 16, 부채비율 80%
    vals = {i["label"]: i["value"] for i in f["items"]}
    assert vals["매출 전년 동기 대비 증가"] == "+20.0%" and vals["영업이익 전년 동기 대비 증가"] == "+20.0%"
    assert vals["부채비율 100% 이하"] == "80.0%"
    assert f["as_of"] == "2026-09-30"
    # 영업이익 감소 → 불충족. 4분기 전 값이 없으면 확인 못 함
    f2 = fundamental_score(_frame({"Total Revenue": [90.0, 1, 1, 1, 100], "Operating Income": [24.0, 1, 1, 1, None]}, q), qc, qb)
    assert [i["ok"] for i in f2["items"]][:2] == [False, None], f2
    # 적자 → 흑자 전환은 증가로 본다(값은 '흑자 전환')
    f3 = fundamental_score(_frame({"Total Revenue": [120.0, 1, 1, 1, 100], "Operating Income": [5.0, 1, 1, 1, -3]}, q), qc, qb)
    assert f3["items"][1]["ok"] is True and f3["items"][1]["value"] == "흑자 전환"
    # 분기가 4개 미만이면 최근 12개월 현금흐름은 확인 못 함, 자본잠식이면 부채비율 확인 못 함
    f4 = fundamental_score(qi, qc.iloc[:, :3], _frame({"Total Liabilities Net Minority Interest": [80.0], "Stockholders Equity": [-5.0]}, q[:1]))
    assert [i["ok"] for i in f4["items"]][2:] == [None, None, None], f4
    # 금융업: 부채비율은 의미가 없어 확인 못 함
    f5 = fundamental_score(qi, qc, qb, financial=True)
    assert f5["items"][4]["ok"] is None and f5["unknown"] == 1
    # 빈 표(데이터 없음) → 전부 확인 못 함
    empty = pd.DataFrame()
    f6 = fundamental_score(empty, empty, empty)
    assert (f6["met"], f6["unknown"]) == (0, 5) and f6["as_of"] is None

    y = ["2025-12-31", "2024-12-31", "2023-12-31", "2022-12-31"]
    ai = _frame({"Total Revenue": [400.0, 360, 330, 300], "Operating Income": [80.0, 70, 60, 50],
                 "Gross Profit": [180.0, 150, 130, 120], "Net Income": [60.0, 50, 40, 20]}, y)
    ab = _frame({"Stockholders Equity": [300.0, 300, 300, 300]}, y)
    m = moat_score(ai, ab)
    assert [i["label"] for i in m["items"]] == ["ROE 15% 이상", "영업이익률 15% 이상", "매출총이익률 40% 이상",
                                                 "최근 3년 ROE 모두 10% 이상", "최근 3년 매출 연속 증가"]
    # ROE 20%, 영업이익률 20%, 매출총이익률 45%, 3년 ROE 20·16.7·13.3%, 매출 330→360→400
    assert [i["ok"] for i in m["items"]] == [True, True, True, True, True], m
    assert m["items"][0]["value"] == "20.0%" and m["items"][2]["value"] == "45.0%" and m["as_of"] == "2025-12-31"
    m2 = moat_score(_frame({"Total Revenue": [400.0, 410, 330], "Operating Income": [40.0, 70, 60],
                            "Net Income": [30.0, 50, 25]}, y[:3]), _frame({"Stockholders Equity": [300.0, 300, 300]}, y[:3]))
    # ROE 10% 불충족, 영업이익률 10% 불충족, 매출총이익 없음 → 확인 못 함, 3년 ROE(10·16.7·8.3) 불충족, 매출 감소 불충족
    assert [i["ok"] for i in m2["items"]] == [False, False, None, False, False], m2
    # 금융업: 영업이익률·매출총이익률은 확인 못 함(ROE는 본다)
    m3 = moat_score(ai, ab, financial=True)
    assert [i["ok"] for i in m3["items"]] == [True, None, None, True, True]
    # 연간이 2년뿐이면 3년 조건은 확인 못 함
    m4 = moat_score(ai.iloc[:, :2], ab.iloc[:, :2])
    assert [i["ok"] for i in m4["items"]][3:] == [None, None]
    # 최신 분기가 비어 있으면(10/30 BAC: 9월·6월 분기 매출이 NaN) 값이 있는 최근 분기로 본다
    gap = _frame({"Total Revenue": [None, None, 110.0, 100, 1, 1, 100], "Operating Income": [None, None, 22.0, 20, 1, 1, 20]},
                 ["2026-09-30", "2026-06-30", "2026-03-31", "2025-12-31", "2025-09-30", "2025-06-30", "2025-03-31"])
    fg = fundamental_score(gap, qc, qb)
    assert fg["as_of"] == "2026-03-31" and fg["items"][0]["value"] == "+10.0%", fg
    # 최근 12개월 현금흐름은 연속한 4분기만(중간이 빠지면 확인 못 함)
    hole = _frame({"Operating Cash Flow": [30.0, None, 20, 22, 10], "Free Cash Flow": [10.0, None, -2, 3, 1]}, q)
    assert [i["ok"] for i in fundamental_score(qi, hole, qb)["items"]][2:4] == [None, None]
    # 저장되는 값은 파이썬 기본형(JSON으로 쓸 수 있어야 한다)
    json.dumps([fundamental_score(qi, qc, qb), moat_score(ai, ab), moat_score(ai, ab, True)])
    assert all(type(i["ok"]) is bool for i in moat_score(ai, ab)["items"])
    # 금융업 판별(야후 업종)과 build 결과 모양
    assert is_financial({"industry": "Banks - Diversified"}) and is_financial({"industry": "Insurance - Life"})
    assert not is_financial({"industry": "Credit Services"}) and not is_financial({})
    fr = {"qi": qi, "qc": qc, "qb": qb, "ai": ai, "ab": ab}
    b = build([{"code": "AAA", "name": "a", "market": "us"}, {"code": "BBB", "name": "b", "market": "us"},
               {"code": "CCC", "name": "c", "market": "us"}],
              {"AAA": ("AAA", fr, {"industry": "Software"}), "CCC": ("CCC", fr, {"industry": "Banks - Regional"})},
              datetime(2026, 10, 30, tzinfo=timezone.utc))
    assert b["failed"] == ["BBB"] and set(b["items"]) == {"AAA", "CCC"}
    a = b["items"]["AAA"]
    assert a["financial"] is False and a["fundamental"]["met"] == 5 and a["moat"]["met"] == 5, a
    assert b["items"]["CCC"]["financial"] is True and b["items"]["CCC"]["moat"]["unknown"] == 2
    print("selftest ok")
    return 0


FINANCIAL_INDUSTRIES = ("Banks", "Insurance", "Capital Markets", "Mortgage Finance", "Financial Conglomerates")


def is_financial(info: dict) -> bool:
    """은행·보험·증권(야후 업종). 영업이익률·매출총이익률·부채비율이 의미 없는 업종."""
    return str(info.get("industry") or "").startswith(FINANCIAL_INDUSTRIES)


def fetch_one(code: str, market: str):
    """(심볼, 재무제표 dict, info). 후보 심볼 중 분기 손익계산서가 있는 첫 번째. 없으면 None."""
    import yfinance as yf

    for sym in ti.candidate_symbols(code, market):
        try:
            tk = yf.Ticker(sym)
            qi = tk.quarterly_income_stmt
            if qi is None or qi.empty:
                continue
            frames = {"qi": qi, "qc": tk.quarterly_cashflow, "qb": tk.quarterly_balance_sheet,
                      "ai": tk.income_stmt, "ab": tk.balance_sheet}
            try:
                info = tk.info or {}
            except Exception:  # noqa: BLE001 — 업종 참고값이라 실패해도 계속(금융업 판별만 못 함)
                info = {}
            return sym, frames, info
        except Exception:  # noqa: BLE001 — 한 종목 실패가 전체를 멈추지 않게
            continue
    return None


def build(targets: list[dict], fetched: dict, now: datetime | None = None) -> dict:
    items, failed = {}, []
    for t in targets:
        got = fetched.get(t["code"])
        if got is None:
            failed.append(t["code"])
            continue
        sym, fr, info = got
        fin = is_financial(info)
        items[t["code"]] = {"name": t["name"], "symbol": sym, "financial": fin,
                            "fundamental": fundamental_score(fr["qi"], fr["qc"], fr["qb"], fin),
                            "moat": moat_score(fr["ai"], fr["ab"], fin)}
    return {"generated_at": (now or datetime.now(timezone.utc)).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "source": "yfinance 분기·연간 재무제표, 코드 계산 — 판단 없음", "failed": failed, "items": items}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tickers", default="all", help="종목코드/티커 쉼표 구분, 또는 all")
    ap.add_argument("--out", default=str(OUT))
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        return selftest()
    targets = ti.load_targets(args.tickers)
    fetched = {}
    for t in targets:
        got = fetch_one(t["code"], t["market"])
        if got:
            fetched[t["code"]] = got
    fresh = build(targets, fetched)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    merged = ti.merge_into(out_path, fresh)
    out_path.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"계산 {len(fresh['items'])}종목, 실패 {len(fresh['failed'])}종목 {fresh['failed']} → {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
