import { describe, expect, it } from 'vitest';
import { compile, type CompileEnv } from './compile';
import { summarizeCompile } from './summary';
import type { Modification, Profile } from './schema';

function mod(id: string, name: string, value = 'v'): Modification {
  return { kind: 'request-header', id, name, value, enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' };
}

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    name: 'P',
    active: true,
    shortLabel: 'P',
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
