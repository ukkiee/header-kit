#!/usr/bin/env node
// 게이트의 검사를 하나씩 무력화하고 **어느 픽스처가 빨강이 되는지** 잰다.
//
// 통과 픽스처만 있는 게이트는 검사가 꺼져도 초록이다. 그것을 반증하는 유일한 길이 검사를
// 실제로 지워 보는 것이고, 이 스크립트가 그 절차를 재현 가능하게 만든다.
//
// **종료 코드가 아니라 빨강이 된 테스트의 제목을 센다.** 종료 코드만 보면 "무언가가 물었다"
// 까지만 알고 무엇이 물었는지는 모르며, 그러면 서로 다른 검사 전부를 픽스처 하나가 받아 내는
// 상태와 구별되지 않는다. 그 구별이 이 도구의 전부다.
//
// **판정을 얻지 못한 변조도 통과가 아니다.** 앵커가 어긋나거나 vitest의 출력을 읽지 못하면
// 그 변조는 "물지 않았다"가 아니라 "재지 않았다"이고, 요약이 잰 수를 함께 말한다.
//
// **게이트가 아니다.** `scripts/gates.txt`가 그 이유를 적는다 — 매 회차 돌리기에는 느리고
// (게이트당 변조 수만큼 스위트를 돈다), 무엇보다 대상 파일을 잠시 고쳤다가 되돌리므로
// 다른 회차와 겹쳐 돌면 서로의 판정을 오염시킨다.
//
//   bun run mutation-sweep                        # 등록된 대상 전부
//   bun run mutation-sweep --gate writer-lane-gate
//
// 변조 표는 **이 파일이 소유한다.** 산문에 열거해 두면 게이트가 하나 바뀔 때마다 그 문장이
// 조용히 낡고, 낡았다는 사실을 알려 줄 것이 없다.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LABEL = 'mutation-sweep';
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const VITEST = join(REPO, 'node_modules', 'vitest', 'vitest.mjs');

const fail = (message) => {
  console.error(`FAIL ${LABEL}: ${message}`);
  process.exitCode = 1;
};

/**
 * 대상과 그 변조들.
 *
 * `from`은 대상 파일에 **정확히 한 번** 나타나야 한다. 여러 번 나타나면 어느 자리를 무력화한
 * 것인지 판정이 말하지 못하고, 한 번도 나타나지 않으면 게이트가 그 사이 바뀐 것이다 — 둘 다
 * 조용히 건너뛰지 않고 FAIL이다. 앵커가 깨진 스윕은 "물지 않았다"와 구별되지 않는다.
 */
const TARGETS = [
  {
    gate: 'writer-lane-gate',
    script: 'writer-lane-gate.mjs',
    test: 'scripts/run-gates.test.mjs',
    filter: 'writer-lane-gate',
    mutations: [
      ['자리 수 비교 무력화', 'if (total === 1) continue;', 'if (true) continue;'],
      [
        '세는 심볼에서 createStateWriter 제거',
        "const LANE_FACTORIES = ['createWriterLane', 'createStateWriter'];",
        "const LANE_FACTORIES = ['createWriterLane'];",
      ],
      [
        '레인 계수의 주석 제거 생략',
        "const code = stripComments(readFileSync(file, 'utf8'));",
        "const code = readFileSync(file, 'utf8');",
      ],
      [
        '주석 제거의 :// 보호 제거',
        "source.replace(/\\/\\*[\\s\\S]*?\\*\\//g, '').replace(/(^|[^:])\\/\\/[^\\n]*/g, '$1');",
        "source.replace(/\\/\\*[\\s\\S]*?\\*\\//g, '').replace(/\\/\\/[^\\n]*/g, '');",
      ],
      ['허가 누출 검사 무력화', 'if (strayPermits.length > 0) {', 'if (false) {'],
      [
        '허용 목록에서 writer-lane.ts 제거',
        "  'src/core/writer-lane.ts', // 허가를 만드는 곳",
        '  // (변조: 제거)',
      ],
      [
        '허가 스캔의 주석 제거 생략',
        "  stripComments(readFileSync(f, 'utf8')).includes('WritePermit'),",
        "  readFileSync(f, 'utf8').includes('WritePermit'),",
      ],
      ['워커 밖 누출 검사 무력화', 'if (leaked.length > 0) {', 'if (false) {'],
      ['워커 안 표지 확인 무력화', 'if (!inWorker) {', 'if (false) {'],
      ['워커 자체 완결 전제 검사 무력화', 'if (workerReachable.size !== 1) {', 'if (false) {'],
      ['인자 계약 오류 무시', 'if (parsed.error) fail(parsed.error);', 'if (false) fail(parsed.error);'],
      [
        '인자 없을 때의 기본 경로 변경',
        "artifactsDirFrom(process.argv.slice(2), join('.output', 'chrome-mv3'))",
        "artifactsDirFrom(process.argv.slice(2), join('.output', 'other'))",
      ],
      ['src/ 부재 검사 무력화', 'if (!existsSync(SRC_DIR)) fail(', 'if (false) fail('],
      [
        '산출물 디렉터리 부재 검사 무력화',
        'if (!existsSync(OUT_DIR)) fail(missingArtifacts(OUT_DIR));',
        'if (false) fail(missingArtifacts(OUT_DIR));',
      ],
      ['매니페스트 부재 검사 무력화', 'if (!existsSync(manifestPath)) fail(', 'if (false) fail('],
      [
        '매니페스트 파싱 실패 처리 제거',
        '  fail(`매니페스트를 읽을 수 없다: ${manifestPath} — ${oneLine(e.message)}`);',
        '  throw e;',
      ],
      [
        'null 매니페스트의 옵셔널 체이닝 제거',
        'const workerEntry = manifest?.background?.service_worker;',
        'const workerEntry = manifest.background?.service_worker;',
      ],
      ['service_worker 키 검사 무력화', "if (typeof workerEntry !== 'string') {", 'if (false) {'],
    ],
  },
  {
    gate: 'smoke-barriers',
    script: 'audit-smoke-barriers.mjs',
    test: 'scripts/audit-smoke-barriers.test.mjs',
    filter: 'smoke-barriers',
    mutations: [
      ['준비 배리어 검사 무력화', 'if (!window.some((line) => BARRIER.test(line))) {', 'if (false) {'],
      [
        '안정화 배리어 검사 무력화',
        'if (!window.some((line) => STABLE_BARRIER.test(line))) {',
        'if (false) {',
      ],
      [
        '받는 배리어를 하나로 줄이기',
        'const BARRIER = /pollSessionRuleMatch\\(|pollUntil\\(|pollStable\\(/;',
        'const BARRIER = /pollSessionRuleMatch\\(/;',
      ],
      [
        '고정 대기도 배리어로 받기',
        'const BARRIER = /pollSessionRuleMatch\\(|pollUntil\\(|pollStable\\(/;',
        'const BARRIER = /waitForTimeout\\(/;',
      ],
      [
        'SEED 루프의 record 부재를 통과로 접기',
        'for (const id of SEED_GATED) {\n  const recordAt = findRecord(id);\n  if (recordAt < 0) {',
        'for (const id of SEED_GATED) {\n  const recordAt = findRecord(id);\n  if (false) {',
      ],
      [
        'STABLE 루프의 record 부재를 통과로 접기',
        'for (const id of STABLE_GATED) {\n  const recordAt = findRecord(id);\n  if (recordAt < 0) {',
        'for (const id of STABLE_GATED) {\n  const recordAt = findRecord(id);\n  if (false) {',
      ],
      ['시드 호출 부재를 통과로 접기', 'if (seedAt < 0) {', 'if (false) {'],
      [
        // 위 스캔과 fallback을 **한 행에 묶지 않는다.** 묶으면 어느 쪽이 물렸는지 도구가
        // 말하지 못한다. 여기 서는 것은 위 스캔 쪽이고, 창 경계 픽스처가 그것을 문다.
        // fallback(`return at`) 자체를 뒤집는 변조는 어느 픽스처도 물지 않아 표에 없다 —
        // 그 사실은 `docs/agents/verification.md`가 적는다.
        'record( 를 위로 짚는 스캔 제거',
        "  for (let i = at; i >= Math.max(0, at - 3); i -= 1) {\n    if (lines[i].includes('record(')) return i;\n  }\n",
        '',
      ],
      [
        '주석 제거 무력화',
        'const stripComments = (text) =>',
        'const stripComments = (text) => text;\nconst unusedStripComments = (text) =>',
      ],
      [
        '주석 제거의 :// 보호 제거',
        ".replace(/(^|[^:])\\/\\/[^\\n]*/g, '$1');",
        ".replace(/\\/\\/[^\\n]*/g, '');",
      ],
      ['안정화 창을 0으로', 'const STABLE_WINDOW = 60;', 'const STABLE_WINDOW = 0;'],
      [
        '세는 시나리오 목록 줄이기',
        "const SEED_GATED = ['K1', 'K2', 'K3', 'M1', 'M2', 'M2b', 'M2c', 'M2d', 'M2e', 'M4'];",
        "const SEED_GATED = ['K1'];",
      ],
      ['판정 발화를 통과로', 'if (problems.length > 0) {', 'if (false) {'],
    ],
  },
  {
    gate: 'core-line-budget',
    script: 'core-line-budget-gate.mjs',
    test: 'scripts/core-line-budget-gate.test.mjs',
    filter: 'core-line-budget',
    mutations: [
      ['알 수 없는 인자 검사 무력화', "if (argv[i] !== '--dir') fail(", 'if (false) fail('],
      ['--dir 중복 검사 무력화', 'if (dir !== null) fail(', 'if (false) fail('],
      [
        '--dir 값 없음 검사 무력화',
        "if (v === undefined || v.trim() === '' || v.startsWith('-')) {",
        'if (false) {',
      ],
      ['AGENTS.md 부재 검사 무력화', 'if (!existsSync(path)) fail(', 'if (false) fail('],
      ['마커 대조를 포함 비교로', 'l.trim() === marker', 'l.includes(marker)'],
      [
        '선언 정규식의 줄 앵커 제거',
        'const DECLARATION = /^Target\\s+(\\S+)\\s+lines$/;',
        'const DECLARATION = /Target\\s+(\\S+)\\s+lines/;',
      ],
      ['마커 쌍 수 검사 무력화', 'if (begins.length !== 1 || ends.length !== 1) {', 'if (false) {'],
      ['마커 순서 검사 무력화', 'if (ends[0] < begins[0]) fail(', 'if (false) fail('],
      [
        '마커 줄 자신도 예산에 넣기',
        'const core = lines.slice(begins[0] + 1, ends[0]);',
        'const core = lines.slice(begins[0], ends[0] + 1);',
      ],
      [
        '선언을 문서 전체에서 찾기',
        'const declared = core.flatMap((l) => {',
        'const declared = lines.flatMap((l) => {',
      ],
      ['선언 수 검사 무력화', 'if (declared.length !== 1) {', 'if (false) {'],
      ['예산이 정수인지 검사 무력화', 'if (!/^\\d+$/.test(declared[0])) fail(', 'if (false) fail('],
      ['예산을 문서 전체 줄 수로', 'const used = core.length;', 'const used = lines.length;'],
      [
        '빈 줄을 세지 않기',
        'const used = core.length;',
        "const used = core.filter((l) => l.trim() !== '').length;",
      ],
      ['예산 초과 검사 무력화', 'if (used > budget) {', 'if (false) {'],
      ['경계를 초과로 취급', 'if (used > budget) {', 'if (used >= budget) {'],
    ],
  },
  {
    gate: 'manifest-gate',
    script: 'manifest-gate.mjs',
    test: 'scripts/manifest-gate.test.mjs',
    filter: 'manifest-gate',
    mutations: [
      ['인자 계약 오류 무시', 'if (parsed.error) fail(parsed.error);', 'if (false) fail(parsed.error);'],
      [
        '인자 없을 때의 기본 경로 변경',
        "artifactsDirFrom(process.argv.slice(2), join('.output', 'chrome-mv3'))",
        "artifactsDirFrom(process.argv.slice(2), join('.output', 'other'))",
      ],
      [
        '매니페스트 부재 검사 무력화',
        'if (!existsSync(MANIFEST)) fail(missingArtifacts(MANIFEST));',
        'if (false) fail(missingArtifacts(MANIFEST));',
      ],
      [
        '매니페스트 파싱 실패 처리 제거',
        '  fail(`매니페스트를 읽을 수 없다: ${MANIFEST} — ${oneLine(e.message)}`);',
        '  throw e;',
      ],
      [
        '객체 여부 가드 무력화',
        "if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {",
        'if (false) {',
      ],
      ['모르는 최상위 키 검사 무력화', 'if (unknownKeys.length > 0) {', 'if (false) {'],
      ['사라진 최상위 키 검사 무력화', 'if (absentKeys.length > 0) note(', 'if (false) note('],
      [
        'JUDGED_KEYS에서 content_security_policy 제거',
        "const JUDGED_KEYS = ['content_security_policy', 'optional_permissions', 'optional_host_permissions'];",
        "const JUDGED_KEYS = ['optional_permissions', 'optional_host_permissions'];",
      ],
      ['manifest_version 검사 무력화', 'if (manifest.manifest_version !== 3) {', 'if (false) {'],
      ['늘어난 항목 검사 무력화', 'if (added.length > 0) note(', 'if (false) note('],
      ['사라진 항목 검사 무력화', 'if (missing.length > 0) note(', 'if (false) note('],
      ['중복 항목 검사 무력화', 'if (dupes.length > 0) note(', 'if (false) note('],
      ['배열 여부 가드 무력화', 'if (!Array.isArray(actual)) {', 'if (false) {'],
      [
        'EXPECTED_LISTS에서 선택 권한 둘 제거',
        '  optional_permissions: [],\n  optional_host_permissions: [],\n',
        '',
      ],
      ['최소 크롬 버전 부재 검사 무력화', 'if (floor === undefined) {', 'if (false) {'],
      [
        '최소 크롬 버전 형식 검사 무력화',
        "} else if (typeof floor !== 'string' || !/^\\d+(\\.\\d+)*$/.test(floor)) {",
        '} else if (false) {',
      ],
      [
        '최소 크롬 버전 동등 비교 무력화',
        '} else if (floor !== MIN_CHROME_VERSION) {',
        '} else if (false) {',
      ],
      ['CSP 검사 전체 무력화', 'if (csp !== undefined) {', 'if (false) {'],
      [
        'CSP 객체 가드 무력화',
        "if (typeof csp !== 'object' || csp === null || Array.isArray(csp)) {",
        'if (false) {',
      ],
      ['판정 가능한 CSP 키 검사 무력화', 'if (!CSP_KEYS.has(key)) note(', 'if (false) note('],
      [
        'extension_pages 문자열 가드 무력화',
        "if (pages !== undefined && typeof pages !== 'string') {",
        'if (false) {',
      ],
      [
        'CSP 토큰의 따옴표 벗기기 제거',
        `.map((t) => t.replace(/^['"]|['"]$/g, '').toLowerCase())`,
        '.map((t) => t.toLowerCase())',
      ],
      [
        'CSP 토큰의 대소문자 무시 제거',
        `.map((t) => t.replace(/^['"]|['"]$/g, '').toLowerCase())`,
        `.map((t) => t.replace(/^['"]|['"]$/g, ''))`,
      ],
      ['CSP 토큰 분해에서 세미콜론 제거', '.split(/[\\s;]+/)', '.split(/[\\s]+/)'],
      [
        '위반 사유의 한 줄 접기 제거',
        'note(`프로덕션 CSP(extension_pages)에 unsafe-eval이 있다: ${oneLine(pages)}`);',
        'note(`프로덕션 CSP(extension_pages)에 unsafe-eval이 있다: ${pages}`);',
      ],
      ['판정 발화를 통과로', 'if (violations.length > 0) fail(', 'if (false) fail('],
    ],
  },
  {
    gate: 'bundle-gate',
    script: 'bundle-gate.mjs',
    test: 'scripts/run-gates.test.mjs',
    filter: 'bundle-gate',
    mutations: [
      ['인자 계약 오류 무시', 'if (parsed.error) fail(parsed.error);', 'if (false) fail(parsed.error);'],
      [
        '인자 없을 때의 기본 경로 변경',
        "artifactsDirFrom(process.argv.slice(2), join('.output', 'chrome-mv3'))",
        "artifactsDirFrom(process.argv.slice(2), join('.output', 'other'))",
      ],
      [
        'popup.html 부재 검사 무력화',
        'if (!existsSync(ENTRY_HTML)) fail(missingArtifacts(ENTRY_HTML));',
        'if (false) fail(missingArtifacts(ENTRY_HTML));',
      ],
      [
        '즉시 로드 뿌리에서 modulepreload 제외',
        '/(?:src|href)="\\/chunks\\/([^"]+\\.js)"/g',
        '/src="\\/chunks\\/([^"]+\\.js)"/g',
      ],
      ['뿌리 0개 검사 무력화', 'if (roots.length === 0) {', 'if (false) {'],
      ['즉시 청크 파일 부재 검사 무력화', 'if (!existsSync(path)) {', 'if (false) {'],
      [
        '정적 import 추적 제거',
        "  for (const match of readFileSync(path, 'utf8').matchAll(STATIC_IMPORT)) queue.push(match[1]);\n",
        '',
      ],
      [
        '정적 추적이 동적 import까지 받기',
        `const STATIC_IMPORT = /(?:from|import)\\s*["']\\.\\/([^"']+\\.js)["']/g;`,
        `const STATIC_IMPORT = /(?:from|import)\\s*\\(?\\s*["']\\.\\/([^"']+\\.js)["']/g;`,
      ],
      [
        '정적 추적에서 bare import 제외',
        `const STATIC_IMPORT = /(?:from|import)\\s*["']\\.\\/([^"']+\\.js)["']/g;`,
        `const STATIC_IMPORT = /from\\s*["']\\.\\/([^"']+\\.js)["']/g;`,
      ],
      ['기준선 상수 부풀리기', 'const BASELINE_KB = 386.0;', 'const BASELINE_KB = 3860.0;'],
      ['한도 상수 완화', 'const MAX_INCREASE_KB = 190;', 'const MAX_INCREASE_KB = 1900;'],
      ['크기 판정을 통과로', 'const sizePass = increase < MAX_INCREASE_KB;', 'const sizePass = true;'],
      ['MUST_BE_DEFERRED에서 rule-form 제거', "  'rule-form',\n", ''],
      ['지연 청크 부재 검사 무력화', 'if (matches.length === 0) {', 'if (false) {'],
      [
        '즉시 누출 검사 무력화',
        'if (leaked.length > 0) deferredViolations.push(',
        'if (false) deferredViolations.push(',
      ],
      ['판정 발화를 통과로', 'if (!sizePass || deferredViolations.length > 0) {', 'if (false) {'],
    ],
  },
  {
    gate: 'a11y-gate',
    // 필터가 `a11y-gate`가 아니라 `a11y`인 것은 이 파일의 describe 제목이 그렇기 때문이다.
    // 맞지 않는 필터는 조용히 0개를 고르므로, 기준선의 `ran === 0` 가드가 그것을 가른다.
    script: 'a11y-gate.mjs',
    test: 'scripts/a11y-gate.test.mjs',
    filter: 'a11y',
    mutations: [
      ['알 수 없는 인자 검사 무력화', "if (a !== '--update') return {", 'if (false) return {'],
      ['--update 중복 검사 무력화', 'if (update) return { error:', 'if (false) return { error:'],
      ['인자 계약 오류 무시', 'if (parsed.error) fail(parsed.error);', 'if (false) fail(parsed.error);'],
      [
        'oxlint 출력 파싱 실패 처리 제거',
        "    fail(`oxlint를 읽을 수 없다: ${String(e.message).split('\\n')[0]}`);",
        '    throw e;',
      ],
      [
        'jsx-a11y 규칙군 필터 제거',
        "if (!d.code?.startsWith('jsx-a11y(')) continue;",
        'if (false) continue;',
      ],
      [
        '요소 이름 뽑기 제거',
        '  const element = /^<\\s*([A-Za-z_$][\\w$.:-]*)/.exec(text);\n  if (element) return element[1];\n',
        '',
      ],
      [
        '속성 이름 뽑기 제거',
        '  const name = /^[A-Za-z_$][\\w$-]*/.exec(text);\n  if (name) return name[0];\n',
        '',
      ],
      [
        '지문에서 규칙 제거',
        'return `${rule} | ${diagnostic.filename} | ${identifierOf(text)}`;',
        'return `${diagnostic.filename} | ${identifierOf(text)}`;',
      ],
      ['개수 누적을 1로 고정', 'observed.set(key, (observed.get(key) ?? 0) + 1);', 'observed.set(key, 1);'],
      [
        '베이스라인에 적는 개수를 1로 굳히기',
        '.map(([key, n]) => `${n} ${key}`)',
        '.map(([key]) => `1 ${key}`)',
      ],
      ['베이스라인 줄 형식 검사 무력화', 'if (!m) fail(', 'if (false) fail('],
      ['베이스라인 중복 지문 검사 무력화', 'if (counts.has(m[2])) fail(', 'if (false) fail('],
      [
        '--update의 넓힘 보고 무력화',
        'const widened = [...observed.entries()].filter(([key, n]) => n > (before.get(key) ?? 0));',
        'const widened = [];',
      ],
      ['베이스라인 부재 검사 무력화', 'if (baseline === null) {', 'if (false) {'],
      ['늘어난 지문 판정 무력화', 'if (n > was) added.push(', 'if (false) added.push('],
      ['사라진 지문 보고 무력화', 'if (now < n) gone.push(', 'if (false) gone.push('],
      ['전부 사라짐 검사 무력화', 'if (baseline.size > 0 && observed.size === 0) {', 'if (false) {'],
      ['판정 발화를 통과로', 'if (added.length > 0) {', 'if (false) {'],
    ],
  },
];

function parseArgs(argv) {
  let gate = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== '--gate') {
      fail(`알 수 없는 인자: ${argv[i]} — 받는 것은 --gate <id> 뿐이다`);
      process.exit(1);
    }
    // 말없이 마지막 값을 고르지 않는다. 이 도구가 검사하는 게이트들이 `--artifacts` 중복을
    // 거절하는 것과 같은 이유다 — 어느 쪽을 쟀는지가 호출 문면에서 읽히지 않는다.
    if (gate !== null) {
      fail('--gate가 두 번 왔다 — 어느 대상을 재라는 것인지 판정할 수 없다');
      process.exit(1);
    }
    const v = argv[i + 1];
    if (v === undefined || v.trim() === '' || v.startsWith('-')) {
      fail(`--gate에 id가 없다 (받은 값: ${v === undefined ? '없음' : `"${v}"`})`);
      process.exit(1);
    }
    gate = v;
    i += 1;
  }
  return gate;
}

/** 빨강이 된 테스트의 제목. 종료 코드가 아니라 이것이 판정의 재료다. */
function redTitles(target, out) {
  const start = out.indexOf('{');
  if (start < 0) return { error: 'vitest가 JSON을 내지 않았다', titles: [] };
  let json;
  try {
    json = JSON.parse(out.slice(start, out.lastIndexOf('}') + 1));
  } catch (e) {
    return { error: `vitest의 JSON을 읽지 못했다 — ${String(e.message).split('\n')[0]}`, titles: [] };
  }
  const all = (json.testResults ?? []).flatMap((f) => f.assertionResults ?? []);
  return {
    titles: all
      .filter((a) => a.status === 'failed')
      .map((a) => (a.title ?? '').replace(new RegExp(`^${target.filter}:\\s*`), '')),
    ran: all.filter((a) => a.status !== 'skipped').length,
  };
}

/**
 * 스위트를 **비동기로** 띄운다. `execFileSync`로 막으면 이벤트 루프가 멈춰 있어 변조 창 내내
 * 시그널 핸들러가 실행되지 못한다 — 그러면 Ctrl-C가 변조된 파일을 남긴 채 나간다(실측).
 * 창의 거의 전부가 이 대기이므로, 여기를 비우는 것이 복원 보증의 대부분이다.
 */
function runSuite(target) {
  const args = [VITEST, 'run', target.test, '--reporter=json'];
  if (target.filter) args.push('-t', target.filter);
  return new Promise((resolve) => {
    const child = spawn('node', args, { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] });
    running = child;
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('error', (e) => {
      running = null;
      resolve({ code: 1, out: `${out}\n${e.message}` });
    });
    child.on('close', (code) => {
      running = null;
      resolve({ code: code ?? 1, out });
    });
  });
}

/**
 * 하드 종료를 덮는 유일한 형태: 원본을 **디스크에** 두고 시작한다.
 *
 * 시그널 핸들러는 SIGKILL·전원 차단을 덮지 못하고, 그때 남는 것은 `if (false) {`로 무장 해제된
 * 추적 파일이다 — 겹쳐 도는 게이트 회차가 그것을 초록으로 읽는다. 사이드카가 있으면 다음 실행이
 * 그것을 보고 복구한 뒤 멈춘다. 사람이 손으로 끊는 것이 이 도구의 정상 경로라 이 자리가 넓다.
 */
const sidecarOf = (path) => `${path}.sweep-orig`;

function recoverAbandoned() {
  const abandoned = TARGETS.map((t) => join(HERE, t.script)).filter((p) => existsSync(sidecarOf(p)));
  if (abandoned.length === 0) return false;
  for (const path of abandoned) {
    writeFileSync(path, readFileSync(sidecarOf(path), 'utf8'));
    rmSync(sidecarOf(path));
    console.error(`  복구: ${path}`);
  }
  fail(
    `앞선 스윕이 변조 창에서 죽어 대상 ${abandoned.length}개가 변조된 채 남아 있었다 — 원본으로 되돌렸다. ` +
      `그 사이에 돈 게이트 회차가 있었다면 그 판정은 신뢰할 수 없다.`,
  );
  return true;
}

/** 지금 변조 중인 대상. 시그널 핸들러가 이것만 보고 되돌린다. */
let inFlight = null;
let running = null;

function restoreInFlight() {
  if (inFlight === null) return;
  const { path, original } = inFlight;
  inFlight = null;
  try {
    writeFileSync(path, original);
    if (existsSync(sidecarOf(path))) rmSync(sidecarOf(path));
  } catch {
    // 여기서 더 할 수 있는 것이 없다. 사이드카가 남으면 다음 실행이 복구한다.
  }
}

// 핸들러는 **한 번만** 단다. 대상마다 달면 먼저 등록된 것이 `process.exit`으로 뒤엣것의
// 실행을 막아, 두 번째 대상의 변조가 그대로 남는다(실측).
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    if (running !== null) running.kill('SIGKILL');
    restoreInFlight();
    process.exit(signal === 'SIGINT' ? 130 : 1);
  });
}

async function sweep(target) {
  const path = join(HERE, target.script);
  if (!existsSync(path)) {
    fail(`대상 스크립트가 없다: ${path}`);
    return;
  }
  const original = readFileSync(path, 'utf8');

  try {
    const base = await runSuite(target);
    const baseRed = redTitles(target, base.out);
    if (baseRed.error) {
      fail(`${target.gate}: 기준선을 얻지 못했다 — ${baseRed.error}`);
      return;
    }
    if (base.code !== 0 || baseRed.titles.length > 0) {
      fail(
        `${target.gate}: 변조 전부터 빨강이다 (${baseRed.titles.join(' · ') || `exit ${base.code}`}) — ` +
          `스윕은 초록인 기준선 위에서만 뜻이 있다`,
      );
      return;
    }
    // **고른 것이 0개면 그것은 초록이 아니다.** `filter`가 어느 테스트도 고르지 못하면 기준선은
    // "빨강 없음"으로 초록처럼 보이고, 그 뒤 모든 변조가 물리지 않아 사유가 "픽스처가 공허하다"로
    // 읽힌다 — 실제 원인은 필터 오타다. 대상이 늘수록 이 혼동이 비싸지므로 여기서 가른다.
    if (baseRed.ran === 0) {
      fail(
        `${target.gate}: 기준선에서 아무 테스트도 돌지 않았다 — ` +
          `filter(${target.filter ?? '없음'})가 ${target.test}의 어느 제목과도 맞지 않는다`,
      );
      return;
    }
    console.log(`\n── ${target.gate} · 픽스처 ${baseRed.ran}개가 기준선에서 초록`);

    let unbitten = 0;
    let measured = 0;
    for (const [name, from, to] of target.mutations) {
      const hits = original.split(from).length - 1;
      if (hits !== 1) {
        // 앵커가 깨진 것을 건너뛰면 "재지 않은 것"이 "물었다"로 접힌다.
        fail(`${target.gate} / ${name}: 변조 대상 문자열이 ${hits}번 나타난다 — 정확히 한 번이어야 한다`);
        continue;
      }
      // 사이드카를 먼저 쓴다. 이 줄과 복구 사이의 어느 지점에서 죽어도 다음 실행이 되돌린다.
      writeFileSync(sidecarOf(path), original);
      inFlight = { path, original };
      // `replaceAll`이 아니라 문자열 하나를 바꾸되, `to`의 `$&`·`$1`이 특수 해석되지 않게
      // 콜백으로 넘긴다 — 정규식 치환의 달러 규칙이 문자열 치환에도 적용된다.
      writeFileSync(
        path,
        original.replace(from, () => to),
      );
      const r = await runSuite(target);
      restoreInFlight();

      const red = redTitles(target, r.out);
      if (red.error) {
        fail(`${target.gate} / ${name}: ${red.error}`);
        continue;
      }
      measured += 1;
      if (red.titles.length === 0) {
        unbitten += 1;
        console.log(`   !! ${name} — 빨강 없음. 이 검사는 재지 않는 자리다`);
        continue;
      }
      console.log(`   ${name}`);
      for (const t of red.titles) console.log(`      빨강: ${t}`);
    }

    // **판정을 얻지 못한 변조도 통과가 아니다.** 잰 수를 함께 요구하지 않으면 앵커가 어긋난
    // 변조를 조용히 건너뛴 회차가 "전부 빨강"을 찍는다 — 이 도구가 없애러 온 모양 그대로다.
    // `fail()`은 stderr로만 가므로 stdout에도 남긴다: 갈무리된 로그에 거짓 문장이 남지 않게.
    if (unbitten > 0 || measured !== target.mutations.length) {
      const note = `변조 ${target.mutations.length}건 중 ${measured}건을 쟀고 ${unbitten}건이 물리지 않았다`;
      console.log(`   → ${note} — 위 FAIL 사유를 보세요`);
      fail(`${target.gate}: ${note}`);
    } else {
      console.log(`   → 변조 ${target.mutations.length}건 전부 빨강`);
    }
  } finally {
    restoreInFlight();
    if (readFileSync(path, 'utf8') !== original) {
      fail(`${target.gate}: 대상을 원상복구하지 못했다 — ${path}를 직접 확인하세요`);
    }
  }
}

const only = parseArgs(process.argv.slice(2));
const targets = only === null ? TARGETS : TARGETS.filter((t) => t.gate === only);
if (targets.length === 0) {
  fail(`등록된 대상이 아니다: ${only} — 있는 것은 ${TARGETS.map((t) => t.gate).join(', ')}`);
  process.exit(1);
}
if (!existsSync(VITEST)) {
  fail(`vitest를 찾지 못했다: ${VITEST} — 먼저 \`bun install\`을 실행하세요`);
  process.exit(1);
}
// 앞선 실행이 남긴 변조부터 되돌린다. 그 위에서 새 스윕을 돌리면 기준선이 이미 빨강이라
// 무엇이 무엇을 물었는지 판정할 수 없다.
if (recoverAbandoned()) process.exit(1);

for (const target of targets) await sweep(target);

if (process.exitCode) {
  const line = `FAIL ${LABEL}: 위 사유를 보세요`;
  console.log(`\n${line}`);
  console.error(line);
} else {
  const total = targets.reduce((n, t) => n + t.mutations.length, 0);
  console.log(`\nPASS ${LABEL}: 대상 ${targets.length}개 · 변조 ${total}건 전부 빨강`);
}
