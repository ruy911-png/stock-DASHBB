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
  kospi: 'https://m.stock.naver.com/api/index/KOSPI/basic',
  kosdaq: 'https://m.stock.naver.com/api/index/KOSDAQ/basic',
  fx: 'https://api.stock.naver.com/marketindex/exchange/FX_USDKRW/prices?page=1&pageSize=5',
  sp500: 'https://api.stock.naver.com/index/.INX/basic',
  nasdaq: 'https://api.stock.naver.com/index/.IXIC/basic',
  vix: 'https://api.stock.naver.com/index/.VIX/basic',
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

function decodeHtml(value) {
  return String(value || '')
    .replace(/<!--.*?-->/gs, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

export function parseFlowAmount(value) {
  const text = decodeHtml(value).replace(/\s/g, '');
  const sign = /^[-−]/.test(text) ? -1 : 1;
  const jo = text.match(/([\d,]+)조/);
  const eok = text.match(/([\d,]+)억/);
  if (!jo && !eok) throw new Error(`수급 금액을 읽지 못했습니다: ${text}`);
  return sign * ((jo ? numberValue(jo[1], '조 단위 수급') * 10000 : 0) + (eok ? numberValue(eok[1], '억 단위 수급') : 0));
}

export function extractBriefing(homeHtml, detailHtml) {
  const href = homeHtml.match(/href="(\/briefing\/market\/posts\/\d+)"/i)?.[1];
  const titleRaw = homeHtml.match(/<strong class="AIBriefing_title__[^"]*">([\s\S]*?)<\/strong>/i)?.[1];
  if (!href || !titleRaw) throw new Error('네이버페이 증권 AI 브리핑 링크 또는 제목을 찾지 못했습니다.');

  const summary = [...detailHtml.matchAll(/<li class="ContentText_item-summary__[^"]*">([\s\S]*?)<\/li>/gi)]
    .map(match => decodeHtml(match[1]))
    .filter(Boolean);
  if (summary.length < 1) throw new Error('AI 브리핑 핵심요약을 찾지 못했습니다.');

  const detailText = decodeHtml(detailHtml);
  const published = detailText.match(/(20\d{2})\.\s*(\d{1,2})\.\s*(\d{1,2})[^\d]{0,12}(\d{2}):(\d{2})\s*AI 핵심요약/);
  if (!published) throw new Error('AI 브리핑 작성 시각을 찾지 못했습니다.');
  const publishedDate = `${published[1]}-${String(published[2]).padStart(2, '0')}-${String(published[3]).padStart(2, '0')}`;
  const publishedAt = `${publishedDate}T${published[4]}:${published[5]}:00+09:00`;

  const kospiSection = detailHtml.match(/<section class="InvestorFlowCombinedBar_market-box__[^"]*">[\s\S]*?<h5[^>]*>코스피<\/h5>([\s\S]*?)<\/section>/i)?.[1];
  if (!kospiSection) throw new Error('AI 브리핑의 코스피 투자자 수급을 찾지 못했습니다.');
  const flowMap = new Map();
  const flowPattern = /<span class="InvestorFlowCombinedBar_category__[^"]*">(개인|외국인|기관)<\/span>\s*<span class="InvestorFlowCombinedBar_value__[^"]*">([\s\S]*?)<\/span>/gi;
  for (const match of kospiSection.matchAll(flowPattern)) flowMap.set(match[1], parseFlowAmount(match[2]));
  const flows = ['외국인', '기관', '개인'].map(name => {
    if (!flowMap.has(name)) throw new Error(`AI 브리핑에서 ${name} 수급을 찾지 못했습니다.`);
    return { name, amount: flowMap.get(name) };
  });

  const title = decodeHtml(titleRaw);
  const comment = summary.slice(0, 3).join(' ');
  return {
    title,
    comment,
    flows,
    publishedDate,
    publishedAt,
    url: new URL(href, urls.home).href,
  };
}

export function makeKeywords(title, comment) {
  const text = `${title} ${comment}`;
  const dictionary = [
    '반도체', '삼성전자', 'SK하이닉스', 'HBM', 'AI', '코스피', '코스닥', '외국인', '기관',
    '수출', '환율', '원화', '금리', '유가', 'WTI', '바이오', '2차전지', '자동차', '금융',
    '내수', '관세', '실적', '공매도', '강세', '약세', '반등', '급락',
  ];
  const keywords = dictionary
    .map(word => ({ word, index: text.toLowerCase().indexOf(word.toLowerCase()) }))
    .filter(item => item.index >= 0)
    .sort((a, b) => a.index - b.index)
    .map(item => item.word);
  const stopWords = new Set(['오늘', '국내', '증시', '시장', '마감', '다시', '중심', '오르며', '내리며']);
  for (const token of title.replace(/[^가-힣A-Za-z0-9]+/g, ' ').split(/\s+/)) {
    if (keywords.length >= 6) break;
    if (token.length >= 2 && !stopWords.has(token) && !keywords.includes(token)) keywords.push(token);
  }
  return keywords.slice(0, 6);
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
  const [homeHtml, kospi, kosdaq, fxRows, sp500, nasdaq, vix, sox, wtiRows] = await Promise.all([
    request(urls.home, false), request(urls.kospi), request(urls.kosdaq), request(urls.fx),
    request(urls.sp500), request(urls.nasdaq), request(urls.vix), request(urls.sox), request(urls.wti),
  ]);
  if (!Array.isArray(fxRows) || !fxRows[0]) throw new Error('원/달러 마감 데이터를 찾지 못했습니다.');
  if (!Array.isArray(wtiRows) || !wtiRows[0]) throw new Error('WTI 결제 데이터를 찾지 못했습니다.');

  const briefingHref = homeHtml.match(/href="(\/briefing\/market\/posts\/\d+)"/i)?.[1];
  if (!briefingHref) throw new Error('네이버페이 증권 AI 브리핑 상세 링크를 찾지 못했습니다.');
  const detailHtml = await request(new URL(briefingHref, urls.home).href, false);
  const briefing = extractBriefing(homeHtml, detailHtml);

  const krDate = isoDate(kospi.localTradedAt, '국장');
  const kosdaqDate = isoDate(kosdaq.localTradedAt, '코스닥');
  const fxDate = isoDate(fxRows[0].localTradedAt, '원/달러');
  const usDate = isoDate(sp500.localTradedAt, '미장');
  const wtiDate = isoDate(wtiRows[0].localTradedAt, 'WTI');
  if (kosdaqDate !== krDate || fxDate !== krDate || briefing.publishedDate !== krDate) {
    throw new Error(`국장 기준일 불일치: KOSPI ${krDate}, KOSDAQ ${kosdaqDate}, 원/달러 ${fxDate}, 브리핑 ${briefing.publishedDate}`);
  }
  for (const [name, data] of [['나스닥', nasdaq], ['VIX', vix], ['필라델피아 반도체', sox]]) {
    const date = isoDate(data.localTradedAt, name);
    if (date !== usDate) throw new Error(`미장 기준일 불일치: S&P500 ${usDate}, ${name} ${date}`);
  }

  const indices = [
    marketIndex('KOSPI', kospi),
    marketIndex('KOSDAQ', kosdaq),
    { name: '원/달러', value: String(fxRows[0].closePrice), chg: numberValue(fxRows[0].fluctuationsRatio, '원/달러 등락률') },
    marketIndex('S&P500', sp500),
    marketIndex('나스닥', nasdaq),
    marketIndex('VIX', vix),
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
    keywords: makeKeywords(briefing.title, briefing.comment),
    ...mood,
    sources: {
      kr: 'https://m.stock.naver.com/domestic/index/KOSPI/total',
      us: 'https://m.stock.naver.com/worldstock/index/.INX/total',
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
