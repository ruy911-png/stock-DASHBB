// data/technical/profiles.json(종목 특성, 코드 계산)의 형식을 검사한다. 파일이 아직 없으면 통과(첫 실행 전).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = path.join(root, 'data', 'technical', 'profiles.json');
const isoDate = /^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
const recommendRe = /(매수|매도)\s*(를|을)?\s*(추천|권유|하세요|하십시오)|사세요|파세요/;

function fail(message) {
  throw new Error(`종목 특성 데이터 오류: ${message}`);
}

if (!fs.existsSync(dataPath)) {
  console.log('종목 특성 데이터 없음 (아직 생성 전) — 건너뜀');
} else {
  const payload = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  if (!payload || typeof payload.items !== 'object') fail('items가 객체가 아닙니다.');
  if (!Array.isArray(payload.failed)) fail('failed는 배열이어야 합니다.');
  const codes = Object.keys(payload.items);
  codes.forEach(code => {
    const item = payload.items[code];
    const at = `items[${code}]`;
    if (!isoDate.test(item.as_of || '')) fail(`${at}.as_of는 YYYY-MM-DD여야 합니다.`);
    if (!['kospi', 'kosdaq', 'us'].includes(item.market)) fail(`${at}.market이 올바르지 않습니다.`);
    if (!Array.isArray(item.labels) || item.labels.some(x => typeof x !== 'string')) fail(`${at}.labels는 문자열 배열이어야 합니다.`);
    if (!Array.isArray(item.notes) || !item.notes.length || item.notes.some(x => typeof x !== 'string')) fail(`${at}.notes는 비어 있지 않은 문자열 배열이어야 합니다.`);
    if (!item.metrics || typeof item.metrics !== 'object') fail(`${at}.metrics가 객체가 아닙니다.`);
    if (!Number.isInteger(item.bars) || item.bars < 0) fail(`${at}.bars가 올바르지 않습니다.`);
    if (payload.thresholds) item.labels.forEach(label => { if (!(label in payload.thresholds)) fail(`${at}: 설명 없는 유형 "${label}"`); });
    [...item.labels, ...item.notes].forEach(text => { if (recommendRe.test(text)) fail(`${at}: 권유 표현 "${text}"`); });
  });
  console.log(`종목 특성 데이터 검증 통과: ${codes.length}종목, 유형 있음 ${codes.filter(c => payload.items[c].labels.length).length}종목`);
}
