import { describe, expect, it } from 'vitest';
import { parseStoredState, SCHEMA_VERSION } from './schema';

describe('parseStoredState', () => {
  it('유효한 상태는 그대로 통과한다', () => {
    const state = {
      schemaVersion: SCHEMA_VERSION,
      paused: false,
      profiles: [
        {
          id: 'p1',
          name: 'P',
          active: true,
          requestHeaders: [{ id: 'm1', name: 'X-A', value: '1', enabled: true }],
        },
      ],
    };

    expect(parseStoredState(state)).toEqual(state);
  });

  function expectDefaultState(actual: unknown) {
    // createDefaultState()는 호출마다 새 Profile id를 만들므로 형태로 비교한다.
    expect(actual).toMatchObject({
      schemaVersion: SCHEMA_VERSION,
      paused: false,
      profiles: [{ name: 'Default Profile', active: true, requestHeaders: [] }],
    });
  }

  it('저장된 값이 없으면(undefined) 기본 상태를 반환한다', () => {
    expectDefaultState(parseStoredState(undefined));
  });

  it.each([
    ['버전 불일치', { schemaVersion: 999, paused: false, profiles: [] }],
    ['profiles가 배열이 아님', { schemaVersion: SCHEMA_VERSION, paused: false, profiles: 'x' }],
    [
      'Modification 필드 타입 위반',
      {
        schemaVersion: SCHEMA_VERSION,
        paused: false,
        profiles: [
          {
            id: 'p1',
            name: 'P',
            active: true,
            requestHeaders: [{ id: 'm1', name: 'X', value: 1, enabled: true }],
          },
        ],
      },
    ],
  ])('%s → 전량 거부하고 기본 상태로 대체한다', (_label, broken) => {
    expectDefaultState(parseStoredState(broken));
  });
});
