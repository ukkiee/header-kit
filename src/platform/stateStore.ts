import type { BackupTarget } from '@/core/backup';
import type { Command } from '@/core/commands';
import {
  isBlockedFromOverwrite,
  readStoredState,
  type StoredState,
  type StoredStateRead,
} from '@/core/schema';
import type { WritePermit } from '@/core/writer-lane';
import type { StatusSummary } from '@/core/summary';
import type { DeleteSnapshotResult } from '@/platform/backupStore';

const STATE_KEY = 'state';
const COMMAND_MESSAGE = 'headerkit:command';

/** 읽을 수 없는 저장 상태로 로드가 멈췄다는 **타입화된** 오류 (R-3) — 기본 상태로 접으면
 *  화면은 "프로필이 사라진" 모습을 오류 없이 그리고 재조정은 빈 규칙을 적용한다. */
export class StateLoadError extends Error {
  constructor(readonly reason: 'newer' | 'unmigratable', readonly storedVersion: number) {
    super(`Stored state is unreadable (${reason}, v${storedVersion}). Your data is left intact.`);
    this.name = 'StateLoadError';
  }
}

/** 권위 저장소에서 **읽기만 한다** — 마이그레이션 커밋은 `commitMigration`이 따로 한다.
 *  읽을 수 없는 값은 접지 않고 던진다(원본은 그대로 남는다).
 *
 *  왜 읽기 경로가 쓰지 않는가 (티켓 14): 이 함수는 재조정의 loadSnapshot이 쓰는 읽기다.
 *  여기서 storage.local에 쓰면 그 쓰기가 `onStateChanged`를 때려 새 세대를 만들고, 쓰기를
 *  수행한 그 세대 자신이 post-loadSnapshot 가드에서 물러나 `apply`를 부르지 못한다 —
 *  규칙 적용이 저장소 왕복 한 번만큼 밀린다. */
export async function loadState(): Promise<StoredState> {
  const read = await readState();
  if (read.status === 'blocked') throw new StateLoadError(read.reason, read.storedVersion);
  return read.state;
}

/**
 * 검증을 통과한 v1→v2를 **권위 저장소에 굳힌다** (R-3) — 메모리 변환만이면 저장소는
 * 영원히 v1이다. 이미 v2면 아무것도 쓰지 않고 `false`.
 *
 * 호출부는 background 컴포지션 루트 하나뿐이고, **재조정 바깥에서 한 번만** 돈다(티켓 14).
 * 실패는 삼키지 않고 호출자에게 전파한다 — 저장소가 v1로 남은 사실이 조용히 묻히지 않게.
 *
 * **읽기부터 커밋까지가 증표 하나 안에서 돈다** (ADR 0016, D2). 읽고 나서 레인을 놓았다가
 * 쓰기에서 다시 잡으면 그 사이에 명령이 들어와, 여기서 걷어낸 compare-and-swap이 막고 있던
 * 바로 그 덮어쓰기가 되살아난다.
 *
 * 그 CAS("쓰기 직전에 읽은 값이 아직 v1일 때만 쓴다")는 레인 아래에서 **항상 참**이라 걷었다
 * (D5). 남은 둘은 경합이 아니다: 이미 v2라 굳힐 것이 없으면 아무것도 쓰지 않고 `false`로
 * 물러나는 정상 경로와, 이 버전이 읽을 수 없는 상태 위에는 쓰지 않는 Schema Version 호환성
 * 계약(`persistState`의 가드)이다.
 */
export async function commitMigration(permit: WritePermit): Promise<boolean> {
  permit.assertLive();
  const read = await readState();
  if (read.status === 'blocked') throw new StateLoadError(read.reason, read.storedVersion);
  if (read.status !== 'migrated') return false;
  await persistState(permit, read.state);
  return true;
}

/**
 * 저장된 값을 분류해서 읽는다 — "읽을 수 없음"을 기본 상태로 접지 않는 경로.
 * 파생 데이터를 쓰는 쪽(백업)이 원본의 가독 여부를 알아야 하므로 필요하다.
 */
export async function readState(): Promise<StoredStateRead> {
  const result = await browser.storage.local.get(STATE_KEY);
  return readStoredState(result[STATE_KEY]);
}

/**
 * 권위 상태를 쓰는 **유일한** 경로 — 레인을 쥔 증표를 요구한다 (ADR 0016, D3).
 *
 * 증표는 `createWriterLane().run`이 넘겨주는 것 말고는 만들 수 없으므로, 화면(팝업·탭)은
 * 이 함수를 부를 방법이 아예 없고 서비스워커 안에서도 레인 밖 호출은 컴파일 오류다.
 * 이 모듈은 화면과 서비스워커 **양쪽에 실린다** — 그래서 규약이 아니라 타입이어야 한다.
 *
 * 그리고 **타입만으로는 부족하다** (structure 게이트 r1 R-1). 인자 자리는 "증표를 가졌다"까지만
 * 강제하므로, 증표를 밖으로 빼내거나 지연 콜백이 붙잡아 두면 레인 밖 쓰기가 성립했다. 그래서
 * 쓰기 직전에 증표가 아직 살아 있는지 확인한다 — 죽은 증표는 조용한 손상 대신 오류가 된다.
 * 이 확인은 경합을 **해결하는** 기제가 아니다(직렬화는 레인이 한다). 배선이 틀렸을 때 소리를
 * 내게 하는 단언이다.
 *
 * **쓰기 전에 저장된 값을 다시 읽어 덮어써도 되는지 확인한다** (티켓 02, ADR 0015).
 * 이 가드가 없으면 데이터 손실 경로가 열린다: 이 버전이 이해 못 하는 상태(더 새 포맷,
 * 또는 마이그레이션이 실패한 구 포맷)를 만나면 로드가 기본 상태로 접히고, 그 기본 상태가
 * 다음 저장에서 원본을 통째로 덮는다. 읽기가 blocked라고 판정한 것 위에는 쓰지 않는다.
 * 이건 동시성이 아니라 Schema Version 호환성 계약이라 레인과 무관하게 남는다 (D5).
 *
 * 매 저장마다 읽기가 한 번 더 들지만, 저장은 사용자 조작에서만 일어나고 storage.local은
 * 로컬이라 이 비용보다 프로필을 잃는 쪽이 훨씬 비싸다.
 */
export async function persistState(permit: WritePermit, state: StoredState): Promise<void> {
  permit.assertLive();
  const existing = await browser.storage.local.get(STATE_KEY);
  if (isBlockedFromOverwrite(existing[STATE_KEY])) {
    throw new Error(
      'Refusing to overwrite stored state this version cannot read (newer or unmigratable format). Your data is left intact.',
    );
  }
  // 진입 검사만으로는 부족하다 (structure r1 뒤 적대적 검증에서 실측됨). 위 읽기를 기다리는
  // 동안 이 허가의 작업이 끝날 수 있고, 그러면 이 쓰기는 레인이 이미 다음 작업으로 넘어간
  // **뒤에** 착지한다. 그래서 실제로 쓰기 직전에 한 번 더 본다 — 이 검사와 `set` 사이에는
  // await가 없다.
  permit.assertLive();
  await browser.storage.local.set({ [STATE_KEY]: state });
}

export function onStateChanged(listener: () => void): void {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && STATE_KEY in changes) listener();
  });
}

const SUMMARY_KEY = 'statusSummary';

/**
 * background가 실제로 적용한 그 스냅샷에서 만든 상태 요약을 session에 발행한다.
 * UI는 이 값을 읽기만 한다 — 독립 재컴파일로 적용분과 어긋나지 않게 한다.
 */
export async function publishSummary(summary: StatusSummary): Promise<void> {
  await browser.storage.session.set({ [SUMMARY_KEY]: summary });
}

/**
 * 세션 요약을 지운다 (전체 초기화 R-3). 요약은 파생 데이터라 다음 재조정이 새로 발행하지만,
 * 지우지 않으면 초기화 직후 한 프레임 동안 없어진 프로필의 규칙 수가 화면에 남는다.
 */
export async function clearSummary(): Promise<void> {
  await browser.storage.session.remove(SUMMARY_KEY);
}

export async function getSummary(): Promise<StatusSummary | null> {
  const result = await browser.storage.session.get(SUMMARY_KEY);
  return (result[SUMMARY_KEY] as StatusSummary | undefined) ?? null;
}

export function onSummaryChanged(listener: () => void): void {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && SUMMARY_KEY in changes) listener();
  });
}

export type CommandResult =
  | { ok: true; state: StoredState }
  | { ok: false; error: string };

/** UI가 단일 writer(background)로 전이 명령을 보낸다. */
export async function sendCommand(command: Command): Promise<CommandResult> {
  return (await browser.runtime.sendMessage({
    type: COMMAND_MESSAGE,
    command,
  })) as CommandResult;
}

const DELETE_SNAPSHOT_MESSAGE = 'headerkit:delete-snapshot';

/**
 * 스냅샷 한 행 삭제를 **서비스워커에 요청한다** (release R2-3).
 *
 * 렌더러가 직접 지우지 않는 이유는 `bk:manifest`의 writer를 하나로 세우기 위해서다.
 * 자동 Backup은 서비스워커에 살고 삭제는 팝업·탭 렌더러에 살았다 — 서로 다른 JS
 * 컨텍스트라 인프로세스 락으로는 원리적으로 못 맞춘다(`browser.storage`에 CAS가 없다).
 * 삭제를 서비스워커로 옮기면 그쪽이 자동 Backup을 중단·드레인한 뒤 지울 수 있다.
 *
 * 전이 명령(`sendCommand`)과 채널을 가르는 이유: 삭제는 권위 상태를 바꾸지 않고
 * 결과가 `CommandResult`가 아니라 잔여 개수를 든 `DeleteSnapshotResult`다.
 */
export async function requestSnapshotDelete(
  snapshotId: string,
  target: BackupTarget,
): Promise<DeleteSnapshotResult> {
  return (await browser.runtime.sendMessage({
    type: DELETE_SNAPSHOT_MESSAGE,
    snapshotId,
    target,
  })) as DeleteSnapshotResult;
}

/** background에서 삭제 요청을 구독한다 — 실패도 결과 객체로 돌려준다(던지지 않는다). */
export function onSnapshotDeleteRequest(
  handler: (snapshotId: string, target: BackupTarget) => Promise<unknown>,
): void {
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (
      typeof message === 'object' &&
      message !== null &&
      (message as { type?: unknown }).type === DELETE_SNAPSHOT_MESSAGE
    ) {
      const { snapshotId, target } = message as { snapshotId: string; target: BackupTarget };
      void handler(snapshotId, target)
        .then((result) => sendResponse(result))
        .catch((error: unknown) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          } satisfies DeleteSnapshotResult),
        );
      return true; // 비동기 응답
    }
    return undefined;
  });
}

/** background에서 명령 메시지를 구독한다. 거부·실패는 오류 응답으로 돌려준다. */
export function onCommand(handler: (command: Command) => Promise<StoredState>): void {
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (
      typeof message === 'object' &&
      message !== null &&
      (message as { type?: unknown }).type === COMMAND_MESSAGE
    ) {
      void handler((message as { command: Command }).command)
        .then((state) => sendResponse({ ok: true, state } satisfies CommandResult))
        .catch((error: unknown) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          } satisfies CommandResult),
        );
      return true; // 비동기 응답
    }
    return undefined;
  });
}
