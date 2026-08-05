import { describe, expect, it } from 'vitest';
import { compile, type CompileEnv } from './compile';
import { profileRowStatus, summarizeCompile } from './summary';
import type { Modification, Profile } from './schema';

function mod(id: string, name: string, value = 'v'): Modification {
  return { kind: 'request-header', id, name, value, enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' };
}

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    name: 'P',
    active: true,
    color: '#2563eb',
    modifications: [mod('m1', 'X-A')],
    ...overrides,
  };
}

const env: CompileEnv = { paused: false, tabs: [], now: 0, materialized: {} };

describe('summarizeCompile', () => {
  it('활성 규칙 수와 활성 Profile 수를 센다', () => {
    const profiles = [
      profile({ id: 'a', modifications: [mod('a1', 'X-A'), mod('a2', 'X-B')] }),
      profile({ id: 'b', active: false }),
      profile({ id: 'c', modifications: [mod('c1', 'X-C')] }),
    ];
    const result = compile(profiles, env);
    const summary = summarizeCompile(result, { profiles, paused: false, applyError: null });

    expect(summary.ruleCount).toBe(3);
    expect(summary.activeProfileCount).toBe(2);
    expect(summary.paused).toBe(false);
  });

  it('경고를 종류별로 묶고 code + 보간 params를 낸다 (라벨은 UI 카탈로그가 지역화)', () => {
    const profiles = [
      profile({ id: 'a', modifications: [mod('a1', 'X-Same'), mod('a2', '  ')] }),
      profile({ id: 'b', modifications: [mod('b1', 'X-Same')] }),
    ];
    const result = compile(profiles, env);
    const summary = summarizeCompile(result, { profiles, paused: false, applyError: null });

    const codes = summary.warnings.map((w) => w.code).sort();
    expect(codes).toContain('empty-header-name');
    expect(codes).toContain('header-overlap');
    for (const warning of summary.warnings) {
      expect(typeof warning.code).toBe('string');
      expect(warning.params).toBeTypeOf('object');
    }
  });

  it('Pause 상태를 요약에 반영한다', () => {
    const profiles = [profile()];
    const result = compile(profiles, { ...env, paused: true });
    const summary = summarizeCompile(result, { profiles, paused: true, applyError: null });

    expect(summary.paused).toBe(true);
    expect(summary.ruleCount).toBe(0);
    expect(summary.activeProfileCount).toBe(0);
  });

  it('apply 실패 메시지를 요약에 반영한다 (조용한 실패 금지)', () => {
    const profiles = [profile()];
    const result = compile(profiles, env);
    const summary = summarizeCompile(result, {
      profiles,
      paused: false,
      applyError: 'Session rule count exceeded.',
    });

    expect(summary.applyError).toBe('Session rule count exceeded.');
    expect(summary.hasProblems).toBe(true);
  });

  it('경고·오류가 없으면 hasProblems가 false다', () => {
    const profiles = [profile()];
    const result = compile(profiles, env);
    const summary = summarizeCompile(result, { profiles, paused: false, applyError: null });

    expect(summary.warnings).toEqual([]);
    expect(summary.hasProblems).toBe(false);
  });
});

/**
 * 프로필 행이 목록에서 말하는 것 (티켓 13, 스펙 story 22/25/38).
 *
 * 행의 표시값은 **저장 상태에서만** 파생된다 — 컴파일 결과를 프로필별로 귀속시키지 않는다.
 * 그래서 규칙 수는 "그 프로필에 들어 있는 켜진 규칙 수"이지 "컴파일이 실제로 낸 수"가
 * 아니고, 일시정지는 그 수를 깎지 않고 **행이 읽히는 상태**만 정지로 돌린다.
 */
describe('profileRowStatus', () => {
  const disabled = (id: string, name: string): Modification => ({ ...mod(id, name), enabled: false });

  it('켜진 규칙만 센다 — 0개·일부만 켜짐·전부 켜짐', () => {
    expect(profileRowStatus(profile({ modifications: [] }), false).enabledModificationCount).toBe(0);
    expect(
      profileRowStatus(profile({ modifications: [disabled('d1', 'X-A'), disabled('d2', 'X-B')] }), false)
        .enabledModificationCount,
    ).toBe(0);
    expect(
      profileRowStatus(
        profile({ modifications: [mod('a1', 'X-A'), disabled('d1', 'X-B'), mod('a2', 'X-C')] }),
        false,
      ).enabledModificationCount,
    ).toBe(2);
    expect(
      profileRowStatus(profile({ modifications: [mod('a1', 'X-A'), mod('a2', 'X-B')] }), false).enabledModificationCount,
    ).toBe(2);
  });

  it('일시정지가 아니면 저장된 active가 곧 행 상태다', () => {
    expect(profileRowStatus(profile({ active: true }), false).state).toBe('on');
    expect(profileRowStatus(profile({ active: false }), false).state).toBe('off');
  });

  it('일시정지는 켜짐·꺼짐을 가리지 않고 모든 행을 정지로 읽게 한다', () => {
    expect(profileRowStatus(profile({ active: true }), true).state).toBe('paused');
    expect(profileRowStatus(profile({ active: false }), true).state).toBe('paused');
  });

  it('일시정지는 표시만 바꾼다 — 저장된 active도 규칙 수도 건드리지 않는다', () => {
    const target = profile({ active: true, modifications: [mod('a1', 'X-A'), disabled('d1', 'X-B')] });

    const running = profileRowStatus(target, false);
    const paused = profileRowStatus(target, true);

    // 재개하면 직전 상태가 그대로 다시 보인다 — 정지는 그 위에 덮이기만 한다.
    expect(paused.enabledModificationCount).toBe(running.enabledModificationCount);
    expect(profileRowStatus(target, false)).toEqual(running);
    expect(target.active).toBe(true);
    expect(target.modifications).toHaveLength(2);
  });
});
