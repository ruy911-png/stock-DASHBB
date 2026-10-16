// 임시 진단(2026-10-16): 네이버 AI 시황 브리핑 목록 주소가 404가 된 원인 확인용. 확인 후 삭제한다.
const H = {
  'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'accept-language': 'ko-KR,ko;q=0.9',
  referer: 'https://m.stock.naver.com/',
};
async function get(url) {
  try {
    const r = await fetch(url, { headers: H, redirect: 'manual', signal: AbortSignal.timeout(15000) });
    const t = await r.text();
    return { status: r.status, loc: r.headers.get('location'), type: r.headers.get('content-type'), text: t };
  } catch (e) { return { status: 'ERR', text: String(e) }; }
}
const show = (u, r, n = 300) => console.log(`\n[${r.status}] ${u}${r.loc ? ' -> ' + r.loc : ''} (${r.type || ''}, ${r.text.length}자)\n  ${r.text.slice(0, n).replace(/\s+/g, ' ')}`);

const probes = [
  'https://m.stock.naver.com/front-api/market/briefing/list?pageSize=50',
  'https://m.stock.naver.com/front-api/market/briefing/detail?id=5164',
  'https://m.stock.naver.com/front-api/market/briefing/list',
  'https://m.stock.naver.com/front-api/v1/market/briefing/list?pageSize=50',
  'https://m.stock.naver.com/front-api/briefing/market/list?pageSize=50',
  'https://m.stock.naver.com/front-api/briefing/list?pageSize=50',
  'https://m.stock.naver.com/front-api/market/briefings?pageSize=50',
  'https://m.stock.naver.com/api/market/briefing/list?pageSize=50',
  'https://m.stock.naver.com/briefing/market',
  'https://m.stock.naver.com/briefing/market/posts/5164',
];
for (const u of probes) show(u, await get(u));

// 브리핑 화면의 스크립트에서 API 주소 후보 찾기
const pages = ['https://m.stock.naver.com/briefing/market', 'https://m.stock.naver.com/briefing/market/posts/5164', 'https://m.stock.naver.com/'];
const found = new Map();
const scripts = new Set();
for (const p of pages) {
  const r = await get(p);
  if (typeof r.text !== 'string') continue;
  for (const m of r.text.matchAll(/(?:src|href)="([^"]+\.js[^"]*)"/g)) scripts.add(new URL(m[1], p).href);
  for (const m of r.text.matchAll(/["'`]((?:https?:\/\/[a-z.]+)?\/?(?:front-api|api)\/[^"'`\s]{0,120})["'`]/gi)) if (/brief/i.test(m[1])) found.set(m[1], p);
  const nd = r.text.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nd) console.log(`\n__NEXT_DATA__ (${p}) 앞부분: ${nd[1].slice(0, 600)}`);
}
console.log(`\n스크립트 ${scripts.size}개 검사`);
let n = 0;
for (const s of scripts) {
  if (n++ > 80) break;
  const r = await get(s);
  if (typeof r.text !== 'string') continue;
  for (const m of r.text.matchAll(/["'`]([^"'`\s]{0,80}brief[^"'`\s]{0,80})["'`]/gi)) {
    if (/\//.test(m[1])) found.set(m[1], s.split('/').pop());
  }
}
console.log('\nbrief 관련 경로 후보:');
for (const [k, v] of found) console.log(`  ${k}   (${v})`);
