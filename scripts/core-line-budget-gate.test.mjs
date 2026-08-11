// 코어 라인 예산 게이트를 **자식 프로세스로** 띄우고 종료 코드와 상태 줄만 단언한다.
// 안으로 손을 뻗을 길이 없다는 것이 이 seam의 값이다.
//
// 이 게이트가 재는 것과 재지 않는 것의 정본은 `docs/agents/verification.md`다.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runChild, tempDirs } from './test-support.mjs';

const GATE = join(dirname(fileURLToPath(import.meta.url)), 'core-line-budget-gate.mjs');
const track = tempDirs();

const BEGIN = '<!-- core:begin -->';
const END = '<!-- core:end -->';

/** `AGENTS.md` 하나짜리 픽스처 트리. 본문을 통째로 준다 — 마커도 선언도 케이스가 정한다. */
function tree(agentsMd) {
  const dir = track(mkdtempSync(join(tmpdir(), 'hk-core-')));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'AGENTS.md'), agentsMd);
  return dir;
}

/** 마커 사이에 `Target <budget> lines` 선언과 `body` 줄 수만큼의 본문을 둔 정상 모양. */
function core({ budget = 10, body = 3, declarations = null } = {}) {
  const decl = declarations ?? [`Target ${budget} lines`];
  return [
    '# fixture',
    '',
    BEGIN,
    ...decl,
    ...Array.from({ length: body }, (_, i) => `본문 ${i + 1}`),
    END,
    '',
    '바깥 줄은 세지 않는다.',
  ].join('\n');
}

const run = (dir) => runChild('node', [GATE, '--dir', dir]);

describe('core-line-budget — 예산', () => {
  it('예산 안이면 통과한다', () => {
    // 마커 사이 = 선언 1줄 + 본문 3줄 = 4줄.
    const r = run(tree(core({ budget: 10, body: 3 })));
    expect(r.out).toMatch(/^PASS core-line-budget:/m);
    expect(r.code).toBe(0);
  });

  it('예산과 정확히 같으면 통과한다 — 경계는 초과가 아니다', () => {
    const r = run(tree(core({ budget: 4, body: 3 })));
    expect(r.out).toMatch(/^PASS core-line-budget:/m);
    expect(r.code).toBe(0);
  });

  it('예산을 넘기면 실패하고, 사유가 몇 줄인지 말한다', () => {
    // 이것이 없으면 항상 로드되는 문서가 부푼 사실이 아무 데도 나타나지 않는다.
    const r = run(tree(core({ budget: 4, body: 10 })));
    expect(r.out).toMatch(/^FAIL core-line-budget:/m);
    // 숫자를 그냥 찾으면 출력 어디에 있어도 매치한다 — 관계를 형태로 단언한다.
    expect(r.out).toMatch(/11\/4줄/);
    expect(r.out).toMatch(/7줄 초과/);
    expect(r.code).toBe(1);
  });

  it('빈 줄도 예산에 든다 — 세지 않았다면 통과했을 자리다', () => {
    // "빈 줄도 센다"는 게이트가 스스로 선언한 규칙이다. 그것을 **뒤집는** 픽스처가 없으면
    // 그 문장은 코드로 확인된 적 없는 주장으로 남고, 빈 줄을 계량에서 빼는 편집이 항상
    // 로드되는 문서의 예산을 조용히 넓힌다. 마커 사이 = 선언 1 + 본문 3 + 빈 줄 2 = 6줄.
    const doc = ['# fixture', '', BEGIN, 'Target 4 lines', '본문 1', '', '본문 2', '', '본문 3', END].join(
      '\n',
    );
    const r = run(tree(doc));
    expect(r.out).toMatch(/^FAIL core-line-budget:/m);
    // 빈 줄을 뺀 4줄이면 경계와 같아 통과한다 — 관계를 형태로 단언해 그 상태를 가른다.
    expect(r.out).toMatch(/6\/4줄/);
    expect(r.code).toBe(1);
  });

  it('마커 바깥 줄은 예산에 들지 않는다', () => {
    // 바깥까지 세면 파일의 설정 블록이 자라는 것만으로 코어가 빨갛게 된다 —
    // 재려던 것(항상 로드되는 지시의 크기)이 아닌 것에 빨강이 붙는다.
    const padded = `${'바깥 줄\n'.repeat(200)}${core({ budget: 4, body: 3 })}`;
    const r = run(tree(padded));
    expect(r.out).toMatch(/^PASS core-line-budget:/m);
    expect(r.code).toBe(0);
  });
});

describe('core-line-budget — 마커', () => {
  it('마커가 없으면 실패한다', () => {
    // **가장 중요한 케이스다.** 여기가 통과하면 게이트가 아무것도 재지 않으면서 초록이 된다.
    const r = run(tree('# fixture\n\nTarget 10 lines\n본문\n'));
    expect(r.out).toMatch(/^FAIL core-line-budget:/m);
    expect(r.out).toContain('마커');
    expect(r.code).toBe(1);
  });

  it('마커 쌍이 둘이면 실패한다 — 어느 쪽이 코어인지 모호하다', () => {
    const doc = [core({ budget: 10, body: 3 }), core({ budget: 10, body: 3 })].join('\n');
    const r = run(tree(doc));
    expect(r.out).toMatch(/^FAIL core-line-budget:/m);
    expect(r.out).toContain('마커');
    expect(r.code).toBe(1);
  });

  it('여는 마커만 있으면 실패한다', () => {
    const r = run(tree(`# fixture\n${BEGIN}\nTarget 10 lines\n본문\n`));
    expect(r.out).toMatch(/^FAIL core-line-budget:/m);
    expect(r.out).toContain('마커');
    expect(r.code).toBe(1);
  });

  it('마커를 본문에 인용한 줄은 마커가 아니다 — 줄 전체가 그 모양이어야 한다', () => {
    // 코어의 "Amending this core"는 마커 이름을 적을 수 있다. 포함 비교로 재면 그런 줄 하나가
    // 마커 쌍을 둘로 만들어 **멀쩡한 문서가 빨강이 된다** — 검사하지 않는 초록만큼 나쁜 것이
    // 평범한 것을 막는 빨강이다.
    const doc = ['# fixture', BEGIN, 'Target 6 lines', `여는 마커는 \`${BEGIN}\`이다.`, '본문', END];
    const r = run(tree(doc.join('\n')));
    expect(r.out).toMatch(/^PASS core-line-budget:/m);
    expect(r.code).toBe(0);
  });

  it('마커 순서가 뒤집히면 실패한다', () => {
    const r = run(tree(`# fixture\n${END}\nTarget 10 lines\n본문\n${BEGIN}\n`));
    expect(r.out).toMatch(/^FAIL core-line-budget:/m);
    expect(r.out).toContain('뒤집');
    expect(r.code).toBe(1);
  });
});

describe('core-line-budget — 선언', () => {
  it('선언이 없으면 실패한다 — 예산 없는 코어는 재지 못한다', () => {
    const r = run(tree(core({ declarations: [] })));
    expect(r.out).toMatch(/^FAIL core-line-budget:/m);
    expect(r.out).toContain('선언하지 않았다');
    expect(r.code).toBe(1);
  });

  it('서로 다른 선언이 둘이면 실패한다 — 어느 쪽이 지배하는지 모호하다', () => {
    const r = run(tree(core({ declarations: ['Target 10 lines', 'Target 400 lines'] })));
    expect(r.out).toMatch(/^FAIL core-line-budget:/m);
    expect(r.out).toContain('선언이 2개');
    expect(r.code).toBe(1);
  });

  it('같은 선언이 둘이어도 실패한다 — 하나만 산다', () => {
    // 값이 같으니 모호하지 않다고 볼 수도 있으나, 둘을 허락하면 한쪽만 고치는 편집이
    // 곧바로 "서로 다른 선언 둘"을 만든다. 그 상태를 만들 수 없게 한다.
    const r = run(tree(core({ declarations: ['Target 10 lines', 'Target 10 lines'] })));
    expect(r.out).toMatch(/^FAIL core-line-budget:/m);
    expect(r.out).toContain('선언이 2개');
    expect(r.code).toBe(1);
  });

  it('마커 바깥의 선언은 세지 않는다', () => {
    // 바깥의 선언을 세면 이 게이트를 설명하는 문서가 자기 예산을 바꾸게 된다.
    const doc = `Target 999 lines\n${core({ budget: 4, body: 3 })}`;
    const r = run(tree(doc));
    expect(r.out).toMatch(/^PASS core-line-budget:/m);
    expect(r.code).toBe(0);
  });

  it('선언 형태를 인용한 줄은 선언이 아니다 — 줄 전체가 그 모양이어야 한다', () => {
    // 코어가 자기 예산 선언의 **모양을** 설명하는 줄을 가질 수 있다. 앵커 없는 정규식으로 재면
    // 그 줄이 두 번째 선언으로 세어져 "선언이 2개"로 빨강이 난다.
    const doc = [
      '# fixture',
      BEGIN,
      'Target 6 lines',
      '예산은 `Target 100 lines` 한 줄로 적는다.',
      '본문',
      END,
    ];
    const r = run(tree(doc.join('\n')));
    expect(r.out).toMatch(/^PASS core-line-budget:/m);
    expect(r.code).toBe(0);
  });

  it('선언의 수가 숫자가 아니면 실패한다', () => {
    const r = run(tree(core({ declarations: ['Target many lines'] })));
    expect(r.out).toMatch(/^FAIL core-line-budget:/m);
    expect(r.out).toContain('정수가 아니다');
    expect(r.code).toBe(1);
  });
});

describe('core-line-budget — 인자와 대상', () => {
  it('알 수 없는 인자를 거절한다', () => {
    const r = runChild('node', [GATE, '--nope']);
    expect(r.out).toMatch(/^FAIL core-line-budget:/m);
    expect(r.out).toContain('알 수 없는 인자');
    expect(r.code).toBe(1);
  });

  it('--dir가 두 번 오면 거절한다', () => {
    // 말없이 마지막 값을 고르면 어느 트리를 쟀는지가 호출 문면에서 읽히지 않는다. 이 픽스처가
    // 없으면 중복 검사를 지워도 두 번째 트리를 재면서 통과한다.
    const r = runChild('node', [GATE, '--dir', tree(core()), '--dir', tree(core())]);
    expect(r.out).toMatch(/^FAIL core-line-budget:/m);
    expect(r.out).toContain('두 번');
    expect(r.code).toBe(1);
  });

  it('--dir에 트리가 없으면 거절한다 — 조용히 이 저장소를 재면 안 된다', () => {
    // 값이 빠진 `--dir`를 통과시키면 `dir`가 undefined가 되어 fallback인 **이 저장소**를
    // 재고 통과한다. 부르는 쪽이 가리킨 트리가 사라진 채 초록이 나오는 자리다.
    const r = runChild('node', [GATE, '--dir']);
    expect(r.out).toMatch(/^FAIL core-line-budget:/m);
    expect(r.out).toContain('트리가 없다');
    expect(r.code).toBe(1);
  });

  it('AGENTS.md가 없으면 실패한다 — 없는 것은 통과가 아니다', () => {
    const r = run(track(mkdtempSync(join(tmpdir(), 'hk-core-empty-'))));
    expect(r.out).toMatch(/^FAIL core-line-budget:/m);
    expect(r.out).toContain('AGENTS.md가 없다');
    expect(r.code).toBe(1);
  });
});

describe('core-line-budget — 이 저장소 자신', () => {
  it('이 저장소의 코어가 예산 안이다', () => {
    const r = runChild('node', [GATE]);
    expect(r.out).toMatch(/^PASS core-line-budget:/m);
    expect(r.code).toBe(0);
  });
});
