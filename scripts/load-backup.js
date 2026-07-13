// 사용법: 배포된 페이지(https://ruy911-png.github.io/stock-DASHBB/)를 열고
// 브라우저 devtools 콘솔에 이 파일 전체를 그대로 붙여넣어 실행한다.
// data/analyses-backup.json(git에 커밋된 최신 스냅샷)을 fetch해 현재 브라우저의
// localStorage와 병합한다. 이 브라우저에 이미 있던 데이터를 지우지 않고,
// 종목별로 더 최신인 ais 항목만 채워 넣는 방식(중복 없이 merge)이라 여러 번 실행해도 안전하다.
//
// 병합 규칙(upsert-analysis.js와 동일):
// - code가 같은 종목이 없으면 새로 추가
// - 있으면 tags는 백업 값으로 교체, ais는 같은 ai+date 조합이면 덮어쓰고
//   아니면 앞에 추가 후 최신 5개까지만 보관

(async function () {
  const STORAGE_KEY = "recdash_analyses_v4";
  const BACKUP_URL = "./data/analyses-backup.json";

  let backup;
  try {
    const res = await fetch(BACKUP_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    backup = await res.json();
  } catch (e) {
    console.error(`[load-backup] ${BACKUP_URL} 를 불러오지 못했습니다:`, e);
    return;
  }

  if (!Array.isArray(backup)) {
    console.error("[load-backup] 백업 파일 형식이 배열이 아닙니다.");
    return;
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  let local = [];
  try {
    local = raw ? JSON.parse(raw) : [];
  } catch (e) {
    local = [];
  }

  let updatedCount = 0;
  let addedCount = 0;

  backup.forEach((item) => {
    const { code, name, market, tags, ais } = item;
    if (!code || !Array.isArray(ais)) return; // 형식이 안 맞는 항목은 건너뜀

    const idx = local.findIndex((x) => x.code === code);

    if (idx === -1) {
      local.unshift({ code, name, price: 0, chg: 0, market, tags, ais: ais.slice(0, 5) });
      addedCount++;
    } else {
      const existing = local[idx];
      existing.tags = tags;
      existing.ais = existing.ais || [];
      ais.forEach((aiEntry) => {
        const sameDayIdx = existing.ais.findIndex(
          (a) => a.ai === aiEntry.ai && a.date === aiEntry.date
        );
        if (sameDayIdx !== -1) {
          existing.ais[sameDayIdx] = aiEntry;
        } else {
          existing.ais = [aiEntry, ...existing.ais].slice(0, 5);
        }
      });
      updatedCount++;
    }
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify(local));
  console.log(
    `[load-backup] 갱신 ${updatedCount}건, 신규 추가 ${addedCount}건 완료. 새로고침하면 반영된 내용을 확인할 수 있습니다.`
  );
})();
