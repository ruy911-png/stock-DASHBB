---
name: case-study
description: 과거사례 Study의 사례 하나(data/cases.json의 items[id])에 웹검색으로 뉴스 타임라인·요약·태그를 쓴다. 숫자(낙폭·기간)는 코드가 이미 계산했으니 글만 쓴다. GitHub Actions(case-study.yml)와 PC에서 같은 절차. 인자 = 사례 id(예: /case-study c20260818-503dd4).
allowed-tools: Read, Write, Edit, Grep, Glob, WebSearch, WebFetch, Bash(npm run build), Bash(node scripts/validate-cases.mjs), Bash(date *)
---

# 과거사례 글 작성

대상: `$ARGUMENTS` (사례 id 하나. 비어 있으면 중단하고 "대상 없음"이라고 답한다)

## 절차
1. `data/cases.json`을 읽어 `items[id]`를 찾는다. `title`·`start`·`end`(null이면 진행 중)·`event`와 코드가 계산한 `indices.KOSPI`·`indices.SP500`(peak_date·bottom_date·drawdown_pct·recovery_date)이 있다. **이 숫자는 고치지 않고, 새 숫자(낙폭·기간)를 만들지 않는다.** 글에서 지수 수치가 필요하면 indices의 값만 그대로 인용한다.
2. 웹검색으로 그 기간(`start`~`end`, 진행 중이면 오늘까지)의 핵심 뉴스를 찾는다. 검색은 제목·기간·"코스피"·"S&P500"·사건 키워드로 3~6번. 한국 기사(연합뉴스·한국경제·매일경제 등)와 영문 기사(Reuters·Bloomberg·CNBC 등)를 섞는다.
3. 아래 칸만 `items[id]`에 써 넣는다(다른 칸은 손대지 않음):
   - `tag`: 12자 이내 분류(예: 고금리, 하락장, V자 반등, 바닥 통과)
   - `summary`: 220자 이내 2~3문장. 원인 → 전개 → (끝났으면) 회복 계기를 **사실로만**. 전망·권유 금지.
   - `timeline`: 4~8개, 날짜 오름차순. 각 항목 `{ "date": "YYYY-MM-DD", "sentiment": "악재|호재|중립", "label": "40자 이내 제목", "desc": "90자 이내 한 줄", "url": "기사 링크(필수)" }`. 날짜는 기사 발생일. 같은 사건을 두 기사가 다르게 적으면 둘 중 공식 발표(중앙은행·통계청·거래소)에 가까운 쪽을 쓰고 desc에 "기사별 차이"라고 적는다.
   - `compare`(선택, 160자 이내): 같은 성격의 다른 시기가 있으면 "비교: 2023-10 10년물 장중 5% 터치 후 두 달 하락"처럼 한 줄. 없으면 넣지 않는다.
   - `written_at`: 오늘 날짜 YYYY-MM-DD (`date +%F`).
4. 금지: 매수·매도·분할매수·저점매수·기회·타이밍·전망·예상 표현, 확률(낙관/비관 %), 출처 없는 타임라인 항목, 코드가 계산하지 않은 낙폭·기간 숫자. 확인 안 되는 내용은 쓰지 않는다(미확인이라고 적지도 않고 그냥 뺀다).
5. `node scripts/validate-cases.mjs` → 통과하면 `npm run build`. 실패하면 지적된 칸을 고쳐 다시 검증한다(최대 3회).
6. 마지막 답에 요약: 사례 id·제목, 타임라인 개수와 출처 매체 목록, 뺀 내용이 있으면 이유, 신뢰도 자가체크(5점 만점).

## 규칙
- 커밋·푸시는 하지 않는다(워크플로가 한다). `data/cases.json`과 `index.html`(build 결과) 외 다른 파일은 고치지 않는다.
- 공개 저장소이니 기사 본문을 길게 옮기지 않는다(제목·한 줄 요약·링크만).
