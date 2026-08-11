#!/usr/bin/env node
// MV3 매니페스트 게이트 — 빌드된 매니페스트가 이 확장이 **선언한 표면만** 갖는지 강제한다.
// 빌드 산출물(.output)을 읽는다. 무엇을 재고 무엇을 재지 않는지의 정본은
// `docs/agents/verification.md`이고, 여기에는 코드가 그렇게 생긴 이유만 적는다.
//
// 자체 스크립트인 이유: WXT 0.20에는 lint/validate 명령이 없고, WebExtension용 eslint
// 플러그인은 npm에 없다. Mozilla `addons-linter`는 Chrome 전용 확장에 Firefox 요구사항
// 세 건을 오류로 내며(실측), 그 셋을 억제하면 억제 목록 자체가 유지 대상이 된다
// (스펙 D10의 버린 대안).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { artifactsDirFrom, missingArtifacts, oneLine, tokenFail } from './artifacts-arg.mjs';

const fail = tokenFail('manifest-gate');

/**
 * 기대하는 표면 — **이 파일이 선언한다.** `wxt.config.ts`에서 읽어 오지 않는 것이 이
 * 게이트의 전부다: 읽어 오면 소스와 산출물이 늘 일치하므로 아무것도 재지 않게 되고,
 * 권한을 하나 더한 커밋이 그대로 초록이 된다. 두 자리에 따로 적어 두면 표면을 넓히는
 * 변경은 **여기도 함께 고치는 것을 포함해야** 하고, 그때 사람이 한 번 멈춘다.
 */

/**
 * 최상위 키의 **집합 전체**를 선언한다. 재는 필드를 열거하는 대신 집합으로 잠그는 이유는,
 * 권한 의미가 `permissions`에만 있지 않기 때문이다 — `content_scripts[].matches`는 설치
 * 시점에 부여되는 호스트 권한이고, WXT는 `src/entrypoints/`에서 매니페스트를 생성하므로
 * content 엔트리포인트를 하나 더하면 `wxt.config.ts`의 권한을 **한 글자도 건드리지 않고**
 * 그 키가 생긴다. `web_accessible_resources`·`externally_connectable`도 같은 종류다.
 * 열거로는 이런 키가 생길 때마다 게이트가 뒤따라가야 하고, 뒤따라가지 못한 동안은 조용히
 * 통과한다. 집합으로 잠그면 **모르는 것은 통과하지 못한다.**
 *
 * 사라지는 것도 막는다. 선언한 키가 산출물에서 빠졌다면 선언과 산출물이 갈라선 것이고,
 * 그것이 의도라면 이 줄을 지우는 것이 그 의도를 적는 방법이다.
 */
const REQUIRED_KEYS = [
  'manifest_version',
  'name',
  'description',
  'version',
  'minimum_chrome_version',
  'permissions',
  'host_permissions',
  'commands',
  'background',
  'action',
];

/**
 * 있어도 되는 키 — **있으면 값을 아래에서 따로 잰다.** 프로덕션 빌드는 지금 이 셋을 내지
 * 않지만, 나타났을 때 판정할 규칙이 이 파일에 이미 있으므로 "모르는 키"가 아니다.
 * 여기 없고 위에도 없는 키가 곧 **판정한 적 없는 표면**이고, 그것이 FAIL의 대상이다.
 */
const JUDGED_KEYS = ['content_security_policy', 'optional_permissions', 'optional_host_permissions'];

/**
 * 권한 목록은 값까지 잰다. 뺀 권한의 근거는 `wxt.config.ts`의 주석이 정본이다(ADR 0002
 * 개정) — 이 게이트는 그 주석을 검사로 만드는 쪽이지 근거를 옮겨 적는 쪽이 아니다.
 *
 * 선택 권한이 빈 목록으로 서 있는 것도 선언이다. 그러지 않으면 `permissions`를 건드리지
 * 않고 `optional_permissions`로 옮기는 것만으로 이 게이트를 지나간다.
 */
const EXPECTED_LISTS = {
  permissions: ['declarativeNetRequest', 'storage'],
  host_permissions: ['<all_urls>'],
  optional_permissions: [],
  optional_host_permissions: [],
};

/** dNR 세션 규칙과 응답 헤더 modifyHeaders가 안정 지원되는 첫 버전. 근거는 `wxt.config.ts`. */
const MIN_CHROME_VERSION = '108';

/** MV3가 정의하는 CSP 키는 둘이다. `sandbox`를 재지 않는 이유는 검증 문서가 적는다. */
const CSP_KEYS = new Set(['extension_pages', 'sandbox']);

const violations = [];
const note = (v) => violations.push(v);

/**
 * 집합의 **정확한 일치**. 부분집합으로 재면 늘어난 것을 놓치고, 상위집합으로 재면 사라진
 * 것을 놓친다 — 둘 다 이 게이트가 막으려는 것이라 양방향으로 잰다. 중복도 어긋남이다:
 * 양방향 포함만 보면 `[a, a, b]`가 `[a, b]`와 같아 보이는데, 그것은 집합의 일치이지
 * **선언과 산출물의 일치**가 아니다.
 */
function exactList(field, actualRaw, expected) {
  const actual = actualRaw ?? [];
  if (!Array.isArray(actual)) {
    note(`${field}가 배열이 아니다: ${oneLine(actualRaw)}`);
    return;
  }
  const added = actual.filter((p) => !expected.includes(p));
  const missing = expected.filter((p) => !actual.includes(p));
  const dupes = actual.filter((p, i) => actual.indexOf(p) !== i);
  if (added.length > 0) note(`${field}에 선언되지 않은 항목이 있다: ${oneLine(added.join(', '))}`);
  if (missing.length > 0) note(`${field}에 선언된 항목이 없다: ${missing.join(', ')}`);
  if (dupes.length > 0) note(`${field}에 중복 항목이 있다: ${oneLine([...new Set(dupes)].join(', '))}`);
}

// 러너가 `--artifacts`로 이 회차의 빌드 경로를 넘긴다 (D4a). 인자 없이 직접 부르면
// 기존 기본 경로다 — 손으로 돌리던 방식이 깨지지 않는다.
const parsed = artifactsDirFrom(process.argv.slice(2), join('.output', 'chrome-mv3'));
if (parsed.error) fail(parsed.error);
const MANIFEST = join(parsed.dir, 'manifest.json');

if (!existsSync(MANIFEST)) fail(missingArtifacts(MANIFEST));

let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
} catch (e) {
  fail(`매니페스트를 읽을 수 없다: ${MANIFEST} — ${oneLine(e.message)}`);
}
// 파싱을 통과했다고 객체인 것은 아니다. `null`·배열·숫자·문자열 전부 유효한 JSON이고, 그중
// `null`은 바로 아래 `Object.keys`에서 TypeError로 죽는다 — 상태 줄 없이 스택 트레이스만
// 나가므로 러너는 "판정을 말하지 않았다"로 접고 사유는 아무 데도 남지 않는다(실측).
if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
  fail(`매니페스트가 객체가 아니다: ${MANIFEST} — ${oneLine(manifest)}`);
}

const keys = Object.keys(manifest);
const unknownKeys = keys.filter((k) => !REQUIRED_KEYS.includes(k) && !JUDGED_KEYS.includes(k));
const absentKeys = REQUIRED_KEYS.filter((k) => !keys.includes(k));
if (unknownKeys.length > 0) {
  note(`선언되지 않은 최상위 키가 있다: ${oneLine(unknownKeys.join(', '))}`);
}
if (absentKeys.length > 0) note(`선언된 최상위 키가 없다: ${absentKeys.join(', ')}`);

// MV3. MV2는 폐지됐고 이 확장의 dNR 사용 전체가 MV3 전제다 — 산출물이 MV2로 나왔다면
// 빌드 설정이 바뀐 것이고, 그 위에서 나머지 검사는 다른 의미를 갖는다.
if (manifest.manifest_version !== 3) {
  note(`manifest_version이 3이 아니다: ${oneLine(manifest.manifest_version)}`);
}

for (const [field, expected] of Object.entries(EXPECTED_LISTS)) {
  exactList(field, manifest[field], expected);
}

/**
 * 최소 크롬 버전도 **정확한 일치**로 잰다. "선언돼 있는가"로 재면 `"80"`이 통과하고, 그러면
 * dNR 세션 규칙과 응답 헤더 수정이 없는 브라우저에 설치가 허용된다 — 확장은 설치되고 규칙은
 * 조용히 적용되지 않는다. 권한을 정확한 일치로 재기로 해 놓고 버전만 존재 검사로 두면 같은
 * 게이트 안에서 강도가 어긋난다. 더 높은 값도 어긋남이다: 안전해 보이지만 설치 가능한
 * 브라우저를 좁히는 결정이고, 선언과 산출물이 갈라선 상태다.
 */
const floor = manifest.minimum_chrome_version;
if (floor === undefined) {
  note(`minimum_chrome_version이 선언되지 않았다 — ${MIN_CHROME_VERSION}을 요구한다`);
} else if (typeof floor !== 'string' || !/^\d+(\.\d+)*$/.test(floor)) {
  note(`minimum_chrome_version이 버전 숫자가 아니다: ${oneLine(floor)}`);
} else if (floor !== MIN_CHROME_VERSION) {
  note(`minimum_chrome_version이 선언과 다르다: ${oneLine(floor)} ≠ ${MIN_CHROME_VERSION}`);
}

/**
 * CSP의 `unsafe-eval`은 **토큰으로** 잰다. 부분 문자열로 재면 `'wasm-unsafe-eval'`이 걸리는데
 * 그것은 WASM 컴파일을 여는 별개의 지시어이고 개발 빌드의 CSP에 실제로 들어 있다(실측) —
 * 검사하지 않는 초록만큼 나쁜 것이 평범한 것을 막는 빨강이다. 대소문자는 가리지 않는다
 * (CSP3의 keyword-source 대조가 그렇다). 따옴표 없는 표기도 벗겨서 함께 잡는다.
 */
const hasEvalToken = (value) =>
  value
    .split(/[\s;]+/)
    .map((t) => t.replace(/^['"]|['"]$/g, '').toLowerCase())
    .includes('unsafe-eval');

const csp = manifest.content_security_policy;
if (csp !== undefined) {
  if (typeof csp !== 'object' || csp === null || Array.isArray(csp)) {
    note(`content_security_policy가 객체가 아니다: ${oneLine(csp)}`);
  } else {
    for (const key of Object.keys(csp)) {
      if (!CSP_KEYS.has(key)) note(`판정할 수 없는 CSP 키다: ${oneLine(key)}`);
    }
    const pages = csp.extension_pages;
    // 문자열이 아니면 토큰 분해가 **조용히 빗나간다** — 배열은 콤마로 이어 붙으며 토큰
    // 경계가 깨져, unsafe-eval을 켜는 값이 통과한다(실측). 판정할 수 없으면 거절한다.
    if (pages !== undefined && typeof pages !== 'string') {
      note(`extension_pages가 문자열이 아니다: ${oneLine(pages)}`);
    } else if (pages !== undefined && hasEvalToken(pages)) {
      note(`프로덕션 CSP(extension_pages)에 unsafe-eval이 있다: ${oneLine(pages)}`);
    }
  }
}

// 판정은 **한 줄로** 말한다. 사유를 stderr에 한 번 더 늘어놓으면 같은 내용이 두 자리에
// 생기고, 러너가 읽는 것은 어차피 이 줄이다.
if (violations.length > 0) fail(`불변식 ${violations.length}건 위반 — ${violations.join(' · ')}`);

console.log(
  `PASS manifest-gate: MV3 · 권한 ${EXPECTED_LISTS.permissions.join(', ')} · ` +
    `호스트 ${EXPECTED_LISTS.host_permissions.join(', ')} · 최소 크롬 ${MIN_CHROME_VERSION} · ` +
    `최상위 키 ${REQUIRED_KEYS.length}개 · CSP unsafe-eval 없음`,
);
