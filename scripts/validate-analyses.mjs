// data/analyses-backup.json이 대시보드가 읽는 형식과 CLAUDE.md 컨벤션(5개 섹션, 매수·매도 추천 금지)을 지키는지 검사한다.
// 자동 재분석(refresh-analyses.yml)이 파일을 고친 뒤 커밋 전에 돌리고, npm run check에도 들어간다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = path.join(root, 'data', 'analyses-backup.json');
const SECTIONS = ['overview', 'moat', 'fundamental', 'technical', 'valuation'];
const MARKETS = ['kospi', 'kosdaq', 'us', 'etc'];
const MAX_AIS = 5;
const dateRe = /^(1[0-2]|[1-9])\.(3[01]|[12]\d|[1-9])$/; // "8.28" — 월.일, 앞자리 0 없음
// 권유 표현 — "매수/매도 추천 아님" 같은 부정문은 통과시킨다
const recommendRe = /(매수|매도)\s*(를|을)?\s*(추천합니다|추천드립니다|권합니다|권유합니다|하세요|하십시오|하시기 바랍니다)|적극\s*매수|강력\s*매수|지금\s*(사|파)세요|(사|파)세요/;

function fail(message) {
  throw new Error(`종목분석 데이터 오류: ${message}`);
}

const entries = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
if (!Array.isArray(entries)) fail('최상위가 배열이 아닙니다.');

const seen = new Set();
entries.forEach((entry, i) => {
  const at = `[${i}]`;
  if (!entry || typeof entry !== 'object') fail(`${at}가 객체가 아닙니다.`);
  if (typeof entry.code !== 'string' || !entry.code.trim()) fail(`${at}.code가 비어 있습니다.`);
  const at2 = `${at} ${entry.code}`;
  if (seen.has(entry.code)) fail(`${at2}: code가 중복됩니다.`);
  seen.add(entry.code);
  if (typeof entry.name !== 'string' || !entry.name.trim()) fail(`${at2}: name이 비어 있습니다.`);
  if (!MARKETS.includes(entry.market)) fail(`${at2}: market은 ${MARKETS.join('/')} 중 하나여야 합니다.`);
  if (!Array.isArray(entry.tags) || entry.tags.some(t => typeof t !== 'string')) fail(`${at2}: tags는 문자열 배열이어야 합니다.`);
  // price·chg는 없어도 된다(화면이 '미입력'으로 처리). 있으면 숫자여야 한다
  ['price', 'chg'].forEach(k => {
    if (entry[k] != null && typeof entry[k] !== 'number') fail(`${at2}: ${k}는 숫자여야 합니다.`);
  });
  if (!Array.isArray(entry.ais) || !entry.ais.length) fail(`${at2}: ais가 비어 있습니다.`);
  if (entry.ais.length > MAX_AIS) fail(`${at2}: ais는 최대 ${MAX_AIS}개입니다.`);
  const seenAi = new Set();
  entry.ais.forEach((a, j) => {
    const at3 = `${at2} ais[${j}]`;
    if (!a || typeof a !== 'object') fail(`${at3}가 객체가 아닙니다.`);
    if (typeof a.ai !== 'string' || !a.ai) fail(`${at3}: ai가 비어 있습니다.`);
    if (!dateRe.test(a.date || '')) fail(`${at3}: date는 "월.일"(예: 8.28) 형식이어야 합니다.`);
    const key = `${a.ai}@${a.date}`;
    if (seenAi.has(key)) fail(`${at3}: 같은 ai·날짜 분석이 중복됩니다.`);
    seenAi.add(key);
    SECTIONS.forEach(s => {
      if (typeof a[s] !== 'string') fail(`${at3}: ${s} 섹션이 문자열이 아닙니다.`);
    });
    const extra = Object.keys(a).filter(k => !['ai', 'date', ...SECTIONS].includes(k));
    if (extra.length) fail(`${at3}: 모르는 항목 ${extra.join(', ')}`);
    SECTIONS.forEach(s => {
      const m = a[s].match(recommendRe);
      if (m) fail(`${at3}.${s}: 매수·매도 권유 표현 "${m[0]}"`);
    });
  });
});

console.log(`종목분석 데이터 검증 통과: ${entries.length}종목, 분석 ${entries.reduce((n, e) => n + e.ais.length, 0)}건`);
