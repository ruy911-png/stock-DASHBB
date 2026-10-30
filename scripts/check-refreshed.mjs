// 오늘자 업데이트 뒤, 대상 종목에 오늘(한국 시간) 분석이 실제로 들어갔는지 확인한다.
// 2026-10-30 한화비전(489790): Claude가 분석가를 백그라운드로 띄우고 결과 전에 끝나 아무것도 안 쓴 채 '성공'으로 끝났다.
// 사용: node scripts/check-refreshed.mjs <코드,코드> — 빠진 종목이 있으면 종료 코드 1
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function todayMD(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' })
    .formatToParts(now).map(x => [x.type, x.value]));
  return `${Number(p.month)}.${Number(p.day)}`;
}

export function missingToday(entries, codes, today) {
  return codes.filter(code => {
    const e = entries.find(x => x.code === code);
    return !e || !(e.ais || []).some(a => a.date === today);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const codes = (process.argv[2] || '').split(',').map(s => s.trim()).filter(Boolean);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const entries = JSON.parse(fs.readFileSync(path.join(root, 'data', 'analyses-backup.json'), 'utf8'));
  const today = todayMD();
  const missing = missingToday(entries, codes, today);
  if (missing.length) {
    console.log(`::error::오늘(${today}) 분석이 들어가지 않은 종목: ${missing.join(', ')} — Claude 실행 요약 단계의 마지막 말을 확인하세요`);
    process.exit(1);
  }
  console.log(`오늘(${today}) 분석 확인: ${codes.join(', ')}`);
}
