# 시황 데이터

`index.json`이 시황분석 화면의 기준 데이터입니다. 최신 항목을 `entries` 맨 앞에 추가합니다.

- 국장: 한국 정규장 마감값
- 미장: 미국 정규장 마감값
- WTI: NYMEX 최근월물 공식 결제값
- 수급: 코스피 외국인·기관·개인 순매수(억원)
- 코멘트·키워드: 네이버페이 증권 AI 브리핑

PR에서는 `npm run check`로 날짜, 8개 지표, 수급, 출처를 자동 검증합니다.

## 자동 수집

GitHub Actions가 화~토요일 오전 6시 30분(KST)에 실행됩니다.

1. 네이버페이 증권에서 국장·미장·WTI 마감값을 수집합니다.
2. 코스피 수급과 코멘트·키워드는 최신 네이버페이 증권 AI 브리핑에서 만듭니다.
3. 검증을 통과하면 날짜별 PR을 생성합니다.
4. PR을 확인하고 병합하면 GitHub Pages에 반영됩니다.

수동 시험은 Actions의 `Collect market data`에서 `Run workflow`로 실행할 수 있습니다.

자동 PR 생성을 위해 저장소의 `Settings → Actions → General → Workflow permissions`에서
`Allow GitHub Actions to create and approve pull requests`를 한 번 켜야 합니다. 이 워크플로는 PR 생성만 하며 자동 승인·병합은 하지 않습니다.
