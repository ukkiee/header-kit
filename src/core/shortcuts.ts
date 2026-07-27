import type { MessageKey } from './i18n';

/**
 * 키보드 단축키의 **읽기 전용** 표시 (티켓 09).
 *
 * 새 커맨드를 만들지도, 기존 바인딩을 바꾸지도 않는다(스펙 Out of Scope) — 브라우저가
 * 지금 무엇을 등록해 두었는지 그대로 옮겨 적는 것이 전부다. 재바인딩은 브라우저의 확장
 * 단축키 페이지가 소유한다.
 */

/** 브라우저가 돌려주는 커맨드 하나 — `chrome.commands.getAll()` 결과 중 쓰는 부분만. */
export interface RegisteredCommand {
  name?: string;
  shortcut?: string;
}

export interface ShortcutRow {
  /** manifest의 커맨드 이름 — 목록의 안정 키이자 라벨을 모를 때의 표시 이름. */
  name: string;
  /** 카탈로그 라벨 키. 모르는 커맨드는 부재 — 그때는 name을 그대로 보여준다. */
  labelKey?: MessageKey;
  /** 실제 바인딩. 비어 있으면 null — 화면은 빈칸 대신 '지정 없음'을 그린다. */
  shortcut: string | null;
}

/**
 * 커맨드 이름 → 카탈로그 라벨. manifest의 `description`을 그대로 그리지 않는 이유는
 * 그 문자열이 영어로 박혀 있어 카탈로그를 우회하기 때문이다 — 사용자 대면 문구는
 * 언제나 i18n을 거친다.
 */
const COMMAND_LABELS: Record<string, MessageKey> = {
  _execute_action: 'shortcutOpenApp',
  'toggle-pause': 'shortcutTogglePause',
};

/**
 * 등록된 커맨드 목록을 화면 행으로 옮긴다. 브라우저가 준 **순서를 지키고**, 라벨을 모르는
 * 커맨드도 버리지 않는다 — 목록의 목적이 "지금 무엇이 등록돼 있는지"를 보는 것이라,
 * 아는 것만 남기면 등록된 커맨드가 화면에서 조용히 사라진다.
 */
export function describeShortcuts(commands: readonly RegisteredCommand[]): ShortcutRow[] {
  const rows: ShortcutRow[] = [];
  for (const command of commands) {
    // 이름 없는 항목은 가리킬 대상이 없다 — 라벨도 키도 만들 수 없다.
    if (!command.name) continue;
    const labelKey = COMMAND_LABELS[command.name];
    const shortcut = command.shortcut?.trim() ? command.shortcut : null;
    rows.push(labelKey ? { name: command.name, labelKey, shortcut } : { name: command.name, shortcut });
  }
  return rows;
}
