// 사용법: 배포된 페이지(https://ruy911-png.github.io/stock-DASHBB/)를 열고
// 브라우저 devtools 콘솔에 이 파일 전체를 그대로 붙여넣어 실행한다.
// NEW_ENTRIES를 수정해 다른 종목/리포트를 넣고 재사용할 수 있다.

const NEW_ENTRIES = [
  {
    code: "005930",
    name: "삼성전자",
    market: "kospi",
    tags: ["반도체", "HBM", "파운드리"],
    ai: "claude",
    date: "7.12",
    overview: `삼성전자는 반도체(DS: 메모리·시스템반도체·파운드리), 모바일·통신(MX/DX), TV·가전(VD/DA), 디스플레이(SDC) 등을 아우르는 종합 전자기업으로, 2026년 1분기 기준 DS부문이 매출·영업이익 모두에서 실적을 견인하고 있음(매출 약 134조원, 영업이익 약 57.2조원, DS부문 영업이익 비중 압도적) [Samsung Newsroom, 2026-1Q 실적발표, 기준일 2026.04.30].

메모리(D램·낸드) 시장에서는 글로벌 1위 지위를 유지하고 있으나 HBM(고대역폭메모리)에서는 SK하이닉스에 뒤진 2위(점유율 약 32%, SK하이닉스 약 58%, 2026년 1분기 기준)로 경쟁 열위에 있음 [카운터포인트리서치, 기준일 2026-1Q].

파운드리 부문은 TSMC(점유율 약 71%)에 크게 못 미치는 2위(약 6.8%, 2025년 3분기 기준)이며, 2나노 공정 확대와 흑자전환 목표 시점을 2027년에서 2026년으로 앞당기는 등 경쟁력 회복을 추진 중.

모바일(스마트폰) 사업은 애플과 함께 글로벌 최상위권 지위를 지속.`,
    fundamental: `삼성전자는 2026년 1분기 연결기준 매출 133.9조원·영업이익 57.2조원(전분기 대비 각각 +43%, +185%)을 기록했고, 2분기 잠정실적은 매출 171조원·영업이익 89.4조원으로 시장 컨센서스(약 85~86조원)를 상회하며 두 분기 연속 역대 최대 실적을 경신했다. AI 서버향 HBM·고부가 D램 중심의 메모리 가격 급등에 따른 DS(반도체)부문 이익 급증이 주 요인이며, DX(스마트폰·가전)부문은 원가 부담 속에 이익 방어 수준. 재무비율은 ROE 약 18~31%, 부채비율 20~28%, 순부채비율 마이너스(순현금 상태)로 재무 건전성은 매우 양호(정확한 분기별 매핑은 미확인). 핵심 리스크는 메모리 슈퍼사이클의 정점 통과 시점과 DS부문 일회성 비용 반영에 따른 향후 이익 변동성.`,
    technical: "",
    valuation: `현재가 285,000원대·시가총액 약 1,700조원대이며, 후행 PER 23.1배·PBR 3.98배 대비 1Q26 영업이익 YoY +756% 등 실적 급증을 반영한 12개월 선행 기준은 PER 8~9배·PBR 약2.3배·EV/EBITDA 3.5~3.9배로 크게 낮아져 후행/선행 배수 괴리가 큼. 동종 마이크론(PER 약11~12배)·SK하이닉스(PER 약5.7~6배) 대비 선행 PER 8~9배는 상대적 할인 거래 중이라는 분석이 다수. 목표주가는 증권사별 21만~57만원(컨센서스 평균 약 36.8만원)으로 편차가 크며, 확정치가 아닌 추정치임에 유의.`,
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
      existing.ais = [aiEntry, ...(existing.ais || [])].slice(0, 5);
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
