import { readFile, writeFile } from 'node:fs/promises';

const sourcePath = 'src/dashboard.template.html';
const source = await readFile(sourcePath, 'utf8');

const title = 'SEPA 기반 종목추천 방법론';
if (source.includes(`title: '${title}'`)) {
  console.log('SEPA study note already exists.');
  process.exit(0);
}

const body = `## 1. 목표

단순히 좋은 회사를 찾는 것이 아니라,

> **실적과 추세가 강한 종목 중 현재 가격에서 손실은 제한적이고 상승여력은 충분한 종목**만 추천한다.

핵심은 **종목선정 ≠ 매수추천**이다.

---

## 2. 전체 평가 순서

시장/가격조건
→ SEPA 펀더멘털
→ Trend Template
→ Base / VCP
→ Pivot
→ Extension
→ Technical Stop
→ Risk / Reward
→ BUY CANDIDATE

이 순서를 건너뛰지 않는다.

---

## 3. 1단계 — SEPA 펀더멘털

우선 실적이 실제로 강한 기업인지 확인한다.

| 항목 | 선호 기준 |
|---|---|
| 최근 분기 EPS 성장 | +25% 이상 |
| 최근 분기 매출 성장 | +20% 이상 |
| 영업이익 | 증가 선호 |
| 최근 2~4분기 | 성장 지속 또는 가속 |
| 가이던스 | 상향/강한 성장 |
| 핵심사업 | 전체보다 빠른 성장 시 가점 |
| Catalyst | AI, 신규시장, 신제품, 점유율 확대 등 |

주의:
- 낮은 기저효과 때문에 이익만 폭증한 경우 감점
- 일회성 이익 제외
- 턴어라운드는 일반 성장주와 구분
- Non-GAAP만 좋은 적자기업은 보수적으로 평가

---

## 4. 2단계 — Trend Template

강한 주가 추세가 있는지 확인한다.

- 현재가 > 50일선
- 현재가 > 150일선
- 현재가 > 200일선
- 50일선 > 150일선 > 200일선
- 200일선 상승
- 52주 저점에서 충분히 상승
- 52주 고점에서 25% 이내
- 시장 대비 상대강도 강함

중요 원칙:

> **52주 신고가 근처라고 바로 매수하지 않는다.**

신고가 근접은 종목의 강도를 보는 조건이지 Entry 신호가 아니다.

---

## 5. 3단계 — Base / VCP

VCP는 단순 조정이 아니라 변동성이 단계적으로 감소하는 패턴이다.

예시:

1차 조정 -20%
→ 2차 조정 -10%
→ 3차 조정 -5%
→ 거래량 감소
→ Pivot

확인 항목:
- 명확한 Base 존재
- 최소 2회 이상의 contraction
- 후속 조정폭 감소
- 캔들 폭 감소
- 가격 Range 감소
- 하락일 거래량 감소
- Pivot 근처 Tight Action
- 마지막 수축에서 거래량 고갈

VCP로 인정하지 않는 것:
- 급등 후 첫 눌림
- 단순 횡보
- 하락하면서 거래량 증가
- 조정폭이 줄지 않음
- Wide & Loose
- Failed Breakout 진행 중

> **VCP 가능성 ≠ VCP 완성**

---

## 6. 4단계 — Pivot

실제 매수 기준이 되는 가격이다.

Pivot은 객관적으로 확인 가능한 다음 구조를 사용한다.
- Base 상단
- Handle 상단
- 마지막 contraction 상단
- 명확한 저항선

임의로 Pivot을 만들지 않는다.

---

## 7. 5단계 — Extension 검사

Base → Pivot 돌파 → +10% → +20% → 신고가로 진행됐다고 해서 신고가라는 이유만으로 추천하지 않는다.

원칙:
- Pivot 대비 약 +5% 이상 올라가면 신규매수 우선순위 하향
- 단기간 급등한 종목 추격 금지
- 이동평균선과 과도하게 이격되면 WAIT
- 급등 후에는 새로운 Mini-VCP를 기다림

---

## 8. 6단계 — 구조적 손절

손절을 먼저 정하고 손익비를 계산한다.

Technical Stop 기준:
- 마지막 contraction 저점
- Base 하단
- Pivot 실패선
- 주요 지지선
- 이동평균 + 가격구조 동시 훼손

금지:

> “손익비를 3R로 만들기 위해 손절을 -3%로 잡자.”

순서는 반드시 **차트 구조 → 손절 → Risk 계산**이다.

---

## 9. 7단계 — Risk / Reward

**Risk = Entry − Technical Stop**

그 다음 현실적인 상승 공간을 확인한다.

| R/R | 판단 |
|---|---|
| < 2R | 추천 금지 |
| 2R 이상 | BUY 가능 |
| 3R 이상 | 우수 |
| 4R 이상 | 매우 우수 |

목표가를 억지로 높여서 3R을 만들지 않는다. 전고점, 주요 저항 또는 새로운 신고가 상승파가 현실적인지 확인한다.

---

## 10. 최종 판정

### BUY CANDIDATE
모두 통과:
- SEPA 실적
- Trend
- Base/VCP
- Pivot
- Extension
- Technical Stop
- R/R ≥ 2
- 최신 데이터 확인

### WATCH
종목은 좋지만:
- VCP 미완성
- Pivot 돌파 전
- 추가 수축 필요
- Extended
- 손익비 부족

### EXCLUDE
- 추세 훼손
- Failed Breakout
- 대량거래 하락
- 고점 과도한 추격
- 구조적 손절 불명확
- 2R 미만
- 데이터 불충분

---

## 11. 추천 개수

3개 요청 = 반드시 3개 추천이 아니다.

- BUY 3개 이상 → TOP 3
- BUY 2개 → 2개
- BUY 1개 → 1개
- BUY 0개 → **추천종목 없음**

WATCH를 억지로 BUY로 올리지 않는다.

---

## 12. 실제 추천 시 출력

핵심 표:

| 순위 | 종목 | 현재가 | SEPA | VCP | Pivot | Entry | Stop | Risk | R/R | 판정 |
|---|---|---:|---|---|---:|---:|---:|---:|---:|---|

종목별 설명은 네 가지까지만 본다.
1. 실적
2. VCP/차트
3. Catalyst
4. 손익비

---

## 한 줄 요약

> **강한 실적의 시장 주도주를 찾고 → 완성된 Base/VCP를 확인하고 → Pivot 근처에서 → 구조적 손절 대비 최소 2R 이상의 상승여력이 있을 때만 추천한다.**

가장 중요한 원칙은 **“좋은 종목”보다 “좋은 Entry”를 우선한다**는 것이다.`;

const anchor = "  study = {\n    notes: [\n";
if (!source.includes(anchor)) throw new Error('study notes anchor not found');

const note = `      { cat: '매매원칙', catCol: '#1E8E5A', catBg: '#E7F6EE', title: '${title}', body: ${JSON.stringify(body)}, date: '9.4' },\n`;
let next = source.replace(anchor, anchor + note);

const oldKey = 'stockking_study_upload_20260828_v2';
const newKey = 'stockking_study_upload_20260904_v3';
if (!next.includes(oldKey)) throw new Error('study upload key anchor not found');
next = next.replace(oldKey, newKey);

await writeFile(sourcePath, next, 'utf8');
console.log('Added SEPA methodology study note and bumped study cache version.');
