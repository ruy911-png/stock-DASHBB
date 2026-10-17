// 임시 진단 3차(2026-10-17): 국장 마감일 브리핑 후보별로 투자자 수급(visuals) 유무 확인. 확인 후 삭제한다.
const H = { 'user-agent': 'Mozilla/5.0 (compatible; stock-DASHBB-market-bot/1.0)', 'accept-language': 'ko-KR,ko;q=0.9', referer: 'https://m.stock.naver.com/' };
const get = async u => (await fetch(u, { headers: H })).json();
const items = (await get('https://m.stock.naver.com/front-api/briefing/market/list?pageSize=50'))?.result?.items || [];
console.log(`목록 ${items.length}건, 날짜별: ${JSON.stringify(items.reduce((m, i) => (m[i.briefingDate] = (m[i.briefingDate] || 0) + 1, m), {}))}`);
for (const it of items.filter(i => i.briefingDate >= '2026-10-15')) {
  const r = (await get(`https://m.stock.naver.com/front-api/briefing/market/detail?id=${it.id}`))?.result || {};
  const types = (r.visuals || []).map(v => v.type);
  const flow = (r.visuals || []).find(v => /flow|investor/i.test(v.type));
  console.log(`id=${it.id} ${it.briefingDate} ${it.briefingHour}시 [${types.join(',')}] ${it.title}`);
  if (flow) console.log(`   수급 visual: ${JSON.stringify(flow).slice(0, 300)}`);
}
