# 임시 진단(브랜치 전용, 확인 뒤 삭제): yfinance 재무제표 필드가 종목별로 얼마나 채워지는지
import importlib.util, json, sys
import yfinance as yf
spec = importlib.util.spec_from_file_location("ti", "scripts/technical-indicators.py"); ti = importlib.util.module_from_spec(spec); spec.loader.exec_module(ti)
FIELDS = {
 "qi": ["Total Revenue", "Operating Income", "Net Income", "Gross Profit"],
 "qc": ["Operating Cash Flow", "Free Cash Flow", "Capital Expenditure"],
 "qb": ["Total Debt", "Total Liabilities Net Minority Interest", "Stockholders Equity", "Common Stock Equity"],
 "ai": ["Total Revenue", "Operating Income", "Net Income", "Gross Profit"],
 "ab": ["Stockholders Equity", "Common Stock Equity"],
}
cov = {}
for t in ti.load_targets("all"):
    sym = ti.yahoo_symbol(t["code"], t["market"])
    if not sym: continue
    tk = yf.Ticker(sym)
    try:
        dfs = {"qi": tk.quarterly_income_stmt, "qc": tk.quarterly_cashflow, "qb": tk.quarterly_balance_sheet, "ai": tk.income_stmt, "ab": tk.balance_sheet}
    except Exception as e:
        print(sym, "ERR", e); continue
    row = {}
    for k, names in FIELDS.items():
        df = dfs[k]
        for n in names:
            if df is not None and not df.empty and n in df.index:
                s = df.loc[n].dropna()
                row[f"{k}:{n}"] = len(s)
            else:
                row[f"{k}:{n}"] = 0
    qcols = list(dfs["qi"].columns[:5]) if dfs["qi"] is not None and not dfs["qi"].empty else []
    print(sym, "q-cols", [str(c)[:10] for c in qcols], json.dumps(row, ensure_ascii=False))
    for key, n in row.items():
        cov.setdefault(key, []).append(n)
print("=== coverage (종목 수 / 값 개수 중앙값) ===")
for key, ns in cov.items():
    have = sum(1 for n in ns if n > 0); ns2 = sorted(ns)
    print(key, f"{have}/{len(ns)}", "median", ns2[len(ns2)//2])
for sym in ["WM", "BAC", "005930.KS"]:
    tk = yf.Ticker(sym)
    print("----", sym); print(tk.quarterly_income_stmt.loc[[r for r in ["Total Revenue","Operating Income"] if r in tk.quarterly_income_stmt.index]].iloc[:, :6].to_string())
