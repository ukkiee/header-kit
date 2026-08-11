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
