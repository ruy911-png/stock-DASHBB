// 사용법: 배포된 페이지(https://ruy911-png.github.io/stock-DASHBB/)를 열고
// 브라우저 devtools 콘솔에 이 파일 전체를 그대로 붙여넣어 실행한다.
// NEW_ENTRIES를 수정해 다른 종목/리포트를 넣고 재사용할 수 있다.
// 서식 규칙: 기존 카드와 통일감을 위해 overview/fundamental/valuation은
// 긴 산문 대신 "• " 로 시작하는 짧은 불릿 3~4줄로 작성한다 (줄바꿈은 \n).

const NEW_ENTRIES = [
  {
    code: "005930",
    name: "삼성전자",
    market: "kospi",
    tags: ["반도체", "HBM", "파운드리"],
    ai: "claude",
    date: "7.12",
    overview: `• 반도체(DS: 메모리·시스템반도체·파운드리)·모바일(MX/DX)·TV가전(VD/DA)·디스플레이(SDC)를 아우르는 종합 전자기업. DS부문이 실적 견인(1Q26 매출 134조·영업익 57.2조, DS 비중 압도적) [Samsung Newsroom, 기준일 2026.04.30]
• 메모리(D램·낸드) 글로벌 1위이나 HBM은 SK하이닉스에 밀린 2위(점유율 32% vs 58%, 2026-1Q) [카운터포인트리서치]
• 파운드리는 TSMC(71%)에 크게 못 미치는 2위(6.8%, 2025-3Q). 2나노 확대·흑자전환 목표를 2026년으로 앞당기며 경쟁력 회복 추진 중
• 모바일은 애플과 함께 글로벌 최상위권 지위 지속`,
    fundamental: `• 1Q26 매출 133.9조·영업익 57.2조(+43%/+185% QoQ), 2Q26 잠정 매출 171조·영업익 89.4조로 컨센서스(85~86조) 상회 — 2분기 연속 역대 최대
• Thesis: AI서버향 HBM·고부가 D램 가격 급등이 DS부문 이익 급증 견인, DX(스마트폰·가전)는 원가부담 속 이익방어 수준
• 재무건전성 매우 양호: ROE 18~31%, 부채비율 20~28%, 순현금 상태(정확한 분기별 매핑은 미확인)
• 리스크: 메모리 슈퍼사이클 정점 통과 시점, DS부문 일회성 비용 반영에 따른 이익 변동성`,
    technical: "",
    valuation: `• 현재가 285,000원대·시총 약 1,700조원, 후행 PER 23.1배·PBR 3.98배 → 실적 급증 반영한 12개월 선행 PER 8~9배·PBR 약2.3배·EV/EBITDA 3.5~3.9배로 크게 낮아짐
• 마이크론(PER 11~12배)·SK하이닉스(PER 5.7~6배) 대비 선행 PER 8~9배는 상대적 할인 거래 중이라는 분석 다수
• 목표주가 컨센서스 평균 약 36.8만원(범위 21만~57만원) — 확정치 아닌 추정치`,
  },
];

function upsertAnalyses(entries) {
  const STORAGE_KEY = "recdash_analyses_v4";
  const raw = localStorage.getItem(STORAGE_KEY);
  let list = [];
  try {
    list = raw ? JSON.parse(raw) : [];
  } catch (e) {
    list = [];
  }

  let updatedCount = 0;
  let addedCount = 0;

  entries.forEach((entry) => {
    const { code, name, market, tags, ai, date, overview, fundamental, technical, valuation } = entry;
    const aiEntry = { ai, date, overview, fundamental, technical, valuation };
    const idx = list.findIndex((item) => item.code === code);

    if (idx !== -1) {
      const existing = list[idx];
      existing.tags = tags;
      const sameDayIdx = (existing.ais || []).findIndex((a) => a.ai === ai && a.date === date);
      if (sameDayIdx !== -1) {
        existing.ais[sameDayIdx] = aiEntry; // same AI+date already exists today: replace in place, no duplicate
      } else {
        existing.ais = [aiEntry, ...(existing.ais || [])].slice(0, 5);
      }
      updatedCount++;
    } else {
      list.unshift({
        code,
        name,
        price: 0,
        chg: 0,
        market,
        tags,
        ais: [aiEntry],
      });
      addedCount++;
    }
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  return { updatedCount, addedCount };
}

const result = upsertAnalyses(NEW_ENTRIES);
console.log(
  `[upsert-analysis] 갱신 ${result.updatedCount}건, 신규 추가 ${result.addedCount}건 완료. 새로고침하면 반영된 내용을 확인할 수 있습니다.`
);
