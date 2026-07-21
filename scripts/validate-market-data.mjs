import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = path.join(root, 'data', 'market', 'index.json');
const payload = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const indexNames = ['KOSPI', 'KOSDAQ', '원/달러', 'S&P500', '나스닥', 'VIX', '필라델피아 반도체', 'WTI'];
const flowNames = ['외국인', '기관', '개인'];
const isoDate = /^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
const isoDateTime = /^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])T([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?(?:Z|[+-]\d{2}:\d{2})$/;
const webUrl = /^https:\/\//;

function fail(message) {
  throw new Error(`시황 데이터 오류: ${message}`);
}

function exactNames(items, expected, label, position) {
  if (!Array.isArray(items) || items.length !== expected.length) {
    fail(`${position} ${label}는 ${expected.length}개여야 합니다.`);
  }
  const names = items.map(item => item && item.name);
  if (new Set(names).size !== names.length || expected.some(name => !names.includes(name))) {
    fail(`${position} ${label} 이름은 ${expected.join(', ')}여야 합니다.`);
  }
  if (names.some((name, index) => name !== expected[index])) {
    fail(`${position} ${label} 순서는 ${expected.join(', ')}여야 합니다.`);
  }
}

if (payload.version !== 1) fail('version은 1이어야 합니다.');
if (!Array.isArray(payload.entries)) fail('entries는 배열이어야 합니다.');

const seenDates = new Set();
let previousDate = null;
payload.entries.forEach((entry, index) => {
  const position = `entries[${index}]`;
  if (!entry || typeof entry !== 'object') fail(`${position}가 객체가 아닙니다.`);
  ['krDate', 'usDate', 'wtiDate'].forEach(key => {
    if (!isoDate.test(entry[key] || '')) fail(`${position}.${key}는 YYYY-MM-DD 형식이어야 합니다.`);
  });
  if (seenDates.has(entry.krDate)) fail(`${entry.krDate} 국장 데이터가 중복되었습니다.`);
  if (previousDate && entry.krDate > previousDate) fail('entries는 최신 국장 날짜순이어야 합니다.');
  seenDates.add(entry.krDate);
  previousDate = entry.krDate;

  if (typeof entry.date !== 'string' || !entry.date.trim()) fail(`${position}.date가 비었습니다.`);
  exactNames(entry.indices, indexNames, 'indices', position);
  entry.indices.forEach((item, itemIndex) => {
    if ((typeof item.value !== 'string' && typeof item.value !== 'number') || String(item.value).trim() === '') {
      fail(`${position}.indices[${itemIndex}].value가 비었습니다.`);
    }
    if (!Number.isFinite(Number(item.chg))) fail(`${position}.indices[${itemIndex}].chg가 숫자가 아닙니다.`);
  });

  exactNames(entry.flows, flowNames, 'flows', position);
  entry.flows.forEach((item, itemIndex) => {
    if (!Number.isFinite(Number(item.amount))) fail(`${position}.flows[${itemIndex}].amount가 숫자가 아닙니다.`);
  });

  if (typeof entry.comment !== 'string' || !entry.comment.trim()) fail(`${position}.comment가 비었습니다.`);
  if (!Array.isArray(entry.keywords) || entry.keywords.length < 1 || entry.keywords.length > 6 || entry.keywords.some(word => typeof word !== 'string' || !word.trim())) {
    fail(`${position}.keywords는 1~6개의 문자열이어야 합니다.`);
  }
  if (typeof entry.mood !== 'string' || !entry.mood.trim() || typeof entry.moodUp !== 'boolean') {
    fail(`${position}의 mood 또는 moodUp이 올바르지 않습니다.`);
  }
  const sources = entry.sources;
  if (!sources || !webUrl.test(sources.kr || '') || !webUrl.test(sources.us || '') || !webUrl.test(sources.wti || '')) {
    fail(`${position}.sources에 국장·미장·WTI 출처가 모두 필요합니다.`);
  }
  const briefing = sources.briefing;
  if (!briefing || briefing.provider !== '네이버페이 증권 AI 브리핑' || !isoDateTime.test(briefing.publishedAt || '') || !webUrl.test(briefing.url || '')) {
    fail(`${position}.sources.briefing에 네이버페이 증권 AI 브리핑의 시각과 URL이 필요합니다.`);
  }
});

console.log(`시황 데이터 검증 완료: ${payload.entries.length}건`);
