import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = path.join(root, 'data', 'insights', 'index.json');
const markerPattern = /<!-- stockking-insight:([^\s]+) -->/;

function cleanText(value, maxLength, label, required = false) {
  const text = String(value || '').replace(/\r\n/g, '\n').trim();
  if (required && !text) throw new Error(`${label}이 비어 있습니다.`);
  if (text.length > maxLength) throw new Error(`${label}은 ${maxLength}자 이하여야 합니다.`);
  return text;
}

export function decodeInsightRequest(issueBody) {
  const marker = String(issueBody || '').match(markerPattern)?.[1];
  if (!marker) throw new Error('투자 인사이트 요청 정보를 찾지 못했습니다.');
  let parsed;
  try {
    parsed = JSON.parse(decodeURIComponent(marker));
  } catch (error) {
    throw new Error(`투자 인사이트 요청 형식이 올바르지 않습니다: ${error.message}`);
  }
  const action = String(parsed.action || '');
  if (!['add', 'update', 'delete'].includes(action)) throw new Error(`지원하지 않는 요청입니다: ${action}`);
  const id = cleanText(parsed.id, 80, '문장 ID');
  if (action !== 'add' && !id) throw new Error('수정·삭제 요청에는 문장 ID가 필요합니다.');
  return {
    action,
    id,
    quote: cleanText(parsed.quote, 500, '투자 문장', action !== 'delete'),
    source: cleanText(parsed.source, 120, '인물·출처'),
    memo: cleanText(parsed.memo, 500, '내 메모'),
  };
}

export function validateInsightData(payload) {
  if (!payload || payload.version !== 1 || !Array.isArray(payload.entries)) throw new Error('투자 인사이트 데이터 구조가 올바르지 않습니다.');
  const ids = new Set();
  payload.entries.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') throw new Error(`${index + 1}번째 문장이 올바르지 않습니다.`);
    const id = cleanText(entry.id, 80, `${index + 1}번째 ID`, true);
    cleanText(entry.quote, 500, `${index + 1}번째 문장`, true);
    cleanText(entry.source, 120, `${index + 1}번째 출처`);
    cleanText(entry.memo, 500, `${index + 1}번째 메모`);
    if (ids.has(id)) throw new Error(`중복된 문장 ID입니다: ${id}`);
    ids.add(id);
  });
  return payload;
}

export function applyInsightRequest(payload, request, issueNumber, now = new Date().toISOString()) {
  validateInsightData(payload);
  const entries = payload.entries.map(entry => ({ ...entry }));
  if (request.action === 'add') {
    const id = `insight-${issueNumber}`;
    if (entries.some(entry => entry.id === id)) throw new Error(`이미 처리된 요청입니다: ${id}`);
    entries.unshift({ id, quote: request.quote, source: request.source, memo: request.memo, createdAt: now, updatedAt: now });
  } else {
    const index = entries.findIndex(entry => entry.id === request.id);
    if (index < 0) throw new Error(`대상 문장을 찾지 못했습니다: ${request.id}`);
    if (request.action === 'update') {
      entries[index] = { ...entries[index], quote: request.quote, source: request.source, memo: request.memo, updatedAt: now };
    } else {
      entries.splice(index, 1);
    }
  }
  return validateInsightData({ version: 1, entries });
}

function main() {
  const payload = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  if (process.argv.includes('--validate')) {
    validateInsightData(payload);
    console.log(`투자 인사이트 데이터 검증 완료: ${payload.entries.length}건`);
    return;
  }
  const issueNumber = Number(process.env.ISSUE_NUMBER);
  if (!Number.isInteger(issueNumber) || issueNumber < 1) throw new Error('ISSUE_NUMBER가 올바르지 않습니다.');
  const request = decodeInsightRequest(process.env.ISSUE_BODY);
  const next = applyInsightRequest(payload, request, issueNumber);
  fs.writeFileSync(dataPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  console.log(`투자 인사이트 ${request.action} 요청 반영 완료`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
