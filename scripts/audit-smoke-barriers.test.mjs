/**
 * `smoke-barriers` 게이트의 판정. seam은 이 저장소의 다른 게이트 테스트와 같다 — **자식
 * 프로세스로 띄우고 종료 코드와 상태 줄만 단언한다.**
 *
 * 이 감사는 대상 파일을 인자로 받으므로(`scripts/audit-smoke-barriers.mjs`가 자기 주석에
 * 그렇게 적는다) 실제 `smoke.mjs` 없이도 판정을 뒤집을 수 있다. **진짜 smoke.mjs를 복사해
 * 오지 않는다**: 그러면 그 파일이 바뀔 때마다 이 테스트가 함께 흔들리고, 흔들린 이유가
 * 감사의 회귀인지 시나리오의 변경인지 구별되지 않는다. 픽스처는 감사가 **세는 관계**만 담는다.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO, runChild, tempDirs } from './test-support.mjs';

const track = tempDirs();
const AUDIT = join(REPO, 'scripts', 'audit-smoke-barriers.mjs');

/** 감사가 이름으로 요구하는 시나리오들. 감사와 어긋나면 픽스처가 통과할 수 없어 곧 드러난다. */
const SEED_IDS = ['K1', 'K2', 'K3', 'M1', 'M2', 'M2b', 'M2c', 'M2d', 'M2e', 'M4'];
const STABLE_ID = 'N34b';

const run = (target) => runChild('node', [AUDIT, target], { cwd: REPO });

function fixture(lines) {
  const dir = track(mkdtempSync(join(tmpdir(), 'hk-barriers-')));
  const path = join(dir, 'smoke-fixture.mjs');
  writeFileSync(path, `${lines.join('\n')}\n`);
  return path;
}

/**
 * 한 시나리오 블록: 시드 → 준비 배리어 → record. 옵션이 그 관계를 하나씩 깨뜨린다.
 * `record`가 여러 줄로 나뉜 모양(`split`)은 포매터가 실제로 만든 형태다.
 */
function block(id, { seed = true, barrier = 'pollSessionRuleMatch', split = false, record = true } = {}) {
  const out = [];
  if (seed) out.push('  await seedProfiles([{ id: "p1", name: "A" }]);');
  if (barrier !== null) out.push(`  await ${barrier}(sw, 1);`);
  if (!record) return out;
  if (split) out.push('  record(', `    '${id}: 설명',`, '    true,', '  );');
  else out.push(`  record('${id}: 설명', true);`);
  return out;
}

/** 안정화 배리어를 요구하는 블록. 창은 record 앞 60줄이므로 거리도 픽스처가 정한다. */
function stableBlock({ pollStable = true, distance = 3, record = true } = {}) {
  const out = [];
  if (pollStable) out.push('  await pollStable(probe, "accent");');
  for (let i = 0; i < distance; i += 1) out.push(`  // 사이 줄 ${i}`);
  if (record) out.push(`  record('${STABLE_ID}: 설명', true);`);
  return out;
}

/** 감사가 통과하는 트리. 관계를 깨뜨리는 케이스들은 여기서 하나씩만 어긋난다. */
const wholeFile = (overrides = {}, stable = {}) => [
  '// 가짜 스모크 — 감사가 세는 관계만 담는다.',
  'const seedProfiles = (profiles) => chrome.storage.local.set({ profiles });',
  ...SEED_IDS.flatMap((id) => block(id, overrides[id] ?? {})),
  ...stableBlock(stable),
];

describe('smoke-barriers — 준비 배리어 감사', () => {
  it('시드와 record 사이에 배리어가 있으면 통과하고, 센 개수를 말한다', () => {
    const r = run(fixture(wholeFile()));
    expect(r.out).toMatch(/^PASS smoke-barriers:/m);
    // 11 = 시드 게이트 10 + 안정화 게이트 1. 개수를 단언하는 이유는, 목록이 조용히 줄면
    // 남은 것만 재면서 통과하기 때문이다 — 그것이 이 감사가 막으려는 것과 같은 모양이다.
    expect(r.out).toContain('11 barriers verified');
    expect(r.code).toBe(0);
  });

  it('시드와 record 사이에 배리어가 없으면 FAIL이고 그 시나리오를 지목한다', () => {
    // 이 감사의 존재 이유. 개수 배리어가 무효인 자리에서 배리어가 빠지면 단언이 정확히 한
    // 테스트씩 밀린다(M2b가 관측한 결함).
    const r = run(fixture(wholeFile({ M2b: { barrier: null } })));
    expect(r.out).toMatch(/^FAIL smoke-barriers:/m);
    expect(r.out).toContain('M2b');
    expect(r.out).toContain('준비 배리어가 없다');
    expect(r.code).toBe(1);
  });

  it('배리어 셋 중 어느 것이든 준비 관측으로 받는다', () => {
    // 하나만 받으면 다른 둘을 쓴 멀쩡한 시나리오가 빨강이 되고, 그것을 푸는 유일한 길이
    // 감사를 고치는 것이 된다 — 평범한 것을 막는 빨강이다.
    for (const barrier of ['pollSessionRuleMatch', 'pollUntil', 'pollStable']) {
      const r = run(fixture(wholeFile(Object.fromEntries(SEED_IDS.map((id) => [id, { barrier }])))));
      expect(r.out, barrier).toMatch(/^PASS smoke-barriers:/m);
      expect(r.code, barrier).toBe(0);
    }
  });

  it('고정 대기는 준비 관측으로 받지 않는다', () => {
    // `waitForTimeout`은 관측이 아니라 가정이다. 이것을 받으면 감사가 아무것도 재지 않는다.
    const r = run(fixture(wholeFile({ M1: { barrier: 'page.waitForTimeout' } })));
    expect(r.out).toMatch(/^FAIL smoke-barriers:/m);
    expect(r.out).toContain('M1');
    expect(r.code).toBe(1);
  });

  it('record를 찾을 수 없으면 통과가 아니라 FAIL이다', () => {
    // 시나리오가 사라진 파일에서 조용히 초록을 내면, 이 감사는 **잴 것이 없는 상태**를 가장
    // 잘 통과한다.
    const r = run(fixture(wholeFile({ K3: { record: false } })));
    expect(r.out).toMatch(/^FAIL smoke-barriers:/m);
    expect(r.out).toContain('K3');
    expect(r.out).toContain('찾을 수 없다');
    expect(r.code).toBe(1);
  });

  it('record 앞에 시드 호출이 없으면 FAIL이다', () => {
    // 첫 블록에서만 뺀다. 뒤쪽에서 빼면 **앞 블록의 시드**가 위로 잡혀 관계가 성립해 버린다.
    const r = run(fixture(wholeFile({ K1: { seed: false } })));
    expect(r.out).toMatch(/^FAIL smoke-barriers:/m);
    expect(r.out).toContain('K1');
    expect(r.out).toContain('seedProfiles( 호출이 없다');
    expect(r.code).toBe(1);
  });

  it('포매터가 record를 여러 줄로 나눠도 찾는다 — 없는 것과 모양이 바뀐 것은 다르다', () => {
    // 실측 이력: 포맷 적용에서 8개가 이 모양이 됐고, 한 줄 안에서만 찾던 감사는 그 8개를
    // "찾을 수 없다"로 보고했다. 그 회귀를 이 픽스처가 문다.
    const r = run(fixture(wholeFile(Object.fromEntries(SEED_IDS.map((id) => [id, { split: true }])))));
    expect(r.out).toMatch(/^PASS smoke-barriers:/m);
    expect(r.code).toBe(0);
  });

  it('안정화 배리어가 창 안에 있으면 통과한다', () => {
    const r = run(fixture(wholeFile({}, { distance: 50 })));
    expect(r.out).toMatch(/^PASS smoke-barriers:/m);
    expect(r.code).toBe(0);
  });

  it('안정화 배리어가 창 밖으로 밀리면 FAIL이다 — 거리가 판정에 든다', () => {
    // 창(60줄)이 0이 되거나 배리어가 멀어지면 전이 중간 프레임을 표본으로 삼게 된다.
    const r = run(fixture(wholeFile({}, { distance: 80 })));
    expect(r.out).toMatch(/^FAIL smoke-barriers:/m);
    expect(r.out).toContain(STABLE_ID);
    expect(r.out).toContain('pollStable');
    expect(r.code).toBe(1);
  });

  it('안정화 배리어가 아예 없으면 FAIL이다', () => {
    const r = run(fixture(wholeFile({}, { pollStable: false })));
    expect(r.out).toMatch(/^FAIL smoke-barriers:/m);
    expect(r.out).toContain(STABLE_ID);
    expect(r.code).toBe(1);
  });

  it('안정화 시나리오의 record가 없으면 FAIL이다', () => {
    const r = run(fixture(wholeFile({}, { record: false })));
    expect(r.out).toMatch(/^FAIL smoke-barriers:/m);
    expect(r.out).toContain(STABLE_ID);
    expect(r.out).toContain('찾을 수 없다');
    expect(r.code).toBe(1);
  });

  it('대상 파일이 없으면 통과가 아니다', () => {
    // 경로 오타가 조용히 초록을 내면, 아무것도 읽지 않은 회차가 가장 잘 통과한다.
    // 이름에 `smoke.mjs`가 부분 문자열로 들어가지 않게 짓는다 — `browser: yes` 게이트의
    // 스크립트 이름을 담은 테스트 파일은 분류 규약이 브라우저 집합으로 밀어낸다.
    const r = run(join(tmpdir(), 'hk-no-such-target.mjs'));
    expect(r.out).not.toMatch(/^PASS smoke-barriers:/m);
    expect(r.code).not.toBe(0);
  });

  it('인자가 없으면 저장소의 실제 대상을 보고 통과한다 — 게이트가 부르는 그 호출이다', () => {
    // 게이트 명령(`bun run smoke-barriers`)에는 인자가 없다. 위 픽스처들이 전부 인자 형태만
    // 재면, 기본 대상이 엉뚱한 곳을 가리켜도 초록이다.
    //
    // 대상 **파일 이름**을 단언하지 않는 이유: 그 이름은 `browser: yes`인 게이트의 스크립트라
    // 이 파일에 적는 순간 분류 규약(`scripts/browser-parity.mjs`)이 이 테스트를 브라우저
    // 집합으로 밀어낸다 — 그러면 CI에서 빠진다. 정규식으로 이름을 쪼개 규약을 피하는 것은
    // 그 검사를 무의미하게 만드는 길이라 하지 않는다. 대신 **개수**를 단언한다: 시나리오
    // 11개가 전부 배리어를 갖춘 파일은 저장소에 그 하나뿐이므로 이쪽이 더 좁은 주장이다.
    const r = runChild('node', [AUDIT], { cwd: REPO });
    expect(r.out).toMatch(/^PASS smoke-barriers:/m);
    expect(r.out).toContain('11 barriers verified');
    expect(r.code).toBe(0);
  });
});
