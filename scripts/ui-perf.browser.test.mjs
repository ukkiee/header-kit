/**
 * `ui-perf`의 산출물 인자 계약. 이 케이스들은 실제로 브라우저를 띄우지 않는다 — 인자와
 * 산출물을 거르는 자리가 `launchWithExtension` **앞**이기 때문이다(`scripts/ui-perf.mjs`).
 *
 * 그런데도 이름이 `*.browser.test.mjs`인 이유는 `scripts/smoke.browser.test.mjs`가 적은 것과
 * 같다: 분류는 레지스트리의 `browser` 칸에서 파생되고 `ui-perf`는 `browser: yes`다. 인자를
 * 보고 "이번 호출은 브라우저를 안 띄운다"를 정적으로 판정할 수 없으므로 규칙이 보수적으로
 * 선다. 대가는 이 단언들이 `bun run test`(CI가 도는 집합)에서 빠진다는 것이고, 그것을 아는
 * 채로 둔다.
 *
 * **이 파일이 재지 않는 것**: 시작 지표를 실제로 재고 기준선과 대조하는 로직(표본 중앙값,
 * 배수·절대값 병용 상한, 회귀 판정, 기준선 부재·손상 분기). 그 경로는 실제 브라우저에서
 * 확장을 로드해야 닿고, 닿더라도 판정이 기기에 매여 있다 — `ui-perf`가 advisory 행인 바로 그
 * 이유다. 그 한계는 `docs/agents/verification.md`가 적는다.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO, runChild, tempDirs } from './test-support.mjs';

const track = tempDirs();
const GATE = join(REPO, 'scripts', 'ui-perf.mjs');
const run = (args) => runChild('node', [GATE, ...args], { cwd: REPO });

describe('ui-perf — 산출물 인자 계약', () => {
  it('가리키는 곳에 확장이 없으면 브라우저를 띄우기 전에 FAIL이고 사유가 경로를 말한다', () => {
    const empty = track(mkdtempSync(join(tmpdir(), 'hk-uiperf-')));
    const r = run(['--artifacts', empty]);
    expect(r.out).toMatch(/^FAIL ui-perf:/m);
    expect(r.out).toContain('빌드 산출물이 없다');
    expect(r.out).toContain(empty);
    expect(r.code).toBe(1);
  });

  it('알 수 없는 인자를 거절한다', () => {
    // 오타(`--artifact`)가 조용히 기본 경로를 재게 두면 러너가 넘긴 회차 경로가 사라지고
    // **디스크에 남아 있는 낡은 빌드**의 성능을 잰다 — D4a가 없애러 온 상태다.
    const r = run(['--artifact', '/tmp/x']);
    expect(r.out).toMatch(/^FAIL ui-perf:/m);
    expect(r.out).toContain('--artifacts');
    expect(r.code).toBe(1);
  });

  it('--artifacts가 두 번 오면 거절한다', () => {
    const r = run(['--artifacts', '/tmp/a', '--artifacts', '/tmp/b']);
    expect(r.out).toMatch(/^FAIL ui-perf:/m);
    expect(r.out).toContain('두 번');
    expect(r.code).toBe(1);
  });

  it('--artifacts에 값이 없으면 거절한다', () => {
    const r = run(['--artifacts']);
    expect(r.out).toMatch(/^FAIL ui-perf:/m);
    expect(r.out).toContain('디렉터리가 없다');
    expect(r.code).toBe(1);
  });

  it('advisory 행이어도 판정 토큰은 FAIL이다 — 다섯 번째 토큰을 만들지 않는다', () => {
    // 완료를 막지 않는다는 것은 판정이 아니라 그 행의 `kind`다. 게이트가 자기 입으로
    // `ADVISORY` 같은 토큰을 만들면 러너의 넷뿐인 판정이 조용히 다섯이 된다.
    const empty = track(mkdtempSync(join(tmpdir(), 'hk-uiperf-')));
    const r = run(['--artifacts', empty]);
    const tokens = r.out.split('\n').filter((l) => /^(PASS|FAIL|N\/A|BLOCKED|ADVISORY) ui-perf:/.test(l));
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatch(/^FAIL ui-perf:/);
  });
});
