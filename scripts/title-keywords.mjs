// 시황 키워드 대체(사용자 결정 2026-11-23 "1번"): 2026-11-19부터 네이버 AI 브리핑에 키워드 카드(keyword_tags)가 빠져,
// 카드가 없는 날에는 브리핑 제목에서 규칙으로 구절을 뽑아 키워드로 쓴다. 형태소 분석기 없이 조사·서술어를 떼는 단순 규칙이라
// 네이버 태그(그날 뉴스 전반의 화제)와 성격이 다르다 — 제목에 나온 시장 요인(예: 반도체 강세, 외국인 매도)만 나온다.

// 단어 끝이 이 꼴이면 거기서 구절이 끝난다(조사·연결어미를 떼고 끊음)
const END = /^(.{2,}?)(에도|에서|에|으로|로|와|과|보다|은|는|가|이|도|만|까지|엔)$/;
// 연결어미로 끝나는 단어(버티는데·밀리며·올랐지만·버티고)는 서술어라 구절을 끊고 버린다
const VERB_END = /(?:는데|며|지만|고)$/;
const CUT_WORDS = new Set(['속', '뒤', '중']);
const KEEP = new Set(['매도', '매수', '눈높이', '금리', '거리', '수익', '차이', '하락', '상승', '반등', '부담', '긴장', '규제']);
// 구절 끝에서 버리는 서술어(그 자체로는 키워드가 아님)
const TAIL = new Set(['마감', '회복', '붕괴', '유지', '이탈', '터치', '집중', '하회', '돌파', '턱걸이', '방어', '버팀목', '밀림', '확인이', '더', '탄력', '흐름', '하루', '제자리', '등', '힘']);
// 활용형(동사·형용사) 단어: 구절을 끊고 그 단어는 버린다
const VERBISH = /(?:렸|했|됐|텼|랐|았|었|던|틴|친|된|리는|티는|하는|뛰자|린|덜한|밀리)$/;
const ALONE = /^(지수|국내 증시|양 시장|마감|하락|상승|반등|급락|부담|수급)$/;

export function titleKeywords(text, max = 6) {
  const phrases = [];
  for (const chunk of String(text || '').split(/[,，·…]/)) {
    let cur = [];
    const flush = () => { if (cur.length) phrases.push(cur); cur = []; };
    for (const raw of chunk.trim().split(/\s+/).filter(Boolean)) {
      if (CUT_WORDS.has(raw)) { flush(); continue; }
      if (!KEEP.has(raw) && raw.length >= 3 && VERB_END.test(raw) && !/[A-Za-z0-9]/.test(raw)) { flush(); continue; }
      const m = KEEP.has(raw) || (/\d/.test(raw) && !/^\d차/.test(raw)) ? null : raw.match(END);
      if (m) { if (!VERBISH.test(m[1])) cur.push(m[1]); flush(); continue; }
      if (!KEEP.has(raw) && VERBISH.test(raw) && !/[A-Za-z0-9]/.test(raw)) { flush(); continue; }
      cur.push(raw);
    }
    flush();
  }
  const out = [];
  for (let words of phrases) {
    const numAt = words.findIndex(w => /\d/.test(w) && !/^\d차/.test(w));
    if (numAt >= 0) words = words.slice(0, numAt);
    while (words.length && TAIL.has(words[words.length - 1])) words = words.slice(0, -1);
    const phrase = words.slice(0, 3).join(' ');
    if (phrase.length < 2 || ALONE.test(phrase) || out.includes(phrase)) continue;
    out.push(phrase);
  }
  return out.slice(0, max);
}
