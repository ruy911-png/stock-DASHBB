// data/cases.json(과거사례 Study, 코드 계산 통계 + Claude 글)의 형식을 검사한다. 파일이 아직 없으면 통과(첫 실행 전).
// 규칙(사용자 결정 2026-10-12): 숫자는 코드가 계산한 indices만, 타임라인은 날짜·악재/호재/중립·제목·출처 URL 필수, 권유·전망 표현 금지.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = path.join(root, 'data', 'cases.json');
const isoDate = /^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
const recommendRe = /(매수|매도)\s*(를|을)?\s*(추천|권유|하세요|하십시오|기회|타이밍|적기)|사세요|파세요|분할\s*매수|저점\s*매수|매수\s*기회/;
const forecastRe = /(할|될|올|오를|내릴)\s*(것이다|것으로\s*보인다|전망이다|가능성이\s*높다)|예상된다|전망된다/;

function fail(message) { throw new Error(`과거사례 데이터 오류: ${message}`); }

if (!fs.existsSync(dataPath)) {
  console.log('과거사례 데이터 없음 (아직 생성 전) — 건너뜀');
} else {
  const payload = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  if (!payload || typeof payload.items !== 'object') fail('items가 객체가 아닙니다.');
  const ids = Object.keys(payload.items);
  let written = 0;
  ids.forEach(id => {
    const it = payload.items[id];
    const at = `items[${id}]`;
    if (it.id !== id) fail(`${at}.id가 키와 다릅니다.`);
    if (typeof it.title !== 'string' || !it.title.trim()) fail(`${at}.title이 비어 있습니다.`);
    if (!isoDate.test(it.start || '')) fail(`${at}.start는 YYYY-MM-DD여야 합니다.`);
    if (it.end != null && !isoDate.test(it.end)) fail(`${at}.end는 YYYY-MM-DD 또는 null이어야 합니다.`);
    if (!['ongoing', 'closed'].includes(it.status)) fail(`${at}.status가 올바르지 않습니다.`);
    if (!it.indices || typeof it.indices !== 'object') fail(`${at}.indices가 없습니다.`);
    ['KOSPI', 'SP500'].forEach(k => {
      const x = it.indices[k];
      if (!x) fail(`${at}.indices.${k}가 없습니다.`);
      if (x.error) return; // 조회 실패는 허용(화면에 미확인)
      if (typeof x.drawdown_pct !== 'number' || x.drawdown_pct > 0) fail(`${at}.indices.${k}.drawdown_pct가 올바르지 않습니다.`);
      if (!Number.isInteger(x.days_to_bottom) || x.days_to_bottom < 0) fail(`${at}.indices.${k}.days_to_bottom이 올바르지 않습니다.`);
      if (x.days_to_recover != null && (!Number.isInteger(x.days_to_recover) || x.days_to_recover < 0)) fail(`${at}.indices.${k}.days_to_recover가 올바르지 않습니다.`);
      if (!Array.isArray(x.series) || x.series.length < 2 || x.series.some(p => !isoDate.test(p.d) || typeof p.v !== 'number')) fail(`${at}.indices.${k}.series가 올바르지 않습니다.`);
    });
    // Claude가 쓰는 칸(없으면 '글 작성 전'으로 허용)
    const texts = [];
    if (it.summary != null) {
      if (typeof it.summary !== 'string' || it.summary.length > 220) fail(`${at}.summary는 220자 이내 문자열이어야 합니다.`);
      texts.push(it.summary); written++;
    }
    if (it.tag != null && (typeof it.tag !== 'string' || it.tag.length > 12)) fail(`${at}.tag는 12자 이내여야 합니다.`);
    if (it.period_basis != null) { // 토픽만 받았을 때 Claude가 정한 기간의 근거(한 줄 + 기사 링크, 사용자 결정 2026-10-12)
      if (typeof it.period_basis !== 'string' || !it.period_basis.trim() || it.period_basis.length > 160) fail(`${at}.period_basis는 160자 이내여야 합니다.`);
      if (typeof it.period_url !== 'string' || !/^https?:\/\//.test(it.period_url)) fail(`${at}.period_url(기간 근거 링크)이 필요합니다.`);
      texts.push(it.period_basis);
    }
    if (it.compare != null) { if (typeof it.compare !== 'string' || it.compare.length > 160) fail(`${at}.compare는 160자 이내여야 합니다.`); texts.push(it.compare); }
    if (it.timeline != null) {
      if (!Array.isArray(it.timeline) || !it.timeline.length || it.timeline.length > 8) fail(`${at}.timeline은 1~8개여야 합니다.`);
      it.timeline.forEach((e, i) => {
        const at2 = `${at}.timeline[${i}]`;
        if (!isoDate.test(e.date || '')) fail(`${at2}.date는 YYYY-MM-DD여야 합니다.`);
        if (!['악재', '호재', '중립'].includes(e.sentiment)) fail(`${at2}.sentiment는 악재/호재/중립이어야 합니다.`);
        if (typeof e.label !== 'string' || !e.label.trim() || e.label.length > 40) fail(`${at2}.label은 40자 이내여야 합니다.`);
        if (e.desc != null && (typeof e.desc !== 'string' || e.desc.length > 90)) fail(`${at2}.desc는 90자 이내여야 합니다.`);
        if (typeof e.url !== 'string' || !/^https?:\/\//.test(e.url)) fail(`${at2}.url(출처 링크)이 필요합니다.`);
        texts.push(e.label, e.desc || '');
      });
    }
    ['now', 'scenarios', 'drop', 'bottom', 'recover', 'shape'].forEach(k => { if (k in it) fail(`${at}: 손으로 적는 항목 "${k}"는 쓰지 않습니다(숫자는 indices만).`); });
    texts.forEach(t => {
      const m = t.match(recommendRe); if (m) fail(`${at}: 권유 표현 "${m[0]}"`);
      const f = t.match(forecastRe); if (f) fail(`${at}: 전망 표현 "${f[0]}"`);
    });
  });
  console.log(`과거사례 데이터 검증 통과: ${ids.length}건, 글 있음 ${written}건`);
}
