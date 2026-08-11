#!/usr/bin/env node
// 게이트의 검사를 하나씩 무력화하고 **어느 픽스처가 빨강이 되는지** 잰다.
//
// 통과 픽스처만 있는 게이트는 검사가 꺼져도 초록이다. 그것을 반증하는 유일한 길이 검사를
// 실제로 지워 보는 것이고, 이 스크립트가 그 절차를 재현 가능하게 만든다.
//
// **종료 코드가 아니라 빨강이 된 테스트의 제목을 센다.** 종료 코드만 보면 "무언가가 물었다"
// 까지만 알고 무엇이 물었는지는 모르며, 그러면 서로 다른 검사 열여덟을 픽스처 하나가 전부
// 받아 내는 상태와 구별되지 않는다. 그 구별이 이 도구의 전부다.
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
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
        'record( 를 id 리터럴과 같은 줄에서만 찾기',
        "  for (let i = at; i >= Math.max(0, at - 3); i -= 1) {\n    if (lines[i].includes('record(')) return i;\n  }\n  return at;",
        "  return lines[at].includes('record(') ? at : -1;",
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
];

function parseArgs(argv) {
  let gate = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== '--gate') {
      fail(`알 수 없는 인자: ${argv[i]} — 받는 것은 --gate <id> 뿐이다`);
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

function runSuite(target) {
  const args = [VITEST, 'run', target.test, '--reporter=json'];
  if (target.filter) args.push('-t', target.filter);
  try {
    return {
      code: 0,
      out: execFileSync('node', args, {
        cwd: REPO,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 64 * 1024 * 1024,
      }),
    };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

function sweep(target) {
  const path = join(HERE, target.script);
  if (!existsSync(path)) {
    fail(`대상 스크립트가 없다: ${path}`);
    return;
  }
  const original = readFileSync(path, 'utf8');
  let restored = false;
  // 신호로 죽어도 되돌린다. 대상은 추적되는 파일이라, 변조된 채 남으면 다음 사람이 그것을
  // 자기 변경으로 읽는다.
  const restore = () => {
    if (!restored) writeFileSync(path, original);
    restored = true;
  };
  process.on('SIGINT', () => {
    restore();
    process.exit(130);
  });

  try {
    const base = runSuite(target);
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
    console.log(`\n── ${target.gate} · 픽스처 ${baseRed.ran}개가 기준선에서 초록`);

    let unbitten = 0;
    for (const [name, from, to] of target.mutations) {
      const hits = original.split(from).length - 1;
      if (hits !== 1) {
        // 앵커가 깨진 것을 건너뛰면 "재지 않은 것"이 "물었다"로 접힌다.
        fail(`${target.gate} / ${name}: 변조 대상 문자열이 ${hits}번 나타난다 — 정확히 한 번이어야 한다`);
        continue;
      }
      writeFileSync(path, original.replace(from, to));
      const r = runSuite(target);
      restored = false;
      writeFileSync(path, original);
      restored = true;
      const red = redTitles(target, r.out);
      if (red.error) {
        fail(`${target.gate} / ${name}: ${red.error}`);
        continue;
      }
      if (red.titles.length === 0) {
        unbitten += 1;
        console.log(`   !! ${name} — 빨강 없음. 이 검사는 재지 않는 자리다`);
        continue;
      }
      console.log(`   ${name}`);
      for (const t of red.titles) console.log(`      빨강: ${t}`);
    }

    if (unbitten > 0) {
      fail(`${target.gate}: 변조 ${target.mutations.length}건 중 ${unbitten}건이 물리지 않았다`);
    } else {
      console.log(`   → 변조 ${target.mutations.length}건 전부 빨강`);
    }
  } finally {
    restore();
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

for (const target of targets) sweep(target);

if (process.exitCode) {
  console.error(`\nFAIL ${LABEL}: 위 사유를 보세요`);
} else {
  const total = targets.reduce((n, t) => n + t.mutations.length, 0);
  console.log(`\nPASS ${LABEL}: 대상 ${targets.length}개 · 변조 ${total}건 전부 빨강`);
}
