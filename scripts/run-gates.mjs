#!/usr/bin/env node
/*
 * 게이트 러너 (티켓 01).
 *
 * 무엇을 하는가: `scripts/gates.txt`에 등록된 게이트를 돌리고 행별 판정을 낸다.
 * 판정의 근거는 게이트가 **실제로 출력한 것**이지 이 파일이 지어낸 문장이 아니다.
 *
 * 그리고 돌리기 전에 **네 자리가 어긋나지 않았는지** 검사한다 — 레지스트리, 사람이 읽는
 * 표(`docs/agents/verification.md`), `package.json` 스크립트, CI 워크플로. 셋이 조용히
 * 갈라서면 표는 장식이 되고, 장식이 된 표는 "무엇을 돌려야 하는가"를 사람의 기억으로
 * 되돌린다.
 *
 * 참여하는 스크립트의 범위는 **레지스트리가 정한다.** `package.json`에는 `dev`·`zip`·
 * `storybook`처럼 게이트가 아닌 스크립트가 이미 있고 앞으로 더 생긴다. "모든 스크립트가
 * 표에 있어야 한다"는 규칙은 영구히 빨강이라 검사가 아니라 소음이다.
 *
 *   node scripts/run-gates.mjs [--dir <트리>] [--check-only]
 *
 * `--check-only`는 네 자리 일치만 보고 게이트를 돌리지 않는다. 이 러너의 테스트가 쓰는
 * 길이기도 하다 — `test` 게이트가 vitest를 부르고 vitest가 이 러너를 부르면 자기 자신을
 * 기다린다.
 */
import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LABEL = 'run-gates';
const KINDS = new Set(['hard', 'advisory']);
const YESNO = new Set(['yes', 'no']);
/** 고아 게이트 검출이 미치는 이름 규약. 이 밖의 이름은 잡지 못한다 — 표가 그 경계를 적는다. */
const GATE_SCRIPT_PATTERN = /-gate\.mjs$/;

function fail(message) {
  process.stderr.write(`FAIL ${LABEL}: ${message}\n`);
  process.exit(1);
}

/**
 * 값이 필요한 플래그의 값을 꺼낸다. 없거나, 비었거나, 플래그처럼 생겼으면 거절한다.
 *
 * 처음 판은 `argv[i += 1]`을 그대로 받고 `undefined`만 걸렀다. 그러면 `--dir ""`가 통과해
 * `resolve('')`가 **cwd**가 되고, 러너가 의도와 다른 트리를 감사하고는 초록을 냈다. 그리고
 * `--dir --check-only`는 플래그를 값으로 삼켜 `--check-only`가 조용히 사라졌다. 둘 다
 * "아무것도 재지 않으면서 초록"으로 끝나는 길이라 값 검사를 여기서 닫는다.
 */
function takeValue(argv, i, flag) {
  const v = argv[i];
  if (v === undefined) fail(`${flag}에 값이 없다`);
  if (v.trim() === '') fail(`${flag}의 값이 비었다`);
  if (v.startsWith('-')) fail(`${flag}의 값이 플래그처럼 보인다: ${v}`);
  return v;
}

function parseArgs(argv) {
  const opts = { dir: null, checkOnly: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--check-only') opts.checkOnly = true;
    else if (a === '--dir') opts.dir = takeValue(argv, (i += 1), '--dir');
    else if (a === '-h' || a === '--help') {
      process.stdout.write('Usage: run-gates.mjs [--dir <tree>] [--check-only]\n');
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
  const lines = readFileSync(path, 'utf8').split('\n');
  for (const [i, raw] of lines.entries()) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const at = `${path}:${i + 1}`;
    if (line.startsWith('gate:')) {
      const fields = line.slice('gate:'.length).split('|').map((s) => s.trim());
      if (fields.length !== 7) fail(`${at} — gate 행은 7칸이어야 하는데 ${fields.length}칸이다`);
      if (fields.some((f) => f === '')) fail(`${at} — 빈 칸이 있다`);
      const [id, script, kind, ci, needs, browser, na] = fields;
      if (!KINDS.has(kind)) fail(`${at} — kind는 hard 또는 advisory여야 한다: ${kind}`);
      if (!YESNO.has(ci)) fail(`${at} — ci는 yes 또는 no여야 한다: ${ci}`);
      if (!YESNO.has(browser)) fail(`${at} — browser는 yes 또는 no여야 한다: ${browser}`);
      // 아직 구현하지 못한 값은 **읽는 자리에서** 거절한다. 실행 루프에서 거절하면
      // `--check-only`가 그것을 초록으로 통과시키고 — 이 저장소의 자기 검사가 바로
      // 그 경로다 — 러너가 돌리기를 거부할 레지스트리가 "일치한다"로 읽힌다.
      // 게다가 루프 안이면 앞선 게이트들이 이미 돌아 버린 뒤에야 멈춘다.
      if (needs !== '-') fail(`${at} — needs를 아직 다루지 못한다(티켓 02): ${needs}`);
      if (na !== 'never') fail(`${at} — na 조건을 아직 다루지 못한다: ${na}`);
      gates.push({ id, script, kind, ci, needs, browser, na, at });
    } else if (line.startsWith('deferred:')) {
      const fields = line.slice('deferred:'.length).split('|').map((s) => s.trim());
      if (fields.length !== 2 || fields.some((f) => f === '')) {
        fail(`${at} — deferred 행은 "<파일> | <이유>" 두 칸이어야 한다`);
      }
      deferred.push({ file: fields[0], reason: fields[1], at });
    } else fail(`${at} — gate: 또는 deferred: 로 시작해야 한다`);
  }
  if (gates.length === 0) fail(`등록된 게이트가 없다: ${path}`);

  const seen = new Set();
  for (const g of gates) {
    if (seen.has(g.id)) fail(`${g.at} — id가 중복된다: ${g.id}`);
    seen.add(g.id);
  }
  return { gates, deferred };
}

/**
 * 표에서 게이트 id를 뽑는다.
 *
 * 마커 사이만 읽는다. "첫 칸이 백틱 토큰인 표 행"만으로 가르려 했더니 판정 설명 표
 * (`PASS`/`FAIL`/`N/A`/`NOT RUN`)가 게이트 행으로 읽혔다 — 문서에 표가 하나뿐이라는
 * 가정이었고, 실측으로 틀렸다. 마커 쌍이 정확히 하나가 아니면 FAIL이다: 마커를 잃은 문서가
 * 빈 집합을 돌려주면 그것은 "게이트가 없다"가 아니라 "읽지 못했다"이고, 둘을 섞으면
 * 아무것도 재지 않으면서 초록인 상태가 생긴다.
 *
 * 규약: 마커 사이 마크다운 표 행의 **첫 칸**이 백틱 토큰 하나면 그것이 게이트 id다.
 */
const TABLE_BEGIN = '<!-- gates:begin -->';
const TABLE_END = '<!-- gates:end -->';

function readTableIds(path) {
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

  const ids = new Set();
  for (const raw of lines.slice(from + 1, to)) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    const first = line.split('|')[1]?.trim() ?? '';
    const m = /^`([^`]+)`$/.exec(first);
    if (m) ids.add(m[1]);
  }
  return ids;
}

/**
 * **게이트 워크플로 하나만** 읽어, 그것이 `bun run <키>`로 부르는 스크립트 키들을 준다.
 * 없으면 null (검사를 건너뛴다 — 워크플로가 아직 없는 것이 정상인 시기가 있다).
 *
 * 워크플로 전부를 훑지 않는 이유: 릴리스 워크플로가 `bun run zip`을 부르는 것은 지극히
 * 평범한데, 그것을 "등록되지 않은 게이트를 돌린다"로 읽으면 게이트가 평범한 변경에
 * 빨강을 내고 그 빨강을 고치는 유일한 길이 게이트를 고치는 것이 된다. 검사하지 않는 초록만큼
 * 나쁜 것이 평범한 것을 막는 빨강이다. 그래서 이 검사가 미치는 곳을 게이트 워크플로로
 * 한정하고, 다른 워크플로는 **보지 않는다는 사실을 표에 적는다.**
 */
const GATE_WORKFLOWS = ['gate.yml', 'gate.yaml'];

function readWorkflowScripts(dir) {
  const wfDir = join(dir, '.github', 'workflows');
  const found = GATE_WORKFLOWS.map((f) => join(wfDir, f)).filter((p) => existsSync(p));
  if (found.length === 0) return null;
  const keys = new Set();
  for (const p of found) {
    for (const m of readFileSync(p, 'utf8').matchAll(/\bbun\s+run\s+([A-Za-z0-9:_-]+)/g)) {
      keys.add(m[1]);
    }
  }
  return keys;
}

/** 명령 문자열이 이 파일을 부르는가. 부분 문자열이 아니라 경로 토큰으로 맞춘다 — */
/** `gate.mjs`가 `bundle-gate.mjs`에 걸리면 고아 게이트가 등록된 것으로 읽힌다. */
function commandInvokes(commands, file) {
  const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[\\\\/\\s'"])${escaped}($|[\\s'"])`, 'm').test(commands);
}

function checkFourPlaces(dir, registryPath) {
  const { gates, deferred } = readRegistry(registryPath);

  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) fail(`package.json이 없다: ${pkgPath}`);
  let scripts;
  try {
    scripts = JSON.parse(readFileSync(pkgPath, 'utf8')).scripts ?? {};
  } catch (e) {
    fail(`package.json을 읽을 수 없다: ${e.message}`);
  }

  const tableIds = readTableIds(join(dir, 'docs', 'agents', 'verification.md'));
  const workflowScripts = readWorkflowScripts(dir);

  for (const g of gates) {
    if (!tableIds.has(g.id)) fail(`표에 행이 없다: ${g.id} (${g.at})`);
    if (!(g.script in scripts)) fail(`package.json에 스크립트가 없다: ${g.script} (게이트 ${g.id})`);
    if (g.ci === 'yes') {
      if (workflowScripts === null) fail(`ci: yes인데 워크플로가 없다: ${g.id}`);
      if (!workflowScripts.has(g.script)) fail(`워크플로가 이 게이트를 돌리지 않는다: ${g.id}`);
    }
  }

  const registeredIds = new Set(gates.map((g) => g.id));
  for (const id of tableIds) {
    if (!registeredIds.has(id)) fail(`표에만 있고 레지스트리에 없다: ${id}`);
  }

  if (workflowScripts) {
    const ciScripts = new Set(gates.filter((g) => g.ci === 'yes').map((g) => g.script));
    for (const key of workflowScripts) {
      if (!ciScripts.has(key)) fail(`워크플로가 등록되지 않은 게이트를 돌린다: ${key}`);
    }
  }

  // 고아 게이트. 등록된 게이트의 명령이 그 파일을 부르면 등록된 것으로 본다.
  const commands = gates.map((g) => scripts[g.script] ?? '').join('\n');
  const declaredDeferred = new Map(deferred.map((d) => [d.file, d]));
  const scriptsDir = join(dir, 'scripts');
  const present = existsSync(scriptsDir)
    ? readdirSync(scriptsDir).filter((f) => GATE_SCRIPT_PATTERN.test(f))
    : [];
  for (const f of present) {
    const invoked = commandInvokes(commands, f);
    const isDeferred = declaredDeferred.has(f);
    if (!invoked && !isDeferred) fail(`등록도 미등록 선언도 되지 않은 게이트 스크립트다: ${f}`);
    if (invoked && isDeferred) {
      fail(`등록됐는데 미등록 선언이 남아 있다: ${f} (${declaredDeferred.get(f).at})`);
    }
  }
  for (const d of deferred) {
    if (!present.includes(d.file)) fail(`미등록 선언이 가리키는 파일이 없다: ${d.file} (${d.at})`);
  }

  return gates;
}

/**
 * 게이트 하나를 돌리고 **출력 전부**와 성공 여부를 준다.
 *
 * 파이프가 아니라 파일로 받는다. 파이프로 캡처하면 `bun run`이 게이트의 출력을 약 64KB에서
 * 조용히 자른다 — 실측으로 2MB를 쓴 게이트에서 65,697바이트만 돌아왔고, 그것을 러너는
 * 알지 못한 채 보고했다. 실패한 게이트의 결정적인 줄은 보통 출력의 끝에 있으므로 정확히
 * 그 자리가 위험하다. 같은 게이트를 파일로 받으면 2,097,354바이트가 온전히 남는다.
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
  // 시그널로 죽으면 status가 null이다. 그것은 통과가 아니다.
  return { ok: status === 0, out };
}

function runGates(dir, gates) {
  let pass = 0;
  let hardFail = 0;
  let advisoryFail = 0;

  for (const g of gates) {
    const { ok, out } = runOne(dir, g.script);
    if (ok) {
      pass += 1;
      process.stdout.write(`PASS ${g.id}\n`);
    } else {
      if (g.kind === 'advisory') advisoryFail += 1;
      else hardFail += 1;
      // 판정 토큰은 넷뿐이다(표 참조). advisory는 다섯 번째 판정이 아니라 그 행의 kind이므로
      // 토큰을 만들지 않고 같은 줄의 산문으로 덧붙인다.
      const note = g.kind === 'advisory' ? ' — advisory 행이라 완료를 막지 않는다' : '';
      process.stdout.write(`FAIL ${g.id}${note}\n`);
      // 출력을 버리면 빨강이 났을 때 무엇이 실패했는지 영영 알 수 없다.
      process.stdout.write(`${out.trimEnd()}\n`);
    }
  }

  const tally = `${gates.length} gate(s): ${pass} pass, ${hardFail} fail, ${advisoryFail} advisory-fail`;
  if (hardFail > 0) {
    // `fail()`을 쓰지 않는다 — 그것은 `process.exit()`을 부르고, 파이프로의
    // `stdout.write`는 비동기라 **아직 나가지 않은 게이트 출력이 잘린다.** 실측으로
    // 2MB를 쓴 실패 게이트의 출력이 65,605바이트로 잘렸다. 이 저장소의 다른 게이트들이
    // `process.exitCode`를 쓰는 이유가 같다: 자연 종료가 flush를 기다린다.
    process.stderr.write(`FAIL ${LABEL}: ${tally}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`PASS ${LABEL}: ${tally}\n`);
}

const here = dirname(fileURLToPath(import.meta.url));
const opts = parseArgs(process.argv.slice(2));
const dir = resolve(opts.dir ?? join(here, '..'));
if (!existsSync(dir)) fail(`대상 트리가 없다: ${dir}`);
const registryPath = resolve(opts.registry ?? join(dir, 'scripts', 'gates.txt'));

const gates = checkFourPlaces(dir, registryPath);

if (opts.checkOnly) {
  process.stdout.write(`PASS ${LABEL}: ${gates.length} gate(s) registered, 네 자리 일치 (checks only)\n`);
} else {
  runGates(dir, gates);
}
