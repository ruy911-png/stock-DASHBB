// '미확인' 검사기 테스트(사용자 요청 2026-10-29: 실행할 때 미확인이 너무 많다 → TDD로 고친다).
// 새 분석은 ① 미확인마다 이유를 붙이고(미확인(이유)) ② 한 분석에 미확인이 MAX_UNCONFIRMED개를 넘지 않아야 한다.
// 걸리면 refresh-analyses 스킬이 그 항목만 다시 찾아본다. 예전 분석은 검사하지 않는다(종목을 지정해 최신 분석만 검사).
import assert from 'node:assert/strict';
import { findUnconfirmed, checkUnconfirmed, hasGrowth, growthProblems, MAX_UNCONFIRMED } from './unconfirmed.mjs';

// 10/29 모더나(MRNA) 실제 분석(문장 일부 줄임) — 이유 없는 미확인 5개
const mrna = {
  ai: 'claude', date: '10.29',
  overview: '• mRNA 플랫폼으로 백신·치료제를 개발하는 미국 바이오기업 (Moderna 10-K)\n• 매출은 코로나 백신 편중 (Moderna 실적발표)\n• mRNA 상용화 선도지만 화이자·BioNTech 등과 경쟁. 3분기 실적과 연간 가이던스는 미확인',
  moat: '• 강점: mRNA 플랫폼과 승인 이력이 개발 속도의 진입장벽이다. 점유율 수치는 미확인\n• 리스크: 코로나 백신 계절성 수요 의존이 크다\n• 리스크: RSV·독감 시장은 대형 제약사가 선점해 후발 진입이다. 영향 규모는 미확인',
  fundamental: '• 2분기 매출 1.45억달러, 순손실 7.8억달러. 3분기 실적은 11월 초 예정이라 미확인 (Moderna 8-K)\n• 현금흐름: 2분기 OCF -5.3억 (StockAnalysis)\n• 8월 암백신 3상 1차 지표 충족 (BioPharma Dive)',
  technical: '• 종가 $214.17 (코드 계산, yfinance 일봉, 2026-10-28)',
  valuation: '• 최근 12개월 순손실이라 PER은 산정 불가다 (StockAnalysis)\n• PBR 12.6배(BPS $16.94). 자체 과거평균·동종 PBR은 미확인 (StockAnalysis)\n• 목표주가 평균 $138.37(23명, 범위 $45~251, 2026-10-27 기준, StockAnalysis)',
};

// 1) 섹션별 위치를 찾고, 이유가 없으면 reason이 null
const found = findUnconfirmed(mrna);
assert.deepEqual(found.map(f => f.section), ['overview', 'moat', 'moat', 'fundamental', 'valuation']);
assert.ok(found.every(f => f.reason === null));
assert.match(found[1].bullet, /점유율 수치는 미확인/); // 어느 bullet인지 보여 준다

// 2) 이유 없는 미확인이 있으면 실패, 문제 목록에 각 항목이 나온다
const bad = checkUnconfirmed(mrna);
assert.equal(bad.ok, false);
assert.equal(bad.problems.filter(p => p.kind === 'no-reason').length, 5);
assert.ok(bad.problems.some(p => p.kind === 'too-many')); // 5개 > 한도

// 3) 이유는 '미확인(…)' 바로 붙은 괄호. 출처처럼 띄어 쓴 괄호는 이유가 아니다
assert.equal(findUnconfirmed({ technical: '• 미확인(일봉 조회 실패)' })[0].reason, '일봉 조회 실패');
assert.equal(findUnconfirmed({ valuation: '• 동종 PBR은 미확인 (StockAnalysis, 2026-10-27)' })[0].reason, null);
assert.equal(findUnconfirmed({ moat: '• 점유율은 미확인()' })[0].reason, null); // 빈 괄호는 이유가 아님

// 4) 다시 찾아본 뒤의 모습 — 찾은 값은 채우고, 발표 전 실적은 '예정'으로, 끝내 없는 것만 이유를 달아 남김 → 통과
const fixed = {
  ...mrna,
  overview: mrna.overview.replace('3분기 실적과 연간 가이던스는 미확인', '연간 매출 가이던스 15억~22억달러'),
  moat: mrna.moat.replace('점유율 수치는 미확인', '점유율 수치는 미확인(공개 자료 없음)').replace('영향 규모는 미확인', '영향 규모는 미확인(수치 근거 없음)'),
  fundamental: mrna.fundamental.replace('3분기 실적은 11월 초 예정이라 미확인', '3분기 실적은 11월 6일 발표 예정').replace('2분기 매출 1.45억달러, 순손실 7.8억달러', '2분기 매출 1.45억달러(+2.1%), 순손실 7.8억달러(적자 축소)'),
  valuation: mrna.valuation.replace('자체 과거평균·동종 PBR은 미확인', '5년 평균 PBR 약 4배'),
};
const good = checkUnconfirmed(fixed);
assert.deepEqual(good.problems, []);
assert.equal(good.ok, true);
assert.equal(findUnconfirmed(fixed).length, 2);

// 5) 이유가 있어도 한도를 넘으면 실패(다 미확인으로 두는 것을 막는다)
const many = { overview: Array.from({ length: MAX_UNCONFIRMED + 1 }, (_, i) => `• 항목${i} 미확인(공개 자료 없음)`).join('\n') };
const r = checkUnconfirmed(many);
assert.equal(r.ok, false);
assert.deepEqual(r.problems.map(p => p.kind), ['too-many']);
assert.equal(checkUnconfirmed({ overview: '• 확인된 값만 있음. PER은 순손실이라 산정 불가' }).ok, true); // '산정 불가'는 미확인이 아니다

// 6) 실적 증감률(사용자 지적 2026-10-30: MS '3Q26 순매출 203억 달러(전년 182억)' — 증감률이 안 보임)
//    기본적분석 첫 bullet(최근 실적)에 부호 있는 증감률(+11.6% / -3.2%)이 있어야 한다.
//    발표 전이면 '발표 예정', 끝내 없으면 '증감률은 미확인(이유)'도 허용
const msFund = '• 3Q26 순매출 203억 달러(전년 182억), 희석 EPS 3.03달러(전년 2.80)다 (MS 3Q26 8-K, 2026-10-14)\n• 현금흐름: OCF -156억 (StockAnalysis)';
assert.equal(hasGrowth(msFund), false);
assert.equal(hasGrowth('• 3Q26 순매출 203.4억 달러(전년 대비 +11.6%), 희석 EPS 3.03달러(+8.2%) (MS 8-K)'), true);
assert.equal(hasGrowth('• 3분기 매출 12.36억달러(+138.1%), 영업이익 2.25억달러 (SEC 8-K)'), false); // 7) 규칙: 이익 증감률도 필요(전엔 통과)
assert.equal(hasGrowth('• 3분기 매출 12.36억달러(+138.1%), 영업이익 2.25억달러(흑자 전환) (SEC 8-K)'), true);
assert.equal(hasGrowth('• 3분기 실적은 11월 6일 발표 예정 (Moderna)'), true); // 실적 숫자가 없고 발표 전이면 통과
assert.equal(hasGrowth('• 2분기 순손실 7.8억달러. 3분기 실적은 11월 6일 발표 예정 (Moderna)'), false); // 쓴 이익엔 증감률 필요(7) 규칙)
assert.equal(hasGrowth('• 3분기 매출 5,734억원. 증감률은 미확인(전년 비교 자료 없음)'), true);
assert.equal(hasGrowth('• 3분기 매출 5,734억원, 영업이익률 17.9% (MTN)'), false); // 부호 없는 비율은 증감률이 아님
const msBad = checkUnconfirmed({ fundamental: msFund });
assert.equal(msBad.ok, false);
assert.ok(msBad.problems.some(p => p.kind === 'no-growth'));
assert.equal(checkUnconfirmed({ fundamental: '• 매출 20억(+11.6%)\n• 현금흐름: OCF 1억' }).ok, true);
assert.equal(checkUnconfirmed({ overview: '• 기술지표만 있는 분석' }).ok, true); // 기본적분석이 없으면 검사하지 않음

// 7) 매출과 이익을 각각(사용자 지적 2026-10-30: '매출 증감만 있다' — WM·ISRG·WKC·BE·SHOP)
//    매출 항목이 있으면 매출 증감률, 이익(영업이익·순이익·EPS·손실) 항목이 있으면 이익 증감률이 각각 필요.
//    '(전년 1.98)'처럼 전년 값을 쓴 항목엔 증감률도 함께. 적자는 '적자 전환·흑자 전환·적자 축소/확대'도 증감으로 본다
const kinds = t => growthProblems(t).map(p => p.kind).sort();
// 실제 10.30 분석 첫 bullet들
assert.deepEqual(kinds('• 3Q26 순매출 203억 달러(전년 182억), 희석 EPS 3.03달러(전년 2.80)다 (MS 3Q26 8-K)'), ['no-profit-growth', 'no-revenue-growth', 'prior-without-growth']);
assert.deepEqual(kinds('• 3분기 매출 68.46억달러(+6.3%), 조정 EPS 2.15달러(전년 1.98)다. 연간 FCF 가이던스 유지 (WM 8-K)'), ['no-profit-growth', 'prior-without-growth']);
assert.deepEqual(kinds('• 3분기 매출 12.36억달러(+138.1%), GAAP 영업이익 2.25억달러, 비GAAP EPS 0.94달러 (SEC 8-K)'), ['no-profit-growth']);
assert.deepEqual(kinds('• 2Q26 매출 4,026억원(+52%), 영업이익 830억원(+59%)이다 (한국경제)'), []);
assert.deepEqual(kinds('• 2Q26 매출 4,142억원(+6.3%), 영업이익 79억원(-53.7%)이며 일회성 비용이 원인이다 (교보증권)'), []);
assert.deepEqual(kinds('• 2분기 연결 영업손실 430억원으로 적자 전환했다. 별도 영업이익은 256억원(+64%)이다 (보도)'), []);
assert.deepEqual(kinds('• 회계 3분기 매출 $305M은 전년비 -3.3%로 컨센서스에 못 미쳤다 (Nasdaq)'), []); // 이익 언급이 없으면 매출만
assert.deepEqual(kinds('• 2Q26 순손실은 9,120만 달러로 전년 2억850만 달러보다 줄었다 (SEC 8-K)'), ['no-profit-growth', 'prior-without-growth']);
assert.deepEqual(kinds('• 2Q26 순손실은 9,120만 달러로 적자 축소(전년 2억850만 달러)다 (SEC 8-K)'), []);
assert.deepEqual(kinds('• 3분기 매출 5,734억원. 증감률은 미확인(전년 비교 자료 없음)'), []); // 이유 단 미확인은 허용
assert.deepEqual(kinds('• 3분기 매출 5,734억원, 영업이익률 17.9% (MTN)'), ['no-profit-growth', 'no-revenue-growth']); // 부호 없는 비율은 증감률 아님
assert.deepEqual(kinds('• 강세 근거는 AI 수요다 (보도)'), ['no-growth']); // 실적 숫자도, 발표 예정도 없음
// checkUnconfirmed가 각 문제를 no-growth 종류로 묶어 보고한다
const wm = checkUnconfirmed({ fundamental: '• 3분기 매출 68.46억달러(+6.3%), 조정 EPS 2.15달러(전년 1.98)다 (WM)' });
assert.equal(wm.ok, false);
assert.ok(wm.problems.some(p => p.kind === 'no-growth' && /이익/.test(p.detail)));

console.log('미확인 검사기 테스트 통과');
