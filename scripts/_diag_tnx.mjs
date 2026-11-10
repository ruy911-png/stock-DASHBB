// 임시 진단(브랜치 전용, 확인 뒤 삭제): 야후 ^TNX 일봉이 Actions에서 받아지는지, 값 단위가 금리(%) 그대로인지
import { request, urls, yieldSymbol, yieldFromHistory, fetchUsFromHistory } from './collect-market-data.mjs';
const chart = await request(`${urls.yahooChart}${encodeURIComponent(yieldSymbol)}?range=1mo&interval=1d`);
const r = chart.chart.result[0];
console.log('last bars', r.timestamp.slice(-4).map((t, i) => [new Date(t * 1000).toISOString().slice(0, 10), r.indicators.quote[0].close.slice(-4)[i]]));
console.log('meta', r.meta.regularMarketPrice, r.meta.exchangeName, r.meta.instrumentType);
const us = await fetchUsFromHistory();
console.log(JSON.stringify(us));
console.log(JSON.stringify(yieldFromHistory(chart, us.usDate)));
