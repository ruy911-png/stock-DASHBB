# 인수인계 — 새 대화에서 이어가기 (2026-10-07 기준)

새 세션은 CLAUDE.md와 이 파일을 먼저 읽는다. 세션이 끝날 때 이 파일을 갱신해 PR로 올린다(머지는 사용자).

## 대화 규칙 (사용자 선호)
- 답은 짧게. 애매하면 질문, 추측이면 "추측"이라고 말하기, 모르면 "모른다" 또는 "화면 보내주세요". 끝에 신뢰도 자가체크(5점 만점).
- 화면 수정은 최소한으로. 올리기 전에 반드시 직접 렌더링해서 본다(`npm run shot`, CLAUDE.md '화면 확인'). 안 보고 올려서 여러 번 지적받았음.
- 사용자는 PC·아이패드·갤럭시 폴드로 보며 캡처로 지적한다. 매수·매도 권유 표현 금지("스크리닝 결과(통계용)").
- PR 머지는 사용자가 GitHub에서 직접 한다. "머지해"라고 하면 시도하되, 이 환경이 머지를 막을 수 있다.

## 현재 상태 (2026-10-07 정오 KST)
- main 최신 = PR #121 머지. 열린 PR 없음. 10/7 머지: #118 홈 순서(시황 요약 → 뉴스 검색 → 카드 4개), #119 렌더 하네스 + tester 역할, #120 하네스 보강(`--full`·주의·Noto Sans KR), #121 좁은 폭(720px 미만) 메뉴 자동 접기·홈 헤더/수급 줄바꿈·body 여백 0·홈 카드 설명 keep-all.
- 페이지: GitHub Pages(ruy911-png.github.io). 머지 후 2~3분이면 배포.
- 자동 실행: 시황 수집 평일 20:20·21:20·22:20 KST(main 직접 커밋) · 종목 특성 토요일 09:20 KST · 종목분석 글은 자동 없음(페이지 ⚡ 오늘자로 업데이트 / 종목별 새로고침 → refresh-analyses.yml → 기술지표·종목 특성 먼저 커밋 → Claude(Secret `CLAUDE_CODE_OAUTH_TOKEN`) 분석 → 커밋).
- 토큰: 페이지 버튼용 GitHub fine-grained PAT는 기기별 브라우저 localStorage(`stockking_gh_token`)에만 저장(PC·아이패드·갤럭시 폴드 각각). 어떤 토큰도 대화·커밋·파일에 넣지 않는다. 사용자가 대화에 토큰을 붙이면 쓰지 말고 재발급을 안내한다.
- Routine "시황 데이터 PR 머지 확인 알림"은 10/7에 비활성화(필요하면 다시 켬).
- 머지된 브랜치 `feat/ui-shot-harness`에 같은 커밋이 하나 더 올라가 있음(지워도 됨).

## 남은 일 (사용자가 모양을 정한 뒤 고친다)
- tester 첫 시험(10/7)에서 나온 것 중 미수정: ① 940px 홈 카드 4개가 3+1로 꺾여 과거사례 카드만 둘째 줄, '39종목' 두 줄 ② 1180px에서 VIX 카드만 둘째 줄 ③ 420px(폴드 커버 폭)에서는 메뉴가 접혀도 종목 목록 종목명이 말줄임으로 빡빡함.
- 먼저 꺼내지 말 것: stock-screening PRD 미결 질문(아래).

## 작업 절차 (UI 수정)
1. `git fetch origin main && git checkout -B <branch> origin/main`
2. `src/dashboard.template.html`만 고친다(`index.html`은 `npm run build`가 생성). 숫자는 코드만 계산한다.
3. `npm run build` → `npm run check`
4. `npm run shot -- --screen <화면> --width 1180,940,600`(tester 에이전트 담당, `--help`에 옵션) → `.cache/ui-shots/`의 PNG를 Read로 직접 본 뒤 사용자에게 보여준다. 블록 순서·화면 하단은 `--full`.
5. 커밋(세션 안내의 트레일러) → `git push -u origin <branch>` → PR 생성 → 머지는 사용자.

## 렌더 하네스 메모
- `scripts/ui-shot.cjs`. 클라우드 세션에는 Playwright·Chromium이 있고, CDN 차단은 `npm pack`으로 우회한다(`.cache/ui-vendor/`, 커밋 안 함). 폰트는 Noto Sans KR을 주입해 갤럭시에 가깝고, 아이패드·PC는 몇 px 차이의 줄바꿈이 다를 수 있다.
- 출력의 '주의'(화면 밖·상자 밖 글자·말줄임·body 여백)는 자동 감지 결과 → 그 자리를 먼저 본다. 옵션: `--click "<글자>"`(카드 열기·버튼), `--full`, `--busy`(실행 중 상태), `--no-token`(토큰 없음 상태), `--font none`.

## stock-screening (다른 저장소)
- `docs/handoff.md`(브랜치 `setup/agent-team-prd` 또는 `test/backtest-sepa-buffett-bb`, main에는 없음, 2026-10-05 기준) 참고. PRD 미결 질문(Q40 실행 요청 방법 등)은 사용자가 "기다려"라고 해서 보류 — 사용자가 다시 꺼낼 때까지 먼저 꺼내지 않는다.
- 백테스트·러셀1000(S&P 제외) 결과는 이슈 #2, 코드는 브랜치 `test/backtest-sepa-buffett-bb`(푸시됨, PR 없음). 브랜치 `test/lightgbm-feasibility-20261006`도 있다.
- Secrets `SEC_USER_AGENT`(사용자 이메일)·`R1000X_UNIVERSE`(iShares 목록)는 로그·커밋 금지, 레딧 원문 커밋 금지. 외부 접속 차단은 우회하지 않고 실제 호출 검증은 GitHub Actions에서 한다.
