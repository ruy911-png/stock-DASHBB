import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = path.join(root, 'data', 'market', 'index.json');
const dryRun = process.argv.includes('--dry-run');
const requestHeaders = {
  'user-agent': 'Mozilla/5.0 (compatible; stock-DASHBB-market-bot/1.0)',
  'accept-language': 'ko-KR,ko;q=0.9',
  referer: 'https://m.stock.naver.com/',
};

const urls = {
  home: 'https://m.stock.naver.com/',
  briefingList: 'https://m.stock.naver.com/front-api/market/briefing/list?pageSize=50',
  briefingDetail: 'https://m.stock.naver.com/front-api/market/briefing/detail',
  kospi: 'https://m.stock.naver.com/api/index/KOSPI/basic',
  kosdaq: 'https://m.stock.naver.com/api/index/KOSDAQ/basic',
  fx: 'https://api.stock.naver.com/marketindex/exchange/FX_USDKRW/prices?page=1&pageSize=5',
  sp500: 'https://api.stock.naver.com/index/.INX/basic',
  nasdaq: 'https://api.stock.naver.com/index/.IXIC/basic',
  vix: 'https://api.stock.naver.com/index/.VIX/basic',
  vixHistory: 'https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv',
  sox: 'https://api.stock.naver.com/index/.SOX/basic',
  wti: 'https://api.stock.naver.com/marketindex/energy/CLcv1/prices?page=1&pageSize=5',
};

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function request(url, asJson = true) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: requestHeaders,
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return asJson ? response.json() : response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await delay(attempt * 1000);
    }
  }
  throw new Error(`데이터 요청 실패: ${url} (${lastError.message})`);
}

function isoDate(value, label) {
  const match = String(value || '').match(/^(20\d{2})-(\d{2})-(\d{2})/);
  if (!match) throw new Error(`${label} 기준일을 읽지 못했습니다: ${value}`);
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function numberValue(value, label) {
  const number = Number(String(value ?? '').replace(/,/g, ''));
  if (!Number.isFinite(number)) throw new Error(`${label} 숫자가 올바르지 않습니다: ${value}`);
  return number;
}

function marketIndex(name, data, requireClose = true) {
  if (requireClose && data.marketStatus !== 'CLOSE') {
    throw new Error(`${name}이 장마감 상태가 아닙니다: ${data.marketStatus || '알 수 없음'}`);
  }
  return {
    name,
    value: String(data.closePrice),
    chg: numberValue(data.fluctuationsRatio, `${name} 등락률`),
  };
}

export function selectClosingBriefing(payload, targetDate) {
  const items = payload?.result?.items;
  if (!Array.isArray(items)) throw new Error('네이버페이 증권 AI 브리핑 목록을 읽지 못했습니다.');
  const sameDate = items.filter(item => item.briefingDate === targetDate);
  const selected = sameDate.find(item => String(item.briefingHour).padStart(2, '0') === '20')
    || sameDate.find(item => /코스피|국내 증시|국내장/.test(`${item.title || ''} ${item.summary || ''}`));
  if (!selected) throw new Error(`${targetDate} 국내 마감 AI 브리핑을 찾지 못했습니다.`);
  return selected;
}

export function extractBriefing(payload, targetDate) {
  const result = payload?.result;
  if (!result || result.briefingDate !== targetDate) throw new Error('AI 브리핑 기준일이 국장 기준일과 다릅니다.');
  const flowVisual = (result.visuals || []).find(item => item.type === 'investor_flow_combined_bar');
  const kospiFlow = flowVisual?.data?.find(item => item.market === 'KOSPI');
  if (!Array.isArray(kospiFlow?.flows)) throw new Error('AI 브리핑에서 코스피 투자자 수급을 찾지 못했습니다.');
  const actorNames = { FOREIGN: '외국인', INSTITUTIONAL: '기관', INDIVIDUAL: '개인' };
  const flowMap = new Map(kospiFlow.flows.map(item => [actorNames[item.actor], numberValue(item.amount, `${item.actor} 수급`) / 100000000]));
  const flows = ['외국인', '기관', '개인'].map(name => {
    const amount = flowMap.get(name);
    if (!Number.isFinite(amount)) throw new Error(`AI 브리핑에서 ${name} 수급을 찾지 못했습니다.`);
    return { name, amount };
  });
  const keywordVisual = (result.visuals || []).find(item => item.type === 'keyword_tags');
  const keywords = (keywordVisual?.data || []).map(item => item.keyword).filter(Boolean).slice(0, 6);
  if (!keywords.length) throw new Error('AI 브리핑에서 오늘의 키워드를 찾지 못했습니다.');
  const generatedAt = result.briefingMeta?.generatedAt || `${targetDate}T${String(result.briefingHour).padStart(2, '0')}:00:00`;
  const publishedAt = /(?:Z|[+-]\d{2}:\d{2})$/.test(generatedAt) ? generatedAt : `${generatedAt}+09:00`;
  return {
    title: result.title,
    comment: result.title,
    keywords,
    flows,
    publishedDate: result.briefingDate,
    publishedAt,
    url: new URL(`/briefing/market/posts/${result.id}`, urls.home).href,
  };
}

export function vixFromHistory(csv, targetDate) {
  const rows = String(csv || '').trim().split(/\r?\n/).slice(1).map(line => line.split(','));
  const target = `${targetDate.slice(5, 7)}/${targetDate.slice(8, 10)}/${targetDate.slice(0, 4)}`;
  const index = rows.findIndex(row => row[0] === target);
  if (index < 1) throw new Error(`Cboe VIX ${targetDate} 마감 데이터를 찾지 못했습니다.`);
  const close = numberValue(rows[index][4], 'VIX 마감값');
  const previousClose = numberValue(rows[index - 1][4], 'VIX 전일 마감값');
  return {
    name: 'VIX',
    value: close.toFixed(2),
    chg: Number((((close / previousClose) - 1) * 100).toFixed(2)),
  };
}

export function marketMood(indices) {
  const names = new Set(['KOSPI', 'KOSDAQ', 'S&P500', '나스닥']);
  const selected = indices.filter(item => names.has(item.name));
  const average = selected.reduce((sum, item) => sum + item.chg, 0) / selected.length;
  if (average >= 1) return { mood: '강세 · 위험선호', moodUp: true };
  if (average >= 0.2) return { mood: '강보합 · 위험선호', moodUp: true };
  if (average > -0.2) return { mood: '보합 · 혼조', moodUp: average >= 0 };
  if (average > -1) return { mood: '약보합 · 경계', moodUp: false };
  return { mood: '약세 · 위험회피', moodUp: false };
}

function writeOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

async function main() {
  const [briefingList, kospi, kosdaq, fxRows, sp500, nasdaq, vix, sox, wtiRows] = await Promise.all([
    request(urls.briefingList), request(urls.kospi), request(urls.kosdaq), request(urls.fx),
    request(urls.sp500), request(urls.nasdaq), request(urls.vix), request(urls.sox), request(urls.wti),
  ]);
  if (!Array.isArray(fxRows) || !fxRows[0]) throw new Error('원/달러 마감 데이터를 찾지 못했습니다.');
  if (!Array.isArray(wtiRows) || !wtiRows[0]) throw new Error('WTI 결제 데이터를 찾지 못했습니다.');

  const krDate = isoDate(kospi.localTradedAt, '국장');
  const kosdaqDate = isoDate(kosdaq.localTradedAt, '코스닥');
  const fxDate = isoDate(fxRows[0].localTradedAt, '원/달러');
  const usDate = isoDate(sp500.localTradedAt, '미장');
  const wtiDate = isoDate(wtiRows[0].localTradedAt, 'WTI');
  const briefingItem = selectClosingBriefing(briefingList, krDate);
  const briefingPayload = await request(`${urls.briefingDetail}?id=${briefingItem.id}`);
  const briefing = extractBriefing(briefingPayload, krDate);
  if (kosdaqDate !== krDate || fxDate !== krDate || briefing.publishedDate !== krDate) {
    throw new Error(`국장 기준일 불일치: KOSPI ${krDate}, KOSDAQ ${kosdaqDate}, 원/달러 ${fxDate}, 브리핑 ${briefing.publishedDate}`);
  }
  for (const [name, data] of [['나스닥', nasdaq], ['필라델피아 반도체', sox]]) {
    const date = isoDate(data.localTradedAt, name);
    if (date !== usDate) throw new Error(`미장 기준일 불일치: S&P500 ${usDate}, ${name} ${date}`);
  }
  const vixDate = isoDate(vix.localTradedAt, 'VIX');
  const vixIndex = vixDate === usDate && vix.marketStatus === 'CLOSE'
    ? marketIndex('VIX', vix)
    : vixFromHistory(await request(urls.vixHistory, false), usDate);

  const indices = [
    marketIndex('KOSPI', kospi),
    marketIndex('KOSDAQ', kosdaq),
    { name: '원/달러', value: String(fxRows[0].closePrice), chg: numberValue(fxRows[0].fluctuationsRatio, '원/달러 등락률') },
    marketIndex('S&P500', sp500),
    marketIndex('나스닥', nasdaq),
    vixIndex,
    marketIndex('필라델피아 반도체', sox),
    { name: 'WTI', value: String(wtiRows[0].closePrice), chg: numberValue(wtiRows[0].fluctuationsRatio, 'WTI 등락률') },
  ];
  const mood = marketMood(indices);
  const entry = {
    date: `${Number(krDate.slice(5, 7))}.${Number(krDate.slice(8, 10))}`,
    krDate,
    usDate,
    wtiDate,
    collectedAt: new Date().toISOString(),
    indices,
    flows: briefing.flows,
    comment: briefing.comment,
    keywords: briefing.keywords,
    ...mood,
    sources: {
      kr: 'https://m.stock.naver.com/domestic/index/KOSPI/total',
      us: 'https://m.stock.naver.com/worldstock/index/.INX/total',
      vix: urls.vixHistory,
      wti: 'https://m.stock.naver.com/marketindex/energy/CLcv1',
      briefing: {
        provider: '네이버페이 증권 AI 브리핑',
        publishedAt: briefing.publishedAt,
        url: briefing.url,
      },
    },
  };

  const payload = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  if (!Array.isArray(payload.entries)) throw new Error('data/market/index.json의 entries가 배열이 아닙니다.');
  const exists = payload.entries.some(item => item.krDate === krDate);
  writeOutput('kr_date', krDate);
  writeOutput('us_date', usDate);
  writeOutput('wti_date', wtiDate);
  writeOutput('briefing_title', briefing.title.replace(/[\r\n]/g, ' '));
  writeOutput('changed', exists ? 'false' : 'true');

  if (dryRun) {
    console.log(JSON.stringify(entry, null, 2));
    console.log(exists ? `드라이런: ${krDate} 데이터가 이미 있습니다.` : `드라이런: ${krDate} 데이터를 추가할 수 있습니다.`);
    return;
  }
  if (exists) {
    console.log(`${krDate} 시황 데이터가 이미 있어 변경하지 않았습니다.`);
    return;
  }
  payload.entries.unshift(entry);
  fs.writeFileSync(dataPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`${krDate} 시황 데이터를 추가했습니다. (미장 ${usDate}, WTI ${wtiDate})`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
