// 사용법: 배포된 페이지(https://ruy911-png.github.io/stock-DASHBB/)를 열고
// 브라우저 devtools 콘솔에 이 파일 전체를 그대로 붙여넣어 실행한다.
// NEW_ENTRIES를 수정해 다른 종목/리포트를 넣고 재사용할 수 있다.
// 서식 규칙: 기존 카드와 통일감을 위해 overview/fundamental/valuation은
// 긴 산문 대신 "• " 로 시작하는 짧은 불릿 3~4줄로 작성한다 (줄바꿈은 \n).
// 미국 종목은 market: "us", code는 티커(예: "AMAT")를 그대로 사용한다.

const NEW_ENTRIES = [
  {
    code: "AMAT",
    name: "AMAT",
    market: "us",
    tags: ["반도체장비", "AI", "WFE"],
    ai: "claude",
    date: "7.12",
    overview: `• 세계 최대 반도체 웨이퍼 팹 장비(WFE) 업체 — 증착·식각·이온주입·CMP·열처리 등 반도체시스템이 핵심, AGS(장비유지보수)·Display 부문 병행
• ASML·Lam Research·TEL·KLA 등과 경쟁하나 폭넓은 포트폴리오로 WFE 시장 1위 지위, AI 반도체발 첨단노드·GAA·첨단패키징 투자 수혜
• 리스크: 대중(對中) 수출규제 강화로 중국 매출 축소, FY26 매출 약 6~7억달러 손실 전망`,
    fundamental: `• FY26 2Q 매출 79.1억달러(+11%YoY, 사상최대), 비GAAP EPS 2.86달러(사상최대), 3Q 가이던스 매출 89.5억±5억달러로 가속 성장
• 2026년 글로벌 WFE 지출 사상 최대 약 1,350억달러(+9%YoY) 전망 — AI·HBM·2nm·첨단패키징 수요의 "기가사이클" 국면
• 강세: AI발 첨단 로직·메모리·패키징 장비 수요 확대, 마진 개선 / 약세: 파운드리·로직 성장(+5.5%)은 상대적으로 완만해 메모리·패키징 쏠림
• 리스크: 대중 수출규제 추가 강화 시 매출·백로그 변동성 확대`,
    technical: "",
    valuation: `• 후행 PER 약 46배, 선행 PER 33~41배, EV/EBITDA 약 42배로 자체 역사적 평균(선행 15~20배) 대비 크게 프리미엄, ASML(선행 43~52배)보다는 낮고 Lam Research(39~40배)와 유사
• 목표주가는 이익승수법 기준 약 $420~550 범위(현재가 약 $410) — AI 자본지출 지속 가정한 추정치, 확정치 아님`,
  },
  {
    code: "ARM",
    name: "ARM홀딩스",
    market: "us",
    tags: ["반도체IP", "로열티", "AI"],
    ai: "claude",
    date: "7.12",
    overview: `• 반도체 IP 라이선싱 + 칩 출하량 기반 로열티 수취하는 자산경량 모델. FY26 4Q 라이선스 8.19억달러(+29%YoY), 로열티 6.71억달러(+11%YoY)
• CSS·Total Access 등 라이선싱 옵션과 Armv9 채택 확대로 칩당 로열티율 상승, 모바일 넘어 데이터센터·서버로 확장하며 x86 점유율 잠식
• 최근 자체 실리콘 'AGI CPU'(3nm, 데이터센터·에이전틱AI용) 출시로 순수 IP 라이선싱→프로덕션 실리콘 공급까지 사업 확장
• 리스크: 중국·저가IoT에서 오픈소스 RISC-V 점유율 확대(약25%)가 장기 경쟁 리스크`,
    fundamental: `• FY26 연매출 $49.2억(+24%YoY), ACV(연환산 라이선스가치) $16.6억(+22%YoY) — Armv9·CSS 채택과 AI 데이터센터 수요가 견인
• Non-GAAP 영업이익률 43.0%(FY25 46.7%에서 하락) — R&D 확대·대규모 주식보상비용(매출대비 약21%)이 GAAP-비GAAP 괴리 확대
• 순현금 우량(현금+단기투자 약$36억, 총부채 $4.57억), FY26 Non-GAAP FCF $8.82억으로 견조
• 리스크: SBC 과다에 따른 GAAP 마진 희석, 대형 라이선스 계약의 분기별 타이밍 변동성`,
    technical: "",
    valuation: `• 트레일링 PER 약355배, 선행 PER 약138배, EV/EBITDA 약298배로 반도체IP·EDA 동종업계(퀄컴 10~20배대, 시놉시스·케이던스 선행 30~45배) 및 자체 역사적 밴드 크게 상회하는 프리미엄
• 컨센서스 목표주가 평균 $298.84(범위 $279~299) — AI 반도체IP 수요 성장·마진 확대 전제한 추정치, 확정치 아님`,
  },
  {
    code: "BAC",
    name: "뱅크오브아메리카",
    market: "us",
    tags: ["은행", "IB", "금리"],
    ai: "claude",
    date: "7.12",
    overview: `• 미국 2위 대형 상업은행 — 소비자금융·글로벌자산관리(GWIM)·글로벌뱅킹(IB)·글로벌마켓(트레이딩) 4개 부문 균형 구조, 소비자금융이 매출 비중 1위
• 광범위 지점망·디지털뱅킹(에리카 AI)으로 예금기반 저비용 조달 우위, IB·마켓에서 JPM·GS와 경쟁하는 글로벌 상위권
• 최근 IB 파이프라인 확대·수수료 환경 개선·순이자마진(NIM) 개선이 실적 견인, 트레이딩 15분기 연속 YoY 성장`,
    fundamental: `• 1Q26 NII 158.7억달러(+9%YoY, 컨센서스 상회), 연간 NII 가이던스 6~8%로 상향. 전사매출 303억달러(+7%YoY)
• 대손충당금 13억달러(전년比 감소), NCO비율 0.48%로 개선. CET1비율 11.2%(주주환원 확대로 소폭 하락)
• ROTCE 16%(목표범위 16~18% 하단), 효율성비율 61%(개선). 순이익 86억달러, EPS $1.11(전년$0.89)
• 리스크: 순이자마진 세부치·비이자수익 부문별 분해 등 일부 미확인, 2Q26 실적(7/14 발표예정) 확인 필요`,
    technical: "",
    valuation: `• 주가 약$59.6, P/E 14.8배, P/B 1.54배로 10년 중앙값(1.14배) 대비 약20% 프리미엄. JPM(P/TBV 2.87배)보다 낮고 Citigroup(P/B 약1.0~1.2배)보다 높음
• 컨센서스 목표주가 평균$64.12(범위$59~71) — 완만한 상승여력 시사하나 추정치, 배당수익률 약2.1~2.2%(업계평균 3.2% 하회)`,
  },
  {
    code: "MS",
    name: "모건스탠리",
    market: "us",
    tags: ["IB", "자산관리", "트레이딩"],
    ai: "claude",
    date: "7.12",
    overview: `• 글로벌 투자은행 — 기관증권(IB·트레이딩)·자산관리(WM)·투자관리 3대 부문, 1Q26 기관증권 100.7억달러·자산관리 85억달러(세전마진30.4%)·투자관리 15억달러
• IB·트레이딩에서 골드만삭스와 최상위권 경쟁력, E*Trade·Eaton Vance 인수 이후 자산관리 수수료 기반 확대로 변동성 낮은 수익구조로 체질 개선
• 최근 시장 변동성 확대에 따른 트레이딩 호실적과 M&A 자문 회복이 분기 최대 순매출 견인`,
    fundamental: `• 1Q26 순영업수익 206억달러, EPS $3.43로 분기 사상 최대. 순이익 +29%YoY, WM 순신규자산 1,180억달러 유입(+16%), IB(+74%)·주식/채권트레이딩(+25%/+29%) 전부문 강세
• 업종 사이클상 증시 강세·IPO/M&A 회복으로 IB·트레이딩 상승국면, 자산관리형 수수료 비중 확대로 실적 변동성 완화되는 구조적 전환기
• 강세: ROTCE 27%로 자기자본이익률 개선, 고액자산가 자금유입 지속성 / 약세: 최근 급등에 따른 밸류에이션 부담
• 리스크: 금리·경기 둔화 시 IB 딜 파이프라인 위축, 트레이딩 변동성 확대에 따른 실적 되돌림 가능성`,
    technical: "",
    valuation: `• 주가 약$222.86, 트레일링 PER 19.1~20.1배, 선행 PER 약17.8배. P/B 2.94배로 10년 중앙값(1.43배) 대비 역사적 고점권, JPM(P/TBV2.87배)·GS(P/B2.48배)와 유사~다소 높음
• 컨센서스 목표주가 평균 $203~218(자료별 편차), Buy 우세(Strong Buy23%+Buy31%) — 자산관리 비중 확대에 따른 재평가 반영, 배당수익률 약1.80%(BAC보다 낮음)`,
  },
  {
    code: "WMT",
    name: "월마트",
    market: "us",
    tags: ["유통", "이커머스", "광고"],
    ai: "claude",
    date: "7.12",
    overview: `• 세계 최대 오프라인 유통업체 — 대형 할인점·슈퍼센터·Sam's Club 운영, 매장 밀도와 규모의 경제 기반 EDLP(상시저가) 경쟁력이 핵심
• FY26 매출 약 7,131억달러, 이커머스 1,504억달러(비중 약23%, +24%)로 15분기 연속 두자릿수 성장, 이커머스 전환 가속
• 광고사업 Walmart Connect +46% 성장(64억달러) — 광고+멤버십이 4분기 영업이익의 약 1/3 차지하며 고마진 포트폴리오로 전환 중
• 고마진 사업 확대가 오프라인 가격경쟁력 유지 재원으로 작용, 아마존 등과의 경쟁에서 구조적 우위 강화 전략`,
    fundamental: `• FY26 1Q(4/30마감) 매출 1,777.5억달러(+7.3%YoY), 순이익 54.9억달러(+18.8%YoY), 매출총이익률+12bp 대비 판관비율+56bp로 영업레버리지 다소 둔화
• 미국 comp sales +4.5%, Sam's Club US +6.7%, 이커머스 +26%·광고 +37% 성장 견인. FY25 영업현금흐름 364억달러, FCF 127억달러(전년比 감소, 투자확대 영향)
• ROIC 약11~13%, 51년 연속 배당증액(배당킹), 배당성향 약33%, 배당수익률 약0.89%
• 강세: 이커머스·광고 고성장에 따른 매출믹스 개선 / 리스크: 판관비 상승에 따른 영업레버리지 둔화, 유동비율 0.78로 단기 유동성 부담`,
    technical: "",
    valuation: `• 주가 $111.54(시총 약$906B), 트레일링 PER 39.1배·선행 PER 37.3~37.5배로 5년평균 대비 약+24% 할증, EV/EBITDA 21배. Costco(PER약50배)보다 낮고 Target(PER16배)보다 크게 높음
• 컨센서스 목표주가 $138~155(편차 큼) — 53년 연속 배당성장(Dividend King)이 프리미엄 일부 정당화하나 자체 5년평균·업종 중간값 대비 고평가 논란 존재`,
  },
  {
    code: "KO",
    name: "코카콜라",
    market: "us",
    tags: ["음료", "필수소비재", "배당"],
    ai: "claude",
    date: "7.12",
    overview: `• 1886년 설립, 원액·시럽을 병입파트너에 판매하는 자산경량 모델 — 북미/EMEA/라틴아메리카/아태/글로벌벤처스 5개 부문 운영
• 코카콜라·스프라이트·환타·다사니·코스타 등 브랜드 보유, 코카콜라 제로슈거가 2025년 +14% 성장하며 최대 성장 브랜드로 부상
• 모나크에너지(몬스터 지분)·바디아머 통해 에너지·기능성음료로 카테고리 확장 중, 펩시 대비 음료 단일카테고리 집중으로 고마진 구조 유지`,
    fundamental: `• 1Q26 매출 124.7억달러(+12%YoY), 유기적 매출성장 +10%(가격·믹스 주도, 물량+3%), comparable EPS $0.86(+18%YoY)로 시장예상 상회
• 2026년 가이던스 유기적 매출성장 4~5%, comparable EPS성장 8~9%로 상향. 2Q26 실적은 7/28 발표예정(미확인)
• 필수소비재로 경기방어적, 가격전가력 검증된 국면. 강세: 가격/믹스 주도 성장과 마진개선, 상향 가이던스
• 리스크: 물량 성장 둔화 가능성, 원재료·환율 변동에 따른 마진 변동성, 설탕세·건강규제 강화에 따른 수요 위축 가능성`,
    technical: "",
    valuation: `• 주가 $84.14(시총 약$362B), 트레일링 PER 26.4배·선행 PER 24.6배, EV/EBITDA 22.7배. PepsiCo(PER21.3배, 배당수익률4.15~4.29%)보다 배수는 높고 배당수익률(2.52%)은 낮음
• 컨센서스 목표주가 평균 $85.97(자료별 $85~88), Buy 우세 — 브랜드력·안정성 프리미엄 반영, 자체 과거평균 대비 낮은 배당수익률은 프리미엄 구간 시사`,
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
