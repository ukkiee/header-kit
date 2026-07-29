import { describe, expect, it } from 'vitest';
import type { Command } from '@/core/commands';
import { createDefaultState, type StoredState } from '@/core/schema';
import { bootstrap, type BackgroundDeps } from './background-bootstrap';

/** 모든 효과·리스너를 no-op으로 채운 기본 deps — 테스트가 필요한 것만 덮어쓴다. */
function fakeDeps(overrides: Partial<BackgroundDeps> = {}): BackgroundDeps {
  return {
    loadState: async () => createDefaultState(),
    readState: async () => ({ status: 'ok', state: createDefaultState() }),
    persistState: async () => {},
    commitMigration: async () => false,
    publishSummary: async () => {},
    queryTabInfos: async () => [],
    performBackup: async () => undefined,
    readBackupKV: async () => ({}),
    removeBackupKeys: async () => {},
    deleteBackupSnapshot: async () => ({ ok: true }),
    onSnapshotDeleteRequest: () => {},
    clearSummary: async () => {},
    replaceSessionRules: async () => {},
    applyBadge: async () => {},
    scheduleExpiryAlarm: async () => {},
    validateCommand: async () => null,
    now: () => 1000,
    setTimer: () => {},
    onStateChanged: () => {},
    onCommand: () => {},
    onTabsChanged: () => {},
    onStartup: () => {},
    onInstalled: () => {},
    onTogglePause: () => {},
    onExpiryAlarm: () => {},
    logError: () => {},
    ...overrides,
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('background bootstrap', () => {
  it('초기 converge가 주입 deps로 규칙·배지·요약을 반영한다 (browser API 없이)', async () => {
    let rules = false;
    let badge = false;
    let summary = false;
    let timerSet = false;
    bootstrap(
      fakeDeps({
        replaceSessionRules: async () => {
          rules = true;
        },
        applyBadge: async () => {
          badge = true;
        },
        publishSummary: async () => {
          summary = true;
        },
        setTimer: () => {
          timerSet = true;
        },
      }),
    );
    await flush();
    expect(rules).toBe(true);
    expect(badge).toBe(true);
    expect(summary).toBe(true);
    expect(timerSet).toBe(true); // 초기 scheduleBackup
  });

  it('onStateChanged가 재수렴을 촉발한다 (규칙 재적용)', async () => {
    let stateChanged = () => {};
    let ruleApplies = 0;
    bootstrap(
      fakeDeps({
        onStateChanged: (cb) => {
          stateChanged = cb;
        },
        replaceSessionRules: async () => {
          ruleApplies += 1;
        },
      }),
    );
    await flush();
    const afterInit = ruleApplies;
    stateChanged();
    await flush();
    expect(ruleApplies).toBeGreaterThan(afterInit);
  });

  it('백업 타이머는 코얼레싱된다 (초기 + 다중 트리거에도 1회 예약)', async () => {
    let stateChanged = () => {};
    let timers = 0;
    bootstrap(
      fakeDeps({
        onStateChanged: (cb) => {
          stateChanged = cb;
        },
        setTimer: () => {
          timers += 1;
        },
      }),
    );
    await flush();
    stateChanged();
    stateChanged();
    await flush();
    // 초기 scheduleBackup 1회, 이후 트리거는 이미 예약된 타이머로 코얼레싱 → 여전히 1.
    expect(timers).toBe(1);
  });

  /*
   * 읽을 수 없는 상태를 백업하지 않는다 (티켓 02 코드리뷰).
   *
   * 이 가드가 없으면 조용한 손실이 난다: 저장된 상태가 이 버전이 이해 못 하는 것이면
   * loadState가 **빈 기본 상태**로 접히고, 그것이 백업 링에 들어가 quota 회전으로 진짜
   * 스냅샷을 밀어낸다. 로컬 원본은 persistState 가드가 지켜도 백업이라는 다른 채널로
   * 같은 데이터가 사라진다 — 게다가 백업은 SW가 깨어날 때마다 예약되므로 상시 경로다.
   */
  it('읽을 수 없는 상태(blocked)에서는 백업을 건너뛴다 — 빈 스냅샷이 링을 오염시키지 않게', async () => {
    let fire = () => {};
    let backups = 0;
    const logged: string[] = [];
    bootstrap(
      fakeDeps({
        // 저장소에는 더 새 포맷이 들어 있다 — 이 버전은 읽을 수 없다.
        readState: async () => ({ status: 'blocked', reason: 'newer', storedVersion: 99 }),
        // loadState는 그것을 빈 기본 상태로 접는다(예전 동작) — 백업이 이것을 쓰면 안 된다.
        loadState: async () => createDefaultState(),
        setTimer: (cb) => {
          fire = cb;
        },
        performBackup: async () => {
          backups += 1;
          return undefined;
        },
        logError: (context) => logged.push(context),
      }),
    );
    await flush();
    fire(); // 예약된 백업 실행
    await flush();
    expect(backups).toBe(0);
    expect(logged).toContain('backup skipped');
  });

  it('읽을 수 있는 상태에서는 평소대로 백업한다', async () => {
    let fire = () => {};
    let backups = 0;
    bootstrap(
      fakeDeps({
        setTimer: (cb) => {
          fire = cb;
        },
        performBackup: async () => {
          backups += 1;
          return undefined;
        },
      }),
    );
    await flush();
    fire();
    await flush();
    expect(backups).toBe(1);
  });

  it('onCommand가 권위 실행자를 지난다 (load → 적용 → persist)', async () => {
    const base = createDefaultState();
    let handler: ((command: Command) => Promise<StoredState>) | undefined;
    let persisted: StoredState | undefined;
    bootstrap(
      fakeDeps({
        loadState: async () => base,
        onCommand: (h) => {
          handler = h;
        },
        persistState: async (_held, state) => {
          persisted = state;
        },
      }),
    );
    await flush();
    expect(handler).toBeDefined();
    const result = await handler!({ type: 'set-paused', paused: true });
    expect(result.paused).toBe(true);
    expect(persisted?.paused).toBe(true);
  });

  it('onTogglePause가 실행자를 지나 pause를 뒤집는다 (persist)', async () => {
    const base = createDefaultState(); // paused: false
    let togglePause = () => {};
    let persisted: StoredState | undefined;
    bootstrap(
      fakeDeps({
        loadState: async () => base,
        onTogglePause: (cb) => {
          togglePause = cb;
        },
        persistState: async (_held, state) => {
          persisted = state;
        },
      }),
    );
    await flush();
    togglePause();
    await flush();
    expect(persisted?.paused).toBe(true);
  });

  /*
   * 전체 초기화 (티켓 08, R-3) — core/reset이 정한 순서를 **실제 스케줄러**가 지키는지.
   *
   * core 테스트는 "중단 중에는 쓰지 않는다"는 계약만 알 뿐, 디바운스 타이머가 그 계약을
   * 존중하는지는 모른다. 여기서 삭제 도중에 예약된 백업을 일부러 터뜨려, 방금 비운
   * 저장소에 옛 데이터가 다시 써지지 않는지를 못 박는다.
   */
  it('전체 초기화는 자동 백업을 멈춘 채 두 저장소를 비우고, 끝난 뒤 다시 켠다', async () => {
    const areas: Record<string, Record<string, unknown>> = {
      local: { 'bk:manifest': { snapshots: [] }, 'bk:s1:0': 'chunk', state: { keep: true } },
      sync: { 'bk:manifest': { snapshots: [] }, 'bk:s2:0': 'chunk' },
    };
    const populated: StoredState = {
      ...createDefaultState(),
      theme: 'dark',
      profiles: [
        { id: 'p1', name: 'One', active: true, shortLabel: '1', color: '#2563eb', modifications: [] },
        { id: 'p2', name: 'Two', active: false, shortLabel: '2', color: '#16a34a', modifications: [] },
      ],
    };
    const timers: (() => void)[] = [];
    let handler: ((command: Command) => Promise<StoredState>) | undefined;
    let backups = 0;
    let backupsWhileResetting = 0;
    let resetting = false;
    let summaryCleared = false;

    bootstrap(
      fakeDeps({
        loadState: async () => populated,
        readState: async () => ({ status: 'ok', state: populated }),
        onCommand: (h) => {
          handler = h;
        },
        readBackupKV: async (target) => ({ ...areas[target] }),
        removeBackupKeys: async (target, keys) => {
          // 디바운스된 자동 백업이 하필 삭제 도중에 내려앉는다 — 중단이 없으면 여기서 되살아난다.
          for (const fire of timers.splice(0)) fire();
          await flush();
          for (const key of keys) delete areas[target]![key];
        },
        clearSummary: async () => {
          summaryCleared = true;
        },
        performBackup: async () => {
          backups += 1;
          if (resetting) backupsWhileResetting += 1;
          return undefined;
        },
        setTimer: (cb) => {
          timers.push(cb);
        },
      }),
    );
    await flush();
    expect(timers.length).toBeGreaterThan(0); // 초기 예약 — 초기화 중에 터질 후보

    resetting = true;
    const state = await handler!({ type: 'full-reset' });
    resetting = false;

    expect(backupsWhileResetting).toBe(0);
    expect(Object.keys(areas.local!)).toEqual(['state']); // 권위 상태는 남는다
    expect(Object.keys(areas.sync!)).toEqual([]);
    expect(state.profiles).toHaveLength(1);
    expect(summaryCleared).toBe(true);

    // 재개 — 다시 예약된 타이머가 이제는 실제로 백업한다 (깨끗한 default 스냅샷).
    expect(timers.length).toBeGreaterThan(0);
    for (const fire of timers.splice(0)) fire();
    await flush();
    expect(backups).toBeGreaterThan(0);
  });

  /*
   * 중단은 **이미 가드를 지난** in-flight 백업까지 막아야 한다. 위 테스트는 중단 이후에
   * 발화하는 타이머만 모델해 이 창이 비어 있었다.
   */
  it('중단은 가드를 이미 지난 in-flight 백업도 착지시키지 않는다', async () => {
    const areas: Record<string, Record<string, unknown>> = {
      local: {},
      sync: { 'bk:manifest': { snapshots: [] }, 'bk:s1:0': 'chunk' },
    };
    const timers: (() => void)[] = [];
    let handler: ((command: Command) => Promise<StoredState>) | undefined;
    let releaseRead = () => {};
    const readGate = new Promise<void>((resolve) => void (releaseRead = resolve));
    let reads = 0;
    const backedUp: string[] = [];

    bootstrap(
      fakeDeps({
        readState: async () => {
          reads += 1;
          if (reads === 1) await readGate; // 첫 백업은 가드를 지난 채 여기서 멈춰 있다
          return { status: 'ok', state: createDefaultState() };
        },
        performBackup: async (payload) => {
          backedUp.push(payload);
          areas.sync!['bk:late:0'] = payload;
        },
        readBackupKV: async (target) => ({ ...areas[target] }),
        removeBackupKeys: async (target, keys) => {
          for (const key of keys) delete areas[target]![key];
        },
        onCommand: (h) => {
          handler = h;
        },
        setTimer: (cb) => {
          timers.push(cb);
        },
      }),
    );
    await flush();
    for (const fire of timers.splice(0)) fire(); // 백업 시작 — readState에서 멈춘다
    await flush();
    expect(backedUp).toEqual([]); // 아직 가드를 지나 진행 중

    const reset = handler!({ type: 'full-reset' });
    releaseRead(); // in-flight 백업이 이제 performBackup 앞까지 간다
    await reset;
    await flush();

    expect(backedUp).toEqual([]); // 재검사에서 멈췄다 — 옛 payload는 착지하지 않았다
    expect(Object.keys(areas.sync!)).toEqual([]);
  });

  /*
   * 중단 전에 걸린 예약은 **취소할 수 없다**. 초기화가 삭제를 마친 뒤 reset-state에서
   * 실패하면 중단이 풀리고 상태는 아직 옛 프로필이라, 그 옛 예약이 뒤늦게 발화하면 방금
   * 지운 스냅샷이 되살아난다 (릴리스 게이트 R-1). 성공 경로 테스트는 타이머를 중단 **중**에
   * 터뜨려 이 순서를 비워 두었다.
   */
  it('실패한 초기화 뒤 발화한 옛 예약은 지운 백업을 되살리지 않는다', async () => {
    const areas: Record<string, Record<string, unknown>> = {
      local: {},
      sync: { 'bk:manifest': { snapshots: [] }, 'bk:s1:0': 'chunk' },
    };
    const populated: StoredState = {
      ...createDefaultState(),
      profiles: [
        { id: 'p1', name: 'One', active: true, shortLabel: '1', color: '#2563eb', modifications: [] },
      ],
    };
    const timers: (() => void)[] = [];
    let handler: ((command: Command) => Promise<StoredState>) | undefined;
    let backups = 0;

    bootstrap(
      fakeDeps({
        loadState: async () => populated,
        readState: async () => ({ status: 'ok', state: populated }),
        // 상태 리셋만 실패한다 — 삭제는 이미 끝난 뒤다(멱등이라 되돌리지 않는다).
        persistState: async () => {
          throw new Error('storage write failed');
        },
        readBackupKV: async (target) => ({ ...areas[target] }),
        removeBackupKeys: async (target, keys) => {
          for (const key of keys) delete areas[target]![key];
        },
        performBackup: async (payload) => {
          backups += 1;
          areas.sync!['bk:late:0'] = payload;
        },
        onCommand: (h) => {
          handler = h;
        },
        setTimer: (cb) => {
          timers.push(cb);
        },
      }),
    );
    await flush();
    expect(timers.length).toBeGreaterThan(0); // 중단 전에 걸린 예약

    await expect(handler!({ type: 'full-reset' })).rejects.toThrow();

    // 실패로 중단이 풀린 **뒤에** 옛 예약이 발화한다.
    for (const fire of timers.splice(0)) fire();
    await flush();

    expect(backups).toBe(0);
    expect(Object.keys(areas.sync!)).toEqual([]); // 지운 스냅샷이 그대로 비어 있다
  });

  /*
   * 스냅샷 삭제 ↔ 자동 Backup (release R2-3).
   *
   * `bk:manifest`의 writer를 서비스워커 하나로 세운 뒤에도, 중단이 **플래그만 세우고**
   * 돌아오면 이미 가드를 지난 자동 Backup이 삭제의 읽기와 쓰기 사이에 그대로 착지한다.
   * 그래서 중단은 드레인까지 간다 — 그 커밋이 삭제의 읽기 **앞으로** 밀려나, 삭제 계획이
   * 그것을 보고 매니페스트에 남긴다.
   *
   * 이 하네스의 자동 Backup 틱은 **읽기와 쓰기가 분리 가능**하다(읽기는 삭제 전, 커밋은
   * 게이트를 푼 뒤). 원자적 틱이나 중단에서 조기 반환하는 틱은 모든 설계에서 통과하므로
   * 이 기준을 채우지 못한다.
   */
  it('삭제는 진행 중인 자동 Backup을 드레인한 뒤에야 매니페스트를 읽는다 — 그 스냅샷이 남는다', async () => {
    const sync: Record<string, unknown> = {
      'bk:manifest': { version: 1, snapshots: [{ id: 's1', at: 1, profileCount: 1, chunkCount: 1, bytes: 4 }] },
      'bk:s1:0': 'chunk-s1',
    };
    const order: string[] = [];
    const timers: (() => void)[] = [];
    let deleteHandler:
      | ((snapshotId: string, target: 'sync' | 'local') => Promise<unknown>)
      | undefined;
    let releaseBackup = () => {};
    const backupGate = new Promise<void>((resolve) => void (releaseBackup = resolve));

    bootstrap(
      fakeDeps({
        // 자동 Backup 틱: 읽기는 지금(삭제 전), 커밋은 게이트를 푼 뒤(삭제 후가 될 뻔한 자리).
        performBackup: async (payload) => {
          order.push('backup:read');
          const manifest = sync['bk:manifest'] as { version: number; snapshots: unknown[] };
          const snapshots = [...manifest.snapshots];
          await backupGate;
          order.push('backup:commit');
          sync['bk:late:0'] = payload;
          sync['bk:manifest'] = {
            version: 1,
            snapshots: [...snapshots, { id: 'late', at: 2, profileCount: 1, chunkCount: 1, bytes: 4 }],
          };
        },
        // 삭제는 어댑터가 하는 일을 그대로 흉내 낸다 — 읽고, 그 항목만 뺀 매니페스트를 통째로 쓴다.
        deleteBackupSnapshot: async (snapshotId) => {
          order.push('delete:read');
          const manifest = sync['bk:manifest'] as {
            version: number;
            snapshots: { id: string }[];
          };
          sync['bk:manifest'] = {
            version: 1,
            snapshots: manifest.snapshots.filter((entry) => entry.id !== snapshotId),
          };
          delete sync[`bk:${snapshotId}:0`];
          return { ok: true };
        },
        onSnapshotDeleteRequest: (handler) => {
          deleteHandler = handler;
        },
        setTimer: (cb) => {
          timers.push(cb);
        },
      }),
    );
    await flush();
    for (const fire of timers.splice(0)) fire(); // 자동 Backup 시작 — 가드를 지나 커밋 직전에 선다
    await flush();
    expect(order).toEqual(['backup:read']);

    const deleting = deleteHandler!('s1', 'sync');
    await flush();
    // 드레인 중이라 아직 읽지 않았다 — 플래그만 세우고 돌아왔다면 여기서 이미 읽었다.
    expect(order).toEqual(['backup:read']);

    releaseBackup();
    expect(await deleting).toEqual({ ok: true });

    // 커밋이 삭제의 읽기 앞에 놓였다.
    expect(order).toEqual(['backup:read', 'backup:commit', 'delete:read']);
    // 삭제 도중 착지한 자동 Backup의 스냅샷 항목과 청크가 남는다 (정방향).
    expect(sync['bk:late:0']).toBeDefined();
    expect((sync['bk:manifest'] as { snapshots: { id: string }[] }).snapshots.map((e) => e.id)).toEqual([
      'late',
    ]);
    // 지운 행은 되살아나지 않는다 — 그 커밋이 우리 읽기 앞으로 밀려 계획이 그것을 봤다 (역방향).
    expect(sync['bk:s1:0']).toBeUndefined();
  });

  /*
   * 중단은 **카운팅**이어야 한다. boolean이면 먼저 끝난 쪽이 플래그를 되돌려 다른 쪽의
   * 창이 열린 채 남는다 — 이 중단이 막으려던 그 실패를 새로 만든다.
   */
  it('겹친 중단은 재진입 안전하다 — 먼저 끝난 쪽이 다른 쪽의 창을 열지 않는다', async () => {
    const timers: (() => void)[] = [];
    let deleteHandler:
      | ((snapshotId: string, target: 'sync' | 'local') => Promise<unknown>)
      | undefined;
    let stateChanged = () => {};
    let backups = 0;
    const gates = new Map<string, () => void>();

    bootstrap(
      fakeDeps({
        performBackup: async () => {
          backups += 1;
        },
        deleteBackupSnapshot: async (snapshotId) =>
          new Promise((resolve) => gates.set(snapshotId, () => resolve({ ok: true }))),
        onSnapshotDeleteRequest: (handler) => {
          deleteHandler = handler;
        },
        onStateChanged: (cb) => {
          stateChanged = cb;
        },
        setTimer: (cb) => {
          timers.push(cb);
        },
      }),
    );
    await flush();
    timers.splice(0);

    const first = deleteHandler!('a', 'sync');
    const second = deleteHandler!('b', 'sync');
    await flush();

    // 먼저 시작한 쪽을 끝낸다 — 다른 쪽은 아직 지우는 중이다.
    gates.get('a')!();
    expect(await first).toEqual({ ok: true });
    await flush();

    // 그 사이 도착한 상태 변경이 예약한 백업은 **여전히** 막혀 있어야 한다.
    stateChanged();
    await flush();
    for (const fire of timers.splice(0)) fire();
    await flush();
    expect(backups).toBe(0);

    gates.get('b')!();
    expect(await second).toEqual({ ok: true });
    await flush();

    // 마지막 한 겹이 풀린 뒤에야 백업이 다시 돈다.
    expect(timers.length).toBeGreaterThan(0);
    for (const fire of timers.splice(0)) fire();
    await flush();
    expect(backups).toBeGreaterThan(0);
  });

  /*
   * 삭제는 `storage.local.state`를 건드리지 않아 `onStateChanged` → `scheduleBackup`이
   * 뒤따르지 않는다. 전체 초기화가 중단을 복구하는 경로가 삭제에는 없으므로, 재개가
   * 무조건 다시 예약하지 않으면 그 백업은 영구히 사라진다.
   */
  it('삭제 실패 뒤에도 재개는 다시 예약한다 — 상태 변경이 뒤따르지 않는 경로다', async () => {
    const timers: (() => void)[] = [];
    let deleteHandler:
      | ((snapshotId: string, target: 'sync' | 'local') => Promise<unknown>)
      | undefined;
    let backups = 0;

    bootstrap(
      fakeDeps({
        performBackup: async () => {
          backups += 1;
        },
        deleteBackupSnapshot: async () => {
          throw new Error('storage unavailable');
        },
        onSnapshotDeleteRequest: (handler) => {
          deleteHandler = handler;
        },
        setTimer: (cb) => {
          timers.push(cb);
        },
      }),
    );
    await flush();
    timers.splice(0);

    await expect(deleteHandler!('s1', 'sync')).rejects.toThrow('storage unavailable');
    await flush();

    // 실패해도 중단은 풀리고 예약은 되살아난다 — 상태 변경을 기다릴 수 없는 경로이므로.
    expect(timers.length).toBeGreaterThan(0);
    for (const fire of timers.splice(0)) fire();
    await flush();
    expect(backups).toBeGreaterThan(0);
  });

  /*
   * 재예약 요구는 **깊이 해제를 살아남아야** 한다 (release R2 R-11). 삭제(요구함)와 실패한
   * 초기화(요구 안 함)가 겹쳐 초기화의 재개가 마지막에 풀리면, 깊이만 보는 판단은 삭제가
   * 명령한 재예약을 삼킨다 — 삭제는 상태를 바꾸지 않아 `onStateChanged`가 뒤따르지 않으므로
   * 그 백업은 영구히 사라진다. 위 재진입 테스트는 요구가 같은 삭제 둘만 겹쳐 이 쌍을 못 본다.
   */
  it('요구가 엇갈린 겹침에서도 삭제의 재예약은 살아남는다 — 실패한 초기화가 마지막에 풀려도', async () => {
    const timers: (() => void)[] = [];
    let deleteHandler: ((id: string, target: 'sync' | 'local') => Promise<unknown>) | undefined;
    let handler: ((command: Command) => Promise<StoredState>) | undefined;
    let backups = 0;
    let releaseDelete = () => {};
    let releaseReset = () => {};
    const deleteGate = new Promise<void>((resolve) => void (releaseDelete = resolve));
    const resetGate = new Promise<void>((resolve) => void (releaseReset = resolve));

    bootstrap(
      fakeDeps({
        performBackup: async () => {
          backups += 1;
        },
        deleteBackupSnapshot: async () => {
          await deleteGate;
          return { ok: true };
        },
        readBackupKV: async () => {
          await resetGate;
          return {};
        },
        // 상태 리셋에서 실패한다 — 초기화의 재개는 `snapshot: false`로 풀린다.
        persistState: async () => {
          throw new Error('storage write failed');
        },
        onSnapshotDeleteRequest: (h) => void (deleteHandler = h),
        onCommand: (h) => void (handler = h),
        setTimer: (cb) => void timers.push(cb),
      }),
    );
    await flush();
    timers.splice(0);

    const deleting = deleteHandler!('s1', 'sync'); // 깊이 1 — 재예약을 요구한다
    const resetting = handler!({ type: 'full-reset' }); // 깊이 2 — 요구하지 않는다
    await flush();

    releaseDelete(); // 삭제가 먼저 풀린다 — 아직 한 겹 남아 예약은 살아나지 않는다
    expect(await deleting).toEqual({ ok: true });
    await flush();
    expect(timers).toHaveLength(0);

    releaseReset(); // 실패한 초기화가 마지막 겹을 푼다
    await expect(resetting).rejects.toThrow();
    await flush();

    // 삭제가 명령한 재예약이 살아남았다 — 삼켜졌다면 여기서 타이머가 하나도 없다.
    expect(timers.length).toBeGreaterThan(0);
    for (const fire of timers.splice(0)) fire();
    await flush();
    expect(backups).toBeGreaterThan(0);
  });

  it('onExpiryAlarm이 실행자를 지나 만료 전이를 태운다 (persist)', async () => {
    let expiryAlarm = () => {};
    let persistCalls = 0;
    bootstrap(
      fakeDeps({
        onExpiryAlarm: (cb) => {
          expiryAlarm = cb;
        },
        persistState: async () => {
          persistCalls += 1;
        },
      }),
    );
    await flush();
    const before = persistCalls;
    expiryAlarm();
    await flush();
    expect(persistCalls).toBeGreaterThan(before);
  });

  /*
   * 마이그레이션 커밋은 **재조정 바깥에서** 한 번만 돈다 (티켓 14) — 메커니즘 잠금.
   *
   * 커밋이 loadSnapshot 안(=loadState)에서 일어나면 그 storage 쓰기가 onStateChanged를 때려
   * 새 세대를 만들고, 쓰기를 수행한 그 세대 자신이 post-loadSnapshot 가드에서 물러나
   * apply(replaceSessionRules)를 부르지 못한다 — 규칙이 저장소 왕복 한 번 뒤로 밀린다.
   * 스모크가 시드 직후 관측하면 "수정이 아직 안 걸린" 상태를 본다(M2b `cookie=existing=preset`).
   * 표본 수와 무관하게 잠그려면 그 순서를 여기서 못 박아야 한다: 커밋이 첫 apply보다 앞서고,
   * 커밋이 발화시킨 onStateChanged에도 apply가 시드 프로필의 규칙으로 실제 일어난다.
   */
  it('v1 커밋이 첫 converge 앞에서 돌고, 그 쓰기의 onStateChanged에도 규칙이 걸린다', async () => {
    const seeded: StoredState = {
      ...createDefaultState(),
      profiles: [
        {
          id: 'p1',
          name: 'Legacy',
          active: true,
          shortLabel: 'L',
          color: '#2563eb',
          modifications: [
            {
              kind: 'request-header',
              id: 'm1',
              name: 'X-Migrated',
              value: 'yes',
              mode: 'override',
              emptyMeans: 'remove',
              comment: '',
              enabled: true,
            },
          ],
        },
      ],
    };
    let stateChanged = () => {};
    const order: string[] = [];
    const applied: unknown[][] = [];
    let persistCalls = 0;
    bootstrap(
      fakeDeps({
        loadState: async () => seeded,
        // 실제 커밋은 storage.local.set이라 onStateChanged가 뒤따른다 — 그 왕복을 그대로 흉낸다.
        commitMigration: async () => {
          order.push('commit');
          stateChanged();
          return true;
        },
        onStateChanged: (cb) => {
          stateChanged = cb;
        },
        persistState: async () => {
          persistCalls += 1;
        },
        replaceSessionRules: async (rules) => {
          order.push('apply');
          applied.push(rules);
        },
      }),
    );
    await flush();
    expect(order[0]).toBe('commit'); // 커밋이 첫 apply보다 앞선다
    expect(order).toContain('apply'); // 세대 자기무효화로 apply가 통째로 스킵되지 않는다
    expect(JSON.stringify(applied.at(-1))).toContain('X-Migrated'); // 시드 프로필에서 컴파일된 규칙
    expect(persistCalls).toBe(0); // 재조정 스냅샷 경로에서는 아무것도 쓰지 않는다
  });
});
