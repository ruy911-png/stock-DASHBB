// '미확인' 검사기(사용자 요청 2026-10-29: 실행할 때 미확인이 너무 많다).
// 새 분석은 ① 미확인마다 바로 붙은 괄호로 이유를 적고(예: 미확인(공개 자료 없음)) ② 한 분석에 MAX_UNCONFIRMED개를 넘지 않는다.
// refresh-analyses 스킬이 분석을 쓴 뒤 `node scripts/unconfirmed.mjs <코드,코드>`로 돌려, 걸린 항목만 다시 찾아본다.
// 예전 분석은 검사하지 않는다 — 지정한 종목의 최신 분석(ais[0])만 본다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SECTIONS = ['overview', 'moat', 'fundamental', 'technical', 'valuation'];
export const MAX_UNCONFIRMED = 3;
const SECTION_NAMES = { overview: '기업개요', moat: '경제적해자', fundamental: '기본적분석', technical: '기술적분석', valuation: '밸류에이션' };

// 분석 하나에서 '미확인'의 위치와 이유를 찾는다. 이유 = '미확인' 바로 뒤에 붙은 괄호의 내용(띄어 쓴 괄호는 출처로 본다)
export function findUnconfirmed(analysis) {
  const out = [];
  for (const section of SECTIONS) {
    const text = analysis?.[section];
    if (typeof text !== 'string') continue;
    for (const bullet of text.split('\n')) {
      for (const m of bullet.matchAll(/미확인(?:\(([^()]*)\))?/g)) {
        const reason = m[1] && m[1].trim() ? m[1].trim() : null;
        out.push({ section, bullet: bullet.trim(), reason });
      }
    }
  }
  return out;
}

// 기본적분석 첫 bullet(최근 실적)의 증감률(사용자 지적 2026-10-30: ① MS '203억 달러(전년 182억)' — 증감률이 안 보임
// ② '매출 증감만 있다' — 이익·EPS엔 증감률이 없음). 매출·이익 항목을 각각 보고, 전년 값만 쓴 항목도 잡는다.
const PCT = /[+\-−]\s?\d+(?:\.\d+)?%/;
const TURN = /(흑자|적자)\s?(전환|축소|확대|지속)/;
const REVENUE = /매출|순매출|총거래액|revenue/i;
const PROFIT = /이익|EPS|손실/;
const PRIOR = /전년\s?(?:동기\s?)?[\d$]/;
export function growthProblems(fundamental) {
  const first = String(fundamental || '').split('\n')[0];
  if (/증감률[^.]*미확인\([^()]+\)/.test(first)) return [];
  // 끝의 출처 괄호(예: (SEC 8-K, 2026-10-22))는 빼고 쉼표·문장 단위로 나눈다 — 단 '(+11.6%)'처럼 증감률이 든 괄호는 남긴다
  const tail = first.match(/\s*\(([^()]*)\)\s*$/);
  const body = tail && !PCT.test(tail[1]) && !TURN.test(tail[1]) ? first.slice(0, tail.index) : first;
  const clauses = body.split(/,\s|\.\s|·/);
  const grown = c => PCT.test(c) || TURN.test(c);
  const rev = clauses.filter(c => REVENUE.test(c));
  const prof = clauses.filter(c => PROFIT.test(c));
  const out = [];
  if (rev.length && !rev.some(grown)) out.push({ kind: 'no-revenue-growth', detail: '매출 증감률 없음' });
  if (prof.length && !prof.some(grown)) out.push({ kind: 'no-profit-growth', detail: '이익(영업이익·순이익·EPS) 증감률 없음' });
  if (clauses.some(c => PRIOR.test(c) && !grown(c))) out.push({ kind: 'prior-without-growth', detail: "전년 값만 쓰고 증감률이 없는 항목 있음" });
  if (!rev.length && !prof.length && !/발표 예정|발표 전/.test(first)) out.push({ kind: 'no-growth', detail: '최근 실적 숫자·증감률 없음' });
  return out;
}
export function hasGrowth(fundamental) {
  return growthProblems(fundamental).length === 0;
}

export function checkUnconfirmed(analysis, max = MAX_UNCONFIRMED) {
  const found = findUnconfirmed(analysis);
  const problems = found.filter(f => f.reason === null).map(f => ({ kind: 'no-reason', ...f }));
  if (found.length > max) problems.push({ kind: 'too-many', count: found.length, max });
  if (typeof analysis?.fundamental === 'string' && analysis.fundamental.trim()) {
    const bullet = analysis.fundamental.split('\n')[0].trim();
    for (const g of growthProblems(analysis.fundamental)) problems.push({ kind: 'no-growth', section: 'fundamental', bullet, detail: g.detail });
  }
  return { ok: problems.length === 0, found, problems };
}

function main(argv) {
  const codes = (argv[0] || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!codes.length) {
    console.log('사용: node scripts/unconfirmed.mjs <코드,코드> — 지정한 종목의 최신 분석에서 미확인을 검사');
    process.exit(2);
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const entries = JSON.parse(fs.readFileSync(path.join(root, 'data', 'analyses-backup.json'), 'utf8'));
  let failed = false;
  for (const code of codes) {
    const entry = entries.find(e => e.code === code);
    const latest = entry?.ais?.[0];
    if (!latest) { console.log(`${code}: 분석 없음`); failed = true; continue; }
    const r = checkUnconfirmed(latest);
    console.log(`${code} ${latest.date}: 미확인 ${r.found.length}개(한도 ${MAX_UNCONFIRMED}) — ${r.ok ? '통과' : '다시 찾기'}`);
    for (const p of r.problems) {
      if (p.kind === 'no-reason') console.log(`  - [이유 없음] ${SECTION_NAMES[p.section]}: ${p.bullet}`);
      else if (p.kind === 'no-growth') console.log(`  - [증감률] ${p.detail} — 매출·이익 각각 전년 대비 증감률(+X%)을 넣는다: ${p.bullet}`);
      else console.log(`  - [너무 많음] ${p.count}개 > ${p.max}개: 찾을 수 있는 값을 다시 찾고, 끝내 없는 것만 미확인(이유)로 남긴다`);
    }
    if (!r.ok) failed = true;
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
