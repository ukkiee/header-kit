#!/usr/bin/env node
// Writer Lane 경계 게이트 — **서비스워커 밖의 어떤 파일도 레인을 담고 있지 않다**를 빌드
// 산출물에 묻는다. 그리고 소스에서 레인을 만드는 자리가 하나뿐인지 센다.
//
// 왜 소스가 아니라 산출물인가 (structure 게이트 r1 R-1). 처음 세운 가드는 소스의 `import`
// 문을 정규식으로 훑었고, 리뷰가 두 구멍을 지적했다: 동적 `import()`를 따라가지 않고(이 저장소는
// 렌더러 쪽에서 실제로 쓴다), entrypoint 목록을 하드코딩했다. 번들러의 답을 읽으면 둘 다
// 사라진다 — 정적 import·동적 import·재수출·별칭·트리셰이킹을 **전부 지나온 뒤**의 사실이기
// 때문이다. TypeScript 7의 Node API에는 파서가 없고, vite의 전이 의존(es-module-lexer·
// oxc-parser)에 기대면 vite 업그레이드가 조용히 가드를 무력화한다.
//
// 왜 화면 표면을 **열거하지 않는가** (structure r1 뒤 적대적 검증). 처음 이 스크립트는 산출물의
// `*.html`을 화면 표면으로 잡았는데, content script는 HTML을 만들지 않는다 — 그래서 자기 레인을
// 세워 권위 상태를 쓰는 content script가 게이트를 그대로 지나갔다(실증됨). 열거는 언제나
// 불완전하다. 그래서 질문을 뒤집었다: **서비스워커에서 도달하는 파일 밖에 표지가 있으면 실패.**
// 새 표면(옵션 페이지·devtools·사이드 패널·또 다른 content script)이 생겨도 자동으로 덮인다.
//
// 판정 방법: `src/core/writer-lane.ts`가 던지는 메시지에 심어 둔 표지 문자열을 찾는다. 최소화는
// 식별자를 뭉개도 문자열 리터럴은 남긴다. 표지가 서비스워커 쪽에 **있는지도** 함께 본다 —
// 없으면 표지가 사라진 것이지 경계가 지켜진 것이 아니고, 그 둘을 구분하지 않는 가드는 늘 통과한다.
//
// 이 게이트가 막는 실패: 서비스워커가 아닌 컨텍스트가 자기 레인을 세워 저장소를 고치는 것.
// 허가의 유효 기간 검사는 그것을 막지 못한다 — 그쪽 컨텍스트에서 허가는 살아 있기 때문이다
// (ADR 0016의 '모듈 최상단 락'이 물린 바로 그 이유). 두 기제가 서로 다른 구멍을 맡는다.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const OUT_DIR = '.output/chrome-mv3';
const SRC_DIR = 'src';
/** `src/core/writer-lane.ts`의 표지와 **같은 문자열**이어야 한다. */
const MARKER = 'writer-lane:service-worker-only';
/**
 * 레인을 낳는 함수들 — 소스에서 **부르는 자리**가 각각 하나여야 한다(테스트 제외).
 *
 * 둘을 함께 세는 이유 (structure 게이트 r2 R-1): `createStateWriter`는 부를 때마다 레인을 새로
 * 만드는 팩토리다. 레인 팩토리만 세면 문을 두 번 구성해 레인 둘을 만드는 길이 열려 있고, 그러면
 * 서로를 전혀 막지 않는 꼬리 둘이 생겨 lost update가 되살아난다.
 */
const LANE_FACTORIES = ['createWriterLane', 'createStateWriter'];

const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exit(1);
};

// ── 1. 소스: 레인을 만드는 자리가 하나인가 ──────────────────────────────────

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

/**
 * 주석을 걷어낸다 — 문서 주석의 언급(`` `createWriterLane().run` ``)을 호출로 세지 않게.
 * `://`는 주석 시작으로 보지 않는다(URL이 든 줄이 통째로 사라져 그 줄의 진짜 호출을 숨기지 않게).
 */
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

if (!existsSync(SRC_DIR)) fail(`${SRC_DIR}를 찾을 수 없습니다.`);
const sourceFiles = walk(SRC_DIR).filter((f) => /\.tsx?$/.test(f) && !/\.(test|stories)\.tsx?$/.test(f));

/**
 * 이 심볼을 **부르는 자리의 수**를 센다 — 담고 있는 **파일 수**가 아니다 (structure r2 R-1).
 * 파일을 세면 한 파일 안에서 두 번 부르는 것이 통과한다. 선언(`function name(`)은 호출이 아니다.
 */
function countCalls(symbol) {
  const call = new RegExp(String.raw`\b${symbol}\s*\(`, 'g');
  const declaration = new RegExp(String.raw`\bfunction\s+${symbol}\s*\(`, 'g');
  let total = 0;
  const perFile = [];
  for (const file of sourceFiles) {
    const code = stripComments(readFileSync(file, 'utf8'));
    const calls = (code.match(call) ?? []).length - (code.match(declaration) ?? []).length;
    if (calls > 0) {
      total += calls;
      perFile.push(`${file}×${calls}`);
    }
  }
  return { total, perFile };
}

const laneSites = LANE_FACTORIES.map((symbol) => ({ symbol, ...countCalls(symbol) }));
for (const { symbol, total, perFile } of laneSites) {
  if (total === 1) continue;
  fail(
    `\`${symbol}\`를 부르는 자리가 ${total}개입니다 (${perFile.join(', ') || '없음'}). ` +
      `레인은 쓰기 문 하나가 소유해야 하고, 그 문도 한 번만 구성되어야 합니다 — 두 번째 레인은 ` +
      `첫 번째를 전혀 막지 않으면서 안전해 보입니다(ADR 0016). 저장소를 고쳐야 한다면 ` +
      `\`platform/state-writer.ts\`의 \`StateWriter\` 매소드를 부르거나 그 문에 매소드를 더하세요.`,
  );
}

// ── 2. 소스: 쓰기 허가가 모듈 경계를 넘는가 ─────────────────────────────────
//
// 허가가 어떤 모듈의 **내보낸 시그니처**에 나타나면, 그 자리에 들어가는 코드가 작업 도중
// 살아 있는 허가를 쥔다 — 그리고 거기서 fan-out하면 두 read-modify-write가 겹쳐 릴리스 r3의
// R-2가 되살아난다(structure r1 뒤 2차 적대적 검증에서 실증됨: 명령은 성공을 보고하고
// 저장소에는 옛 값이 남았다). 그래서 허가를 이름 부를 수 있는 파일을 못 박는다.

const PERMIT_ALLOWED = [
  'src/core/writer-lane.ts', // 허가를 만드는 곳
  'src/platform/stateStore.ts', // 허가를 요구하는 저장소 쓰기
  'src/platform/state-writer.ts', // 허가를 쥐고 쓰기를 조율하는 유일한 문
];
const permitMentions = sourceFiles.filter((f) =>
  stripComments(readFileSync(f, 'utf8')).includes('WritePermit'),
);
const strayPermits = permitMentions.filter((f) => !PERMIT_ALLOWED.includes(f.replaceAll('\\', '/')));
if (strayPermits.length > 0) {
  fail(
    `쓰기 허가(\`WritePermit\`)가 허용된 파일 밖에 나타납니다 (${strayPermits.join(', ')}). ` +
      `허가가 모듈 경계를 넘으면 그 자리가 fan-out 자리가 됩니다 — 한 획득 안에서 병행 쓰기를 ` +
      `띄우면 두 read-modify-write가 겹쳐 사용자 편집이 조용히 사라집니다(ADR 0016). 저장소를 ` +
      `고쳐야 한다면 \`platform/state-writer.ts\`의 \`StateWriter\` 매소드를 부르거나 그 문에 ` +
      `매소드를 더하세요 — 매소드마다 자기 레인 작업이 되므로 겹쳐 불러도 안전합니다.`,
  );
}

// ── 3. 산출물: 서비스워커 밖에 표지가 있는가 ────────────────────────────────

if (!existsSync(OUT_DIR)) fail(`${OUT_DIR}를 찾을 수 없습니다 — 먼저 \`bun run build\`를 실행하세요.`);

const manifestPath = join(OUT_DIR, 'manifest.json');
if (!existsSync(manifestPath)) fail(`${manifestPath}가 없습니다 — 빌드 산출물 형식이 바뀐 것 같습니다.`);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const workerEntry = manifest.background?.service_worker;
if (typeof workerEntry !== 'string') {
  fail('manifest에 `background.service_worker`가 없습니다 — 이 게이트의 전제가 깨졌습니다.');
}

/** 한 파일에서 정적·동적 import 대상을 뽑는다. 산출물의 명세자는 언제나 상대 경로다. */
const SPECIFIERS = [
  /(?:from|import)\s*["'`](\.[^"'`]+\.js)["'`]/g,
  /import\s*\(\s*["'`](\.[^"'`]+\.js)["'`]/g,
];

function reachableFrom(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length > 0) {
    const rel = queue.pop();
    if (seen.has(rel)) continue;
    const path = join(OUT_DIR, rel);
    if (!existsSync(path)) continue; // 없는 참조는 다른 검사(번들 게이트)가 잡는다
    seen.add(rel);
    const source = readFileSync(path, 'utf8');
    const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
    for (const pattern of SPECIFIERS) {
      for (const match of source.matchAll(pattern)) {
        queue.push(join(dir, match[1]).replaceAll('\\', '/'));
      }
    }
  }
  return seen;
}

const workerReachable = reachableFrom(workerEntry);

/**
 * 서비스워커 번들이 청크를 공유하지 않는다는 전제 위에 이 게이트가 선다. 공유하는 순간
 * "서비스워커에서 도달 가능"과 "화면에서 도달 가능"이 겹쳐, 겹친 청크에 든 레인이 통과한다.
 * 그래서 전제가 깨지면 조용히 약해지지 말고 여기서 멈춘다.
 */
if (workerReachable.size !== 1) {
  fail(
    `서비스워커 번들이 이제 ${workerReachable.size}개 파일로 나뉩니다 (${[...workerReachable].join(', ')}). ` +
      `이 게이트는 서비스워커가 자체 완결이라는 전제 위에 있습니다 — 청크를 화면과 공유하면 ` +
      `"워커에서 도달 가능"과 "화면에서 도달 가능"이 겹쳐 판정이 무의미해집니다. 판정 방식을 ` +
      `다시 설계하세요.`,
  );
}

const allEmitted = walk(OUT_DIR)
  .map((f) => relative(OUT_DIR, f).replaceAll('\\', '/'))
  .filter((f) => /\.(js|html)$/.test(f));
const outsideWorker = allEmitted.filter((f) => !workerReachable.has(f));
const leaked = outsideWorker.filter((f) => readFileSync(join(OUT_DIR, f), 'utf8').includes(MARKER));
const inWorker = [...workerReachable].some((f) => readFileSync(join(OUT_DIR, f), 'utf8').includes(MARKER));

console.log(
  `writer-lane gate: ${laneSites.map((s) => `${s.symbol} ${s.total}회`).join(' · ')} · ` +
    `허가 노출 ${permitMentions.length}파일(전부 허용) · ` +
    `산출물 ${allEmitted.length}개 중 워커 밖 ${outsideWorker.length}개 검사 — ` +
    `${leaked.length === 0 && inWorker ? 'PASS' : 'FAIL'}`,
);

if (!inWorker) {
  fail(
    `표지 "${MARKER}"가 서비스워커 번들(${workerEntry})에 없습니다. 레인이 서비스워커에서 빠졌거나 ` +
      `표지가 바뀐 것입니다 — 어느 쪽이든 이 게이트는 아무것도 지키지 못하는 상태이므로 통과시키지 않습니다.`,
  );
}
if (leaked.length > 0) {
  fail(
    `Writer Lane이 서비스워커 밖 번들에 들어 있습니다 (${leaked.join(', ')}). 그 컨텍스트는 자기 ` +
      `레인을 세울 수 있고, 그러면 컨텍스트마다 하나씩 생겨 서로를 전혀 막지 않으면서 안전해 ` +
      `보입니다(ADR 0016). \`@/core/writer-lane\`·\`@/platform/state-writer\` import를 제거하거나, ` +
      `필요한 것이 타입뿐이면 \`import type\`으로 바꾸세요(그것은 지워지므로 번들에 남지 않습니다).`,
  );
}
