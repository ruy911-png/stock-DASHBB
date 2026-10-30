// 오늘자 업데이트가 '성공'인데 분석이 안 들어가는 일을 막는다(2026-10-30 한화비전 489790: Claude가 분석가를
// 백그라운드로 띄우고 결과 전에 끝나 "변경 없음" — 워크플로는 성공으로 표시됨).
// ① 대상 종목에 오늘 날짜 분석이 없으면 실패 ② 워크플로가 백그라운드 실행을 끈다(CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { missingToday, todayMD } from './check-refreshed.mjs';

const entries = [
  { code: 'FTNT', ais: [{ date: '10.30' }, { date: '10.8' }] },
  { code: 'ONDS', ais: [{ date: '10.30' }] },
  { code: 'BE', ais: [{ date: '10.27' }] },
];

// 1) 오늘 분석이 있는 종목은 통과, 없는 종목·목록에 없는 신규 종목은 걸린다
assert.deepEqual(missingToday(entries, ['FTNT', 'ONDS'], '10.30'), []);
assert.deepEqual(missingToday(entries, ['FTNT', 'BE', '489790'], '10.30'), ['BE', '489790']);
// 2) 오늘 분석이 맨 앞(최신)이 아니라도 있으면 통과 — 같은 날짜는 바꾸기만 하니까
assert.deepEqual(missingToday([{ code: 'X', ais: [{ date: '10.31' }, { date: '10.30' }] }], ['X'], '10.30'), []);
// 3) 오늘 '월.일'은 한국 시간, 앞자리 0 없음
assert.equal(todayMD(new Date('2026-10-29T15:28:00Z')), '10.30');
assert.equal(todayMD(new Date('2026-11-04T23:00:00Z')), '11.5');

// 4) 워크플로: 백그라운드 끄기 + Claude 뒤에 이 검사(실패하면 커밋 안 하고 실패 표시)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wf = fs.readFileSync(path.join(root, '.github/workflows/refresh-analyses.yml'), 'utf8');
assert.match(wf, /^[ \t]+CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1"$/m, '워크플로 env에 CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1" 필요');
assert.match(wf, /node scripts\/check-refreshed\.mjs "\$\{\{ matrix\.chunk \}\}"/, 'Claude 뒤에 check-refreshed 단계 필요');
assert.ok(wf.indexOf('check-refreshed.mjs') < wf.indexOf('커밋 (검증 통과 시'), '검사는 커밋 단계보다 앞에');

console.log('오늘자 분석 저장 확인 테스트 통과');
