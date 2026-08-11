import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * seam: 러너를 **자식 프로세스로 띄우고 종료 코드와 상태 줄만** 단언한다.
 * 러너의 내부 함수를 부르지 않는다 — 안으로 손을 뻗을 길이 없다는 것이 이 seam의 값이다.
 *
 * 픽스처는 매번 새 임시 트리다. 검사 대상 트리 안에 테스트가 쓰면 단언하는 대상을
 * 스스로 바꾸게 된다.
 */

const RUNNER = join(dirname(fileURLToPath(import.meta.url)), 'run-gates.mjs');

const made = [];
afterEach(() => {
  while (made.length) rmSync(made.pop(), { recursive: true, force: true });
});

/** 실행하고 {code, out}을 준다. 던지지 않는다 — 종료 코드가 단언 대상이다. */
function run(args) {
  try {
    // maxBuffer를 넉넉히 준다. 기본 1MB로는 이 하네스가 러너의 출력을 스스로 잘라,
    // "출력을 버리지 않는다"를 재려는 테스트가 자기 손으로 그것을 버리게 된다.
    const out = execFileSync('node', [RUNNER, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

/**
 * 픽스처 트리. gates는 레지스트리 행, scripts는 package.json 스크립트,
 * table은 verification.md에 등장할 id들, workflow는 CI가 도는 스크립트 키들.
 */
const TABLE_BEGIN = '<!-- gates:begin -->';
const TABLE_END = '<!-- gates:end -->';
/** `ci: no`인 행의 표 칸 기본값. 러너가 이유를 요구하므로 픽스처도 이유를 단다. */
const CI_NO_CELL = 'no — 픽스처';
/** 워크플로 픽스처의 트리거. 러너가 `pull_request`를 요구하므로 정상 모양에는 늘 있다. */
const WF_ON = 'on:\n  pull_request:\n';

function tree({
  gates = [],
  deferred = [],
  scripts = {},
  table = null,
  workflow = null,
  files = {},
  markers = true,
}) {
  const dir = mkdtempSync(join(tmpdir(), 'hk-gates-'));
  made.push(dir);
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  mkdirSync(join(dir, 'docs', 'agents'), { recursive: true });

  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture', scripts }, null, 2));

  const rows = [
    '# fixture registry',
    ...gates.map((g) => `gate: ${g}`),
    ...deferred.map((d) => `deferred: ${d}`),
  ];
  writeFileSync(join(dir, 'scripts', 'gates.txt'), `${rows.join('\n')}\n`);

  // 표의 명령·kind·CI·N/A 칸도 레지스트리와 대조되므로 기본값은 레지스트리에서 파생시킨다.
  // 어긋남을 재는 테스트만 `table`로 직접 준다.
  const derived = gates.map((g) => {
    const [id, script, kind, ci, needs, , , na] = g.split('|').map((s) => s.trim());
    // `no`는 표에 이유를 요구한다 — 그 요구를 재는 테스트만 `table`로 이유를 빼고 준다.
    return { id, command: `bun run ${script}`, kind, ci: ci === 'no' ? CI_NO_CELL : ci, needs, na };
  });
  const tableRows = table ?? derived;
  const cell = (r) =>
    `| \`${r.id}\` | \`${r.command}\` | 임계값 | ${r.kind} | ${r.ci ?? CI_NO_CELL} | ${r.needs ?? '-'} | ${r.na} |`;
  // 마커 밖에 백틱 첫 칸을 가진 표를 함께 둔다 — 실제 문서의 판정 설명 표가 그렇고,
  // 그것이 게이트 행으로 읽히던 결함을 이 픽스처가 계속 재현한다.
  const decoy = '| `PASS` | 돌았고 만족했다 |\n| `N/A` | 잴 대상이 없다 |';
  const body = markers
    ? `${decoy}\n\n${TABLE_BEGIN}\n${tableRows.map(cell).join('\n')}\n${TABLE_END}`
    : `${decoy}\n\n${tableRows.map(cell).join('\n')}`;
  writeFileSync(join(dir, 'docs', 'agents', 'verification.md'), `# 검증\n\n${body}\n`);

  if (workflow) {
    mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
    writeFileSync(
      join(dir, '.github', 'workflows', 'gate.yml'),
      `${WF_ON}jobs:\n  gate:\n    steps:\n${workflow.map((s) => `      - run: bun run ${s}\n`).join('')}`,
    );
  }

  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  return dir;
}

/** id | script | kind | ci | needs | browser | verdict | na */
const ROW = (id, script, over = {}) => {
  const f = {
    kind: 'hard',
    ci: 'no',
    needs: '-',
    browser: 'no',
    verdict: 'exit',
    na: 'never',
    ...over,
  };
  return `${id} | ${script} | ${f.kind} | ${f.ci} | ${f.needs} | ${f.browser} | ${f.verdict} | ${f.na}`;
};

/** 상태 줄을 찍는 게이트를 만든다 — verdict: token 계약을 재는 데 쓴다. */
const says = (token, id, code) => `node -e "console.log('${token} ${id}: detail'); process.exit(${code})"`;

const OK = 'node -e "process.exit(0)"';
const BAD = 'node -e "console.log(\'boom: the decisive line\'); process.exit(1)"';
/** CI 진입점의 정상 모양. no-op으로 두면 CI 일치가 이름만 보고 통과한다. */
const CI_OK = 'node scripts/run-gates.mjs --ci';

describe('run-gates — 네 자리 일치', () => {
  it('전부 일치하면 통과한다', () => {
    const dir = tree({ gates: [ROW('alpha', 'alpha')], scripts: { alpha: OK } });
    const r = run(['--dir', dir]);
    expect(r.out).toMatch(/^PASS run-gates:/m);
    expect(r.code).toBe(0);
  });

  it('레지스트리에 있는데 표에 없으면 실패한다', () => {
    const dir = tree({ gates: [ROW('alpha', 'alpha')], scripts: { alpha: OK }, table: [] });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.out).toContain('alpha');
    expect(r.code).toBe(1);
  });

  it('표에 있는데 레지스트리에 없으면 실패한다', () => {
    const dir = tree({
      gates: [ROW('alpha', 'alpha')],
      scripts: { alpha: OK },
      table: [
        { id: 'alpha', command: 'bun run alpha', kind: 'hard', na: 'never' },
        { id: 'ghost', command: 'bun run ghost', kind: 'hard', na: 'never' },
      ],
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.out).toContain('ghost');
    expect(r.code).toBe(1);
  });

  it('package.json에 스크립트가 없으면 실패한다', () => {
    const dir = tree({ gates: [ROW('alpha', 'alpha')], scripts: {} });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('ci: yes인데 워크플로가 없으면 실패한다', () => {
    const dir = tree({ gates: [ROW('alpha', 'alpha', { ci: 'yes' })], scripts: { alpha: OK } });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('게이트 워크플로가 알 수 없는 것을 부르면 실패한다', () => {
    const dir = tree({
      gates: [ROW('alpha', 'alpha', { ci: 'yes' })],
      scripts: { alpha: OK, 'gate:ci': CI_OK },
      workflow: ['gate:ci', 'rogue'],
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.out).toContain('rogue');
    expect(r.code).toBe(1);
  });
});

describe('run-gates — 참여하는 스크립트의 범위', () => {
  it('평범한 non-gate 스크립트가 있어도 통과한다', () => {
    // 이것이 없으면 "모든 스크립트가 표에 있어야 한다"는 영구 빨강 규칙이
    // 슬그머니 되살아난다 — 검사가 아니라 소음이 되는 자리.
    const dir = tree({
      gates: [ROW('alpha', 'alpha')],
      scripts: {
        alpha: OK,
        dev: OK,
        zip: OK,
        'test:watch': OK,
        storybook: OK,
        postinstall: OK,
      },
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^PASS run-gates:/m);
    expect(r.code).toBe(0);
  });
});

describe('run-gates — 고아 게이트와 미등록 선언', () => {
  it('등록도 선언도 되지 않은 *-gate.mjs 가 있으면 실패한다', () => {
    const dir = tree({
      gates: [ROW('alpha', 'alpha')],
      scripts: { alpha: OK },
      files: { 'scripts/orphan-gate.mjs': '// nothing\n' },
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.out).toContain('orphan-gate.mjs');
    expect(r.code).toBe(1);
  });

  it('미등록으로 선언된 *-gate.mjs 는 통과한다', () => {
    const dir = tree({
      gates: [ROW('alpha', 'alpha')],
      deferred: ['later-gate.mjs | 티켓 02 뒤에 등록한다'],
      scripts: { alpha: OK },
      files: { 'scripts/later-gate.mjs': '// nothing\n' },
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^PASS run-gates:/m);
    expect(r.code).toBe(0);
  });

  it('등록됐는데 미등록 선언이 남아 있으면 실패한다', () => {
    // 선언을 지우는 것이 등록하는 변경의 일부다 — 양방향으로 정직하게 유지된다.
    const dir = tree({
      gates: [ROW('later', 'later')],
      deferred: ['later-gate.mjs | 이미 등록됐는데 선언이 남았다'],
      scripts: { later: `node scripts/later-gate.mjs` },
      files: { 'scripts/later-gate.mjs': '// nothing\n' },
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('존재하지 않는 파일을 미등록 선언하면 실패한다', () => {
    const dir = tree({
      gates: [ROW('alpha', 'alpha')],
      deferred: ['ghost-gate.mjs | 없는 파일'],
      scripts: { alpha: OK },
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.out).toContain('ghost-gate.mjs');
    expect(r.code).toBe(1);
  });
});

describe('run-gates — 레지스트리 자체의 건강성', () => {
  it('필드 수가 틀린 행이 있으면 실패한다', () => {
    const dir = tree({ gates: ['alpha | alpha | hard'], scripts: { alpha: OK } });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('kind 값이 hard/advisory가 아니면 실패한다', () => {
    const dir = tree({
      gates: [ROW('alpha', 'alpha', { kind: 'sorta' })],
      scripts: { alpha: OK },
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('레지스트리가 비어 있으면 실패한다', () => {
    const dir = tree({ gates: [], scripts: {} });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('id가 중복되면 실패한다', () => {
    const dir = tree({
      gates: [ROW('alpha', 'alpha'), ROW('alpha', 'beta')],
      scripts: { alpha: OK, beta: OK },
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });
});

describe('run-gates — 게이트 표를 어디서 읽는가', () => {
  it('마커 밖의 백틱 표(판정 설명 등)를 게이트 행으로 읽지 않는다', () => {
    // 이것이 없으면 문서에 표가 하나뿐이라는 가정이 조용히 서고, 두 번째 표가
    // 생기는 순간 그 행들이 "표에만 있고 레지스트리에 없다"로 잘못 걸린다.
    const dir = tree({ gates: [ROW('alpha', 'alpha')], scripts: { alpha: OK } });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^PASS run-gates:/m);
    expect(r.code).toBe(0);
  });

  it('마커가 없으면 실패한다', () => {
    // 마커를 잃은 문서가 빈 집합을 돌려주면 그것은 "게이트가 없다"가 아니라
    // "읽지 못했다"이다. 둘을 섞으면 아무것도 재지 않으면서 초록인 상태가 생긴다.
    const dir = tree({ gates: [ROW('alpha', 'alpha')], scripts: { alpha: OK }, markers: false });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('마커 쌍이 둘이면 실패한다', () => {
    const dir = tree({ gates: [ROW('alpha', 'alpha')], scripts: { alpha: OK } });
    const doc = join(dir, 'docs', 'agents', 'verification.md');
    writeFileSync(
      doc,
      `${readFileSync(doc, 'utf8')}\n${TABLE_BEGIN}\n| \`beta\` | x | y | z |\n${TABLE_END}\n`,
    );
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });
});

describe('run-gates — 실행과 증거', () => {
  it('게이트가 실패하면 그 게이트의 출력을 버리지 않고 보고한다', () => {
    // 출력을 버리면 빨강이 났을 때 무엇이 실패했는지 영영 알 수 없다.
    const dir = tree({ gates: [ROW('alpha', 'alpha')], scripts: { alpha: BAD } });
    const r = run(['--dir', dir]);
    expect(r.out).toContain('boom: the decisive line');
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('advisory 행은 실패해도 러너를 빨갛게 만들지 않는다', () => {
    const dir = tree({
      gates: [ROW('alpha', 'alpha'), ROW('advice', 'advice', { kind: 'advisory' })],
      scripts: { alpha: OK, advice: BAD },
    });
    const r = run(['--dir', dir]);
    expect(r.out).toMatch(/^PASS run-gates:/m);
    expect(r.code).toBe(0);
  });

  it('--check-only 는 게이트를 돌리지 않는다', () => {
    // 돌린다면 BAD가 러너를 빨갛게 만들었을 것이다.
    const dir = tree({ gates: [ROW('alpha', 'alpha')], scripts: { alpha: BAD } });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^PASS run-gates:/m);
    expect(r.code).toBe(0);
  });
});

describe('run-gates — 아직 다루지 못하는 필드는 읽는 자리에서 거절한다', () => {
  it('needs 값이 있으면 --check-only 에서 거절한다', () => {
    // 실행 루프에서 거절하면 --check-only 가 이것을 초록으로 통과시킨다. 이 저장소의
    // 자기 검사가 바로 그 경로라, 돌리기를 거부할 레지스트리가 "일치한다"로 읽힌다.
    const dir = tree({
      gates: [ROW('alpha', 'alpha', { needs: 'build' })],
      scripts: { alpha: OK },
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('na 값이 never가 아니면 --check-only 에서 거절한다', () => {
    const dir = tree({
      gates: [ROW('alpha', 'alpha', { na: 'no-artifact' })],
      scripts: { alpha: OK },
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('거절이 앞선 게이트를 돌리기 전에 일어난다', () => {
    // 루프 안에서 거절하면 alpha가 이미 돈 뒤에 멈춘다.
    const dir = tree({
      gates: [ROW('alpha', 'alpha'), ROW('beta', 'beta', { needs: 'build' })],
      scripts: { alpha: OK, beta: OK },
    });
    const r = run(['--dir', dir]);
    expect(r.out).not.toContain('PASS alpha');
    expect(r.code).toBe(1);
  });
});

describe('run-gates — 인자 검사', () => {
  it('--dir 의 값이 비면 거절한다', () => {
    // 통과시키면 resolve('')가 cwd가 되어 의도와 다른 트리를 감사하고 초록을 낸다.
    const r = run(['--dir', '', '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('--dir 뒤에 플래그가 오면 거절한다', () => {
    // 삼키면 --check-only가 조용히 사라져 게이트가 전부 실제로 돈다.
    const r = run(['--dir', '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('--dir 에 값이 아예 없으면 거절한다', () => {
    const r = run(['--dir']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });
});

describe('run-gates — 워크플로 검사가 미치는 범위', () => {
  it('게이트 워크플로가 아닌 워크플로는 보지 않는다', () => {
    // 릴리스 워크플로가 `bun run zip`을 부르는 것은 평범하다. 그것을 "등록되지 않은
    // 게이트"로 읽으면 게이트가 평범한 변경에 빨강을 내고, 그 빨강을 고치는 유일한 길이
    // 게이트를 고치는 것이 된다.
    const dir = tree({
      gates: [ROW('alpha', 'alpha')],
      scripts: { alpha: OK, zip: OK },
      files: {
        '.github/workflows/release.yml': 'jobs:\n  r:\n    steps:\n      - run: bun run zip\n',
      },
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^PASS run-gates:/m);
    expect(r.code).toBe(0);
  });
});

describe('run-gates — 고아 검출의 경계', () => {
  it('이름 규약 밖의 게이트 스크립트는 잡지 못한다 (덮은 척하지 않는다)', () => {
    // 표가 이 경계를 적고 있다. 이 케이스는 그 문장이 사실임을 붙들어 둔다 —
    // 나중에 규약을 넓히면 여기가 먼저 깨져서 문서를 함께 고치게 된다.
    const dir = tree({
      gates: [ROW('alpha', 'alpha')],
      scripts: { alpha: OK },
      files: { 'scripts/rogue-check.mjs': '// 규약 밖 이름\n' },
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^PASS run-gates:/m);
    expect(r.code).toBe(0);
  });

  it('부분 문자열이 아니라 파일 이름으로 맞춘다', () => {
    // `bundle-gate.mjs`를 부르는 명령이 있으면 `e-gate.mjs`가 부분 문자열로 걸려
    // 등록된 것처럼 읽힌다 — 고아 게이트가 조용히 통과하는 자리.
    const dir = tree({
      gates: [ROW('bundle', 'bundle')],
      scripts: { bundle: 'node scripts/bundle-gate.mjs' },
      files: {
        'scripts/bundle-gate.mjs': '// 등록됨\n',
        'scripts/e-gate.mjs': '// 고아\n',
      },
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.out).toContain('e-gate.mjs');
    expect(r.code).toBe(1);
  });
});

describe('run-gates — 큰 출력을 버리지 않는다', () => {
  it('실패한 게이트가 64KB를 넘게 써도 결정적인 줄이 남는다', () => {
    // 파이프로 캡처하면 `bun run`이 약 64KB에서 조용히 자른다(실측: 2MB -> 65,697바이트).
    // 실패한 게이트의 결정적인 줄은 보통 출력의 끝에 있어 정확히 그 자리가 위험하다.
    const LOUD =
      "node -e \"process.stdout.write('x'.repeat(2*1024*1024)+'\\nDECISIVE-LINE\\n'); process.exit(1)\"";
    const dir = tree({ gates: [ROW('loud', 'loud')], scripts: { loud: LOUD } });
    const r = run(['--dir', dir]);
    expect(r.out).toContain('DECISIVE-LINE');
    expect(r.out.length).toBeGreaterThan(1024 * 1024);
    expect(r.code).toBe(1);
  });
});

describe('run-gates — 표와 레지스트리는 id만이 아니라 완료 의미까지 맞는다', () => {
  it('kind가 표와 레지스트리에서 다르면 실패한다', () => {
    // 이것이 없으면 한쪽이 advisory, 다른 쪽이 hard인 채로 초록이 나고
    // 그 모순을 코어와 README가 옮겨 적는다.
    const dir = tree({
      gates: [ROW('alpha', 'alpha', { kind: 'advisory' })],
      scripts: { alpha: OK },
      table: [{ id: 'alpha', command: 'bun run alpha', kind: 'hard', na: 'never' }],
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('명령이 표와 레지스트리에서 다르면 실패한다', () => {
    const dir = tree({
      gates: [ROW('alpha', 'alpha')],
      scripts: { alpha: OK },
      table: [{ id: 'alpha', command: 'bun run something-else', kind: 'hard', na: 'never' }],
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('N/A 조건이 표와 레지스트리에서 다르면 실패한다', () => {
    const dir = tree({
      gates: [ROW('alpha', 'alpha')],
      scripts: { alpha: OK },
      table: [{ id: 'alpha', command: 'bun run alpha', kind: 'hard', na: '산출물 없음' }],
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('needs가 표와 레지스트리에서 다르면 실패한다', () => {
    // 이 칸을 대조하지 않으면 레지스트리에서 `needs: build`를 `-`로 되돌려도 네 자리가 초록이고,
    // 그 게이트는 러너가 넘기는 회차 경로 대신 기본 경로의 **낡은 산출물**을 잰다 — D4a가
    // 없애러 온 형태가 그 문으로 되돌아온다(릴리스 r1 F1).
    const dir = tree({
      gates: [ROW('base', 'base'), ROW('consumer', 'consumer', { needs: 'base' })],
      scripts: { base: OK, consumer: OK },
      table: [
        { id: 'base', command: 'bun run base', kind: 'hard', needs: '-', na: 'never' },
        { id: 'consumer', command: 'bun run consumer', kind: 'hard', needs: '-', na: 'never' },
      ],
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.out).toContain('needs');
    expect(r.code).toBe(1);
  });

  it('표가 needs를 주장하는데 레지스트리는 아니어도 실패한다', () => {
    const dir = tree({
      gates: [ROW('base', 'base'), ROW('consumer', 'consumer')],
      scripts: { base: OK, consumer: OK },
      table: [
        { id: 'base', command: 'bun run base', kind: 'hard', needs: '-', na: 'never' },
        { id: 'consumer', command: 'bun run consumer', kind: 'hard', needs: 'base', na: 'never' },
      ],
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('CI가 표에서는 no인데 레지스트리에서는 yes면 실패한다', () => {
    // 사람이 읽는 표가 "CI가 돌지 않는다"고 말하는 동안 CI는 그것을 돌고 있다.
    const dir = tree({
      gates: [ROW('alpha', 'alpha', { ci: 'yes' })],
      scripts: { alpha: OK, 'gate:ci': CI_OK },
      table: [{ id: 'alpha', command: 'bun run alpha', kind: 'hard', ci: 'no — 픽스처', na: 'never' }],
      files: {
        '.github/workflows/gate.yml': `${WF_ON}jobs:\n  g:\n    steps:\n      - run: bun run gate:ci\n`,
      },
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('CI가 표에서는 yes인데 레지스트리에서는 no면 실패한다', () => {
    // 이 방향이 더 위험하다: 표가 "CI가 잡아 준다"고 말하는데 실제로는 아무도 돌지 않는다.
    const dir = tree({
      gates: [ROW('alpha', 'alpha')],
      scripts: { alpha: OK },
      table: [{ id: 'alpha', command: 'bun run alpha', kind: 'hard', ci: 'yes', na: 'never' }],
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('ci: no인 행이 표에 이유를 적지 않으면 실패한다', () => {
    // CI에서 빼는 것은 예외이고 예외에는 근거가 붙는다. 근거 없는 `no`가 통과하면
    // 게이트를 CI 밖으로 옮기는 일이 아무 흔적도 남기지 않는다.
    const dir = tree({
      gates: [ROW('alpha', 'alpha')],
      scripts: { alpha: OK },
      table: [{ id: 'alpha', command: 'bun run alpha', kind: 'hard', ci: 'no', na: 'never' }],
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('ci: no인 행이 이유를 적으면 통과한다', () => {
    const dir = tree({
      gates: [ROW('alpha', 'alpha')],
      scripts: { alpha: OK },
      table: [
        { id: 'alpha', command: 'bun run alpha', kind: 'hard', ci: 'no — 실제 크롬을 띄운다', na: 'never' },
      ],
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^PASS run-gates:/m);
    expect(r.code).toBe(0);
  });

  it('표의 CI 칸이 yes/no가 아니면 실패한다', () => {
    const dir = tree({
      gates: [ROW('alpha', 'alpha')],
      scripts: { alpha: OK },
      table: [{ id: 'alpha', command: 'bun run alpha', kind: 'hard', ci: '아마도', na: 'never' }],
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });
});

describe('run-gates — 게이트가 판정을 어떻게 말하는가', () => {
  it('token 게이트가 FAIL을 찍고 0으로 끝나면 FAIL이다', () => {
    // 종료 코드만 보면 PASS다. 이 대조가 없으면 게이트가 자기 실패를 삼킬 수 있다.
    const dir = tree({
      gates: [ROW('alpha', 'alpha', { verdict: 'token' })],
      scripts: { alpha: says('FAIL', 'alpha', 0) },
    });
    const r = run(['--dir', dir]);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('token 게이트가 아무 상태도 찍지 않으면 FAIL이다', () => {
    const dir = tree({
      gates: [ROW('alpha', 'alpha', { verdict: 'token' })],
      scripts: { alpha: OK },
    });
    const r = run(['--dir', dir]);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('token 게이트가 PASS를 찍고 0으로 끝나면 통과한다', () => {
    const dir = tree({
      gates: [ROW('alpha', 'alpha', { verdict: 'token' })],
      scripts: { alpha: says('PASS', 'alpha', 0) },
    });
    const r = run(['--dir', dir]);
    expect(r.out).toMatch(/^PASS run-gates:/m);
    expect(r.code).toBe(0);
  });

  it('na: never인 행이 N/A를 찍으면 FAIL이다', () => {
    // 레지스트리가 "이 행은 절대 N/A가 될 수 없다"고 선언했는데 런타임이 토큰을 받아들이면
    // 게이트가 스스로 필수 검사를 건너뛸 수 있다. 선언과 실행이 갈라서는 자리다.
    const dir = tree({
      gates: [ROW('alpha', 'alpha', { verdict: 'token' })],
      scripts: { alpha: says('N/A', 'alpha', 0) },
    });
    const r = run(['--dir', dir]);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('선행을 만족시키는 것은 PASS뿐이다 — 실패한 선행은 뒤를 풀어 주지 않는다', () => {
    // "잴 대상이 없었다"가 "확인됐다"와 같은 값을 가지면 판정을 넷으로 나눈 이유가 사라진다.
    const dir = tree({
      gates: [ROW('first', 'first', { verdict: 'token' }), ROW('second', 'second', { needs: 'first' })],
      scripts: { first: says('FAIL', 'first', 1), second: OK },
    });
    const r = run(['--dir', dir]);
    expect(r.out).toMatch(/^BLOCKED second/m);
    expect(r.code).toBe(1);
  });

  it('exit 게이트에는 상태 줄을 요구하지 않는다', () => {
    // tsc·vitest·wxt는 이 저장소가 만든 것이 아니다. 요구하면 게이트마다 래퍼가 생긴다.
    const dir = tree({ gates: [ROW('alpha', 'alpha')], scripts: { alpha: OK } });
    const r = run(['--dir', dir]);
    expect(r.out).toMatch(/^PASS run-gates:/m);
    expect(r.code).toBe(0);
  });

  it('verdict 값이 exit/token이 아니면 실패한다', () => {
    const dir = tree({
      gates: [ROW('alpha', 'alpha', { verdict: 'vibes' })],
      scripts: { alpha: OK },
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });
});

describe('run-gates — 선행이 무너지면 BLOCKED다', () => {
  it('선행이 실패하면 뒤 게이트는 BLOCKED이고 돌지 않는다', () => {
    const dir = tree({
      gates: [ROW('first', 'first'), ROW('second', 'second', { needs: 'first' })],
      scripts: { first: BAD, second: OK },
    });
    const r = run(['--dir', dir]);
    expect(r.out).toMatch(/^BLOCKED second/m);
    expect(r.out).not.toMatch(/^PASS second/m);
    expect(r.code).toBe(1);
  });

  it('선행이 통과하면 뒤 게이트가 돈다', () => {
    const dir = tree({
      gates: [ROW('first', 'first'), ROW('second', 'second', { needs: 'first' })],
      scripts: { first: OK, second: OK },
    });
    const r = run(['--dir', dir]);
    expect(r.out).toMatch(/^PASS second/m);
    expect(r.code).toBe(0);
  });

  it('needs가 뒤 게이트를 가리키면 실패한다', () => {
    // 뒤를 가리키면 그 선행이 아직 돌지 않아 판정을 알 수 없다. 순환도 이 규칙 하나로 막힌다.
    const dir = tree({
      gates: [ROW('first', 'first', { needs: 'second' }), ROW('second', 'second')],
      scripts: { first: OK, second: OK },
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('없는 게이트를 needs로 가리키면 실패한다', () => {
    const dir = tree({
      gates: [ROW('alpha', 'alpha', { needs: 'ghost' })],
      scripts: { alpha: OK },
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });
});

describe('run-gates — CI는 러너를 한 번 부른다', () => {
  const CI_WF = (body) => ({ '.github/workflows/gate.yml': `${WF_ON}jobs:\n  g:\n    steps:\n${body}` });

  it('워크플로가 gate:ci 하나만 부르면 통과한다', () => {
    const dir = tree({
      gates: [ROW('alpha', 'alpha', { ci: 'yes' })],
      scripts: { alpha: OK, 'gate:ci': CI_OK },
      files: CI_WF('      - run: bun run gate:ci\n'),
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^PASS run-gates:/m);
    expect(r.code).toBe(0);
  });

  it('워크플로가 게이트를 직접 부르면 실패한다', () => {
    // 직접 부르면 선행 관계가 무너져 산출물을 읽는 게이트가 각자 빌드하거나 낡은 것을 쓴다 —
    // 티켓 02가 없애러 온 결함이 CI 쪽 문으로 들어온다.
    const dir = tree({
      gates: [ROW('alpha', 'alpha', { ci: 'yes' })],
      scripts: { alpha: OK, 'gate:ci': CI_OK },
      files: CI_WF('      - run: bun run gate:ci\n      - run: bun run alpha\n'),
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.out).toContain('alpha');
    expect(r.code).toBe(1);
  });

  it('주석 처리된 명령은 실행된 것으로 세지 않는다', () => {
    // 세면 비활성화된 명령이 "실행됨"으로 읽혀 CI 일치가 거짓 초록이 된다.
    const dir = tree({
      gates: [ROW('alpha', 'alpha', { ci: 'yes' })],
      scripts: { alpha: OK, 'gate:ci': CI_OK },
      files: CI_WF('      # - run: bun run gate:ci\n      - run: bun run gate:ci\n'),
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^PASS run-gates:/m);
    expect(r.code).toBe(0);
  });

  it('주석만 남고 실제 호출이 없으면 실패한다', () => {
    const dir = tree({
      gates: [ROW('alpha', 'alpha', { ci: 'yes' })],
      scripts: { alpha: OK, 'gate:ci': CI_OK },
      files: CI_WF('      # - run: bun run gate:ci\n'),
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('gate:ci가 러너를 부르지 않는 no-op이면 실패한다', () => {
    // 이름표만 검사하면 아무 게이트도 돌리지 않는 워크플로가 CI 일치를 통과한다.
    const dir = tree({
      gates: [ROW('alpha', 'alpha', { ci: 'yes' })],
      scripts: { alpha: OK, 'gate:ci': OK },
      files: CI_WF('      - run: bun run gate:ci\n'),
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('gate:ci가 --ci 없이 러너를 부르면 실패한다', () => {
    const dir = tree({
      gates: [ROW('alpha', 'alpha', { ci: 'yes' })],
      scripts: { alpha: OK, 'gate:ci': 'node scripts/run-gates.mjs' },
      files: CI_WF('      - run: bun run gate:ci\n'),
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('조건부 단계가 있으면 실패한다 (판정할 수 없는 모양을 거절한다)', () => {
    const dir = tree({
      gates: [ROW('alpha', 'alpha', { ci: 'yes' })],
      scripts: { alpha: OK, 'gate:ci': CI_OK },
      files: CI_WF('      - if: false\n        run: bun run gate:ci\n'),
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('continue-on-error 단계가 있으면 실패한다', () => {
    const dir = tree({
      gates: [ROW('alpha', 'alpha', { ci: 'yes' })],
      scripts: { alpha: OK, 'gate:ci': CI_OK },
      files: CI_WF('      - run: bun run gate:ci\n        continue-on-error: true\n'),
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('echo로 흉내 낸 호출은 실행으로 세지 않는다', () => {
    const dir = tree({
      gates: [ROW('alpha', 'alpha', { ci: 'yes' })],
      scripts: { alpha: OK, 'gate:ci': CI_OK },
      files: CI_WF('      - run: echo "bun run gate:ci"\n'),
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('진입점에 접미 인자가 붙으면 실패한다 — --check-only', () => {
    // bun이 인자를 전달하므로 `--ci --check-only`가 되어 게이트를 0개 돌고 exit 0을 낸다.
    // 부분 문자열로 보면 이 워크플로가 CI 일치를 통과한다 — 영구 초록 CI가 세워지는 자리.
    const dir = tree({
      gates: [ROW('alpha', 'alpha', { ci: 'yes' })],
      scripts: { alpha: OK, 'gate:ci': CI_OK },
      files: CI_WF('      - run: bun run gate:ci --check-only\n'),
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('진입점에 접미 인자가 붙으면 실패한다 — --help', () => {
    const dir = tree({
      gates: [ROW('alpha', 'alpha', { ci: 'yes' })],
      scripts: { alpha: OK, 'gate:ci': CI_OK },
      files: CI_WF('      - run: bun run gate:ci --help\n'),
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('셸 연산자로 실패를 가리면 실패한다 — || true', () => {
    const dir = tree({
      gates: [ROW('alpha', 'alpha', { ci: 'yes' })],
      scripts: { alpha: OK, 'gate:ci': CI_OK },
      files: CI_WF('      - run: bun run gate:ci || true\n'),
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('gate:ci 스크립트에 군더더기가 붙으면 실패한다', () => {
    const dir = tree({
      gates: [ROW('alpha', 'alpha', { ci: 'yes' })],
      scripts: { alpha: OK, 'gate:ci': 'node scripts/run-gates.mjs --ci --check-only' },
      files: CI_WF('      - run: bun run gate:ci\n'),
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('ci: yes인 게이트의 선행이 ci: no면 실패한다', () => {
    // 선행이 CI 집합에서 빠지면 그 판정이 없어져 소비자가 선행이 없는 것처럼 돈다 —
    // DAG가 CI에서만 조용히 사라진다.
    const dir = tree({
      gates: [ROW('base', 'base'), ROW('consumer', 'consumer', { ci: 'yes', needs: 'base' })],
      scripts: { base: OK, consumer: OK, 'gate:ci': CI_OK },
      files: CI_WF('      - run: bun run gate:ci\n'),
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.out).toContain('base');
    expect(r.code).toBe(1);
  });

  it('선행까지 ci: yes면 통과한다', () => {
    const dir = tree({
      gates: [ROW('base', 'base', { ci: 'yes' }), ROW('consumer', 'consumer', { ci: 'yes', needs: 'base' })],
      scripts: { base: OK, consumer: OK, 'gate:ci': CI_OK },
      files: CI_WF('      - run: bun run gate:ci\n'),
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^PASS run-gates:/m);
    expect(r.code).toBe(0);
  });

  it('--ci 는 ci: yes 인 행만 돌린다', () => {
    const dir = tree({
      gates: [ROW('inci', 'inci', { ci: 'yes' }), ROW('local', 'local')],
      scripts: { inci: OK, local: BAD, 'gate:ci': CI_OK },
      files: CI_WF('      - run: bun run gate:ci\n'),
    });
    const r = run(['--dir', dir, '--ci']);
    expect(r.out).toMatch(/^PASS inci/m);
    expect(r.out).not.toContain('local');
    expect(r.code).toBe(0);
  });

  it('--ci 가 게이트를 0개 고르면 실패한다 — 아무것도 돌리지 않은 초록은 통과가 아니다', () => {
    // `--ci`를 부르는 것은 CI뿐이고, CI가 게이트를 0개 도는 상태는 설정 오류이지 결과가
    // 아니다. 여기가 초록이면 모든 행을 `ci: no`로 되돌리는 커밋 하나로 CI가 영구 초록이
    // 되면서 아무것도 재지 않는다.
    const dir = tree({
      gates: [ROW('local', 'local')],
      scripts: { local: OK, 'gate:ci': CI_OK },
    });
    const r = run(['--dir', dir, '--ci']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('--ci --check-only 도 0개면 실패한다 — 설정 오류는 돌리지 않아도 이미 참이다', () => {
    const dir = tree({
      gates: [ROW('local', 'local')],
      scripts: { local: OK, 'gate:ci': CI_OK },
    });
    const r = run(['--dir', dir, '--ci', '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('pull_request 트리거가 없으면 실패한다 — 존재하되 아무 변경에도 돌지 않는다', () => {
    // 무엇을 돌리는지를 아무리 정확히 묶어도 트리거를 놓으면 아무것도 묶이지 않는다.
    // 실측: `on:`을 `workflow_dispatch:`로 바꿔도 다른 검사는 전부 초록이었다.
    const dir = tree({
      gates: [ROW('alpha', 'alpha', { ci: 'yes' })],
      scripts: { alpha: OK, 'gate:ci': CI_OK },
      files: {
        '.github/workflows/gate.yml':
          'on:\n  workflow_dispatch:\njobs:\n  g:\n    steps:\n      - run: bun run gate:ci\n',
      },
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('주석에 적힌 트리거는 트리거가 아니다', () => {
    const dir = tree({
      gates: [ROW('alpha', 'alpha', { ci: 'yes' })],
      scripts: { alpha: OK, 'gate:ci': CI_OK },
      files: {
        '.github/workflows/gate.yml':
          '# pull_request:\non:\n  workflow_dispatch:\njobs:\n  g:\n    steps:\n      - run: bun run gate:ci\n',
      },
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('인라인 목록 트리거도 인정한다 — on: [push, pull_request]', () => {
    const dir = tree({
      gates: [ROW('alpha', 'alpha', { ci: 'yes' })],
      scripts: { alpha: OK, 'gate:ci': CI_OK },
      files: {
        '.github/workflows/gate.yml':
          'on: [push, pull_request]\njobs:\n  g:\n    steps:\n      - run: bun run gate:ci\n',
      },
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^PASS run-gates:/m);
    expect(r.code).toBe(0);
  });

  it('경로 필터가 있으면 실패한다 — 무엇이 걸러지는지 판정할 수 없다', () => {
    // `paths-ignore` 한 줄이면 게이트가 사실상 꺼지는데 워크플로는 존재하고 이름도 맞는다.
    const dir = tree({
      gates: [ROW('alpha', 'alpha', { ci: 'yes' })],
      scripts: { alpha: OK, 'gate:ci': CI_OK },
      files: {
        '.github/workflows/gate.yml':
          'on:\n  pull_request:\n    paths-ignore: ["**"]\njobs:\n  g:\n    steps:\n      - run: bun run gate:ci\n',
      },
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('워크플로는 남았는데 ci: yes인 행이 없으면 실패한다', () => {
    // CI를 되돌리는 커밋이 **레지스트리만** 손대고 워크플로를 그대로 두는 모양. 이 분기가
    // 없으면 워크플로가 매 푸시마다 0개를 돌면서 초록을 낸다. 산문으로만 서 있던 자리다.
    const dir = tree({
      gates: [ROW('local', 'local')],
      scripts: { local: OK, 'gate:ci': CI_OK },
      files: CI_WF('      - run: bun run gate:ci\n'),
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });
});

// ── D4a: 산출물을 읽는 게이트가 이 회차의 빌드만 본다 (티켓 02) ─────────────────

/**
 * 픽스처의 가짜 빌드. 러너가 재지정한 디렉터리의 chrome-mv3/에 소스 파일
 * (src-marker.txt)의 **현재** 내용과 자기 pid를 굽고, 호출 사실을 build-log.txt에
 * 남긴다. 재지정 없이 불리면 아무것도 굽지 않는다 — 소비자 없는 회차의 모양.
 */
const BUILD_MJS = `
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const out = process.env.HK_BUILD_OUT_DIR ?? null;
appendFileSync('build-log.txt', JSON.stringify({ out, pid: process.pid }) + '\\n');
if (out) {
  const dir = join(out, 'chrome-mv3');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'marker.txt'), readFileSync('src-marker.txt', 'utf8'));
  writeFileSync(join(dir, 'round.txt'), String(process.pid));
}
`;

/**
 * 픽스처의 가짜 소비자. 자기 회차의 산출물이 없으면 FAIL, 산출물이 소스보다 낡았으면
 * FAIL — 신선도를 스스로 재는 소비자라, 러너가 낡은 경로를 넘기는 순간 여기서 걸린다.
 *
 * 무엇을 쟀는지는 consumer-log.txt에 남긴다. 러너는 **통과한 게이트의 출력을 버리는
 * 것이 계약**이라(증거는 실패에만 남는다), 소비자가 받은 경로는 stdout이 아니라
 * 트리 안 파일에서 읽어야 한다.
 */
const CONSUMER_MJS = `
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const i = process.argv.indexOf('--artifacts');
const dir = i === -1 ? join('.output', 'chrome-mv3') : process.argv[i + 1];
if (!existsSync(join(dir, 'marker.txt'))) {
  console.log('FAIL consumer: 이 회차의 빌드 산출물이 없다: ' + dir);
  process.exit(1);
}
const got = readFileSync(join(dir, 'marker.txt'), 'utf8');
const want = readFileSync('src-marker.txt', 'utf8');
if (got !== want) {
  console.log('FAIL consumer: 낡은 산출물을 쟀다 (산출물 "' + got + '" vs 소스 "' + want + '")');
  process.exit(1);
}
appendFileSync('consumer-log.txt', JSON.stringify({ dir, round: readFileSync(join(dir, 'round.txt'), 'utf8') }) + '\\n');
console.log('PASS consumer: 이 회차의 산출물을 쟀다');
`;

/** build + 소비자(needs: build) 두 행짜리 기본 D4a 픽스처. files는 기본 위에 덮인다. */
function d4aTree(over = {}) {
  const { files = {}, ...rest } = over;
  return tree({
    gates: [ROW('build', 'build'), ROW('consumer', 'consumer', { needs: 'build', verdict: 'token' })],
    scripts: { build: 'node build.mjs', consumer: 'node consumer.mjs' },
    files: {
      'build.mjs': BUILD_MJS,
      'consumer.mjs': CONSUMER_MJS,
      'src-marker.txt': 'v1',
      ...files,
    },
    ...rest,
  });
}

/** 러너를 비동기로 띄운다 — 겹친 실행과 도중 죽이기는 동기 실행으로는 만들 수 없다. */
function runAsync(args) {
  return new Promise((resolve) => {
    const child = spawn('node', [RUNNER, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (code) => resolve({ code, out }));
  });
}

async function waitFor(cond, { tries = 200, delay = 50 } = {}) {
  for (let i = 0; i < tries; i += 1) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, delay));
  }
  throw new Error('waitFor: 조건이 시간 안에 참이 되지 않았다');
}

const jsonLines = (dir, file) =>
  readFileSync(join(dir, file), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
const buildLog = (dir) => jsonLines(dir, 'build-log.txt');
const consumerLog = (dir) => jsonLines(dir, 'consumer-log.txt');

describe('run-gates — 회차별 산출물 디렉터리 (D4a)', () => {
  it('회차마다 고유한 디렉터리에 빌드하고 그 경로를 소비자에게 넘긴다 — 빌드는 한 번만', () => {
    const dir = d4aTree();
    const r1 = run(['--dir', dir]);
    expect(r1.out).toMatch(/^PASS consumer/m);
    expect(r1.code).toBe(0);

    const r2 = run(['--dir', dir]);
    expect(r2.out).toMatch(/^PASS consumer/m);

    const log = buildLog(dir);
    const seen = consumerLog(dir);
    expect(log).toHaveLength(2); // 회차당 빌드 한 번
    expect(seen).toHaveLength(2);
    // 회차마다 다른 디렉터리 — 같은 경로를 다시 쓰면 겹친 실행이 섞일 트리가 생긴다.
    expect(seen[1].dir).not.toBe(seen[0].dir);
    // 소비자가 받은 경로는 그 회차의 빌드가 재지정받은 디렉터리 아래다.
    expect(seen[0].dir.startsWith(log[0].out)).toBe(true);
    expect(seen[1].dir.startsWith(log[1].out)).toBe(true);
  });

  it('빌드가 실패하면 소비자는 BLOCKED다 — FAIL도 N/A도 아니다', () => {
    const dir = d4aTree({ files: { 'build.mjs': 'process.exit(1)' } });
    const r = run(['--dir', dir]);
    expect(r.out).toMatch(/^BLOCKED consumer — 선행 build이 FAIL/m);
    expect(r.out).not.toMatch(/^N\/A consumer/m);
    expect(r.out).not.toMatch(/^PASS consumer/m);
    expect(r.code).toBe(1);
  });

  it('낡은 산출물이 통과를 만들지 못한다 — 소스를 바꾸고 빌드를 막으면 소비자가 돌지 않는다', () => {
    // 직전 회차가 기본 경로에 남긴 산출물(v1) + 그 뒤 바뀐 소스(v2) + 막힌 빌드.
    // 고정 경로 설계였다면 소비자가 v1을 재고 초록을 냈을 자리다.
    const dir = d4aTree({
      files: {
        'src-marker.txt': 'v2-new-source',
        '.output/chrome-mv3/marker.txt': 'v1-stale',
        '.output/chrome-mv3/round.txt': 'stale',
        'build.mjs': 'process.exit(1)',
      },
    });
    const r = run(['--dir', dir]);
    expect(r.out).not.toMatch(/^PASS consumer/m);
    expect(r.out).toMatch(/^BLOCKED consumer/m);
    expect(r.code).toBe(1);
  });

  it('빌드가 성공했는데 산출물이 없으면 소비자는 FAIL이고 사유가 그것을 말한다 — N/A가 아니다', () => {
    // 대상이 없는 것(N/A)과 대상을 만들지 못한 것(FAIL)은 다르다.
    const dir = d4aTree({ files: { 'build.mjs': 'process.exit(0)' } });
    const r = run(['--dir', dir]);
    expect(r.out).toMatch(/^FAIL consumer/m);
    expect(r.out).toContain('이 회차의 빌드 산출물이 없다');
    expect(r.out).not.toMatch(/^N\/A consumer/m);
    expect(r.code).toBe(1);
  });

  it('needs: build인 게이트가 하나도 안 돌면 산출물 배관이 서지 않는다', () => {
    // build는 여느 게이트로 돌되, 회차 디렉터리도 재지정도 없어야 한다.
    const dir = tree({
      gates: [ROW('build', 'build'), ROW('other', 'other')],
      scripts: { build: 'node build.mjs', other: OK },
      files: { 'build.mjs': BUILD_MJS, 'src-marker.txt': 'v1' },
    });
    const r = run(['--dir', dir]);
    expect(r.out).toMatch(/^PASS build/m);
    expect(r.code).toBe(0);
    const log = buildLog(dir);
    expect(log).toHaveLength(1);
    expect(log[0].out).toBeNull();
  });
});

describe('run-gates — 겹친 실행은 경로 분리로 격리된다 (D4a)', () => {
  /** 빌드 구간을 늘려 두 러너가 그 안에서 겹치게 만든다. */
  const SLOW_BUILD_MJS = BUILD_MJS.replace(
    'if (out) {',
    'await new Promise((r) => setTimeout(r, 1500));\nif (out) {',
  );

  it('겹친 두 러너가 서로 다른 디렉터리를 쓰고 각자 자기 회차의 빌드만 잰다', async () => {
    const dir = d4aTree({ files: { 'build.mjs': SLOW_BUILD_MJS } });
    const a = runAsync(['--dir', dir]);
    await waitFor(() => existsSync(join(dir, 'build-log.txt'))); // A가 빌드 구간에 들어갔다
    const b = runAsync(['--dir', dir]);
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.code).toBe(0);
    expect(rb.code).toBe(0);
    expect(ra.out).toMatch(/^PASS consumer/m);
    expect(rb.out).toMatch(/^PASS consumer/m);

    const builds = buildLog(dir);
    const seen = consumerLog(dir);
    expect(builds).toHaveLength(2);
    expect(seen).toHaveLength(2);
    expect(seen[0].dir).not.toBe(seen[1].dir); // 서로 다른 디렉터리
    expect(seen[0].round).not.toBe(seen[1].round); // 서로 다른 회차의 빌드를 쟀다
    // 각 소비자가 잰 것이 정확히 **자기 회차의** 빌드다 — 경로와 pid가 함께 맞는다.
    for (const s of seen) {
      const producer = builds.find((b) => String(b.pid) === s.round);
      expect(producer).toBeDefined();
      expect(s.dir.startsWith(producer.out)).toBe(true);
    }
  }, 30000);

  /**
   * 죽은 러너의 빌드 자식이 계속 쓰는 시나리오. slow-build 파일이 있으면: 자기 산출물
   * 디렉터리에 6초간 계속 쓰는 **떨어져 나간 자식**을 남기고 오래 잔다 — 러너를 여기서
   * 죽이면 자식들이 살아남는다. 잠금 설계였다면 "소유자가 죽었다 = 회수해도 된다"로
   * 읽혀 정확히 뚫렸을 모양이다.
   */
  const KILLABLE_BUILD_MJS = `
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
const out = process.env.HK_BUILD_OUT_DIR ?? null;
appendFileSync('build-log.txt', JSON.stringify({ out, pid: process.pid }) + '\\n');
if (out && existsSync('slow-build')) {
  const w = spawn(process.execPath, ['orphan-writer.mjs', join(out, 'chrome-mv3')], { detached: true, stdio: 'ignore' });
  w.unref();
  appendFileSync('orphan-pids.txt', process.pid + '\\n' + w.pid + '\\n');
  await new Promise((r) => setTimeout(r, 8000));
}
if (out) {
  const dir = join(out, 'chrome-mv3');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'marker.txt'), readFileSync('src-marker.txt', 'utf8'));
  writeFileSync(join(dir, 'round.txt'), String(process.pid));
}
`;

  const ORPHAN_WRITER_MJS = `
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const dir = process.argv[2];
const until = Date.now() + 6000;
(function tick() {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'marker.txt'), 'orphan-garbage-' + Date.now());
  if (Date.now() < until) setTimeout(tick, 50);
})();
`;

  it('빌드 도중 죽은 러너의 자식이 계속 써도 다음 회차는 전혀 영향받지 않는다', async () => {
    const dir = d4aTree({
      files: {
        'build.mjs': KILLABLE_BUILD_MJS,
        'orphan-writer.mjs': ORPHAN_WRITER_MJS,
        'slow-build': 'x',
      },
    });
    const childA = spawn('node', [RUNNER, '--dir', dir], { stdio: 'ignore' });
    try {
      // A의 빌드가 고아 자식을 남길 때까지 기다렸다가 **러너만** 죽인다.
      await waitFor(() => existsSync(join(dir, 'orphan-pids.txt')));
      childA.kill('SIGKILL');
      rmSync(join(dir, 'slow-build'));

      // 두 번째 회차 — A의 고아가 A의 디렉터리에 아직 쓰는 동안 돈다.
      const rb = run(['--dir', dir]);
      expect(rb.out).toMatch(/^PASS consumer/m);
      expect(rb.code).toBe(0);

      const log = buildLog(dir);
      const seen = consumerLog(dir); // A는 소비자까지 못 갔다 — B의 것 하나뿐
      // 죽은 A의 회차 디렉터리는 러너가 못 치웠다 — 단언이 던져도 새지 않게 먼저 등록한다.
      if (log[0]?.out) made.push(log[0].out);
      expect(log).toHaveLength(2);
      expect(seen).toHaveLength(1);
      expect(log[1].out).not.toBe(log[0].out); // B는 A의 디렉터리를 쓰지 않았다
      expect(seen[0].dir.startsWith(log[1].out)).toBe(true); // B의 소비자는 B의 산출물만 쟀다
    } finally {
      childA.kill('SIGKILL');
      if (existsSync(join(dir, 'orphan-pids.txt'))) {
        for (const pid of readFileSync(join(dir, 'orphan-pids.txt'), 'utf8').trim().split('\n')) {
          try {
            process.kill(Number(pid), 'SIGKILL');
          } catch {
            // 이미 죽었다
          }
        }
      }
    }
  }, 30000);
});

describe('산출물 소비 게이트 스크립트 — 인자와 판정 (실제 빌드 없이)', () => {
  const SCRIPTS_DIR = dirname(RUNNER);
  const REPO = join(SCRIPTS_DIR, '..');

  function runScript(script, args, cwd) {
    try {
      const out = execFileSync('node', [join(SCRIPTS_DIR, script), ...args], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 64 * 1024 * 1024,
      });
      return { code: 0, out };
    } catch (e) {
      return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
    }
  }

  it('bundle-gate: --artifacts가 가리키는 곳에 산출물이 없으면 FAIL이고 사유가 경로를 말한다', () => {
    const empty = mkdtempSync(join(tmpdir(), 'hk-empty-'));
    made.push(empty);
    const r = runScript('bundle-gate.mjs', ['--artifacts', join(empty, 'nope')], REPO);
    expect(r.out).toMatch(/^FAIL bundle-gate:/m);
    expect(r.out).toContain('nope');
    expect(r.out).not.toMatch(/^N\/A bundle-gate:/m);
    expect(r.code).toBe(1);
  });

  it('bundle-gate: 알 수 없는 인자를 거절한다', () => {
    // 오타(--artifact)가 조용히 기본 경로를 재게 두면 러너가 넘긴 경로가 사라진다.
    const r = runScript('bundle-gate.mjs', ['--artifact', '/tmp/x'], REPO);
    expect(r.out).toMatch(/^FAIL bundle-gate:/m);
    expect(r.code).toBe(1);
  });

  it('bundle-gate: --artifacts가 두 번 오면 거절한다', () => {
    // 말없이 마지막 값을 고르면 어느 쪽을 쟀는지가 호출 문면에서 읽히지 않는다.
    const r = runScript('bundle-gate.mjs', ['--artifacts', '/tmp/a', '--artifacts', '/tmp/b'], REPO);
    expect(r.out).toMatch(/^FAIL bundle-gate:/m);
    expect(r.out).toContain('두 번');
    expect(r.code).toBe(1);
  });

  it('bundle-gate: 인자가 없으면 기본 경로를 본다 — 손으로 돌리던 방식이 깨지지 않는다', () => {
    const empty = mkdtempSync(join(tmpdir(), 'hk-cwd-'));
    made.push(empty);
    const r = runScript('bundle-gate.mjs', [], empty);
    expect(r.out).toContain(join('.output', 'chrome-mv3'));
    expect(r.code).toBe(1); // 빈 트리 — 그 사실을 기본 경로에 대해 말한다
  });

  it('bundle-gate: 픽스처 산출물 트리로 실제 빌드 없이 통과가 성립한다', () => {
    const art = mkdtempSync(join(tmpdir(), 'hk-art-'));
    made.push(art);
    mkdirSync(join(art, 'chunks'), { recursive: true });
    writeFileSync(join(art, 'popup.html'), '<script type="module" src="/chunks/entry.js"></script>');
    writeFileSync(join(art, 'chunks', 'entry.js'), 'console.log("hi")');
    // 지연 계약 청크 — 존재하되 즉시 집합에 없어야 통과한다.
    for (const p of ['sortable-profile-list', 'motion', 'suggest-autocomplete', 'rule-form']) {
      writeFileSync(join(art, 'chunks', `${p}-x.js`), '// deferred');
    }
    const r = runScript('bundle-gate.mjs', ['--artifacts', art], REPO);
    expect(r.out).toMatch(/^PASS bundle-gate:/m);
    expect(r.code).toBe(0);
  });

  /** writer-lane-gate는 cwd의 src/도 읽는다 — 소스와 산출물을 함께 갖춘 픽스처 트리. */
  function laneTree() {
    const dir = mkdtempSync(join(tmpdir(), 'hk-lane-'));
    made.push(dir);
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(
      join(dir, 'src', 'worker.ts'),
      'const lane = createWriterLane();\nconst writer = createStateWriter(lane);\n',
    );
    const art = join(dir, 'out');
    mkdirSync(art, { recursive: true });
    writeFileSync(
      join(art, 'manifest.json'),
      JSON.stringify({ background: { service_worker: 'background.js' } }),
    );
    writeFileSync(join(art, 'background.js'), 'throw new Error("writer-lane:service-worker-only")');
    writeFileSync(join(art, 'popup.js'), 'console.log("ui")');
    return { dir, art };
  }

  it('writer-lane-gate: 픽스처 트리로 실제 빌드 없이 통과가 성립한다', () => {
    const { dir, art } = laneTree();
    const r = runScript('writer-lane-gate.mjs', ['--artifacts', art], dir);
    expect(r.out).toMatch(/^PASS writer-lane-gate:/m);
    expect(r.code).toBe(0);
  });

  it('writer-lane-gate: --artifacts가 가리키는 곳에 산출물이 없으면 FAIL이고 사유가 경로를 말한다', () => {
    const { dir } = laneTree();
    const r = runScript('writer-lane-gate.mjs', ['--artifacts', join(dir, 'nope')], dir);
    expect(r.out).toMatch(/^FAIL writer-lane-gate:/m);
    expect(r.out).toContain('nope');
    expect(r.code).toBe(1);
  });

  // `smoke`의 같은 계약은 `scripts/smoke.browser.test.mjs`가 잰다 — `browser: yes`인 게이트를
  // 부르는 파일은 이름이 `*.browser.test.mjs`여야 한다는 분류 규칙 때문이다(그 규칙의 출처는
  // 레지스트리의 `browser` 칸이고, `scripts/browser-parity.test.mjs`가 검사한다).
});

describe('run-gates — 이 저장소 자신', () => {
  /** 이 저장소의 레지스트리 행들. 위 픽스처들과 달리 여기서는 **실제 결정**을 단언한다. */
  const registry = () =>
    readFileSync(join(dirname(RUNNER), 'gates.txt'), 'utf8')
      .split('\n')
      .filter((l) => l.startsWith('gate:'))
      .map((l) => {
        const [id, script, kind, ci, needs, browser] = l
          .slice('gate:'.length)
          .split('|')
          .map((c) => c.trim());
        return { id, script, kind, ci, needs, browser };
      });

  it('이 저장소의 네 자리가 일치한다', () => {
    const r = run(['--check-only']);
    expect(r.out).toMatch(/^PASS run-gates:/m);
    expect(r.code).toBe(0);
  });

  it('CI가 도는 게이트가 실재한다 — 위 검사가 공허하지 않다', () => {
    // 이것이 없으면 모든 행이 `ci: no`인 트리에서도 네 자리 일치가 초록이고(워크플로가
    // 없는 것이 정상 통과이므로), 위 테스트는 CI 쪽 검사를 한 줄도 지나지 않는다.
    // 여기가 참인 동안은 워크플로가 사라지는 순간 네 자리 일치가 빨강이다(실측: M5).
    expect(registry().filter((g) => g.ci === 'yes').length).toBeGreaterThan(0);
  });

  it('CI가 도는 집합은 정확히 브라우저를 안 띄우는 집합이다 — 양방향으로', () => {
    // 한 방향(`browser: yes ⇒ ci: no`)이 CI가 크롬을 프로비저닝하지 않아도 되는 근거다.
    // 워크플로에 "브라우저를 받지 않는다"고 적는 것은 약속이지만 이 단언은 그 약속을
    // 필요 없게 만든다 — 고르는 집합에 브라우저 행이 없으면 받을 것도 없다.
    //
    // 반대 방향(`browser: no ⇒ ci: yes`)이 없으면 D12의 "브라우저 없이 도는 게이트를
    // **전부**"가 한쪽만 지켜진다: 새 비브라우저 게이트를 `ci: no — <아무 이유>`로 등록하면
    // CI 밖으로 조용히 빠지고 네 자리도 표도 전부 초록이다. 등식으로 못박아, 빼려면
    // 이 테스트를 함께 고치게 한다 — 그 자리가 사람이 한 번 멈추는 자리다.
    const rows = registry();
    const inCi = rows.filter((g) => g.ci === 'yes').map((g) => g.id);
    const headless = rows.filter((g) => g.browser === 'no').map((g) => g.id);
    expect(inCi).toEqual(headless);
  });

  it('산출물을 소비하는 게이트는 전부 needs: build다 — 파생으로 잰다', () => {
    // 릴리스 r1 F1: `needs`를 빠뜨린 소비자는 회차 경로 대신 기본 경로의 낡은 산출물을 잰다.
    // 소비자 목록을 손으로 적으면 그 목록이 낡으므로 **파생한다**: 게이트의 명령이 부르는
    // 스크립트에서 시작해 `scripts/` 안의 import를 전이적으로 따라가 `artifactsDirFrom`에
    // 닿으면 그 게이트는 `--artifacts`를 받는다 — 즉 산출물 소비자다.
    const read = (f) => {
      try {
        return readFileSync(join(dirname(RUNNER), f), 'utf8');
      } catch {
        return null;
      }
    };
    const consumes = (entry, seen = new Set()) => {
      if (seen.has(entry)) return false;
      seen.add(entry);
      const text = read(entry);
      if (text === null) return false;
      // 정의 파일 자신은 세지 않는다 — `tokenFail`만 쓰려고 같은 모듈을 import하는 게이트가
      // 있어서, 그 파일까지 걸어 들어가 정의를 세면 전부 소비자로 읽힌다(실측).
      if (entry !== 'artifacts-arg.mjs' && text.includes('artifactsDirFrom')) return true;
      return [...text.matchAll(/from '\.\/([\w.-]+\.mjs)'/g)].some((m) => consumes(m[1], seen));
    };
    const pkg = JSON.parse(readFileSync(join(dirname(RUNNER), '..', 'package.json'), 'utf8'));
    const derived = [];
    for (const g of registry()) {
      const cmd = pkg.scripts[g.script] ?? '';
      const files = [...cmd.matchAll(/scripts\/([\w.-]+\.mjs)/g)].map((m) => m[1]);
      if (files.some((f) => consumes(f))) derived.push(g.id);
    }
    const declared = registry()
      .filter((g) => g.needs === 'build')
      .map((g) => g.id);
    expect(derived.length).toBeGreaterThan(0);
    expect([...derived].sort()).toEqual([...declared].sort());
  });

  it('test는 CI에서 돌고 test:browser는 돌지 않는다', () => {
    // 티켓 07이 세운 분류가 여기서 실제 효과를 낸다. 브라우저 테스트가 이름을 잘못 달아
    // 브라우저 없는 집합으로 새어 들어오는 경우는 `browser-parity` 쪽이 먼저 잡고,
    // 그 검사 자신은 `bun run test`가 도므로 CI 안에 있다.
    const by = new Map(registry().map((g) => [g.id, g]));
    expect(by.get('test').ci).toBe('yes');
    expect(by.get('test-browser').ci).toBe('no');
  });
});
