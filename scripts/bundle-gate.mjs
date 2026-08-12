#!/usr/bin/env node
// 번들 크기 게이트 — popup이 **즉시 로드하는 전체 집합**의 합계가 기준선 대비 한도
// 미만인지 강제한다. 빌드 산출물(.output)을 검사한다.
//
// 즉시 집합은 파일명 규칙이 아니라 **생성된 popup.html에서 도출**한다 — 엔트리 스크립트와
// modulepreload를 뿌리로 잡고 정적 import를 전이 폐포한다. 예전에는 `global-*` 하나만 재서
// popup이 함께 즉시 로드하는 `react-*`/`popup-*`가 계량 밖이었고, 코드가 그쪽으로 옮겨가면
// 게이트가 통과했다 (ui-polish structure r1 S-1). 동적 import(`import("./x.js")`)는 뿌리에서
// 도달하지 않으므로 자연히 지연으로 분류된다 — 지연 여부를 파일명으로 판정하지 않는다.
//
// 한도 이력: 60KB(ui-refine 08 초기 추정) → 120KB(ui-refine 08 재트리아지, plan r1 R-3)
// → 135KB(ui-polish 02 재트리아지) → 계량 기준을 즉시 집합 전체로 넓히며 같은 여유를
// 유지하도록 재표현(ui-polish structure r1 S-1) → 175 → 190KB(ui-stack-migration 02·03).
// **네 번째까지의 변경은 완화가 아니다** — 재던 것보다 더 많이 재면서 남는 여유는 그대로
// 두었으므로 게이트는 오히려 더 촘촘해졌다. **마지막 둘(175·190KB)은 완화가 맞다** —
// shadcn/ui 소스와 그것이 전제하는 tailwind-merge를 받아들이며 사다리를 밟고 승인받았다.
//
// **여섯 번째 칸은 밟지 않았다** (scope-race-hardening 07). `wide-ui-redesign`이 한도를
// 14.8KB 넘겼을 때 상향 대신 규칙 폼을 지연 청크로 옮겼다 — 모듈 단위 실측이 초과분의
// 출처가 의존성이 아니라 1차 기능 코드임을 보였고(의존성 델타 순 +1.6KB), 폼은 목록을 보는
// 동안 그려지지 않는데도 첫 페인트 컴포넌트가 정적으로 import하고 있었다. 올리지 않고
// 통과했으므로 한도는 190 그대로다.
//
// 측정치와 경위의 정본은 세 파일이다 — 숫자를 여기 옮겨 적지 않는다(여러 곳에 베껴 두면
// 곧 서로 어긋난다):
//   - .scratch/ui-polish/issues/02-scroll-area.md (135KB까지의 경위)
//   - .scratch/ui-stack-migration/issues/02-shadcn-infra.md (175KB 재트리아지)
//   - .scratch/scope-race-hardening/issues/07-bundle-gate-overrun.md
//     (main 대비 모듈 단위 증감표 · 항목별 지연 가능성 판정 · 상향 대신 줄인 경위)
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { artifactsDirFrom, missingArtifacts, tokenFail } from './artifacts-arg.mjs';

const fail = tokenFail('bundle-gate');

const BASELINE_KB = 386.0; // 기준선(ui-refine 이전 공용 청크, min·비압축)
/**
 * 허용 증가량. 143KB까지는 계량 기준을 넓히며 **남는 여유를 기준으로** 재계산한 값이었다
 * (즉시 합계 523.8KB에 한도 529.0KB → 여유 5.2KB).
 *
 * 190KB는 성격이 다르다 — shadcn/ui 채택이 끌고 온 몫이다. 가장 큰 항목은 tailwind-merge
 * 하나로 **+26.6KB**(추정 6~7KB의 4배: v4 클래스 그룹 테이블을 통째로 담는다), 나머지는
 * shadcn 컴포넌트 소스다. 사다리를 밟았고(지연 로드 불가 — 거의 모든 프리미티브가 첫
 * 페인트에 cn을 쓴다 / 대안 clsx-only는 제시 후 기각) 사용자 승인으로 올렸다. 근거는
 * ui-polish 02와 같되 이번에도 **실측**이다 — 시작 지표가 회귀하지 않았다.
 *
 * 이 값은 마이그레이션 도중 175 → 190으로 한 번 더 올렸다. 175는 인프라 단계 실측
 * (166.1KB)에 여유를 얹은 값이었는데, 조합 파일들이 shadcn 컴포넌트를 실제 import 체인에
 * 들이면서 180.5KB가 됐다. 지금 여유는 9.5KB로 마이그레이션 전(9.9KB)과 같은 수준이다.
 * 경위·수치는 위 주석이 가리키는 이슈 파일이 정본이다.
 */
const MAX_INCREASE_KB = 190;
// 러너가 `--artifacts`로 이 회차의 빌드 경로를 넘긴다 (D4a). 인자 없이 직접 부르면
// 기존 기본 경로다 — 손으로 돌리던 방식이 깨지지 않는다.
const parsed = artifactsDirFrom(process.argv.slice(2), join('.output', 'chrome-mv3'));
if (parsed.error) fail(parsed.error);
const OUT_DIR = parsed.dir;
const CHUNKS_DIR = join(OUT_DIR, 'chunks');
const ENTRY_HTML = join(OUT_DIR, 'popup.html');

/**
 * 지연 로드가 계약인 기능들. 여기 이름이 즉시 집합에 나타나면 실패한다.
 * 파일명으로 "지연이다"를 **정의하지 않는다** — 즉시 집합은 위 그래프에서 나오고,
 * 이 목록은 그 결과에 거는 단언일 뿐이다. 청크가 사라지면(이름 변경·번들러 병합)
 * 그것도 실패로 잡아, 이름만 바뀌어 단언이 조용히 무력해지는 일을 막는다.
 */
const MUST_BE_DEFERRED = [
  'sortable-profile-list',
  // motion 패키지(ADR 0012). **접두이므로 이름공간을 가리는 1차 모듈을 두지 마라** —
  // `src/ui/motion-row.tsx`가 지연 모듈에서도 import되며 공용 청크 `motion-row-*`가 되자 이
  // 단언이 그것을 물어 거짓 빨강이 났다. 그래서 그 파일을 `row-motion.tsx`로 옮겼다(게이트를
  // 느슨하게 하는 대신 코드를 고쳤다). 여기 이름을 좁히면 진짜 누출을 놓친다.
  'motion',
  'suggest-autocomplete',
  // 규칙 폼 (scope-race-hardening 07). 목록을 보는 동안에는 그려지지 않는 UI인데 첫 페인트
  // 컴포넌트가 정적으로 import해 폼 전용 프리미티브까지 즉시 내려받고 있었다 — 실측 59.9KB.
  // 이 줄이 없으면 누군가 `rule-form`을 다시 정적 import해도 크기 한도 안에 들어오는 한
  // 조용히 통과한다.
  'rule-form',
  // 규칙 목록 재정렬. dnd-kit이 이 청크와 `sortable-profile-list-*` 둘에만 있다 — 규칙 목록은
  // 첫 페인트 UI라 정적으로 들이면 dnd-kit 45.2KB가 즉시 집합에 들어온다. 크기 한도 안에
  // 들어오므로 **크기로는 막히지 않는다**: 그것이 이 구조 단언이 따로 있는 이유다.
  'sortable-rule-list',
  // 프로필 색의 **자유 선택** (ADR 0017 재개정). 벤더링한 컬러피커(`ui/color-picker.tsx`)가
  // 이 청크에만 있다 — 실측 34.2KB이고, 그것을 보는 사람은 프로필을 고치는 중인 사람 하나뿐이다.
  // 팔레트 10색은 이 청크 **밖**(`profile-color-field`)에 남아 팝오버를 연 순간 바로 보인다:
  // 여기 들어오면 색을 고르려고 청크 하나를 기다려야 한다.
  'profile-color-picker',
];

if (!existsSync(ENTRY_HTML)) fail(missingArtifacts(ENTRY_HTML));

/** popup.html의 엔트리 스크립트 + modulepreload = 즉시 로드의 뿌리. */
const html = readFileSync(ENTRY_HTML, 'utf8');
const roots = [...html.matchAll(/(?:src|href)="\/chunks\/([^"]+\.js)"/g)].map((m) => m[1]);
if (roots.length === 0) {
  fail(`${ENTRY_HTML}에서 즉시 로드 청크를 찾지 못했다 — 빌드 산출물 형식이 바뀐 것 같다.`);
}

// 정적 import만 따라간다. 동적 import는 `import(` 형태라 아래 패턴에 걸리지 않는다.
const STATIC_IMPORT = /(?:from|import)\s*["']\.\/([^"']+\.js)["']/g;
const eager = new Set();
const queue = [...roots];
while (queue.length > 0) {
  const name = queue.pop();
  if (eager.has(name)) continue;
  const path = join(CHUNKS_DIR, name);
  if (!existsSync(path)) {
    fail(`즉시 로드 청크 ${name}이(가) 없다 — 빌드 산출물이 깨졌다.`);
  }
  eager.add(name);
  for (const match of readFileSync(path, 'utf8').matchAll(STATIC_IMPORT)) queue.push(match[1]);
}

const kb = (name) => statSync(join(CHUNKS_DIR, name)).size / 1024;
const eagerNames = [...eager].sort((a, b) => kb(b) - kb(a));
const totalKb = eagerNames.reduce((sum, name) => sum + kb(name), 0);
const increase = totalKb - BASELINE_KB;

const allChunks = readdirSync(CHUNKS_DIR).filter((f) => f.endsWith('.js'));
const deferredNames = allChunks.filter((f) => !eager.has(f)).sort((a, b) => kb(b) - kb(a));

const fmt = (names) => names.map((n) => `${n} ${kb(n).toFixed(1)}KB`).join(', ');
const sizePass = increase < MAX_INCREASE_KB;
console.log(
  `bundle gate: popup 즉시 로드 합계 ${totalKb.toFixed(1)}KB = baseline ${BASELINE_KB}KB + ` +
    `${increase.toFixed(1)}KB (한도 +${MAX_INCREASE_KB}KB) — ${sizePass ? '한도 안' : '한도 초과'}`,
);
console.log(`  eager   (${eagerNames.length}): ${fmt(eagerNames)}`);
console.log(`  deferred(${deferredNames.length}): ${fmt(deferredNames) || '(없음)'}`);

// 지연이 계약인 기능이 즉시 집합에 섞여 들어왔는지 — 크기 한도와 별개로 구조를 지킨다.
const deferredViolations = [];
for (const prefix of MUST_BE_DEFERRED) {
  const matches = allChunks.filter((f) => f.startsWith(`${prefix}-`));
  if (matches.length === 0) {
    deferredViolations.push(`${prefix}-*: 청크가 없습니다 (이름이 바뀌었거나 다른 청크에 병합됨)`);
    continue;
  }
  const leaked = matches.filter((f) => eager.has(f));
  if (leaked.length > 0) deferredViolations.push(`${prefix}-*: 즉시 로드됨 (${leaked.join(', ')})`);
}
for (const violation of deferredViolations) console.error(`  지연 계약 위반: ${violation}`);

if (!sizePass || deferredViolations.length > 0) {
  fail(
    [
      ...(sizePass
        ? []
        : [`즉시 로드 합계 증가 ${increase.toFixed(1)}KB가 한도 +${MAX_INCREASE_KB}KB를 넘었다`]),
      ...(deferredViolations.length > 0 ? [`지연 계약 위반 ${deferredViolations.length}건`] : []),
    ].join(' · '),
  );
}
console.log(
  `PASS bundle-gate: 즉시 로드 ${totalKb.toFixed(1)}KB (baseline+${increase.toFixed(1)}KB, ` +
    `한도 +${MAX_INCREASE_KB}KB) · 지연 계약 ${MUST_BE_DEFERRED.length}건 유지`,
);
