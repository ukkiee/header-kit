// `smoke`의 인자 계약. 이 케이스는 실제로 브라우저를 띄우지 않는다 — 산출물이 없으면
// `smoke`가 크롬을 띄우기 **전에** 죽는 것을 재기 때문이다.
//
// 그런데도 이름이 `*.browser.test.mjs`인 이유: 분류는 **레지스트리의 `browser` 칸**에서
// 파생되고, `smoke`는 `browser: yes`다. 인자를 보고 "이번 호출은 브라우저를 안 띄운다"를
// 판정하는 것은 정적으로 불가능하므로 규칙이 보수적으로 선다. 규칙을 우회하려고 호출을
// 간접적으로 쓰는 쪽이 훨씬 나쁘다 — 그러면 검사가 무엇도 못 잡는다.
//
// 대가는 실재한다: 이 단언이 `bun run test`(CI가 도는 집합)에서 빠진다. 그것을 아는 채로
// 옮긴다.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO, runChild } from './test-support.mjs';

describe('smoke — 산출물 인자 계약', () => {
  it('가리키는 곳에 산출물이 없으면 브라우저를 띄우기 전에 FAIL이고 사유가 경로를 말한다', () => {
    const r = runChild(
      'node',
      [join(REPO, 'scripts', 'smoke.mjs'), '--artifacts', '/nonexistent-hk-artifacts'],
      {
        cwd: REPO,
      },
    );
    expect(r.out).toMatch(/^FAIL smoke:/m);
    expect(r.out).toContain('nonexistent-hk-artifacts');
    expect(r.code).toBe(1);
  });
});
