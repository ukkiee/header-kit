import { describe, expect, it } from 'vitest';
import { compile } from './compile';
import { ALL_RESOURCE_TYPES } from './rules';
import type { Profile } from './schema';

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    name: 'Test Profile',
    active: true,
    modifications: [],
    ...overrides,
  };
}

describe('compile', () => {
  it('활성 Profile의 enabled Request Header를 set 규칙으로 컴파일한다', () => {
    const { rules, warnings } = compile(
      [
        profile({
          modifications: [
            { kind: 'request-header', id: 'm1', name: 'X-Debug', value: 'on', enabled: true },
            { kind: 'request-header', id: 'm2', name: 'X-Trace', value: 'abc', enabled: true },
          ],
        }),
      ],
      { paused: false },
    );

    expect(warnings).toEqual([]);
    expect(rules).toHaveLength(2);
    expect(rules[0]).toEqual({
      id: 1,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [{ header: 'X-Debug', operation: 'set', value: 'on' }],
      },
      condition: { resourceTypes: [...ALL_RESOURCE_TYPES] },
    });
    expect(rules[1]?.id).toBe(2);
    expect(rules[1]?.action.requestHeaders).toEqual([
      { header: 'X-Trace', operation: 'set', value: 'abc' },
    ]);
  });

  it('비활성 Profile과 disabled Modification은 규칙을 만들지 않는다', () => {
    const { rules } = compile(
      [
        profile({
          active: false,
          modifications: [{ kind: 'request-header', id: 'm1', name: 'X-A', value: '1', enabled: true }],
        }),
        profile({
          id: 'p2',
          modifications: [{ kind: 'request-header', id: 'm2', name: 'X-B', value: '2', enabled: false }],
        }),
      ],
      { paused: false },
    );

    expect(rules).toEqual([]);
  });

  it('Pause 상태에서는 규칙이 없다', () => {
    const { rules } = compile(
      [profile({ modifications: [{ kind: 'request-header', id: 'm1', name: 'X-A', value: '1', enabled: true }] })],
      { paused: true },
    );

    expect(rules).toEqual([]);
  });

  it('이름이 빈 Modification은 건너뛰고 경고를 반환한다', () => {
    const { rules, warnings } = compile(
      [
        profile({
          modifications: [
            { kind: 'request-header', id: 'm1', name: '  ', value: '1', enabled: true },
            { kind: 'request-header', id: 'm2', name: 'X-Ok', value: '2', enabled: true },
          ],
        }),
      ],
      { paused: false },
    );

    expect(rules).toHaveLength(1);
    expect(rules[0]?.action.requestHeaders?.[0]?.header).toBe('X-Ok');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      code: 'empty-header-name',
      profileId: 'p1',
      modificationId: 'm1',
    });
  });

  it('빈 값은 빈 문자열 set으로 컴파일된다 (의미 세분화는 후속 슬라이스)', () => {
    const { rules } = compile(
      [profile({ modifications: [{ kind: 'request-header', id: 'm1', name: 'X-Empty', value: '', enabled: true }] })],
      { paused: false },
    );

    expect(rules[0]?.action.requestHeaders).toEqual([
      { header: 'X-Empty', operation: 'set', value: '' },
    ]);
  });

  it('같은 입력은 같은 출력을 낸다 (순수성 스모크)', () => {
    const profiles = [
      profile({ modifications: [{ kind: 'request-header', id: 'm1', name: 'X-A', value: '1', enabled: true }] }),
    ];
    const a = compile(profiles, { paused: false });
    const b = compile(profiles, { paused: false });

    expect(a).toEqual(b);
  });
});
