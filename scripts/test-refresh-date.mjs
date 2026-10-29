// 오늘자 업데이트의 분석 날짜는 한국 시간 기준이어야 한다(2026-10-29 발견: Actions 서버는 UTC라
// 한국 10/30 00:28 실행이 '10.29'로 붙음). 워크플로 전체에 TZ=Asia/Seoul을 주고, 스킬은 `date +%-m.%-d`로 읽는다.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/refresh-analyses.yml'), 'utf8');
const skill = fs.readFileSync(path.join(root, '.claude/skills/refresh-analyses/SKILL.md'), 'utf8');

// 1) 워크플로 맨 위 env에 TZ가 있어야 plan·refresh 두 job과 Claude의 date 명령이 모두 한국 시간을 쓴다
assert.match(workflow, /^env:\n(?:[ \t]+#.*\n)*[ \t]+TZ: Asia\/Seoul$/m, 'refresh-analyses.yml 최상위 env에 TZ: Asia/Seoul 필요');

// 2) 스킬은 앞자리 0 없는 '월.일'을 date로 읽는다(10.5처럼 — 검증기 형식)
assert.ok(skill.includes('date +%-m.%-d'), 'SKILL.md에 `date +%-m.%-d` 필요');

// 3) 실제로 그 명령이 UTC 15:28(한국 다음 날 00:28)에 한국 날짜를 내는지
const at = (tz, iso) => execFileSync('date', ['-d', iso, '+%-m.%-d'], { env: { ...process.env, TZ: tz } }).toString().trim();
assert.equal(at('UTC', '2026-10-29T15:28:00Z'), '10.29'); // 지금까지의 동작(틀린 날짜)
assert.equal(at('Asia/Seoul', '2026-10-29T15:28:00Z'), '10.30');
assert.equal(at('Asia/Seoul', '2026-11-04T23:00:00Z'), '11.5'); // 앞자리 0 없음

console.log('오늘자 업데이트 날짜(한국 시간) 테스트 통과');
