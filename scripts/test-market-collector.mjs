import assert from 'node:assert/strict';
import { buildBriefingComment, extractBriefing, marketMood, selectClosingBriefing, vixFromHistory } from './collect-market-data.mjs';

const briefingList = {
  result: {
    items: [
      { id: 3731, title: '미국 개장 전 브리핑', briefingDate: '2026-07-21', briefingHour: '22' },
      { id: 3730, title: '반도체 매수세 회복에 코스피 강세 마감', briefingDate: '2026-07-21', briefingHour: '20' },
    ],
  },
};
assert.equal(selectClosingBriefing(briefingList, '2026-07-21').id, 3730);

const detail = {
  result: {
    id: 3730,
    title: '반도체 매수세 회복에 코스피 강세 마감',
    summary: '반도체 대형주가 다시 시장의 중심에 섰어요.\n7월 수출 증가와 반도체 수출 급증이 힘을 보탰고, 외국인과 기관 매수가 집중됐어요.',
    briefingDate: '2026-07-21',
    briefingHour: '20',
    briefingMeta: { generatedAt: '2026-07-21T20:01:27' },
    visuals: [
      {
        type: 'investor_flow_combined_bar',
        data: [{
          market: 'KOSPI',
          flows: [
            { actor: 'INDIVIDUAL', amount: '-1642100000000' },
            { actor: 'FOREIGN', amount: '295200000000' },
            { actor: 'INSTITUTIONAL', amount: '1374400000000' },
          ],
        }],
      },
      {
        type: 'keyword_tags',
        data: [{ keyword: '회생절차' }, { keyword: 'AI' }, { keyword: '환율' }, { keyword: '반도체' }],
      },
    ],
  },
};

const briefing = extractBriefing(detail, '2026-07-21');
assert.equal(briefing.title, '반도체 매수세 회복에 코스피 강세 마감');
assert.equal(
  briefing.comment,
  '반도체 매수세 회복에 코스피 강세 마감. 7월 수출 증가와 반도체 수출 급증이 힘을 보탰고, 외국인과 기관 매수가 집중됐어요.',
);
assert.equal(buildBriefingComment('제목', ''), '제목');
assert.equal(briefing.publishedAt, '2026-07-21T20:01:27+09:00');
assert.deepEqual(briefing.keywords, ['회생절차', 'AI', '환율', '반도체']);
assert.deepEqual(briefing.flows, [
  { name: '외국인', amount: 2952 },
  { name: '기관', amount: 13744 },
  { name: '개인', amount: -16421 },
]);
assert.deepEqual(vixFromHistory('DATE,OPEN,HIGH,LOW,CLOSE\n07/17/2026,18.01,19.50,17.68,18.77\n07/20/2026,18.90,18.94,17.41,18.65\n', '2026-07-20'), {
  name: 'VIX', value: '18.65', chg: -0.64,
});
assert.deepEqual(marketMood([
  { name: 'KOSPI', chg: 1 },
  { name: 'KOSDAQ', chg: 1 },
  { name: 'S&P500', chg: 1 },
  { name: '나스닥', chg: 1 },
]), { mood: '강세 · 위험선호', moodUp: true });

console.log('시황 자동수집 파서 검증 완료');
