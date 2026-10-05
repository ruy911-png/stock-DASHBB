// 1회용 도구: 미장 값이 복사 체인으로 멈춰 있던 항목(2026-09-23~10-02, S&P500 7,764.64 반복)을 이력으로 바로잡는다.
// 각 항목의 미장 기준일 = 수집 시각(collectedAt) 이전에 끝난 마지막 뉴욕 정규장. 야후 일봉 + Cboe VIX 이력 사용.
// 사용: node scripts/backfill-us-indices.mjs [--dry-run]   (워크플로 수동 실행의 backfill_us 옵션이 이걸 돌린다)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { request, urls, usFromHistory, vixFromHistory, yahooSymbols } from './collect-market-data.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = path.join(root, 'data', 'market', 'index.json');
const dryRun = process.argv.includes('--dry-run');

const payload = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const charts = {};
for (const [name, symbol] of Object.entries(yahooSymbols)) {
  charts[name] = await request(`${urls.yahooChart}${encodeURIComponent(symbol)}?range=3mo&interval=1d`);
}
const vixCsv = await request(urls.vixHistory, false);

let changed = 0;
for (const entry of payload.entries) {
  if (!entry.collectedAt) continue; // 손으로 넣은 옛 항목은 건드리지 않는다
  const at = new Date(entry.collectedAt);
  const fresh = Object.keys(yahooSymbols).map(name => usFromHistory(name, charts[name], at));
  const usDate = fresh[0].usDate;
  if (fresh.some(item => item.usDate !== usDate)) throw new Error(`${entry.krDate}: 미장 기준일 불일치(이력)`);
  if (entry.usDate === usDate) continue;
  const byName = Object.fromEntries(fresh.map(item => [item.index.name, item.index]));
  const vix = vixFromHistory(vixCsv, usDate);
  console.log(`${entry.krDate}: 미장 ${entry.usDate} → ${usDate} (S&P500 ${byName['S&P500'].value} ${byName['S&P500'].chg > 0 ? '+' : ''}${byName['S&P500'].chg}%)`);
  entry.usDate = usDate;
  entry.indices = entry.indices.map(item => byName[item.name] || (item.name === 'VIX' ? vix : item));
  changed += 1;
}
console.log(dryRun ? `드라이런: ${changed}개 항목을 고칠 수 있습니다.` : `${changed}개 항목을 고쳤습니다.`);
if (!dryRun && changed) fs.writeFileSync(dataPath, `${JSON.stringify(payload, null, 2)}\n`);
