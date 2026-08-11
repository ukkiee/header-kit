#!/usr/bin/env node
/*
 * 게이트 러너 (티켓 01, structure 게이트 r1 반영).
 *
 * 등록된 게이트를 돌리고 행마다 **네 판정 중 하나**를 낸다: PASS / FAIL / N/A / BLOCKED.
 * 그리고 돌리기 전에 레지스트리·사람이 읽는 표·`package.json`·게이트 워크플로가 서로
 * 어긋나지 않았는지 검사한다.
 *
 * 참여하는 스크립트의 범위는 **레지스트리가 정한다.** `package.json`에는 `dev`·`zip`·
 * `storybook`처럼 게이트가 아닌 스크립트가 이미 있다. "모든 스크립트가 표에 있어야 한다"는
 * 규칙은 영구히 빨강이라 검사가 아니라 소음이다.
 *
 *   node scripts/run-gates.mjs [--dir <트리>] [--check-only] [--ci]
 *
 * `--check-only`는 일치만 보고 게이트를 돌리지 않는다. 이 러너의 테스트가 쓰는 길이기도 하다 —
 * `test` 게이트가 vitest를 부르고 vitest가 이 러너를 부르면 자기 자신을 기다린다.
 * `--ci`는 `ci: yes`인 행만 고르되 **선행 관계를 그대로 지킨다.** CI가 게이트를 하나씩
 * 부르면 산출물을 읽는 게이트가 각자 빌드하거나 낡은 것을 재사용하게 되므로, CI도 이
 * 러너를 한 번 부르는 것이 계약이다.
 */
import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LABEL = 'run-gates';
const KINDS = new Set(['hard', 'advisory']);
const YESNO = new Set(['yes', 'no']);
/**
 * 게이트가 판정을 **어떻게 말하는가**.
 *   exit  — 종료 코드가 계약의 전부다. `tsc`·`vitest`·`wxt build`처럼 이 저장소가 만들지
 *           않은 도구는 상태 줄을 주지 않으며, 주라고 요구하면 게이트마다 래퍼가 생기고
 *           그 래퍼가 새로운 거짓말 자리가 된다.
 *   token — 이 저장소가 소유한 게이트. `PASS|FAIL|N/A <id>: <detail>` 한 줄을 찍고,
 *           그것이 종료 코드와 어긋나면 FAIL이다. FAIL을 찍고 0으로 끝나는 경우가 여기서 걸린다.
 */
const VERDICTS = new Set(['exit', 'token']);
/** 이 러너가 낼 수 있는 판정. 표가 선언하는 넷과 같다. */
const PASS = 'PASS';
const FAIL = 'FAIL';
const NA = 'N/A';
const BLOCKED = 'BLOCKED';
/** 고아 게이트 검출이 미치는 이름 규약. 이 밖의 이름은 잡지 못한다 — 표가 그 경계를 적는다. */
const GATE_SCRIPT_PATTERN = /-gate\.mjs$/;
const TABLE_BEGIN = '<!-- gates:begin -->';
const TABLE_END = '<!-- gates:end -->';
/** CI가 불러야 하는 단 하나의 진입점. 게이트를 하나씩 부르면 선행 관계가 무너진다. */
const CI_ENTRYPOINT = 'gate:ci';
/**
 * 그 진입점을 **어떻게** 부르는지까지 못박는다. 부분 문자열로 보면 접미 인자 하나가
 * 실행 전체를 우회한다 — `bun run gate:ci --check-only`는 `--ci --check-only`로 전달돼
 * 게이트를 0개 돌고 exit 0을 낸다(실측). `--help`도, `|| true`도 같은 문을 지난다.
 * 이름표를 묶고 그것이 가리키는 것도 묶었는데 부르는 방식을 안 묶으면 아무것도 묶이지 않는다.
 */
const CANONICAL_CI_RUN = `bun run ${CI_ENTRYPOINT}`;
const CANONICAL_CI_SCRIPT = 'node scripts/run-gates.mjs --ci';
/** 게이트 워크플로에서 판정할 수 없게 만드는 것들. 셋 다 "돌았다"를 뜻하지 않는다. */
const SHELL_OPERATORS = /(\|\||&&|;|\||>|<)/;
const GATE_WORKFLOWS = ['gate.yml', 'gate.yaml'];
/**
 * 산출물 배관 (D4a). `needs: build`인 게이트가 이 회차에 하나라도 있으면 러너가
 * **회차마다 고유한** 디렉터리를 만들어 build 게이트의 출력을 그리로 보내고
 * (`HK_BUILD_OUT_DIR` — `wxt.config.ts`가 읽는다. `wxt build` CLI에는 출력 경로
 * 옵션이 없어 이 env가 유일한 통로다: 옵션 목록 실측), 소비자에게는
 * `--artifacts <경로>`로 명시적으로 넘긴다. 그래야 소비자가 **이 회차의 빌드**를
 * 재지, 직전 빌드가 기본 경로에 남긴 낡은 산출물을 재지 않는다.
 *
 * 겹친 실행은 잠금이 아니라 이 경로 분리가 격리한다. 잠그면 "소유자가 죽었다"를
 * "쓰는 것이 다 멈췄다"로 읽어야 하는데, 러너가 죽어도 빌드 자식은 살아남아 계속
 * 쓴다 — 그것을 닫는 것은 부정 증명이라 비용에 바닥이 없다. 회차마다 다른 경로에
 * 쓰면 잠글 것도 회수할 것도 없다.
 */
const BUILD_GATE_ID = 'build';
const OUT_DIR_ENV = 'HK_BUILD_OUT_DIR';
/** wxt가 outDir 아래에 만드는 산출물 디렉터리 이름 (outDirTemplate 기본값 · 크롬 MV3). */
const ARTIFACT_SUBDIR = 'chrome-mv3';

function fail(message) {
  process.stderr.write(`FAIL ${LABEL}: ${message}\n`);
  process.exit(1);
}

/**
 * 값이 필요한 플래그의 값을 꺼낸다. 없거나, 비었거나, 플래그처럼 생겼으면 거절한다.
 * `--dir ""`가 통과하면 `resolve('')`가 cwd가 되어 의도와 다른 트리를 감사하고 초록을 냈다.
 * `--dir --check-only`는 플래그를 값으로 삼켜 `--check-only`를 조용히 없앴다.
 */
function takeValue(argv, i, flag) {
  const v = argv[i];
  if (v === undefined) fail(`${flag}에 값이 없다`);
  if (v.trim() === '') fail(`${flag}의 값이 비었다`);
  if (v.startsWith('-')) fail(`${flag}의 값이 플래그처럼 보인다: ${v}`);
  return v;
}

function parseArgs(argv) {
  const opts = { dir: null, checkOnly: false, ci: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--check-only') opts.checkOnly = true;
    else if (a === '--ci') opts.ci = true;
    else if (a === '--dir') opts.dir = takeValue(argv, (i += 1), '--dir');
    else if (a === '-h' || a === '--help') {
      process.stdout.write('Usage: run-gates.mjs [--dir <tree>] [--check-only] [--ci]\n');
      process.exit(0);
    } else fail(`알 수 없는 인자: ${a}`);
  }
  return opts;
}

/** `#` 주석과 빈 줄을 걷어내고 `gate:` / `deferred:` 레코드로 가른다. */
function readRegistry(path) {
  if (!existsSync(path)) fail(`레지스트리가 없다: ${path}`);
  const gates = [];
  const deferred = [];
  for (const [i, raw] of readFileSync(path, 'utf8').split('\n').entries()) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const at = `${path}:${i + 1}`;
    if (line.startsWith('gate:')) {
      const f = line
        .slice('gate:'.length)
        .split('|')
        .map((s) => s.trim());
      if (f.length !== 8) fail(`${at} — gate 행은 8칸이어야 하는데 ${f.length}칸이다`);
      if (f.some((x) => x === '')) fail(`${at} — 빈 칸이 있다`);
      const [id, script, kind, ci, needs, browser, verdict, na] = f;
      if (!KINDS.has(kind)) fail(`${at} — kind는 hard 또는 advisory여야 한다: ${kind}`);
      if (!YESNO.has(ci)) fail(`${at} — ci는 yes 또는 no여야 한다: ${ci}`);
      if (!YESNO.has(browser)) fail(`${at} — browser는 yes 또는 no여야 한다: ${browser}`);
      if (!VERDICTS.has(verdict)) fail(`${at} — verdict는 exit 또는 token이어야 한다: ${verdict}`);
      if (na !== 'never') fail(`${at} — na 조건을 아직 다루지 못한다: ${na}`);
      gates.push({ id, script, kind, ci, needs, browser, verdict, na, at });
    } else if (line.startsWith('deferred:')) {
      const f = line
        .slice('deferred:'.length)
        .split('|')
        .map((s) => s.trim());
      if (f.length !== 2 || f.some((x) => x === '')) {
        fail(`${at} — deferred 행은 "<파일> | <이유>" 두 칸이어야 한다`);
      }
      deferred.push({ file: f[0], reason: f[1], at });
    } else fail(`${at} — gate: 또는 deferred: 로 시작해야 한다`);
  }
  if (gates.length === 0) fail(`등록된 게이트가 없다: ${path}`);

  const seen = new Set();
  for (const g of gates) {
    if (seen.has(g.id)) fail(`${g.at} — id가 중복된다: ${g.id}`);
    seen.add(g.id);
  }
  // `needs`는 **앞선 행의 id**를 가리킨다. 앞선 것만 허용하는 이유는 뒤를 가리키면 그 선행이
  // 아직 돌지 않아 판정을 알 수 없고, 순환도 이 규칙 하나로 함께 막히기 때문이다.
  const before = new Set();
  for (const g of gates) {
    if (g.needs !== '-' && !before.has(g.needs)) {
      fail(`${g.at} — needs가 앞선 게이트를 가리켜야 한다: ${g.needs}`);
    }
    before.add(g.id);
  }
  return { gates, deferred };
}

/**
 * 마커 사이의 게이트 표를 행으로 읽는다.
 *
 * 마커 사이만 읽는 이유: "첫 칸이 백틱 토큰인 표 행"만으로 가르려 했더니 같은 문서의 판정
 * 설명 표가 게이트 행으로 읽혔다 — 문서에 표가 하나뿐이라는 가정이었고 실측으로 틀렸다.
 * 마커 쌍이 정확히 하나가 아니면 FAIL이다: 마커를 잃은 문서가 빈 집합을 돌려주면 그것은
 * "게이트가 없다"가 아니라 "읽지 못했다"이고, 둘을 섞으면 아무것도 재지 않으면서 초록인
 * 상태가 생긴다.
 */
function readTableRows(path) {
  if (!existsSync(path)) fail(`게이트 표가 없다: ${path}`);
  const lines = readFileSync(path, 'utf8').split('\n');
  const begins = lines.filter((l) => l.trim() === TABLE_BEGIN).length;
  const ends = lines.filter((l) => l.trim() === TABLE_END).length;
  if (begins !== 1 || ends !== 1) {
    fail(`게이트 표 마커가 정확히 한 쌍이어야 한다 (begin ${begins}, end ${ends}): ${path}`);
  }
  const from = lines.findIndex((l) => l.trim() === TABLE_BEGIN);
  const to = lines.findIndex((l) => l.trim() === TABLE_END);
  if (to < from) fail(`게이트 표 마커의 순서가 뒤집혔다: ${path}`);

  const rows = [];
  for (const raw of lines.slice(from + 1, to)) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    const m = /^`([^`]+)`$/.exec(cells[0] ?? '');
    if (!m) continue;
    // 표 칸: 게이트 | 명령 | 임계값 | kind | N/A 조건
    rows.push({ id: m[1], command: cells[1] ?? '', kind: cells[3] ?? '', na: cells[4] ?? '' });
  }
  return rows;
}

/** 백틱을 벗긴다 — 표는 명령을 `bun run x` 꼴로 적는다. */
const unticked = (s) => s.replace(/^`|`$/g, '').trim();

/**
 * **게이트 워크플로 하나만** 읽어 활성 `run:` 줄이 부르는 것을 준다.
 * 주석 줄은 세지 않는다 — 주석 처리된 명령을 "실행됨"으로 세면 CI 일치가 거짓 초록이 된다.
 *
 * 워크플로 전부를 훑지 않는 이유: 릴리스 워크플로가 `bun run zip`을 부르는 것은 평범한데,
 * 그것을 "등록되지 않은 게이트"로 읽으면 게이트가 평범한 변경에 빨강을 내고 그 빨강을 고치는
 * 유일한 길이 게이트를 고치는 것이 된다. 검사하지 않는 초록만큼 나쁜 것이 평범한 것을 막는
 * 빨강이다. 다른 워크플로를 보지 않는다는 사실은 표가 적는다.
 */
function readWorkflowInvocations(dir) {
  const wfDir = join(dir, '.github', 'workflows');
  const found = GATE_WORKFLOWS.map((f) => join(wfDir, f)).filter((p) => existsSync(p));
  if (found.length === 0) return null;
  const keys = [];
  const guards = [];
  for (const p of found) {
    for (const raw of readFileSync(p, 'utf8').split('\n')) {
      const line = raw.trim();
      if (line.startsWith('#')) continue;
      // 조건부·실패 무시 단계는 "돌았다"를 뜻하지 않는다. YAML을 제대로 파싱하지 않으므로
      // 판정할 수 없는 모양을 **거절한다** — 게이트 워크플로는 우리가 단순하게 유지할 수 있는
      // 파일이고, 판정할 수 없는 것을 통과시키는 것보다 모양을 좁히는 편이 정직하다.
      if (/^-?\s*(if|continue-on-error)\s*:/.test(line)) guards.push(line);
      // `run:` 단계의 값만 실행으로 센다. `echo "bun run gate:ci"`는 실행이 아니다.
      const step = /^-?\s*run\s*:\s*(.*)$/.exec(line);
      if (!step) continue;
      const cmd = step[1]
        .trim()
        .replace(/^['"]|['"]$/g, '')
        .replace(/\s+/g, ' ');
      if (/^echo\b/.test(cmd)) continue;
      // 셸 연산자가 있으면 무엇이 실제로 돌고 무엇이 가려지는지 이 파서로는 판정할 수 없다.
      if (SHELL_OPERATORS.test(cmd)) guards.push(cmd);
      for (const m of cmd.matchAll(/\bbun\s+run\s+([A-Za-z0-9:_-]+)/g)) {
        // 진입점은 **정확한 명령**이어야 한다. 접미 인자 하나가 실행을 통째로 우회한다.
        if (m[1] === CI_ENTRYPOINT && cmd !== CANONICAL_CI_RUN) {
          guards.push(`진입점 호출이 정확하지 않다: "${cmd}" — "${CANONICAL_CI_RUN}"이어야 한다`);
          continue;
        }
        keys.push(m[1]);
      }
    }
  }
  return { keys, guards };
}

/** 명령 문자열이 이 파일을 부르는가. 부분 문자열이 아니라 경로 토큰으로 맞춘다 — */
/** `e-gate.mjs`가 `bundle-gate.mjs`에 걸리면 고아 게이트가 등록된 것으로 읽힌다. */
function commandInvokes(commands, file) {
  const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[\\\\/\\s'"])${escaped}($|[\\s'"])`, 'm').test(commands);
}

function checkPlaces(dir, registryPath) {
  const { gates, deferred } = readRegistry(registryPath);

  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) fail(`package.json이 없다: ${pkgPath}`);
  let scripts;
  try {
    scripts = JSON.parse(readFileSync(pkgPath, 'utf8')).scripts ?? {};
  } catch (e) {
    fail(`package.json을 읽을 수 없다: ${e.message}`);
  }

  const rows = readTableRows(join(dir, 'docs', 'agents', 'verification.md'));
  const byId = new Map(rows.map((r) => [r.id, r]));

  for (const g of gates) {
    const row = byId.get(g.id);
    if (!row) fail(`표에 행이 없다: ${g.id} (${g.at})`);
    if (!(g.script in scripts)) fail(`package.json에 스크립트가 없다: ${g.script} (게이트 ${g.id})`);
    // id만 맞추면 가장 결과가 큰 칸들이 조용히 갈라선다 — 한쪽이 advisory, 다른 쪽이 hard여도
    // 초록이고, 그 모순을 코어와 README가 옮겨 적는다.
    const wantCommand = `bun run ${g.script}`;
    if (unticked(row.command) !== wantCommand) {
      fail(`표와 레지스트리의 명령이 다르다: ${g.id} — 표 "${unticked(row.command)}" vs "${wantCommand}"`);
    }
    if (row.kind !== g.kind) {
      fail(`표와 레지스트리의 kind가 다르다: ${g.id} — 표 "${row.kind}" vs "${g.kind}"`);
    }
    if (row.na !== g.na) {
      fail(`표와 레지스트리의 N/A 조건이 다르다: ${g.id} — 표 "${row.na}" vs "${g.na}"`);
    }
  }

  const registered = new Set(gates.map((g) => g.id));
  for (const r of rows) {
    if (!registered.has(r.id)) fail(`표에만 있고 레지스트리에 없다: ${r.id}`);
  }

  // CI 일치. CI는 게이트를 하나씩 부르지 않는다 — 그러면 선행 관계가 무너져, 산출물을 읽는
  // 게이트가 각자 빌드하거나 낡은 것을 재사용한다.
  const wf = readWorkflowInvocations(dir);
  const ciRows = gates.filter((g) => g.ci === 'yes');

  // CI에서 고르는 집합은 **선행까지 닫혀 있어야 한다.** 소비자만 고르고 선행을 빼면 그
  // 선행의 판정이 없어져 소비자가 선행이 없는 것처럼 돈다 — DAG가 CI에서만 조용히 사라진다.
  // 전이적으로 끌어오는 대신 설정 오류로 거절한다: 무엇을 CI에서 돌릴지는 사람이 정해 적는다.
  const ciIds = new Set(ciRows.map((g) => g.id));
  for (const g of ciRows) {
    if (g.needs !== '-' && !ciIds.has(g.needs)) {
      fail(`ci: yes인 ${g.id}의 선행 ${g.needs}가 ci: no다 — CI 선택 집합이 선행까지 닫혀야 한다`);
    }
  }

  if (wf === null) {
    if (ciRows.length > 0) {
      fail(`ci: yes인 게이트가 있는데 게이트 워크플로가 없다: ${ciRows.map((g) => g.id).join(', ')}`);
    }
  } else {
    if (wf.guards.length > 0) {
      fail(`게이트 워크플로에 조건부·실패 무시 단계가 있다(판정할 수 없다): ${wf.guards[0]}`);
    }
    const direct = wf.keys.filter((k) => gates.some((g) => g.script === k));
    if (direct.length > 0) {
      fail(
        `게이트 워크플로가 게이트를 직접 부른다(선행 관계를 건너뛴다): ${direct.join(', ')} — ${CI_ENTRYPOINT} 하나만 부른다`,
      );
    }
    const entry = wf.keys.filter((k) => k === CI_ENTRYPOINT);
    if (ciRows.length > 0 && entry.length === 0) fail(`게이트 워크플로가 ${CI_ENTRYPOINT}를 부르지 않는다`);
    if (entry.length > 1)
      fail(`게이트 워크플로가 ${CI_ENTRYPOINT}를 ${entry.length}번 부른다 — 한 번이어야 한다`);
    if (ciRows.length === 0 && entry.length > 0) {
      fail(`ci: yes인 게이트가 없는데 워크플로가 ${CI_ENTRYPOINT}를 부른다`);
    }
    const unknown = wf.keys.filter((k) => k !== CI_ENTRYPOINT && !gates.some((g) => g.script === k));
    if (unknown.length > 0) fail(`게이트 워크플로가 알 수 없는 것을 부른다: ${unknown.join(', ')}`);

    // 이름표가 가리키는 것을 본다. 이 검사가 없으면 `gate:ci`가 아무것도 하지 않는
    // no-op이어도 CI 일치가 초록이다 — 이름만 맞고 아무 게이트도 돌지 않는 워크플로.
    if (entry.length === 1) {
      const cmd = scripts[CI_ENTRYPOINT];
      if (cmd === undefined) fail(`package.json에 ${CI_ENTRYPOINT} 스크립트가 없다`);
      if (cmd.trim().replace(/\s+/g, ' ') !== CANONICAL_CI_SCRIPT) {
        fail(`${CI_ENTRYPOINT}가 정확한 명령이 아니다: "${cmd}" — "${CANONICAL_CI_SCRIPT}"이어야 한다`);
      }
    }
  }

  // 고아 게이트. 등록된 게이트의 명령이 그 파일을 부르면 등록된 것으로 본다.
  const commands = gates.map((g) => scripts[g.script] ?? '').join('\n');
  const declared = new Map(deferred.map((d) => [d.file, d]));
  const scriptsDir = join(dir, 'scripts');
  const present = existsSync(scriptsDir)
    ? readdirSync(scriptsDir).filter((f) => GATE_SCRIPT_PATTERN.test(f))
    : [];
  for (const f of present) {
    const invoked = commandInvokes(commands, f);
    const isDeferred = declared.has(f);
    if (!invoked && !isDeferred) fail(`등록도 미등록 선언도 되지 않은 게이트 스크립트다: ${f}`);
    if (invoked && isDeferred) fail(`등록됐는데 미등록 선언이 남아 있다: ${f} (${declared.get(f).at})`);
  }
  for (const d of deferred) {
    if (!present.includes(d.file)) fail(`미등록 선언이 가리키는 파일이 없다: ${d.file} (${d.at})`);
  }

  return gates;
}

/**
 * 게이트 하나를 돌리고 **출력 전부**와 종료 코드를 준다.
 *
 * 파이프가 아니라 파일로 받는다. 파이프로 캡처하면 `bun run`이 게이트의 출력을 약 64KB에서
 * 조용히 자른다 — 실측으로 2MB를 쓴 게이트에서 65,697바이트만 돌아왔다. 실패한 게이트의
 * 결정적인 줄은 보통 출력의 끝에 있으므로 정확히 그 자리가 위험하다. 파일로 받으면
 * 2,097,354바이트가 온전히 남는다.
 */
function runOne(dir, script, args = [], env = {}) {
  const logDir = mkdtempSync(join(tmpdir(), 'hk-gate-'));
  const logPath = join(logDir, 'gate.log');
  const fd = openSync(logPath, 'w');
  // 바깥 환경에서 새어 들어온 출력 재지정은 걷어낸다 — 어느 게이트가 어느 산출물을
  // 보는지는 이 회차의 계약이고, 그것을 정하는 것은 러너뿐이어야 한다.
  const childEnv = { ...process.env, ...env };
  if (!(OUT_DIR_ENV in env)) delete childEnv[OUT_DIR_ENV];
  let status;
  try {
    status = spawnSync('bun', ['run', script, ...args], {
      cwd: dir,
      stdio: ['ignore', fd, fd],
      env: childEnv,
    }).status;
  } finally {
    closeSync(fd);
  }
  const out = readFileSync(logPath, 'utf8');
  rmSync(logDir, { recursive: true, force: true });
  return { status, out };
}

/**
 * 종료 코드와 출력에서 판정을 정한다.
 *
 * `verdict: exit`는 종료 코드가 전부다. `verdict: token`은 게이트가 찍은 상태 줄을 읽고
 * **종료 코드와 어긋나면 FAIL**로 잡는다 — FAIL을 찍고 0으로 끝나거나, 아무 상태도 찍지
 * 않으면서 통과한 척하는 경우가 여기서 걸린다. 시그널로 죽으면 status가 null이며 그것은
 * 통과가 아니다.
 */
function classify(gate, status, out) {
  const ok = status === 0;
  if (gate.verdict === 'exit') {
    return ok ? { state: PASS } : { state: FAIL, why: `종료 코드 ${status}` };
  }
  const re = new RegExp(`^(PASS|FAIL|N/A) ${gate.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`, 'm');
  const m = re.exec(out);
  if (!m) {
    return { state: FAIL, why: `상태 줄("<PASS|FAIL|N/A> ${gate.id}: …")을 찍지 않았다` };
  }
  const token = m[1];
  if (token === FAIL && ok) return { state: FAIL, why: 'FAIL을 찍고 종료 코드 0으로 끝났다' };
  if (token !== FAIL && !ok) {
    return { state: FAIL, why: `${token}을 찍고 종료 코드 ${status}로 끝났다` };
  }
  // 행이 `na: never`라고 선언했으면 N/A 토큰은 그 선언과 정면으로 모순이다. 받아들이면
  // 게이트가 스스로 "잴 대상이 없다"고 말해 필수 검사를 건너뛰고, 그 상태가 선행 조건까지
  // 만족시켜 산출물 소비 게이트를 풀어 준다 — 선언과 실행이 갈라서는 자리다.
  if (token === 'N/A' && gate.na === 'never') {
    return { state: FAIL, why: 'N/A를 찍었지만 이 행의 na 조건은 never다' };
  }
  return { state: token === 'N/A' ? NA : token === FAIL ? FAIL : PASS };
}

function runGates(dir, gates) {
  const tally = { [PASS]: 0, [FAIL]: 0, [NA]: 0, [BLOCKED]: 0 };
  const state = new Map();
  let hardFail = 0;

  // D4a: 이 회차에 산출물 소비 게이트(`needs: build`)가 있을 때만 배관을 세운다 —
  // 아무도 읽지 않을 산출물을 굽는 회차는 없다. 디렉터리는 회차마다 새로 만든다.
  const wantsArtifacts = gates.some((g) => g.needs === BUILD_GATE_ID);
  const runDir = wantsArtifacts ? mkdtempSync(join(tmpdir(), 'hk-artifacts-')) : null;
  const artifactsDir = runDir === null ? null : join(runDir, ARTIFACT_SUBDIR);

  try {
    for (const g of gates) {
      // 선행이 통과하지 못했으면 이 게이트는 BLOCKED다 — FAIL도 N/A도 아니다. 실패한 것은
      // 이 게이트가 아니고, 잴 대상이 없었던 것도 아니다. BLOCKED은 완료를 막는다.
      // 선행을 만족시키는 것은 **PASS뿐**이다. N/A로도 풀리게 두면 "잴 대상이 없었다"가
      // "확인됐다"와 같은 값을 갖게 되고, 그 둘의 차이가 판정을 넷으로 나눈 이유다.
      const need = g.needs === '-' ? null : state.get(g.needs);
      if (need !== null && need !== PASS) {
        state.set(g.id, BLOCKED);
        tally[BLOCKED] += 1;
        if (g.kind === 'hard') hardFail += 1;
        process.stdout.write(`${BLOCKED} ${g.id} — 선행 ${g.needs}이 ${need}\n`);
        continue;
      }

      // build 게이트가 곧 산출물 생산자다 — 빌드는 이 회차에 **한 번만** 돈다.
      const env = runDir !== null && g.id === BUILD_GATE_ID ? { [OUT_DIR_ENV]: runDir } : {};
      const args = artifactsDir !== null && g.needs === BUILD_GATE_ID ? ['--artifacts', artifactsDir] : [];
      const { status, out } = runOne(dir, g.script, args, env);
      const { state: verdict, why } = classify(g, status, out);
      state.set(g.id, verdict);
      tally[verdict] += 1;

      if (verdict === PASS || verdict === NA) {
        process.stdout.write(`${verdict} ${g.id}\n`);
        continue;
      }
      if (g.kind === 'hard') hardFail += 1;
      // 판정 토큰은 넷뿐이다. advisory는 다섯 번째 판정이 아니라 그 행의 kind이므로
      // 토큰을 만들지 않고 같은 줄의 산문으로 덧붙인다.
      const note = g.kind === 'advisory' ? ' — advisory 행이라 완료를 막지 않는다' : '';
      process.stdout.write(`${FAIL} ${g.id}${why ? ` (${why})` : ''}${note}\n`);
      // 출력을 버리면 빨강이 났을 때 무엇이 실패했는지 영영 알 수 없다.
      process.stdout.write(`${out.trimEnd()}\n`);
    }
  } finally {
    // 회차가 끝나면 산출물은 판정에 반영됐다 — 남겨 두면 tmp만 쌓인다. 실패 회차라도
    // 지운다: 결정적 증거는 위에서 전문으로 남긴 게이트 출력이고, 트리 자체는 빌드
    // 재실행으로 재현된다. 도중에 죽은 러너가 남긴 디렉터리는 OS tmp 청소에 맡긴다 —
    // 다음 회차는 어차피 자기 것만 본다.
    if (runDir !== null) rmSync(runDir, { recursive: true, force: true });
  }

  const line = `${gates.length} gate(s): ${tally[PASS]} pass, ${tally[FAIL]} fail, ${tally[NA]} n/a, ${tally[BLOCKED]} blocked`;
  if (hardFail > 0) {
    // `fail()`을 쓰지 않는다 — 그것은 `process.exit()`을 부르고, 파이프로의 `stdout.write`는
    // 비동기라 아직 나가지 않은 게이트 출력이 잘린다. 실측으로 2MB가 65,605바이트로 잘렸다.
    process.stderr.write(`FAIL ${LABEL}: ${line}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`PASS ${LABEL}: ${line}\n`);
}

const here = dirname(fileURLToPath(import.meta.url));
const opts = parseArgs(process.argv.slice(2));
const dir = resolve(opts.dir ?? join(here, '..'));
if (!existsSync(dir)) fail(`대상 트리가 없다: ${dir}`);

const all = checkPlaces(dir, join(dir, 'scripts', 'gates.txt'));
// `--ci`는 고르되 순서를 지킨다. 선행이 골라지지 않았으면 그 관계는 이 회차에 없다.
const selected = opts.ci ? all.filter((g) => g.ci === 'yes') : all;

if (opts.checkOnly) {
  process.stdout.write(`PASS ${LABEL}: ${all.length} gate(s) registered, 자리들이 일치한다 (checks only)\n`);
} else if (selected.length === 0) {
  process.stdout.write(`PASS ${LABEL}: 0 gate(s) selected\n`);
} else {
  runGates(dir, selected);
}
