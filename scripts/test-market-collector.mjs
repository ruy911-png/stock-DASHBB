import assert from 'node:assert/strict';
import { addDays, carryForwardUsIndices, extractBriefing, marketMood, selectClosingBriefing, vixFromHistory } from './collect-market-data.mjs';

assert.equal(addDays('2026-07-31', 1), '2026-08-01');
assert.equal(addDays('2026-12-31', 1), '2027-01-01');

const briefingList = {
  result: {
    items: [
      { id: 3731, title: '미국 개장 전 브리핑', briefingDate: '2026-07-21', briefingHour: '22' },
      { id: 3730, title: '반도체 매수세 회복에 코스피 강세 마감', briefingDate: '2026-07-21', briefingHour: '20' },
    ],
  },
};
assert.equal(selectClosingBriefing(briefingList, '2026-07-21')[0].id, 3730);

// 20시 정각 브리핑도 없고 키워드 매치도 안 되면, 해당 날짜의 가장 늦은 시각 브리핑으로 폴백한다
const fallbackList = {
  result: {
    items: [
      { id: 4001, title: '오전 시황 요약', briefingDate: '2026-07-22', briefingHour: '09' },
      { id: 4002, title: '오후 시황 요약', briefingDate: '2026-07-22', briefingHour: '15' },
    ],
  },
};
assert.equal(selectClosingBriefing(fallbackList, '2026-07-22')[0].id, 4002);

// 해당 날짜 자체가 목록에 없으면, 에러 메시지에 실제 존재하는 날짜 목록을 포함해 진단을 돕는다
assert.throws(
  () => selectClosingBriefing(briefingList, '2099-01-01'),
  /2026-07-21/,
);

// 2026.8 이후 관측된 네이버 브리핑 라벨링 지연: 국장 마감일(targetDate)이 아니라
// 그 다음 날짜로 브리핑이 태깅되는 경우, targetDate+1일로 폴백해서 찾는다
const nextDayLabeledList = {
  result: {
    items: [
      { id: 5001, title: '코스피 반도체 대형주 급락에 하락 마감', briefingDate: '2026-08-13', briefingHour: '20' },
    ],
  },
};
assert.equal(selectClosingBriefing(nextDayLabeledList, '2026-08-12')[0].id, 5001);

// 정확한 날짜가 있으면 다음날 폴백보다 우선한다
const bothDatesList = {
  result: {
    items: [
      { id: 6001, title: '정확한 날짜 브리핑', briefingDate: '2026-08-12', briefingHour: '20' },
      { id: 6002, title: '다음날로 밀린 브리핑', briefingDate: '2026-08-13', briefingHour: '20' },
    ],
  },
};
assert.equal(selectClosingBriefing(bothDatesList, '2026-08-12')[0].id, 6001);

// 같은 날짜에 여러 브리핑이 있으면(20시 정각 우선, 그다음 제목매치, 그다음 최신순) 후보 전체를
// 순서대로 돌려준다 — 1순위 후보 상세에 코스피 수급이 없어도 호출측이 다음 후보로 재시도 가능
const multiCandidateList = {
  result: {
    items: [
      { id: 7001, title: '오전 시황 요약', briefingDate: '2026-08-13', briefingHour: '09' },
      { id: 7002, title: '미국 개장 전 브리핑', briefingDate: '2026-08-13', briefingHour: '22' },
      { id: 7003, title: '코스피 반도체 강세 마감', briefingDate: '2026-08-13', briefingHour: '20' },
    ],
  },
};
assert.deepEqual(selectClosingBriefing(multiCandidateList, '2026-08-13').map(c => c.id), [7003, 7002, 7001]);

const detail = {
  result: {
    id: 3730,
    title: '반도체 매수세 회복에 코스피 강세 마감',
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
assert.equal(briefing.comment, briefing.title);
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

// 국장 마감 시점엔 미장이 아직 열려있는 경우가 흔하므로, 가장 최근 저장된 엔트리에서
// 미장 쪽 지표(S&P500/나스닥/VIX/필라델피아 반도체)만 그대로 이어받는다
const usIndexNames = ['S&P500', '나스닥', 'VIX', '필라델피아 반도체'];
const historyEntries = [
  {
    krDate: '2026-08-18', usDate: '2026-08-14',
    indices: [
      { name: 'KOSPI', value: '3,200.00', chg: 0.5 },
      { name: 'S&P500', value: '5,600.00', chg: 0.3 },
      { name: '나스닥', value: '18,000.00', chg: 0.4 },
      { name: 'VIX', value: '14.00', chg: -1.2 },
      { name: '필라델피아 반도체', value: '5,000.00', chg: 0.6 },
    ],
  },
  {
    krDate: '2026-08-14', usDate: '2026-08-14',
    indices: [
      { name: 'KOSPI', value: '3,190.00', chg: 0.1 },
      { name: 'S&P500', value: '5,600.00', chg: 0.3 },
      { name: '나스닥', value: '18,000.00', chg: 0.4 },
      { name: 'VIX', value: '14.00', chg: -1.2 },
      { name: '필라델피아 반도체', value: '5,000.00', chg: 0.6 },
    ],
  },
];
const carried = carryForwardUsIndices(historyEntries, usIndexNames);
assert.equal(carried.usDate, '2026-08-14');
assert.deepEqual(carried.usIndices.map(i => i.name), usIndexNames);
assert.equal(carried.usIndices.find(i => i.name === 'S&P500').value, '5,600.00');
// 이어받은 지표는 원본 엔트리와 별개 객체여야 한다(참조 공유 금지)
assert.notEqual(carried.usIndices[0], historyEntries[0].indices[1]);

assert.throws(
  () => carryForwardUsIndices([{ krDate: '2026-08-01', indices: [{ name: 'KOSPI', value: '1', chg: 0 }] }], usIndexNames),
  /참고할 이전 미장 데이터가 없습니다/,
);

console.log('시황 자동수집 파서 검증 완료');
