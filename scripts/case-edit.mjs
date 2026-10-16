// 과거사례 수정·삭제·재계산 (사용자 결정 2026-10-15: 수정은 저장소 커밋으로). 페이지의 ✏/✕ → case-edit.yml → 이 스크립트.
// 입력(env): CASE_ID, ACTION(update|delete|recalc), PAYLOAD(JSON). update는 글 칸(title·tag·summary·compare·period_basis·period_url·timeline)과
// 날짜(start·end·event)만 받는다. 숫자(indices)는 손대지 않고, 날짜가 바뀌면 GITHUB_OUTPUT에 recalc=true를 써서 워크플로가 case-stats.py를 돌린다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = path.join(root, 'data', 'cases.json');
const TEXT = ['title', 'tag', 'summary', 'compare', 'period_basis', 'period_url', 'timeline'];
const DATES = ['start', 'end', 'event'];
const isoDate = /^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;

function out(obj) {
  const f = process.env.GITHUB_OUTPUT;
  const lines = Object.entries(obj).map(([k, v]) => `${k}=${v == null ? '' : String(v)}`);
  if (f) fs.appendFileSync(f, lines.join('\n') + '\n'); else console.log(lines.join('\n'));
}
function fail(m) { console.error('과거사례 수정 오류: ' + m); process.exit(1); }

const id = String(process.env.CASE_ID || '').trim();
const action = String(process.env.ACTION || 'update').trim();
if (!id) fail('CASE_ID가 비어 있습니다');
if (!fs.existsSync(dataPath)) fail('data/cases.json이 없습니다');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const item = data.items[id];
if (!item) fail(`사례 ${id}가 없습니다`);

let recalc = false;
if (action === 'delete') {
  delete data.items[id];
  console.log(`삭제: ${id} ${item.title}`);
} else if (action === 'recalc') {
  recalc = true;
  console.log(`재계산: ${id} ${item.title}`);
} else if (action === 'update') {
  let p;
  try { p = JSON.parse(process.env.PAYLOAD || '{}'); } catch (e) { fail('PAYLOAD가 JSON이 아닙니다'); }
  const changed = [];
  for (const k of TEXT) {
    if (!(k in p)) continue;
    const v = p[k];
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) { if (k in item && k !== 'title') { delete item[k]; changed.push(k + '(삭제)'); } continue; }
    if (k === 'timeline') {
      if (!Array.isArray(v)) fail('timeline은 배열이어야 합니다');
      item.timeline = v.map(e => ({ date: String(e.date || '').trim(), sentiment: String(e.sentiment || '중립').trim(), label: String(e.label || '').trim(), desc: String(e.desc || '').trim(), url: String(e.url || '').trim() }));
    } else item[k] = String(v).trim();
    changed.push(k);
  }
  for (const k of DATES) {
    if (!(k in p)) continue;
    const v = String(p[k] || '').trim();
    if (v && !isoDate.test(v)) fail(`${k}는 YYYY-MM-DD여야 합니다: ${v}`);
    const cur = item[k] || '';
    if ((v || '') !== (cur || '')) { item[k] = v || null; changed.push(k); recalc = true; }
  }
  if (recalc) {
    if (!item.start) fail('start는 비울 수 없습니다');
    if (item.end && item.end < item.start) fail('end가 start보다 앞입니다');
    if (!item.event) item.event = item.start;
    item.status = item.end ? 'closed' : 'ongoing';
  }
  item.written_at = new Date().toISOString().slice(0, 10);
  console.log(`수정: ${id} ${item.title} — ${changed.join(', ') || '변경 없음'}`);
} else fail(`모르는 ACTION: ${action}`);

data.generated_at = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
fs.writeFileSync(dataPath, JSON.stringify(data, null, 2) + '\n');
out({ recalc, title: item.title, start: item.start, end: item.end || '', event: item.event || '' });
