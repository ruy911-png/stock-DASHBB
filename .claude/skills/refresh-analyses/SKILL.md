---
name: refresh-analyses
description: 종목분석 모음의 지정 종목을 오늘 날짜 기준으로 다시 분석해 data/analyses-backup.json에 오늘자 분석을 추가한다. GitHub Actions(refresh-analyses.yml)와 PC에서 같은 절차로 쓴다. 인자 = 종목코드/티커 쉼표 구분(예: /refresh-analyses 005930,SCHW).
allowed-tools: Agent, Read, Write, Edit, Grep, Glob, WebSearch, WebFetch, Bash(npm run build), Bash(npm run check), Bash(node scripts/validate-analyses.mjs), Bash(date *)
---

# 종목분석 오늘자 재분석

대상: `$ARGUMENTS` (종목코드/티커를 쉼표로 구분. 비어 있으면 중단하고 "대상 종목 없음"이라고 답한다)

## 절차
1. `data/analyses-backup.json`을 읽어 대상 종목마다 `code`가 같은 항목을 찾는다(name·market·tags 확인).
   - **목록에 없는 코드는 신규 종목이다.** `data/technical/latest.json`의 `items[code]`에 `new: true`와 함께 코드가 판별한 `market`(일봉이 있는 쪽: kospi/kosdaq/us)과 `name_hint`(야후 회사명, 참고용)가 있다. 정식 회사명(국장은 한글 상호, 미국은 통용 한글 표기 + 티커)은 웹검색으로 확인한다. `items[code]`가 없으면(일봉 조회 실패 = 코드가 틀렸을 가능성) 그 종목은 만들지 않고 요약에 "코드/티커 확인 필요"라고 적는다.
2. `data/technical/latest.json`을 읽는다. 종목별 `items[code]`에 코드가 계산한 숫자(종가·이동평균 5/20/60/120·배열 상태·RSI(14)·거래량과 20일 평균 대비·52주 고저 대비·1/3/6개월 수익률, `as_of` 날짜)가 있다. **기술적분석의 숫자는 오직 이 파일의 값만 쓴다.** 없으면(`failed`에 있거나 항목 없음) 기술적분석은 `"• 미확인(일봉 조회 실패)"` 한 줄로 쓴다.
3. 종목마다 `company-analyst`, `fundamental-analyst`, `valuation-analyst` 서브에이전트를 **한 메시지에서 동시에, run_in_background: false로** 호출한다(technical-analyst는 차트가 없으니 호출하지 않는다). 여러 종목이면 종목×3을 모두 한 메시지에서 보낸다. 모든 결과가 돌아오기 전에는 다음 단계로 가지 않는다. 각 호출에 아래 한 줄을 그대로 붙인다:
   > "Sources: KR=네이버금융(DART는 웹검색 우회) / US=Yahoo Finance→Investing.com / Macro=FRED(미국)·ECOS(한국). Cite source+as-of date, say '미확인' instead of fabricating, no buy/sell recommendation. Keep it compact: max 3 bullets per section, one short parenthetical citation per bullet at most — this feeds a dashboard card, not a research report. 오늘 날짜: {오늘, YYYY-MM-DD}. 현금흐름(OCF·FCF·capex)과 PBR(BPS 포함)은 반드시 다룬다."
4. 결과로 CLAUDE.md의 '종목분석 리포트 컨벤션'대로 5개 섹션을 쓴다(섹션당 최대 3개 bullet, bullet은 `• `로 시작하고 `\n`으로 구분, bullet당 출처 괄호 최대 1개, 확인 불가는 "미확인", 매수·매도 추천 금지, 컨센서스·목표주가는 사실 보고로만):
   - `overview` 기업개요 ← company-analyst
   - `moat` 경제적해자 ← company-analyst의 경쟁우위 + 그 우위를 위협하는 리스크 1개 이상(필요하면 웹검색 보강)
   - `fundamental` 기본적분석 ← fundamental-analyst (현금흐름 bullet 필수)
   - `technical` 기술적분석 ← 2의 숫자로만 작성. 3개 bullet: ① 추세·이동평균(종가와 20/120일선 대비, 배열 상태) — `data/technical/profiles.json`의 `items[code].main_labels`(카드에 보이는 대표 유형 2개 이내, 없으면 `labels` 앞 2개. 예: 추세 지속형·고변동형)가 있으면 이 bullet 끝에 "종목 특성: …" 으로 덧붙인다 ② RSI(14)와 거래량(20일 평균 대비) ③ 52주 고저 대비 위치와 1/3/6개월 수익률. 각 bullet 끝에 `(코드 계산, yfinance 일봉, as_of 날짜)`를 붙인다. 과매수·과매도는 RSI 70/30 기준의 사실 서술만 하고 전망·권유는 쓰지 않는다. 유형의 근거 숫자는 카드의 '종목 특성' 블록이 따로 보여 주므로 여기서 반복하지 않는다
   - `valuation` 밸류에이션 ← valuation-analyst (PER과 PBR·BPS bullet 필수)
5. 항목을 넣는다: `{ "ai": "claude", "date": "<오늘 월.일, 예: 10.5 — 앞자리 0 없이, 한국 시간 기준>", overview, moat, fundamental, technical, valuation }`. 같은 `ai`·`date`가 이미 있으면 그 항목을 바꾸고, 아니면 `ais` 맨 앞에 넣고 최신 5개만 남긴다. `code`·`name`·`market`·`price`·`chg`는 그대로 두고, `tags`는 명백히 낡았을 때만 3개 이내로 고친다. 목록 화면에는 **첫 번째 태그 1개만** 보이므로 첫 태그는 업종(예: 반도체, 소프트웨어, 손해보험)으로 둔다(사용자 결정 2026-10-06). 다른 종목 항목은 건드리지 않는다.
   - **신규 종목**은 배열 맨 앞에 새 항목을 만든다: `{ "code": "<입력한 코드 — 국장 6자리, 미국은 대문자 티커>", "name": "<확인한 회사명>", "price": 0, "chg": 0, "market": "<latest.json의 market>", "tags": ["핵심 키워드 3개 이내"], "ais": [<오늘 항목>] }`.
   - JSON은 UTF-8, 들여쓰기 2칸, 파일 끝 줄바꿈 하나로 저장한다.
6. `node scripts/validate-analyses.mjs` → `npm run build` → `npm run check`를 차례로 돌리고, 실패하면 고친 뒤 다시 돌린다.
7. **git commit·push는 하지 않는다**(워크플로가 한다). 마지막에 요약만 쓴다: 처리한 종목, 건너뛴 종목(이유), 기술적분석을 미확인으로 둔 종목, 신뢰도 자가체크(5점 만점).

## 금지
- **파일은 Read·Edit·Write 도구로만 읽고 고친다.** Bash는 `npm run build`, `npm run check`, `node scripts/validate-analyses.mjs`, `date`만 허용되며 그 밖의 명령(python/node 스크립트로 JSON 고치기, cat, git 등)은 권한 거부로 실패한다 — 시도하지 말고, 거부되더라도 멈추지 말고 Edit/Write로 이어서 끝낸다. (2026-10-06 첫 실행이 스크립트 거부 뒤 아무것도 쓰지 않고 끝난 적 있음)
- 숫자를 지어내지 않는다. 기술적분석 숫자는 `data/technical/latest.json`만, 나머지 숫자는 서브에이전트가 출처와 함께 가져온 것만.
- 매수·매도·보유 권유, "지금 사라/팔아라" 류 표현 금지. 애널리스트 의견은 "~로 집계된다(사실 보고)"로만.
- `index.html`을 직접 고치지 않는다(`npm run build`가 만든다).
