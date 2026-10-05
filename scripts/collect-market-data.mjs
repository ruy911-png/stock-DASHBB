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

export const urls = {
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
  // 미장이 열려 있을 때(국장 마감 시각엔 흔함) 직전에 끝난 정규장 종가를 가져오는 일봉 이력(야후, 비공식)
  yahooChart: 'https://query1.finance.yahoo.com/v8/finance/chart/',
};
export const yahooSymbols = { 'S&P500': '^GSPC', '나스닥': '^IXIC', '필라델피아 반도체': '^SOX' };

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function request(url, asJson = true) {
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

export function addDays(isoDateStr, days) {
  const d = new Date(`${isoDateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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
  // 네이버페이 증권 AI 브리핑이 종종 국장 마감일(targetDate)이 아니라 그 다음 날짜로
  // 라벨링되는 경우가 관측되어(2026.8 이후 거의 매일), targetDate를 우선 찾고
  // 없으면 targetDate+1일도 폴백으로 확인한다.
  const candidateDates = [targetDate, addDays(targetDate, 1)];
  for (const date of candidateDates) {
    const sameDate = items.filter(item => item.briefingDate === date);
    if (!sameDate.length) continue;
    const byHourDesc = [...sameDate].sort((a, b) => Number(b.briefingHour) - Number(a.briefingHour));
    const preferred = sameDate.find(item => String(item.briefingHour).padStart(2, '0') === '20');
    const titleMatch = sameDate.find(item => /코스피|국내\s*증시|국내장/.test(`${item.title || ''} ${item.summary || ''}`));
    // 선호 순서(20시 정각 > 제목 키워드매치 > 최신순)로 후보 전체를 반환한다 — 1순위 후보의
    // 상세 데이터에 코스피 수급 정보가 없는 경우(예: 미국장 브리핑이 잘못 픽업된 경우)
    // 호출측에서 다음 후보로 재시도할 수 있게 하기 위함.
    const ordered = [];
    const seen = new Set();
    for (const candidate of [preferred, titleMatch, ...byHourDesc]) {
      if (candidate && !seen.has(candidate.id)) { ordered.push(candidate); seen.add(candidate.id); }
    }
    if (ordered.length) return ordered;
  }
  const availableDates = [...new Set(items.map(item => item.briefingDate))].slice(0, 10).join(', ');
  throw new Error(`${targetDate} 국내 마감 AI 브리핑을 찾지 못했습니다. (${targetDate}, ${candidateDates[1]} 모두 확인, 목록에서 확인된 날짜: ${availableDates || '없음'}, 총 ${items.length}건)`);
}

export function extractBriefing(payload, targetDate) {
  const result = payload?.result;
  if (!result || result.briefingDate !== targetDate) throw new Error('AI 브리핑 기준일이 국장 기준일과 다릅니다.');
  const flowVisual = (result.visuals || []).find(item => item.type === 'investor_flow_combined_bar');
  const kospiFlow = flowVisual?.data?.find(item => item.market === 'KOSPI');
  if (!Array.isArray(kospiFlow?.flows)) {
    const visualTypes = (result.visuals || []).map(item => item.type);
    const debugDump = JSON.stringify(flowVisual ?? null).slice(0, 1500);
    throw new Error(`AI 브리핑에서 코스피 투자자 수급을 찾지 못했습니다. (visuals 타입 목록: ${JSON.stringify(visualTypes)}, flowVisual 덤프: ${debugDump})`);
  }
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

// 국장 마감 시점엔 미장이 아직 열려있는 경우가 흔하다(네이버 등 국내 증권 사이트도 이 시점엔
// 전일 미장 마감치를 그대로 보여줌). 미장이 열려있으면 당일 미장 데이터를 새로 가져오지 않고,
// 가장 최근 저장된 엔트리의 미장 쪽 값을 그대로 이어받는다.
export function carryForwardUsIndices(entries, usIndexNames) {
  const latestUsEntry = entries.find(item => usIndexNames.every(name => (item.indices || []).some(i => i.name === name)));
  if (!latestUsEntry) throw new Error('미장이 아직 진행 중인데 참고할 이전 미장 데이터가 없습니다.');
  return {
    usDate: latestUsEntry.usDate,
    usIndices: usIndexNames.map(name => ({ ...latestUsEntry.indices.find(i => i.name === name) })),
  };
}

// 뉴욕 시간 기준 날짜(YYYY-MM-DD)와 0시부터의 분
export function newYorkParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(date);
  const get = type => parts.find(part => part.type === type).value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

// 야후 일봉(chart API) → now 이전에 끝난 마지막 정규장 종가와 그 전 종가 대비 등락률.
// 뉴욕 16:00 전의 '오늘' 봉은 장중 값이라 빼고, now 뒤의 봉(백필 때)도 보지 않는다.
// 전에는 미장이 열려 있으면 직전 저장값을 복사했는데, 그 값도 복사본이면 같은 숫자가 계속 이어졌다(2026-09-23~10-02 S&P500 7,764.64 반복).
export function usFromHistory(name, chart, now = new Date()) {
  const result = chart && chart.chart && Array.isArray(chart.chart.result) && chart.chart.result[0];
  if (!result || !Array.isArray(result.timestamp)) throw new Error(`${name} 야후 일봉을 읽지 못했습니다.`);
  const closes = result.indicators.quote[0].close;
  const ny = newYorkParts(now);
  const bars = result.timestamp
    .map((ts, i) => ({ date: newYorkParts(new Date(ts * 1000)).date, close: closes[i] }))
    .filter(bar => Number.isFinite(bar.close) && bar.date <= ny.date);
  if (bars.length && bars[bars.length - 1].date === ny.date && ny.minutes < 16 * 60) bars.pop();
  if (bars.length < 2) throw new Error(`${name} 야후 일봉이 부족합니다.`);
  const last = bars[bars.length - 1];
  const previous = bars[bars.length - 2];
  return {
    usDate: last.date,
    index: {
      name,
      value: last.close.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      chg: Number((((last.close / previous.close) - 1) * 100).toFixed(2)),
    },
  };
}

export async function fetchUsFromHistory(now = new Date()) {
  const results = [];
  for (const [name, symbol] of Object.entries(yahooSymbols)) {
    const chart = await request(`${urls.yahooChart}${encodeURIComponent(symbol)}?range=1mo&interval=1d`);
    results.push(usFromHistory(name, chart, now));
  }
  const usDate = results[0].usDate;
  if (results.some(item => item.usDate !== usDate)) {
    throw new Error(`미장 기준일 불일치(이력): ${results.map(item => `${item.index.name} ${item.usDate}`).join(', ')}`);
  }
  const vixIndex = vixFromHistory(await request(urls.vixHistory, false), usDate);
  const byName = Object.fromEntries(results.map(item => [item.index.name, item.index]));
  return { usDate, usIndices: [byName['S&P500'], byName['나스닥'], vixIndex, byName['필라델피아 반도체']] };
}

export function alreadyCollected(payload, krDate) {
  return payload.entries.some(item => item.krDate === krDate);
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
  const wtiDate = isoDate(wtiRows[0].localTradedAt, 'WTI');

  const payload = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  if (!Array.isArray(payload.entries)) throw new Error('data/market/index.json의 entries가 배열이 아닙니다.');
  // 이미 수집된 거래일이면(휴일·같은 날 재실행) 브리핑을 찾기 전에 정상 종료한다.
  // 전에는 이 검사가 브리핑 조회 뒤에 있어서, 휴일에는 "브리핑을 찾지 못했습니다"로 실패했다(2026-09-24·25).
  if (alreadyCollected(payload, krDate)) {
    writeOutput('kr_date', krDate);
    writeOutput('changed', 'false');
    console.log(`${krDate} 시황 데이터가 이미 있어 변경하지 않았습니다.`);
    return;
  }
  const briefingCandidates = selectClosingBriefing(briefingList, krDate);
  let briefing = null;
  let briefingError = null;
  for (const candidate of briefingCandidates) {
    try {
      const briefingPayload = await request(`${urls.briefingDetail}?id=${candidate.id}`);
      briefing = extractBriefing(briefingPayload, candidate.briefingDate);
      break;
    } catch (error) {
      briefingError = error;
    }
  }
  if (!briefing) throw briefingError || new Error('AI 브리핑 후보 중 유효한 항목을 찾지 못했습니다.');
  const briefingDateOk = briefing.publishedDate === krDate || briefing.publishedDate === addDays(krDate, 1);
  if (kosdaqDate !== krDate || fxDate !== krDate || !briefingDateOk) {
    throw new Error(`국장 기준일 불일치: KOSPI ${krDate}, KOSDAQ ${kosdaqDate}, 원/달러 ${fxDate}, 브리핑 ${briefing.publishedDate}`);
  }

  const usIndexNames = ['S&P500', '나스닥', 'VIX', '필라델피아 반도체'];
  let usDate;
  let usIndices;
  if (sp500.marketStatus === 'CLOSE') {
    usDate = isoDate(sp500.localTradedAt, '미장');
    for (const [name, data] of [['나스닥', nasdaq], ['필라델피아 반도체', sox]]) {
      const date = isoDate(data.localTradedAt, name);
      if (date !== usDate) throw new Error(`미장 기준일 불일치: S&P500 ${usDate}, ${name} ${date}`);
    }
    const vixDate = isoDate(vix.localTradedAt, 'VIX');
    const vixIndex = vixDate === usDate && vix.marketStatus === 'CLOSE'
      ? marketIndex('VIX', vix)
      : vixFromHistory(await request(urls.vixHistory, false), usDate);
    usIndices = [marketIndex('S&P500', sp500), marketIndex('나스닥', nasdaq), vixIndex, marketIndex('필라델피아 반도체', sox)];
  } else {
    // 미장이 프리마켓·장중이면 직전에 끝난 정규장 종가를 이력에서 직접 가져온다(복사하지 않음).
    ({ usDate, usIndices } = await fetchUsFromHistory());
    if (usIndices.length !== usIndexNames.length) throw new Error('미장 지수 이력이 불완전합니다.');
  }

  const indices = [
    marketIndex('KOSPI', kospi),
    marketIndex('KOSDAQ', kosdaq),
    { name: '원/달러', value: String(fxRows[0].closePrice), chg: numberValue(fxRows[0].fluctuationsRatio, '원/달러 등락률') },
    ...usIndices,
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
