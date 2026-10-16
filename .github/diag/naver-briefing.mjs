// 임시 진단 2차(2026-10-16): 새 브리핑 주소(front-api/briefing/market/*)의 응답 형식 확인. 확인 후 삭제한다.
const H = { 'user-agent': 'Mozilla/5.0 (compatible; stock-DASHBB-market-bot/1.0)', 'accept-language': 'ko-KR,ko;q=0.9', referer: 'https://m.stock.naver.com/' };
const get = async u => { const r = await fetch(u, { headers: H }); console.log(`[${r.status}] ${u}`); return r.json(); };
const list = await get('https://m.stock.naver.com/front-api/briefing/market/list?pageSize=50');
const items = list?.result?.items || [];
console.log(`목록 ${items.length}건, 첫 항목 키: ${Object.keys(items[0] || {}).join(', ')}`);
for (const it of items.slice(0, 6)) console.log(`  id=${it.id} date=${it.briefingDate} hour=${it.briefingHour} ${it.title}`);
const d = await get(`https://m.stock.naver.com/front-api/briefing/market/detail?id=${items[0]?.id}`);
const r = d?.result || {};
console.log(`상세 키: ${Object.keys(r).join(', ')}`);
console.log(`visuals 타입: ${JSON.stringify((r.visuals || []).map(v => v.type))}`);
