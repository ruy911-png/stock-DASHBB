// 오늘자 재분석(refresh-analyses.yml)의 실행 계획: 대상 종목을 골라 묶음(chunk)으로 나눠 JSON 배열로 출력한다.
// 사용: node scripts/plan-refresh.mjs --tickers all|005930,SCHW --max-age-days 0 --chunk-size 8
// 출력 예: ["005930,SCHW,001450","AMAT,NVDA"]  (워크플로 matrix 입력, 묶음은 차례로 실행)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entries = JSON.parse(fs.readFileSync(path.join(root, 'data', 'analyses-backup.json'), 'utf8'));

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] != null ? process.argv[i + 1] : fallback;
}

const tickers = String(arg('--tickers', 'all')).trim();
const maxAgeDays = Number(arg('--max-age-days', '0')) || 0;
const chunkSize = Math.max(1, Number(arg('--chunk-size', '8')) || 8);
const today = arg('--today', null) ? new Date(arg('--today')) : new Date();

// "8.28"(연도 없음) → 날짜. 월이 오늘보다 뒤면 작년으로 본다.
export function parseMonthDay(md, now = today) {
  const m = /^(\d{1,2})\.(\d{1,2})$/.exec(String(md || ''));
  if (!m) return null;
  let year = now.getFullYear();
  const d = new Date(year, Number(m[1]) - 1, Number(m[2]));
  if (d > now) d.setFullYear(year - 1);
  return d;
}

export function latestAnalysisDate(entry, now = today) {
  const dates = (entry.ais || []).map(a => parseMonthDay(a.date, now)).filter(Boolean);
  return dates.length ? new Date(Math.max(...dates.map(d => d.getTime()))) : null;
}

export function plan(list, { tickers: want, maxAgeDays: maxAge, chunkSize: size, now }) {
  let targets = list;
  if (want && want.toLowerCase() !== 'all') {
    // 목록에 없는 코드/티커는 신규 종목으로 넣는다(사용자 요청 2026-10-05: 신규 종목분석도 웹에서)
    const known = new Map(list.map(e => [String(e.code).toUpperCase(), e]));
    // 시장 이름(KOSPI·KOSDAQ·US·미국·기타)은 그 시장 종목 전체로 푼다 — 2026-10-08 사용자가 "KOSPI"를 넣었는데 종목 하나로 취급해 건너뛰었던 문제
    const MARKET = { KOSPI: 'kospi', 코스피: 'kospi', KOSDAQ: 'kosdaq', 코스닥: 'kosdaq', US: 'us', USA: 'us', 미국: 'us', 미국주식: 'us', ETC: 'etc', 기타: 'etc' };
    const wanted = [...new Set(want.split(',').map(t => t.trim().toUpperCase()).filter(Boolean)
      .flatMap(t => MARKET[t] ? list.filter(e => (e.market || '') === MARKET[t]).map(e => String(e.code).toUpperCase()) : [t]))];
    targets = wanted.map(c => known.get(c) || { code: c, ais: [], isNew: true });
  }
  if (maxAge > 0) {
    const cutoff = now.getTime() - maxAge * 86400000;
    targets = targets.filter(e => {
      const d = latestAnalysisDate(e, now);
      return !d || d.getTime() < cutoff;
    });
  }
  // 오래된 분석부터
  targets = [...targets].sort((a, b) => (latestAnalysisDate(a, now)?.getTime() ?? 0) - (latestAnalysisDate(b, now)?.getTime() ?? 0));
  const chunks = [];
  for (let i = 0; i < targets.length; i += size) chunks.push(targets.slice(i, i + size).map(e => e.code).join(','));
  return chunks;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const chunks = plan(entries, { tickers, maxAgeDays, chunkSize, now: today });
  const known = new Set(entries.map(e => String(e.code).toUpperCase()));
  const fresh = chunks.flatMap(c => c.split(',')).filter(c => !known.has(c.toUpperCase()));
  console.error(`대상 ${chunks.reduce((n, c) => n + c.split(',').length, 0)}종목(신규 ${fresh.length}: ${fresh.join(', ') || '없음'}) → ${chunks.length}묶음 (묶음당 최대 ${chunkSize})`);
  process.stdout.write(JSON.stringify(chunks));
}
