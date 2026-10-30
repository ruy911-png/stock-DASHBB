// 오늘자 업데이트 실행 여유(사용자 요청 2026-10-30, TDD): 8종목 묶음이 대화 57/60턴을 써 '다시 찾기'를 건너뛰고,
// 거부되는 명령(python·awk 등 11번)에 턴을 낭비했다.
// ① 묶음 기본 4종목 ② 대화 한도 100턴 ③ 분석 항목을 꺼내 보는 허용 스크립트(show-analysis.mjs)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { showAnalysis } from './show-analysis.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wf = fs.readFileSync(path.join(root, '.github/workflows/refresh-analyses.yml'), 'utf8');
const skill = fs.readFileSync(path.join(root, '.claude/skills/refresh-analyses/SKILL.md'), 'utf8');
const plan = fs.readFileSync(path.join(root, 'scripts/plan-refresh.mjs'), 'utf8');

// ① 묶음 크기 기본 4 (워크플로 입력 기본값과 plan-refresh 기본값 둘 다)
assert.match(wf, /chunk_size:\n(?:.*\n){0,2}?\s+default: "4"/, 'refresh-analyses.yml chunk_size 기본값 "4" 필요');
assert.match(plan, /arg\('--chunk-size', '4'\)\) \|\| 4/, 'plan-refresh.mjs 기본 묶음 4 필요');

// ② 대화 한도 100
assert.match(wf, /--max-turns 100\b/, '--max-turns 100 필요');

// ③ show-analysis: 코드의 기본 정보 + 최신 분석(또는 n개)을 보여 준다. 없는 코드는 '없음'
const entries = [
  { code: 'MS', name: '모건스탠리 (MS)', market: 'us', tags: ['IB'], ais: [
    { ai: 'claude', date: '10.30', summary: '요약', overview: '• 개요', moat: '• 해자', fundamental: '• 매출 203억(+11.6%)', technical: '• 종가', valuation: '• PBR' },
    { ai: 'claude', date: '10.20', overview: '• 옛 개요', moat: '', fundamental: '', technical: '', valuation: '' },
  ] },
];
const one = showAnalysis(entries, 'MS');
assert.match(one, /MS 모건스탠리 \(MS\) us/);
assert.match(one, /\[10\.30\]/);
assert.match(one, /fundamental: • 매출 203억\(\+11\.6%\)/);
assert.doesNotMatch(one, /\[10\.20\]/); // 기본은 최신 1개의 본문만(머리줄의 날짜 목록은 전부)
assert.match(showAnalysis(entries, 'MS', 2), /\[10\.20\]/);
assert.match(showAnalysis(entries, 'X'), /X: 목록에 없음/);
// CLI로 실제 데이터 파일을 읽는다(종료 코드 0)
execFileSync('node', [path.join(root, 'scripts/show-analysis.mjs'), 'BE'], { stdio: 'pipe' });
// 워크플로·스킬에서 허용
assert.ok(wf.includes('Bash(node scripts/show-analysis.mjs *)'), 'allowedTools에 show-analysis 필요');
assert.ok(skill.includes('Bash(node scripts/show-analysis.mjs *)'), '스킬 allowed-tools에 show-analysis 필요');
assert.ok(skill.includes('node scripts/show-analysis.mjs <코드>'), '스킬 본문에 사용법 필요');

// ④ 기본적분석·해자 신호 달 점수(사용자 결정 2026-10-30): 오늘자 업데이트와 토요일 갱신 둘 다 fin-score.py를 돌려 fin.json을 커밋
const prof = fs.readFileSync(path.join(root, '.github/workflows/stock-profiles.yml'), 'utf8');
for (const [name, text] of [['refresh-analyses.yml', wf], ['stock-profiles.yml', prof]]) {
  assert.ok(text.includes('python3 scripts/fin-score.py --selftest'), `${name}: fin-score selftest 필요`);
  assert.match(text, /python3 scripts\/fin-score\.py --tickers /, `${name}: fin-score 실행 필요`);
  assert.match(text, /git add [^\n]*data\/technical\/fin\.json/, `${name}: fin.json 커밋 필요`);
}

console.log('오늘자 업데이트 실행 여유 테스트 통과');
