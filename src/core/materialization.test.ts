import { describe, expect, it } from 'vitest';
import {
  addModification,
  addProfile,
  expireRules,
  removeModification,
  removeProfile,
  restoreModification,
  toggleProfile,
  updateModification,
} from './commands';
import type { MaterializeDeps } from './placeholder';
import type { Modification, Profile, StoredState } from './schema';
import { SCHEMA_VERSION } from './schema';

function stubDeps(): MaterializeDeps & { uuidCalls: number } {
  const deps = {
    uuidCalls: 0,
    uuid: () => `uuid-${++deps.uuidCalls}`,
    now: () => 42,
  };
  return deps;
}

function mod(id: string, value: string): Modification {
  return {
    kind: 'request-header',
    id,
    name: `X-${id}`,
    value,
    mode: 'override',
    emptyMeans: 'remove',
    comment: '',
    enabled: true,
  };
}

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    name: 'P',
    active: false,
    shortLabel: 'P',
    color: '#2563eb',
    modifications: [mod('m-ph', 'trace-{{uuid}}'), mod('m-plain', 'static')],
    ...overrides,
  };
}

function state(profiles: Profile[], materialized: Record<string, string> = {}): StoredState {
  return { schemaVersion: SCHEMA_VERSION, paused: false, profiles, materialized, customHeaderNames: [] };
}

describe('실체화 수명주기 (활성화 경계)', () => {
  it('비활성→활성 전환이 Placeholder Modification만 실체화한다', () => {
    const deps = stubDeps();
    const next = toggleProfile(state([profile()]), 'p1', true, deps);

    expect(next.materialized).toEqual({ 'm-ph': 'trace-uuid-1' });
  });

  it('재활성화는 새 값을 만든다', () => {
    const deps = stubDeps();
    const on = toggleProfile(state([profile()]), 'p1', true, deps);
    const off = toggleProfile(on, 'p1', false, deps);
    const onAgain = toggleProfile(off, 'p1', true, deps);

    expect(off.materialized).toEqual({});
    expect(onAgain.materialized).toEqual({ 'm-ph': 'trace-uuid-2' });
  });

  it('이미 활성인 Profile의 재-toggle(true)은 값을 갈지 않는다', () => {
    const deps = stubDeps();
    const on = toggleProfile(state([profile()]), 'p1', true, deps);
    const stillOn = toggleProfile(on, 'p1', true, deps);

    expect(stillOn.materialized).toEqual({ 'm-ph': 'trace-uuid-1' });
  });

  it('활성 중 템플릿 편집은 그 Modification만 재실체화한다', () => {
    const deps = stubDeps();
    const twoPh = profile({
      modifications: [mod('m-a', '{{uuid}}'), mod('m-b', '{{uuid}}')],
    });
    const on = toggleProfile(state([twoPh]), 'p1', true, deps);
    expect(on.materialized).toEqual({ 'm-a': 'uuid-1', 'm-b': 'uuid-2' });

    const edited = updateModification(on, 'p1', mod('m-a', 'edited-{{uuid}}'), deps);
    expect(edited.materialized).toEqual({ 'm-a': 'edited-uuid-3', 'm-b': 'uuid-2' });
  });

  it('활성 중 편집으로 Placeholder가 없어지면 실체화 값을 정리한다', () => {
    const deps = stubDeps();
    const on = toggleProfile(state([profile()]), 'p1', true, deps);
    const edited = updateModification(on, 'p1', mod('m-ph', 'now-static'), deps);

    expect(edited.materialized).toEqual({});
  });

  it('비활성 Profile의 편집은 실체화를 만들지 않는다', () => {
    const deps = stubDeps();
    const next = updateModification(state([profile()]), 'p1', mod('m-ph', '{{uuid}}'), deps);

    expect(next.materialized).toEqual({});
  });

  it('활성 Profile에 Placeholder Modification을 추가하면 즉시 실체화한다', () => {
    const deps = stubDeps();
    const active = profile({ active: true, modifications: [] });
    const next = addModification(state([active]), 'p1', mod('m-new', '{{timestamp}}'), deps);

    expect(next.materialized).toEqual({ 'm-new': '42' });
  });

  it('Modification 제거·Profile 제거가 실체화 값을 정리한다', () => {
    const deps = stubDeps();
    const on = toggleProfile(state([profile()]), 'p1', true, deps);

    const removedMod = removeModification(on, 'p1', 'm-ph');
    expect(removedMod.materialized).toEqual({});

    const removedProfile = removeProfile(on, 'p1');
    expect(removedProfile.materialized).toEqual({});
  });

  it('활성 상태로 추가된 Profile(Import·복원 경로)은 활성화 경계로 실체화된다', () => {
    const deps = stubDeps();
    const imported = profile({ id: 'p-in', active: true });
    const next = addProfile(state([]), imported, undefined, deps);

    expect(next.materialized).toEqual({ 'm-ph': 'trace-uuid-1' });
  });

  it('만료 경로(expireRules)는 규칙만 끄고 실체화 값은 보존한다 — 활성화 경계가 아니다', () => {
    const timed = profile({
      active: true,
      modifications: [{ ...mod('m-ph', 'trace-{{uuid}}'), conditions: { expiresAt: 100 } }],
    });
    const withValues = state([timed], { 'm-ph': 'trace-old' });

    const expired = expireRules(withValues, 200);
    expect(expired.profiles[0]?.active).toBe(true);
    expect(expired.profiles[0]?.modifications[0]?.enabled).toBe(false);
    expect(expired.materialized).toEqual({ 'm-ph': 'trace-old' });
  });

  it('삭제-Undo(restoreModification): 원위치·원상태 복원, Placeholder는 재실체화 없이 값 보존 (ui-refine 07)', () => {
    const deps = stubDeps();
    // 활성 프로필: m-ph(placeholder)=uuid-1, m-plain=static. m-ph를 삭제했다 되돌린다.
    const on = toggleProfile(state([profile()]), 'p1', true, deps);
    expect(on.materialized).toEqual({ 'm-ph': 'trace-uuid-1' });
    const original = on.profiles[0]!.modifications[0]!; // m-ph, 인덱스 0
    const snapshotValue = on.materialized['m-ph'];

    const removed = removeModification(on, 'p1', 'm-ph');
    expect(removed.materialized).toEqual({}); // 삭제가 값도 제거

    // 스냅샷으로 원자 복원 — 재실체화 금지(deps 없이도 값이 돌아온다)
    const restored = restoreModification(removed, 'p1', 0, original, snapshotValue);
    expect(restored.profiles[0]?.modifications.map((m) => m.id)).toEqual(['m-ph', 'm-plain']);
    expect(restored.materialized).toEqual({ 'm-ph': 'trace-uuid-1' }); // 새 uuid 아님
    expect(deps.uuidCalls).toBe(1); // toggle에서 1회, 복원에선 0회
  });

  it('삭제-Undo: 원래 인덱스(중간)에 다시 끼운다', () => {
    const three = profile({
      modifications: [mod('a', 'x'), mod('b', 'y'), mod('c', 'z')],
    });
    const removed = removeModification(state([three]), 'p1', 'b');
    expect(removed.profiles[0]?.modifications.map((m) => m.id)).toEqual(['a', 'c']);

    const restored = restoreModification(removed, 'p1', 1, mod('b', 'y'));
    expect(restored.profiles[0]?.modifications.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('삭제-Undo: 인덱스가 현재 목록을 벗어나면 끝에 클램프한다 (삭제 시점 인덱스 계약)', () => {
    // 삭제 시점 인덱스 5지만 되돌릴 때 목록이 1개 → 범위 밖이라 끝에 붙는다.
    const one = profile({ modifications: [mod('a', 'x')] });
    const restored = restoreModification(state([one]), 'p1', 5, mod('b', 'y'));
    expect(restored.profiles[0]?.modifications.map((m) => m.id)).toEqual(['a', 'b']);
  });
});

describe('재시작 유지 (persist → parse → compile)', () => {
  it('직렬화 왕복 후에도 같은 실체화 값이 소비된다', async () => {
    const { parseStoredState } = await import('./schema');
    const { compile } = await import('./compile');
    const deps = stubDeps();
    const on = toggleProfile(state([profile()]), 'p1', true, deps);

    // storage.local 왕복(JSON 직렬화)을 흉내낸다
    const revived = parseStoredState(JSON.parse(JSON.stringify(on)));

    const { rules } = compile(revived.profiles, {
      paused: false,
      tabs: [],
      now: 0,
      materialized: revived.materialized,
    });
    expect(rules[0]?.action.requestHeaders?.[0]?.value).toBe('trace-uuid-1');
  });
});

describe('compile — 실체화 값 소비와 방어선', () => {
  const compileEnv = (materialized: Record<string, string>) => ({
    paused: false,
    tabs: [],
    now: 0,
    materialized,
  });

  it('Placeholder Modification은 실체화 값으로, 일반 값은 템플릿 그대로 컴파일된다', async () => {
    const { compile } = await import('./compile');
    const active = profile({ active: true });
    const { rules, warnings } = compile([active], compileEnv({ 'm-ph': 'trace-real' }));

    expect(warnings).toEqual([]);
    const values = rules.map((r) => r.action.requestHeaders?.[0]?.value);
    expect(values).toEqual(['trace-real', 'static']);
  });

  it('실체화 누락 활성 Profile은 전체가 규칙에서 제외되고 경고를 반환한다', async () => {
    const { compile } = await import('./compile');
    const active = profile({ active: true });
    const { rules, warnings } = compile([active], compileEnv({}));

    expect(rules).toEqual([]);
    expect(warnings).toContainEqual(
      expect.objectContaining({
        code: 'missing-materialization',
        profileId: 'p1',
        modificationId: 'm-ph',
      }),
    );
  });

  it('탭 이벤트·알람 재컴파일(같은 실체화 구역)은 값을 갈지 않는다 — Compile은 소비만', async () => {
    const { compile } = await import('./compile');
    const active = profile({ active: true });
    const env = compileEnv({ 'm-ph': 'stable-value' });

    const first = compile([active], { ...env, now: 1 });
    const second = compile([active], { ...env, now: 2, tabs: [] });

    expect(first.rules[0]?.action.requestHeaders?.[0]?.value).toBe('stable-value');
    expect(second.rules[0]?.action.requestHeaders?.[0]?.value).toBe('stable-value');
  });
});
