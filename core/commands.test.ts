import { describe, expect, it } from 'vitest';
import {
  addModification,
  addProfile,
  applyCommand,
  duplicateProfile,
  moveProfile,
  removeModification,
  removeProfile,
  setPaused,
  toggleProfile,
  updateModification,
  updateProfileMeta,
} from './commands';
import type { Modification, StoredState } from './schema';
import { SCHEMA_VERSION } from './schema';

function modification(id: string, name = 'X-A'): Modification {
  return { kind: 'request-header', id, name, value: '1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' };
}

function state(): StoredState {
  return {
    schemaVersion: SCHEMA_VERSION,
    paused: false,
    profiles: [
      { id: 'p1', name: 'One', active: false, shortLabel: '1', color: '#2563eb', modifications: [modification('m1')], filters: [] },
      { id: 'p2', name: 'Two', active: false, shortLabel: '2', color: '#16a34a', modifications: [], filters: [] },
    ],
    materialized: {},
  };
}

describe('state transition commands', () => {
  it('toggleProfile은 대상 Profile만 바꾸고 나머지는 보존한다', () => {
    const next = toggleProfile(state(), 'p1', true);

    expect(next.profiles[0]?.active).toBe(true);
    expect(next.profiles[1]?.active).toBe(false);
    expect(next.profiles[0]?.modifications).toHaveLength(1);
  });

  it('addModification은 목록 끝에 추가한다 (순서 = 우선순위 세분)', () => {
    const next = addModification(state(), 'p1', modification('m2', 'X-B'));

    expect(next.profiles[0]?.modifications.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('updateModification은 id가 일치하는 항목만 교체한다', () => {
    const next = updateModification(state(), 'p1', {
      ...modification('m1'),
      value: 'changed',
    });

    expect(next.profiles[0]?.modifications[0]?.value).toBe('changed');
  });

  it('removeModification은 해당 항목만 제거한다', () => {
    const next = removeModification(state(), 'p1', 'm1');

    expect(next.profiles[0]?.modifications).toEqual([]);
  });

  it('addProfile은 지정 위치 뒤(또는 끝)에 Profile을 추가한다', () => {
    const created = { ...state().profiles[1]!, id: 'p3', name: 'Three' };

    const appended = addProfile(state(), created);
    expect(appended.profiles.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);

    const afterFirst = addProfile(state(), created, 'p1');
    expect(afterFirst.profiles.map((p) => p.id)).toEqual(['p1', 'p3', 'p2']);
  });

  it('duplicateProfile은 새 id의 비활성 사본을 원본 바로 뒤에 넣는다', () => {
    const next = duplicateProfile(state(), 'p1');

    expect(next.profiles).toHaveLength(3);
    const copy = next.profiles[1]!;
    expect(copy.name).toBe('One copy');
    expect(copy.active).toBe(false);
    expect(copy.id).not.toBe('p1');
    expect(copy.modifications[0]?.id).not.toBe('m1');
    expect(copy.modifications[0]?.name).toBe('X-A');
  });

  it('updateProfileMeta는 shortLabel을 2자로 강제한다 (권위 경로의 불변식)', () => {
    const next = updateProfileMeta(state(), 'p1', {
      name: 'One',
      shortLabel: 'LONG',
      color: '#dc2626',
    });

    expect(next.profiles[0]?.shortLabel).toBe('LO');
  });

  it('removeProfile은 해당 Profile만 제거한다', () => {
    const next = removeProfile(state(), 'p1');

    expect(next.profiles.map((p) => p.id)).toEqual(['p2']);
  });

  it('moveProfile은 순서를 바꾼다 (순서 = 충돌 우선순위)', () => {
    const next = moveProfile(state(), 'p2', 0);

    expect(next.profiles.map((p) => p.id)).toEqual(['p2', 'p1']);
  });

  it('updateProfileMeta는 이름·라벨·색만 바꾼다', () => {
    const next = updateProfileMeta(state(), 'p1', {
      name: 'Renamed',
      shortLabel: 'R',
      color: '#dc2626',
    });

    expect(next.profiles[0]).toMatchObject({
      name: 'Renamed',
      shortLabel: 'R',
      color: '#dc2626',
      active: false,
    });
    expect(next.profiles[0]?.modifications).toHaveLength(1);
  });

  it('setPaused는 Profile 상태를 건드리지 않는다', () => {
    const activated = toggleProfile(state(), 'p1', true);
    const paused = setPaused(activated, true);

    expect(paused.paused).toBe(true);
    expect(paused.profiles[0]?.active).toBe(true);

    const resumed = setPaused(paused, false);
    expect(resumed.paused).toBe(false);
    expect(resumed.profiles[0]?.active).toBe(true);
  });

  it('applyCommand는 모든 명령 타입을 해당 전이로 위임한다', () => {
    const viaCommand = applyCommand(state(), {
      type: 'move-profile',
      profileId: 'p2',
      toIndex: 0,
    });

    expect(viaCommand.profiles.map((p) => p.id)).toEqual(['p2', 'p1']);

    const pausedState = applyCommand(state(), { type: 'set-paused', paused: true });
    expect(pausedState.paused).toBe(true);
  });

  it('명령은 입력 상태를 변형하지 않는다 (불변성)', () => {
    const original = state();
    const snapshot = structuredClone(original);

    toggleProfile(original, 'p1', true);
    addModification(original, 'p1', modification('m9'));
    removeModification(original, 'p1', 'm1');

    expect(original).toEqual(snapshot);
  });
});
