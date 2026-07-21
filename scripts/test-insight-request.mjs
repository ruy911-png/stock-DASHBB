import assert from 'node:assert/strict';
import { applyInsightRequest, decodeInsightRequest, validateInsightData } from './process-insight-request.mjs';

const encoded = encodeURIComponent(JSON.stringify({
  action: 'add', id: '', quote: '가격보다 가치를 본다.', source: '테스트 출처', memo: '원칙을 지킨다.',
}));
const request = decodeInsightRequest(`<!-- stockking-insight:${encoded} -->\n\n요청 내용`);
assert.deepEqual(request, {
  action: 'add', id: '', quote: '가격보다 가치를 본다.', source: '테스트 출처', memo: '원칙을 지킨다.',
});

const added = applyInsightRequest({ version: 1, entries: [] }, request, 25, '2026-07-21T00:00:00.000Z');
assert.equal(added.entries[0].id, 'insight-25');
assert.equal(added.entries[0].quote, '가격보다 가치를 본다.');

const updated = applyInsightRequest(added, {
  action: 'update', id: 'insight-25', quote: '가격보다 기업가치를 본다.', source: '수정 출처', memo: '',
}, 26, '2026-07-22T00:00:00.000Z');
assert.equal(updated.entries[0].quote, '가격보다 기업가치를 본다.');

const deleted = applyInsightRequest(updated, {
  action: 'delete', id: 'insight-25', quote: '', source: '', memo: '',
}, 27, '2026-07-23T00:00:00.000Z');
assert.equal(deleted.entries.length, 0);
assert.doesNotThrow(() => validateInsightData(deleted));

console.log('투자 인사이트 요청 처리 검증 완료');
