#!/usr/bin/env node
/*
 * 화면 확인용 헤드리스 렌더 하네스 (scripts/ui-shot.cjs)
 * index.html을 실제 Chromium으로 띄워 화면별·폭별 스크린샷을 .cache/ui-shots/에 남기고, 가로 넘침·말줄임을 자동으로 찾아 '주의'로 보여 준다.
 * UI(템플릿) 수정을 푸시하기 전에 반드시 돌리고 PNG를 직접 본다 — CLAUDE.md '화면 확인' 절차, tester 에이전트 담당.
 *
 * 사용: npm run shot -- [--screen home,ai] [--width 1180,940,600] [--click "글자,글자"] [--full] [--height 900] [--font noto|none] [--out .cache/ui-shots] [--busy] [--no-token]
 *   --screen   화면 키 또는 메뉴 이름(기본 home). home·ai(종목분석)·market(시황분석)·news(뉴스)·study(주식공부)·journal(매매일지)·chart(차트 복기 노트)·predict(과거사례 Study)
 *   --width    뷰포트 폭 목록(기본 1180,940,600 = PC·갤럭시 폴드 펼침·좁은 폭)
 *   --click    화면에 들어간 뒤 차례로 누를 글자(정확히 일치). 예: --click "찰스 슈왑"(카드 열기), --click "새로고침"
 *   --full     화면 전체 높이로 캡처(본문이 안쪽 스크롤이라 뷰포트를 내용 높이만큼 늘려 찍는다). 블록 순서·하단 확인용. 기본은 뷰포트 높이(900)만
 *   --font     noto(기본): Noto Sans KR을 'Pretendard' 이름으로 끼워 넣어 갤럭시 기본 한글 폰트에 가깝게 그린다(최초 1회 약 50MB 내려받아 .cache에 둠) / none: 환경 폰트 그대로
 *   --busy     GitHub 실행 조회 스텁이 '실행 중'을 돌려주게 함(중복 실행 확인창 등 상태 확인용)
 *   --no-token 브라우저 localStorage에 가짜 GitHub 토큰을 넣지 않음(토큰 없음 상태 확인용)
 *
 * 출력: 저장한 PNG 경로, 그 아래 '주의'(화면 오른쪽 밖으로 나간 요소, 상자 밖으로 삐져나온 글자, 말줄임된 글자). 주의는 실패가 아니라 직접 볼 곳의 힌트.
 * 환경: Playwright + Chromium. 클라우드 세션에는 둘 다 설치돼 있음(/opt/node-tools, /opt/pw-browsers).
 *   PC: npm i -g playwright && npx playwright install chromium (저장소 의존성에는 넣지 않는다)
 * 외부 접속: CDN(jsdelivr·unpkg)이 막힌 환경을 위해 npm 패키지 파일은 `npm pack`으로 받아 .cache/ui-vendor/에 두고 끼워 넣는다(폰트도 같은 방법).
 *   gstatic(Firebase)·api.github.com은 스텁으로 대체하고, 그 밖의 외부 요청은 차단한 뒤 끝에 목록을 보여 준다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const IS_WIN = process.platform === 'win32';
const NPM = IS_WIN ? 'npm.cmd' : 'npm';
const VENDOR_DIR = path.join(ROOT, '.cache', 'ui-vendor');
const FONT_PKG = { pkg: '@fontsource/noto-sans-kr', ver: '5.3.0', alias: 'Pretendard' }; // 템플릿 폰트 스택의 첫 이름으로 끼워 넣는다
const MAX_FULL_HEIGHT = 12000;
const SCREENS = {
  home: { label: '홈', marker: '홈' },
  ai: { label: '종목분석', marker: '종목분석' },
  market: { label: '시황분석', marker: '시황분석' },
  news: { label: '뉴스', marker: '뉴스' },
  study: { label: '주식공부', marker: '주식공부' },
  journal: { label: '매매일지', marker: '매매일지' },
  chart: { label: '차트 복기 노트', marker: '차트복기' },
  predict: { label: '과거사례 Study', marker: '예측' },
};
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
  '.cjs': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.woff': 'font/woff', '.woff2': 'font/woff2',
};
// Firebase compat 스텁: 로그인·저장 없이 화면만 그린다 (get은 '문서 없음', 쓰기는 무시).
const FIREBASE_STUB = `window.firebase={initializeApp(){return{}},firestore:Object.assign(function(){return{collection(){return{doc(){return{get:async()=>({exists:false,data:()=>null}),set:async()=>{},update:async()=>{},onSnapshot(cb){try{cb({exists:false,data:()=>null})}catch(e){}return()=>{}}}}}}}},{FieldValue:{serverTimestamp(){return new Date()}}})};`;

function usage() {
  const lines = fs.readFileSync(__filename, 'utf8').split('\n');
  const start = lines.indexOf('/*') + 1, end = lines.indexOf(' */');
  console.log(lines.slice(start, end).map(l => l.replace(/^ \*\s?/, '')).join('\n'));
}

function parseArgs(argv) {
  const o = { screens: ['home'], widths: [1180, 940, 600], clicks: [], full: false, height: 900, font: 'noto', out: path.join(ROOT, '.cache', 'ui-shots'), busy: false, token: true, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { if (i + 1 >= argv.length) throw new Error(`${a} 뒤에 값이 없습니다`); return argv[++i]; };
    if (a === '--screen') o.screens = next().split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--width') o.widths = next().split(',').map(s => Number(s.trim())).filter(n => n > 0);
    else if (a === '--click') o.clicks.push(...next().split(',').map(s => s.trim()).filter(Boolean));
    else if (a === '--full') o.full = true;
    else if (a === '--height') o.height = Number(next());
    else if (a === '--font') o.font = next();
    else if (a === '--out') o.out = path.resolve(ROOT, next());
    else if (a === '--busy') o.busy = true;
    else if (a === '--no-token') o.token = false;
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error(`알 수 없는 인자: ${a} (--help 참고)`);
  }
  if (!['noto', 'none'].includes(o.font)) throw new Error(`--font 값은 noto 또는 none (받은 값: ${o.font})`);
  o.screens = o.screens.map(s => {
    const key = Object.keys(SCREENS).find(k => k === s || SCREENS[k].label === s);
    if (!key) throw new Error(`모르는 화면: ${s} (가능: ${Object.keys(SCREENS).map(k => `${k}=${SCREENS[k].label}`).join(', ')})`);
    return key;
  });
  return o;
}

function loadPlaywright() {
  const candidates = ['playwright', process.env.PLAYWRIGHT_MODULE, '/opt/node-tools/node_modules/playwright'].filter(Boolean);
  try {
    const g = execFileSync(NPM, ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell: IS_WIN }).trim();
    if (g) candidates.push(path.join(g, 'playwright'));
  } catch (e) { /* npm 없음 — 아래 후보로 계속 */ }
  for (const c of candidates) {
    try { return require(c); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
  }
  console.error('Playwright를 찾지 못했습니다. 설치: npm i -g playwright && npx playwright install chromium  (또는 PLAYWRIGHT_MODULE=<playwright 폴더>)');
  process.exit(2);
}

function serveStatic() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let urlPath;
      try { urlPath = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); } catch (e) { res.writeHead(400); res.end(); return; }
      const file = path.normalize(path.join(ROOT, urlPath === '/' ? '/index.html' : urlPath));
      if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

// https://unpkg.com/react@18.3.1/umd/react.production.min.js, https://cdn.jsdelivr.net/npm/marked@12.0.0/marked.min.js
function parseNpmUrl(url) {
  const m = url.match(/^https?:\/\/(?:unpkg\.com|cdn\.jsdelivr\.net\/npm)\/((?:@[^/@]+\/)?[^/@]+)@([^/]+)\/(.+?)(?:\?.*)?$/);
  return m ? { pkg: m[1], ver: m[2], file: m[3] } : null;
}

// npm 패키지 tgz를 받아 풀어 둔다(최초 1회). tar는 외부 명령 없이 직접 읽는다(Windows 포함).
function extractTgz(tgz, destDir) {
  const buf = zlib.gunzipSync(fs.readFileSync(tgz));
  const root = path.resolve(destDir);
  let off = 0, longName = null;
  while (off + 512 <= buf.length) {
    const hdr = buf.subarray(off, off + 512); off += 512;
    if (hdr.every(b => b === 0)) break;
    const str = (s, e) => hdr.toString('utf8', s, e).replace(/\0[\s\S]*$/, '');
    const size = parseInt(str(124, 136).trim() || '0', 8);
    const type = String.fromCharCode(hdr[156]);
    let name = str(0, 100);
    const prefix = str(345, 500);
    if (prefix && str(257, 262) === 'ustar') name = `${prefix}/${name}`;
    if (longName) { name = longName; longName = null; }
    const data = buf.subarray(off, off + size); off += Math.ceil(size / 512) * 512;
    if (type === 'L') { longName = data.toString('utf8').replace(/\0[\s\S]*$/, ''); continue; }
    if (type !== '0' && type !== '\0') continue;
    const target = path.resolve(root, name);
    if (!target.startsWith(root + path.sep)) continue; // 경로 탈출 방지
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
  }
}

function vendorDir(pkg, ver) {
  const dir = path.join(VENDOR_DIR, `${pkg.replace('/', '__')}-${ver}`);
  const marker = path.join(dir, '.ok');
  if (!fs.existsSync(marker)) {
    console.log(`패키지 받는 중(최초 1회): ${pkg}@${ver}`);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    execFileSync(NPM, ['pack', `${pkg}@${ver}`, '--pack-destination', dir], { stdio: ['ignore', 'pipe', 'pipe'], shell: IS_WIN });
    const tgz = fs.readdirSync(dir).find(f => f.endsWith('.tgz'));
    if (!tgz) throw new Error(`npm pack 결과 tgz 없음: ${pkg}@${ver}`);
    extractTgz(path.join(dir, tgz), dir);
    fs.rmSync(path.join(dir, tgz), { force: true });
    fs.writeFileSync(marker, new Date().toISOString());
  }
  return dir;
}

function vendorFile({ pkg, ver, file }) {
  const p = path.join(vendorDir(pkg, ver), 'package', file);
  return fs.existsSync(p) ? p : null;
}

// 폰트 패키지의 @font-face CSS를 모아 템플릿 폰트 스택의 첫 이름(alias)으로 바꾸고, 파일 경로는 로컬 서버 주소로 바꾼다.
function fontCss(origin) {
  const pkgDir = path.join(vendorDir(FONT_PKG.pkg, FONT_PKG.ver), 'package');
  const rel = path.relative(ROOT, pkgDir).split(path.sep).map(encodeURIComponent).join('/');
  const cssFiles = fs.readdirSync(pkgDir).filter(f => /^\d{3}\.css$/.test(f)).sort();
  if (!cssFiles.length) throw new Error(`폰트 CSS 없음: ${FONT_PKG.pkg}@${FONT_PKG.ver}`);
  return cssFiles.map(f => fs.readFileSync(path.join(pkgDir, f), 'utf8')
    .replace(/font-family:\s*'[^']*'/g, `font-family: '${FONT_PKG.alias}'`)
    .replace(/url\(\.\/files\//g, `url(${origin}/${rel}/files/`)
    .replace(/font-display:\s*swap;/g, 'font-display: block;')).join('\n');
}

function githubStub(url, busy) {
  if (/\/dispatches(\?|$)/.test(url)) return { status: 204, body: '' };
  if (/\/runs(\/\d+)?(\?|$)/.test(url)) {
    const run = { id: 1, status: 'in_progress', conclusion: null, created_at: new Date().toISOString(), html_url: 'https://github.com/ruy911-png/stock-DASHBB/actions/runs/1' };
    const body = /\/runs\/\d+/.test(url) ? run : { total_count: busy ? 1 : 0, workflow_runs: busy ? [run] : [] };
    return { status: 200, contentType: 'application/json', body: JSON.stringify(body) };
  }
  return { status: 200, contentType: 'application/json', body: '{}' };
}

const exact = text => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);

// 브라우저 안에서 실행: 화면 오른쪽 밖으로 나간 요소, 상자 밖으로 삐져나온 글자, 말줄임된 글자를 찾는다(각 5개까지).
function inspectLayout() {
  const vw = document.documentElement.clientWidth;
  const text = el => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 20);
  const hasBox = el => {
    const cs = getComputedStyle(el);
    return (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent')
      || (cs.borderTopStyle !== 'none' && parseFloat(cs.borderTopWidth) > 0)
      || cs.overflowX !== 'visible';
  };
  // 접힌 메뉴(폭 0, overflow hidden)처럼 일부러 가린 요소는 건너뛴다: 가리는 조상 밖에 완전히 나가 있거나 조상 폭이 0이면 '의도된 숨김'
  const hiddenByClip = (el, r) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const acs = getComputedStyle(a);
      if (acs.overflowX !== 'hidden' && acs.overflowX !== 'clip') continue;
      const ar = a.getBoundingClientRect();
      if (ar.width < 1 || r.left >= ar.right - 0.5 || r.right <= ar.left + 0.5) return true;
    }
    return false;
  };
  const beyond = [], outOfBox = [], ellipsis = [];
  const docW = document.documentElement.scrollWidth;
  if (docW > vw + 1) beyond.push(`문서에 가로 스크롤이 생김 (+${docW - vw}px)`);
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed' || cs.visibility === 'hidden' || cs.display === 'none') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || hiddenByClip(el, r)) continue;
    if (r.right > vw + 1 && beyond.length < 5) beyond.push(`${el.tagName.toLowerCase()} "${text(el)}" 화면 오른쪽 밖 ${Math.round(r.right - vw)}px`);
    if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1 && ellipsis.length < 5) ellipsis.push(`"${text(el)}"`);
    if (el.children.length || !text(el)) continue;
    let p = el.parentElement;
    while (p && p !== document.body && !hasBox(p)) p = p.parentElement;
    if (p && p !== document.body) {
      const over = r.right - p.getBoundingClientRect().right;
      if (over > 1 && outOfBox.length < 5) outOfBox.push(`"${text(el)}" 상자 밖 ${Math.round(over)}px`);
    }
  }
  const out = [];
  const bm = getComputedStyle(document.body);
  if (parseFloat(bm.marginTop) || parseFloat(bm.marginLeft) || parseFloat(bm.marginRight)) out.push(`body 기본 여백 남음: margin ${bm.margin}`);
  if (beyond.length) out.push(`화면 밖: ${beyond.join(' / ')}`);
  if (outOfBox.length) out.push(`상자 밖 글자: ${outOfBox.join(' / ')}`);
  if (ellipsis.length) out.push(`말줄임: ${ellipsis.join(', ')}`);
  return out;
}

// 왼쪽 메뉴로 화면을 바꾼다. 좁은 폭(720px 미만)에서는 메뉴가 접혀 있으므로 토글(›)로 열고 누른 뒤 다시 접어 원래 상태로 찍는다.
async function goScreen(page, def) {
  const openBtn = page.locator('div').filter({ hasText: /^›$/ }).first();
  const wasCollapsed = (await openBtn.count()) > 0 && await openBtn.isVisible();
  if (wasCollapsed) { await openBtn.click({ timeout: 5000 }); await page.waitForTimeout(350); }
  await page.locator('span').filter({ hasText: exact(def.label) }).first().click({ timeout: 8000 });
  await page.waitForSelector(`[data-screen-label="${def.marker}"]`, { timeout: 8000 });
  if (wasCollapsed) {
    const closeBtn = page.locator('div').filter({ hasText: /^‹$/ }).first();
    if ((await closeBtn.count()) > 0) { await closeBtn.click({ timeout: 5000 }); await page.waitForTimeout(350); }
  }
  await page.waitForTimeout(500);
}

// 본문이 height:100vh 안쪽 스크롤이라 fullPage로는 안 찍힌다 → 내용 높이만큼 뷰포트를 늘려 찍고 되돌린다.
async function screenshot(page, file, width, baseHeight, full) {
  if (!full) { await page.screenshot({ path: file }); return; }
  const needed = await page.evaluate(() => {
    let el = document.querySelector('[data-screen-label]'), scroller = null;
    while (el) { const cs = getComputedStyle(el); if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight) { scroller = el; break; } el = el.parentElement; }
    const inner = scroller ? scroller.scrollHeight + (window.innerHeight - scroller.clientHeight) : 0;
    return Math.max(document.documentElement.scrollHeight, inner);
  });
  await page.setViewportSize({ width, height: Math.min(Math.max(needed, baseHeight), MAX_FULL_HEIGHT) });
  await page.waitForTimeout(400);
  await page.screenshot({ path: file });
  await page.setViewportSize({ width, height: baseHeight });
  await page.waitForTimeout(200);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { usage(); return 0; }
  if (!fs.existsSync(path.join(ROOT, 'index.html'))) throw new Error('index.html이 없습니다. npm run build 먼저.');
  const { chromium } = loadPlaywright();
  fs.mkdirSync(opts.out, { recursive: true });
  const { server, origin } = await serveStatic();
  const css = opts.font === 'noto' ? fontCss(origin) : null;
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const blocked = new Set();
  const pageErrors = [];
  const saved = [];
  try {
    for (const width of opts.widths) {
      const ctx = await browser.newContext({ viewport: { width, height: opts.height }, deviceScaleFactor: 1, locale: 'ko-KR' });
      if (opts.token) await ctx.addInitScript(() => { try { localStorage.setItem('stockking_gh_token', 'github_pat_TEST_ONLY'); } catch (e) {} });
      const page = await ctx.newPage();
      page.on('pageerror', e => pageErrors.push(`[${width}px] ${String(e.message || e).split('\n')[0]}`));
      page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) pageErrors.push(`[${width}px console] ${m.text().split('\n')[0]}`); });
      await page.route('**/*', async route => {
        const url = route.request().url();
        if (url.startsWith(origin)) return route.continue();
        if (/^https?:\/\/www\.gstatic\.com\//.test(url)) return route.fulfill({ status: 200, contentType: 'application/javascript', body: FIREBASE_STUB });
        if (/^https?:\/\/api\.github\.com\//.test(url)) return route.fulfill(githubStub(url, opts.busy));
        const npm = parseNpmUrl(url);
        if (npm) {
          try {
            const f = vendorFile(npm);
            if (f) return route.fulfill({ status: 200, contentType: MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', body: fs.readFileSync(f) });
            blocked.add(`${url} (패키지에 그 파일 없음)`);
          } catch (e) { blocked.add(`${url} (npm pack 실패: ${String(e.message).split('\n')[0]})`); }
          return route.abort();
        }
        blocked.add(url);
        return route.abort();
      });
      await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
      if (css) await page.addStyleTag({ content: css });
      await page.waitForSelector('[data-screen-label]', { timeout: 20000 }).catch(() => { throw new Error(`[${width}px] 앱이 20초 안에 그려지지 않았습니다 (아래 차단 목록·페이지 오류 확인)`); });
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);
      for (const key of opts.screens) {
        const def = SCREENS[key];
        await goScreen(page, def);
        for (const t of opts.clicks) {
          await page.getByText(t, { exact: true }).first().click({ timeout: 8000 })
            .catch(e => { throw new Error(`[${width}px ${def.label}] "${t}" 클릭 실패: ${String(e.message).split('\n')[0]}`); });
          await page.waitForTimeout(700);
        }
        await page.evaluate(() => document.fonts.ready);
        const file = path.join(opts.out, `${key}-${width}${opts.clicks.length ? '-click' : ''}${opts.full ? '-full' : ''}.png`);
        await screenshot(page, file, width, opts.height, opts.full);
        saved.push({ file, warnings: await page.evaluate(inspectLayout) });
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log('저장:');
  saved.forEach(({ file, warnings }) => { console.log(`  ${path.relative(ROOT, file)}`); warnings.forEach(w => console.log(`    주의 — ${w}`)); });
  console.log(opts.font === 'noto'
    ? `폰트: Noto Sans KR을 '${FONT_PKG.alias}'로 끼워 넣음(갤럭시 기본 한글 폰트에 가까움). 아이패드(Apple SD Gothic Neo)·PC(맑은 고딕)는 글자 폭이 달라 경계선 줄바꿈·넘침은 실제 캡처로 재확인.`
    : '폰트: 환경 폰트 그대로(한글은 대체 폰트일 수 있어 글자 폭이 실제 기기와 다름).');
  if (blocked.size) { console.log('외부 요청 차단(의도된 것, 화면에 필요한 것이 있으면 하네스를 고친다):'); [...blocked].forEach(u => console.log(`  ${u}`)); }
  if (pageErrors.length) { console.log(`페이지 오류 ${pageErrors.length}건:`); pageErrors.forEach(e => console.log(`  ${e}`)); return 1; }
  console.log('페이지 오류 없음');
  return 0;
}

main().then(code => process.exit(code)).catch(e => { console.error(`실패: ${e.message}`); process.exit(1); });
