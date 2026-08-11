import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
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

  // 표의 명령·kind·N/A 칸도 레지스트리와 대조되므로 기본값은 레지스트리에서 파생시킨다.
  // 어긋남을 재는 테스트만 `table`로 직접 준다.
  const derived = gates.map((g) => {
    const [id, script, kind, , , , , na] = g.split('|').map((s) => s.trim());
    return { id, command: `bun run ${script}`, kind, na };
  });
  const tableRows = table ?? derived;
  const cell = (r) => `| \`${r.id}\` | \`${r.command}\` | 임계값 | ${r.kind} | ${r.na} |`;
  // 마커 밖에 백틱 첫 칸을 가진 표를 함께 둔다 — 실제 문서의 판정 설명 표가 그렇고,
  // 그것이 게이트 행으로 읽히던 결함을 이 픽스처가 계속 재현한다.
  const decoy = '| `PASS` | 돌았고 만족했다 |\n| `N/A` | 잴 대상이 없다 |';
  const body = markers
    ? `${decoy}\n\n${TABLE_BEGIN}\n${tableRows.map(cell).join("\n")}\n${TABLE_END}`
    : `${decoy}\n\n${tableRows.map(cell).join("\n")}`;
  writeFileSync(join(dir, 'docs', 'agents', 'verification.md'), `# 검증\n\n${body}\n`);

  if (workflow) {
    mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
    writeFileSync(
      join(dir, '.github', 'workflows', 'gate.yml'),
      `jobs:\n  gate:\n    steps:\n${workflow.map((s) => `      - run: bun run ${s}\n`).join('')}`,
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
const says = (token, id, code) =>
  `node -e "console.log('${token} ${id}: detail'); process.exit(${code})"`;

const OK = 'node -e "process.exit(0)"';
const BAD = 'node -e "console.log(\'boom: the decisive line\'); process.exit(1)"';

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
      scripts: { alpha: OK, 'gate:ci': OK },
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
    writeFileSync(doc, `${readFileSync(doc, 'utf8')}\n${TABLE_BEGIN}\n| \`beta\` | x | y | z |\n${TABLE_END}\n`);
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
      'node -e "process.stdout.write(\'x\'.repeat(2*1024*1024)+\'\\nDECISIVE-LINE\\n\'); process.exit(1)"';
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

  it('token 게이트가 N/A를 찍으면 N/A이고 완료를 막지 않는다', () => {
    const dir = tree({
      gates: [ROW('alpha', 'alpha', { verdict: 'token' })],
      scripts: { alpha: says('N/A', 'alpha', 0) },
    });
    const r = run(['--dir', dir]);
    expect(r.out).toMatch(/^N\/A alpha/m);
    expect(r.out).toMatch(/^PASS run-gates:/m);
    expect(r.code).toBe(0);
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
  const CI_WF = (body) => ({ '.github/workflows/gate.yml': `jobs:\n  g:\n    steps:\n${body}` });

  it('워크플로가 gate:ci 하나만 부르면 통과한다', () => {
    const dir = tree({
      gates: [ROW('alpha', 'alpha', { ci: 'yes' })],
      scripts: { alpha: OK, 'gate:ci': OK },
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
      scripts: { alpha: OK, 'gate:ci': OK },
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
      scripts: { alpha: OK, 'gate:ci': OK },
      files: CI_WF('      # - run: bun run gate:ci\n      - run: bun run gate:ci\n'),
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^PASS run-gates:/m);
    expect(r.code).toBe(0);
  });

  it('주석만 남고 실제 호출이 없으면 실패한다', () => {
    const dir = tree({
      gates: [ROW('alpha', 'alpha', { ci: 'yes' })],
      scripts: { alpha: OK, 'gate:ci': OK },
      files: CI_WF('      # - run: bun run gate:ci\n'),
    });
    const r = run(['--dir', dir, '--check-only']);
    expect(r.out).toMatch(/^FAIL run-gates:/m);
    expect(r.code).toBe(1);
  });

  it('--ci 는 ci: yes 인 행만 돌린다', () => {
    const dir = tree({
      gates: [ROW('inci', 'inci', { ci: 'yes' }), ROW('local', 'local')],
      scripts: { inci: OK, local: BAD, 'gate:ci': OK },
      files: CI_WF('      - run: bun run gate:ci\n'),
    });
    const r = run(['--dir', dir, '--ci']);
    expect(r.out).toMatch(/^PASS inci/m);
    expect(r.out).not.toContain('local');
    expect(r.code).toBe(0);
  });
});

describe('run-gates — 이 저장소 자신', () => {
  it('이 저장소의 네 자리가 일치한다', () => {
    const r = run(['--check-only']);
    expect(r.out).toMatch(/^PASS run-gates:/m);
    expect(r.code).toBe(0);
  });
});
