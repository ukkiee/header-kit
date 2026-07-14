import { describe, expect, it } from 'vitest';
import { createCommandExecutor } from './executor';
import type { StoredState } from './schema';
import { SCHEMA_VERSION } from './schema';

function initialState(): StoredState {
  return {
    schemaVersion: SCHEMA_VERSION,
    paused: false,
    profiles: [
      { id: 'p1', name: 'One', active: false, shortLabel: '1', color: '#2563eb', modifications: [], filters: [] },
      { id: 'p2', name: 'Two', active: false, shortLabel: '2', color: '#16a34a', modifications: [], filters: [] },
    ],
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('createCommandExecutor', () => {
  it('겹쳐 도착한 두 전이가 모두 최종 상태에 남는다 (lost update 차단)', async () => {
    let stored = initialState();
    const firstSaveGate = deferred();
    let saveCalls = 0;

    const executor = createCommandExecutor({
      load: async () => structuredClone(stored),
      save: async (state) => {
        saveCalls += 1;
        if (saveCalls === 1) await firstSaveGate.promise; // 첫 저장이 느린 상황
        stored = state;
      },
    });

    // 팝업의 빠른 연속 조작: await 없이 두 명령이 겹친다
    const first = executor.execute({ type: 'toggle-profile', profileId: 'p1', active: true });
    const second = executor.execute({ type: 'toggle-profile', profileId: 'p2', active: true });
    firstSaveGate.resolve();
    await Promise.all([first, second]);

    expect(stored.profiles[0]?.active).toBe(true);
    expect(stored.profiles[1]?.active).toBe(true);
  });

  it('명령은 도착 순서대로 적용된다', async () => {
    let stored = initialState();
    const executor = createCommandExecutor({
      load: async () => structuredClone(stored),
      save: async (state) => {
        stored = state;
      },
    });

    const on = executor.execute({ type: 'toggle-profile', profileId: 'p1', active: true });
    const off = executor.execute({ type: 'toggle-profile', profileId: 'p1', active: false });
    await Promise.all([on, off]);

    expect(stored.profiles[0]?.active).toBe(false);
  });

  it('validate가 거부한 명령은 상태를 바꾸지 않고, 큐는 계속 동작한다', async () => {
    let stored = initialState();
    const executor = createCommandExecutor({
      load: async () => structuredClone(stored),
      save: async (state) => {
        stored = state;
      },
      validate: async (command) =>
        command.type === 'add-filter' && command.filter.kind === 'url'
          ? 'Invalid regex'
          : null,
    });

    await expect(
      executor.execute({
        type: 'add-filter',
        profileId: 'p1',
        filter: { kind: 'url', id: 'f1', enabled: true, pattern: '(' },
      }),
    ).rejects.toThrow('Invalid regex');
    expect(stored.profiles[0]?.filters).toEqual([]);

    await executor.execute({ type: 'toggle-profile', profileId: 'p1', active: true });
    expect(stored.profiles[0]?.active).toBe(true);
  });

  it('실패한 명령은 뒤 명령을 막지 않는다', async () => {
    let stored = initialState();
    let failNext = true;
    const executor = createCommandExecutor({
      load: async () => structuredClone(stored),
      save: async (state) => {
        if (failNext) {
          failNext = false;
          throw new Error('storage write failed');
        }
        stored = state;
      },
    });

    await expect(
      executor.execute({ type: 'toggle-profile', profileId: 'p1', active: true }),
    ).rejects.toThrow('storage write failed');

    await executor.execute({ type: 'toggle-profile', profileId: 'p2', active: true });
    expect(stored.profiles[1]?.active).toBe(true);
  });
});
