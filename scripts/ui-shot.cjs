#!/usr/bin/env node
/*
 * 화면 확인용 헤드리스 렌더 하네스 (scripts/ui-shot.cjs)
 * index.html을 실제 Chromium으로 띄워 화면별·폭별 스크린샷을 .cache/ui-shots/에 남긴다.
 * UI(템플릿) 수정을 푸시하기 전에 반드시 돌리고 PNG를 직접 본다 — CLAUDE.md '화면 확인' 절차, tester 에이전트 담당.
 *
 * 사용: npm run shot -- [--screen home,ai] [--width 1180,940,600] [--click "글자,글자"] [--full] [--height 900] [--out .cache/ui-shots] [--busy] [--no-token]
 *   --screen   화면 키 또는 메뉴 이름(기본 home). home·ai(종목분석)·market(시황분석)·news(뉴스)·study(주식공부)·journal(매매일지)·chart(차트 복기 노트)·predict(과거사례 Study)
 *   --width    뷰포트 폭 목록(기본 1180,940,600 = PC·갤럭시 폴드 펼침·좁은 폭)
 *   --click    화면에 들어간 뒤 차례로 누를 글자(정확히 일치). 예: --click "찰스 슈왑"(카드 열기), --click "새로고침"
 *   --full     전체 페이지 길이로 캡처(기본은 뷰포트 높이만)
 *   --busy     GitHub 실행 조회 스텁이 '실행 중'을 돌려주게 함(중복 실행 확인창 등 상태 확인용)
 *   --no-token 브라우저 localStorage에 가짜 GitHub 토큰을 넣지 않음(토큰 없음 상태 확인용)
 *
 * 환경: Playwright + Chromium. 클라우드 세션에는 둘 다 설치돼 있음(/opt/node-tools, /opt/pw-browsers).
 *   PC: npm i -g playwright && npx playwright install chromium (저장소 의존성에는 넣지 않는다)
 * 외부 접속: CDN(jsdelivr·unpkg)이 막힌 환경을 위해 npm 패키지 파일은 `npm pack`으로 받아 .cache/ui-vendor/에 두고 끼워 넣는다.
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
  const o = { screens: ['home'], widths: [1180, 940, 600], clicks: [], full: false, height: 900, out: path.join(ROOT, '.cache', 'ui-shots'), busy: false, token: true, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { if (i + 1 >= argv.length) throw new Error(`${a} 뒤에 값이 없습니다`); return argv[++i]; };
    if (a === '--screen') o.screens = next().split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--width') o.widths = next().split(',').map(s => Number(s.trim())).filter(n => n > 0);
    else if (a === '--click') o.clicks.push(...next().split(',').map(s => s.trim()).filter(Boolean));
    else if (a === '--full') o.full = true;
    else if (a === '--height') o.height = Number(next());
    else if (a === '--out') o.out = path.resolve(ROOT, next());
    else if (a === '--busy') o.busy = true;
    else if (a === '--no-token') o.token = false;
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error(`알 수 없는 인자: ${a} (--help 참고)`);
  }
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

function vendorFile({ pkg, ver, file }) {
  const dir = path.join(VENDOR_DIR, `${pkg.replace('/', '__')}-${ver}`);
  const marker = path.join(dir, '.ok');
  if (!fs.existsSync(marker)) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    execFileSync(NPM, ['pack', `${pkg}@${ver}`, '--pack-destination', dir], { stdio: ['ignore', 'pipe', 'pipe'], shell: IS_WIN });
    const tgz = fs.readdirSync(dir).find(f => f.endsWith('.tgz'));
    if (!tgz) throw new Error(`npm pack 결과 tgz 없음: ${pkg}@${ver}`);
    extractTgz(path.join(dir, tgz), dir);
    fs.writeFileSync(marker, new Date().toISOString());
  }
  const p = path.join(dir, 'package', file);
  return fs.existsSync(p) ? p : null;
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

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { usage(); return 0; }
  if (!fs.existsSync(path.join(ROOT, 'index.html'))) throw new Error('index.html이 없습니다. npm run build 먼저.');
  const { chromium } = loadPlaywright();
  fs.mkdirSync(opts.out, { recursive: true });
  const { server, origin } = await serveStatic();
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
      await page.waitForSelector('[data-screen-label]', { timeout: 20000 }).catch(() => { throw new Error(`[${width}px] 앱이 20초 안에 그려지지 않았습니다 (아래 차단 목록·페이지 오류 확인)`); });
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(500);
      for (const key of opts.screens) {
        const def = SCREENS[key];
        await page.locator('span').filter({ hasText: exact(def.label) }).first().click({ timeout: 8000 });
        await page.waitForSelector(`[data-screen-label="${def.marker}"]`, { timeout: 8000 });
        await page.waitForTimeout(500);
        for (const text of opts.clicks) {
          await page.getByText(text, { exact: true }).first().click({ timeout: 8000 })
            .catch(e => { throw new Error(`[${width}px ${def.label}] "${text}" 클릭 실패: ${String(e.message).split('\n')[0]}`); });
          await page.waitForTimeout(700);
        }
        const file = path.join(opts.out, `${key}-${width}${opts.clicks.length ? '-click' : ''}.png`);
        await page.screenshot({ path: file, fullPage: opts.full });
        saved.push(file);
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log('저장:');
  saved.forEach(f => console.log(`  ${path.relative(ROOT, f)}`));
  if (blocked.size) { console.log('외부 요청 차단(의도된 것, 화면에 필요한 것이 있으면 하네스를 고친다):'); [...blocked].forEach(u => console.log(`  ${u}`)); }
  if (pageErrors.length) { console.log(`페이지 오류 ${pageErrors.length}건:`); pageErrors.forEach(e => console.log(`  ${e}`)); return 1; }
  console.log('페이지 오류 없음');
  return 0;
}

main().then(code => process.exit(code)).catch(e => { console.error(`실패: ${e.message}`); process.exit(1); });
