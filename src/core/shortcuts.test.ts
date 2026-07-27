import { describe, expect, it } from 'vitest';
import { describeShortcuts } from './shortcuts';

/**
 * 읽기 전용 단축키 목록 (티켓 09). 브라우저가 돌려준 커맨드 목록을 화면 행으로 옮기는
 * 순수 함수 — 여기서 정하는 것은 셋이다: 아는 커맨드는 카탈로그 라벨을 얻고, 모르는
 * 커맨드도 **버려지지 않으며**, 바인딩이 비어 있는 것은 빈칸이 아니라 '지정 없음'으로
 * 읽히게 null이 된다. 새 키보드 커맨드는 추가하지 않으므로(스펙 Out of Scope) 이 함수는
 * 표시만 한다.
 */
describe('describeShortcuts', () => {
  it('등록된 두 커맨드가 카탈로그 라벨 키를 얻는다', () => {
    expect(
      describeShortcuts([
        { name: '_execute_action', shortcut: 'Alt+Shift+H' },
        { name: 'toggle-pause', shortcut: 'Alt+Shift+P' },
      ]),
    ).toEqual([
      { name: '_execute_action', labelKey: 'shortcutOpenApp', shortcut: 'Alt+Shift+H' },
      { name: 'toggle-pause', labelKey: 'shortcutTogglePause', shortcut: 'Alt+Shift+P' },
    ]);
  });

  it('바인딩이 비었거나 없으면 null — 빈칸이 아니라 "지정 없음"으로 읽힌다', () => {
    expect(describeShortcuts([{ name: 'toggle-pause', shortcut: '' }, { name: '_execute_action' }])).toEqual([
      { name: 'toggle-pause', labelKey: 'shortcutTogglePause', shortcut: null },
      { name: '_execute_action', labelKey: 'shortcutOpenApp', shortcut: null },
    ]);
  });

  it('라벨을 모르는 커맨드도 이름으로 남는다 — 조용히 버리면 등록된 것을 못 보게 된다', () => {
    expect(describeShortcuts([{ name: 'future-command', shortcut: 'Alt+Shift+X' }])).toEqual([
      { name: 'future-command', shortcut: 'Alt+Shift+X' },
    ]);
  });

  it('이름 없는 항목만 버린다 — 가리킬 대상이 없다', () => {
    expect(describeShortcuts([{ shortcut: 'Alt+Q' }, { name: '', shortcut: 'Alt+W' }])).toEqual([]);
  });

  it('브라우저가 준 순서를 지킨다 — manifest 선언 순서가 곧 읽는 순서다', () => {
    const rows = describeShortcuts([
      { name: 'toggle-pause', shortcut: 'Alt+Shift+P' },
      { name: '_execute_action', shortcut: 'Alt+Shift+H' },
    ]);
    expect(rows.map((r) => r.name)).toEqual(['toggle-pause', '_execute_action']);
  });
});
