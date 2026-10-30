// 종목 하나의 기본 정보와 최신 분석을 보여 준다(오늘자 업데이트에서 Claude가 python·awk로 JSON을 뒤지다
// 권한 거부로 턴을 낭비하지 않게 — 2026-10-30 8종목 실행에서 11번 거부).
// 사용: node scripts/show-analysis.mjs <코드> [개수=1]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SECTIONS = ['summary', 'overview', 'moat', 'fundamental', 'technical', 'valuation'];

export function showAnalysis(entries, code, n = 1) {
  const e = entries.find(x => x.code === code);
  if (!e) return `${code}: 목록에 없음(신규 종목이면 data/technical/latest.json의 items[코드] 확인)`;
  const lines = [`${e.code} ${e.name} ${e.market} 태그=${(e.tags || []).join('·')} 분석날짜=${(e.ais || []).map(a => a.date).join(',')}`];
  for (const a of (e.ais || []).slice(0, n)) {
    lines.push(`[${a.date}] ai=${a.ai}`);
    for (const s of SECTIONS) if (a[s]) lines.push(`${s}: ${String(a[s]).replace(/\n/g, '\n  ')}`);
  }
  return lines.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [code, n] = process.argv.slice(2);
  if (!code) { console.log('사용: node scripts/show-analysis.mjs <코드> [개수]'); process.exit(2); }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const entries = JSON.parse(fs.readFileSync(path.join(root, 'data', 'analyses-backup.json'), 'utf8'));
  console.log(showAnalysis(entries, code, Math.max(1, Number(n) || 1)));
}
