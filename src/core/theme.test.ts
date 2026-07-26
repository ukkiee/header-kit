import { describe, expect, it } from 'vitest';
import { applyCommand } from './commands';
import { createDefaultState, parseStoredState } from './schema';
import { resolveTheme } from './theme';

/**
 * 테마 해석 (티켓 05, ADR 0015가 ADR 0004의 '스위치 없음'을 개정).
 *
 * 선호값 세 가지와 시스템 상태 둘의 곱을 표로 못박는다 — 이 함수가 앱 전체의 명암을
 * 정하는 단일 판단 지점이라, 분기 하나가 틀리면 사용자가 고른 테마가 조용히 무시된다.
 */
describe('resolveTheme', () => {
  it.each([
    ['dark', true, 'dark'],
    ['dark', false, 'dark'],
    ['light', true, 'light'],
    ['light', false, 'light'],
    ['system', true, 'dark'],
    ['system', false, 'light'],
  ] as const)('pref=%s, 시스템 다크=%s → %s', (pref, systemPrefersDark, expected) => {
    expect(resolveTheme(pref, systemPrefersDark)).toBe(expected);
  });

  it('명시 선호는 시스템을 무시한다 — 그러라고 있는 스위치다', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });
});

describe('테마 선호값의 영속 (티켓 05)', () => {
  it('기본은 시스템 — 고른 적 없는 사용자는 OS를 따른다', () => {
    expect(createDefaultState().theme).toBe('system');
  });

  it('커맨드가 선호값만 바꾸고 나머지 상태는 그대로 둔다', () => {
    const before = createDefaultState();
    const next = applyCommand(before, { type: 'set-theme', theme: 'dark' });
    expect(next.theme).toBe('dark');
    // 미처리 커맨드는 `command satisfies never`가 런타임에 지워져 **커맨드 자신**을 돌려준다.
    // 그러면 `.theme`만 보는 단언은 통과해 버리므로, 돌아온 것이 진짜 상태인지 함께 본다.
    expect(next.profiles).toEqual(before.profiles);
    expect(next.schemaVersion).toBe(before.schemaVersion);
    expect(applyCommand(next, { type: 'set-theme', theme: 'system' }).theme).toBe('system');
  });

  it('저장→로드 왕복에서 살아남는다 — "다시 열어도 유지된다"의 실질', () => {
    const saved = applyCommand(createDefaultState(), { type: 'set-theme', theme: 'light' });
    const revived = parseStoredState(JSON.parse(JSON.stringify(saved)));
    expect(revived.theme).toBe('light');
  });

  it('테마를 모르는 예전 상태는 시스템으로 백필된다 — 필드 추가가 전체 리셋을 부르면 안 된다', () => {
    const { theme: _dropped, ...withoutTheme } = createDefaultState();
    const revived = parseStoredState(JSON.parse(JSON.stringify(withoutTheme)));
    expect(revived.theme).toBe('system');
    // 백필이 다른 것을 건드리지 않았는지 — 리셋됐다면 프로필이 사라졌을 것이다.
    expect(revived.profiles).toHaveLength(1);
  });

  it('알 수 없는 값은 시스템으로 치유한다 — 그릴 수 없는 값이 화면까지 가지 않게', () => {
    const broken = { ...createDefaultState(), theme: 'neon' };
    expect(parseStoredState(JSON.parse(JSON.stringify(broken))).theme).toBe('system');
  });
});
