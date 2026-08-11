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
const GATE_WORKFLOWS = ['gate.yml', 'gate.yaml'];

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
      const f = line.slice('gate:'.length).split('|').map((s) => s.trim());
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
      const f = line.slice('deferred:'.length).split('|').map((s) => s.trim());
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
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
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
  for (const p of found) {
    for (const raw of readFileSync(p, 'utf8').split('\n')) {
      const line = raw.trim();
      if (line.startsWith('#')) continue;
      for (const m of line.matchAll(/\bbun\s+run\s+([A-Za-z0-9:_-]+)/g)) keys.push(m[1]);
    }
  }
  return keys;
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
  const invocations = readWorkflowInvocations(dir);
  const ciRows = gates.filter((g) => g.ci === 'yes');
  if (invocations === null) {
    if (ciRows.length > 0) fail(`ci: yes인 게이트가 있는데 게이트 워크플로가 없다: ${ciRows.map((g) => g.id).join(', ')}`);
  } else {
    const direct = invocations.filter((k) => gates.some((g) => g.script === k));
    if (direct.length > 0) {
      fail(`게이트 워크플로가 게이트를 직접 부른다(선행 관계를 건너뛴다): ${direct.join(', ')} — ${CI_ENTRYPOINT} 하나만 부른다`);
    }
    const entry = invocations.filter((k) => k === CI_ENTRYPOINT);
    if (ciRows.length > 0 && entry.length === 0) fail(`게이트 워크플로가 ${CI_ENTRYPOINT}를 부르지 않는다`);
    if (entry.length > 1) fail(`게이트 워크플로가 ${CI_ENTRYPOINT}를 ${entry.length}번 부른다 — 한 번이어야 한다`);
    if (ciRows.length === 0 && entry.length > 0) {
      fail(`ci: yes인 게이트가 없는데 워크플로가 ${CI_ENTRYPOINT}를 부른다`);
    }
    const unknown = invocations.filter((k) => k !== CI_ENTRYPOINT && !gates.some((g) => g.script === k));
    if (unknown.length > 0) fail(`게이트 워크플로가 알 수 없는 것을 부른다: ${unknown.join(', ')}`);
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
function runOne(dir, script) {
  const logDir = mkdtempSync(join(tmpdir(), 'hk-gate-'));
  const logPath = join(logDir, 'gate.log');
  const fd = openSync(logPath, 'w');
  let status;
  try {
    status = spawnSync('bun', ['run', script], { cwd: dir, stdio: ['ignore', fd, fd] }).status;
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
  return { state: token === 'N/A' ? NA : token === FAIL ? FAIL : PASS };
}

function runGates(dir, gates) {
  const tally = { [PASS]: 0, [FAIL]: 0, [NA]: 0, [BLOCKED]: 0 };
  const state = new Map();
  let hardFail = 0;

  for (const g of gates) {
    // 선행이 통과하지 못했으면 이 게이트는 BLOCKED다 — FAIL도 N/A도 아니다. 실패한 것은
    // 이 게이트가 아니고, 잴 대상이 없었던 것도 아니다. BLOCKED은 완료를 막는다.
    const need = g.needs === '-' ? null : state.get(g.needs);
    if (need && need !== PASS && need !== NA) {
      state.set(g.id, BLOCKED);
      tally[BLOCKED] += 1;
      if (g.kind === 'hard') hardFail += 1;
      process.stdout.write(`${BLOCKED} ${g.id} — 선행 ${g.needs}이 ${need}\n`);
      continue;
    }

    const { status, out } = runOne(dir, g.script);
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
