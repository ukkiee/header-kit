import type { RegisteredCommand } from '@/core/shortcuts';

/**
 * 브라우저에 지금 등록된 커맨드 목록 (티켓 09) — 읽기만 한다.
 *
 * manifest의 선언이 아니라 **현재 바인딩**을 묻는다. 사용자가 브라우저의 확장 단축키
 * 페이지에서 키를 바꾸거나 비워 두었을 수 있고, 목록의 목적은 지금 무엇을 누르면 되는지
 * 보여주는 것이라 manifest를 그대로 읽으면 거짓을 말하게 된다.
 */
export async function listShortcuts(): Promise<RegisteredCommand[]> {
  return browser.commands.getAll();
}
