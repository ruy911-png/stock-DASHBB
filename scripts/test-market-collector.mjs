import assert from 'node:assert/strict';
import { extractBriefing, makeKeywords, marketMood, parseFlowAmount } from './collect-market-data.mjs';

const home = `
  <strong class="AIBriefing_title__fixture">반도체 매수세 회복에 코스피 강세 마감</strong>
  <a href="/briefing/market/posts/3730">상세</a>
`;
const detail = `
  <p>2026. 7. 21 (화) 20:00 AI 핵심요약</p>
  <ul>
    <li class="ContentText_item-summary__fixture">반도체 대형주가 시장을 이끌었어요.</li>
    <li class="ContentText_item-summary__fixture">외국인과 기관 매수가 집중됐어요.</li>
    <li class="ContentText_item-summary__fixture">코스닥 바이오는 약했어요.</li>
  </ul>
  <section class="InvestorFlowCombinedBar_market-box__fixture">
    <h5>코스피</h5>
    <span class="InvestorFlowCombinedBar_category__fixture">개인</span><span class="InvestorFlowCombinedBar_value__fixture InvestorFlowCombinedBar_FALLING__fixture">-1조 6,421억</span>
    <span class="InvestorFlowCombinedBar_category__fixture">외국인</span><span class="InvestorFlowCombinedBar_value__fixture InvestorFlowCombinedBar_RISING__fixture">+2,952억</span>
    <span class="InvestorFlowCombinedBar_category__fixture">기관</span><span class="InvestorFlowCombinedBar_value__fixture InvestorFlowCombinedBar_RISING__fixture">+1조 3,744억</span>
  </section>
`;

const briefing = extractBriefing(home, detail);
assert.equal(briefing.title, '반도체 매수세 회복에 코스피 강세 마감');
assert.equal(briefing.publishedAt, '2026-07-21T20:00:00+09:00');
assert.deepEqual(briefing.flows, [
  { name: '외국인', amount: 2952 },
  { name: '기관', amount: 13744 },
  { name: '개인', amount: -16421 },
]);
assert.equal(parseFlowAmount('+3조 120억'), 30120);
assert.equal(parseFlowAmount('-920억'), -920);
assert.ok(makeKeywords(briefing.title, briefing.comment).includes('반도체'));
assert.deepEqual(marketMood([
  { name: 'KOSPI', chg: 1 },
  { name: 'KOSDAQ', chg: 1 },
  { name: 'S&P500', chg: 1 },
  { name: '나스닥', chg: 1 },
]), { mood: '강세 · 위험선호', moodUp: true });

console.log('시황 자동수집 파서 검증 완료');
