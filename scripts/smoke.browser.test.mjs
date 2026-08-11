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
// **이 파일이 재지 않는 것**: 시나리오 자체. `smoke`가 도는 흐름은 실제 브라우저에 확장을
// 로드해야 닿고, 거기까지 간 실행은 이미 게이트를 돈 것이라 테스트가 따로 재는 것이 없다.
// 시나리오의 **준비 배리어 규율**은 별도 게이트가 재고 그쪽에는 뒤집는 픽스처가 있다
// (`scripts/audit-smoke-barriers.test.mjs`). 남는 경계는 `docs/agents/verification.md`가 적는다.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO, runChild } from './test-support.mjs';

const GATE = join(REPO, 'scripts', 'smoke.mjs');
const run = (args) => runChild('node', [GATE, ...args], { cwd: REPO });

describe('smoke — 산출물 인자 계약', () => {
  it('가리키는 곳에 산출물이 없으면 브라우저를 띄우기 전에 FAIL이고 사유가 경로를 말한다', () => {
    const r = run(['--artifacts', '/nonexistent-hk-artifacts']);
    expect(r.out).toMatch(/^FAIL smoke:/m);
    expect(r.out).toContain('nonexistent-hk-artifacts');
    expect(r.code).toBe(1);
  });

  it('알 수 없는 인자를 거절한다', () => {
    // 오타가 조용히 기본 경로를 재게 두면 러너가 넘긴 회차 경로가 사라지고, 스모크가
    // **디스크에 남아 있는 낡은 빌드**를 돌면서 초록을 낸다.
    const r = run(['--artifact', '/tmp/x']);
    expect(r.out).toMatch(/^FAIL smoke:/m);
    expect(r.out).toContain('--artifacts');
    expect(r.code).toBe(1);
  });

  it('--artifacts가 두 번 오면 거절한다', () => {
    const r = run(['--artifacts', '/tmp/a', '--artifacts', '/tmp/b']);
    expect(r.out).toMatch(/^FAIL smoke:/m);
    expect(r.out).toContain('두 번');
    expect(r.code).toBe(1);
  });

  it('--artifacts에 값이 없으면 거절한다', () => {
    const r = run(['--artifacts']);
    expect(r.out).toMatch(/^FAIL smoke:/m);
    expect(r.out).toContain('디렉터리가 없다');
    expect(r.code).toBe(1);
  });
});
