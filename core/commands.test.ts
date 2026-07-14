import { describe, expect, it } from 'vitest';
import {
  addModification,
  removeModification,
  toggleProfile,
  updateModification,
} from './commands';
import type { Modification, StoredState } from './schema';
import { SCHEMA_VERSION } from './schema';

function modification(id: string, name = 'X-A'): Modification {
  return { kind: 'request-header', id, name, value: '1', enabled: true };
}

function state(): StoredState {
  return {
    schemaVersion: SCHEMA_VERSION,
    paused: false,
    profiles: [
      { id: 'p1', name: 'One', active: false, modifications: [modification('m1')] },
      { id: 'p2', name: 'Two', active: false, modifications: [] },
    ],
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

  it('명령은 입력 상태를 변형하지 않는다 (불변성)', () => {
    const original = state();
    const snapshot = structuredClone(original);

    toggleProfile(original, 'p1', true);
    addModification(original, 'p1', modification('m9'));
    removeModification(original, 'p1', 'm1');

    expect(original).toEqual(snapshot);
  });
});
