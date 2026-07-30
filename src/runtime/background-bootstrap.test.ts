import { describe, expect, it } from 'vitest';
import { applyCommand, type Command } from '@/core/commands';
import { createDefaultState, type StoredState } from '@/core/schema';
import { performFullReset, type ResetEffects } from '@/core/reset';
import type { BackupMutation, BackupMutationResult, StateWriter } from '@/core/state-writer';
import { bootstrap, type BackgroundDeps } from './background-bootstrap';

/**
 * 쓰기 문의 테스트 대역 — **초기화 순서는 흉내내지 않고 진짜 `core/reset`을 돌린다.**
 *
 * 이 테스트들이 보는 것은 백업 **예약 정책**이 `core/reset`이 정한 순서를 지키는가이므로,
 * 그 순서를 대역이 손으로 재현하면 계약이 아니라 재현물을 검사하게 된다. 대역이 대신하는 것은
 * **상태 쓰기 한 걸음**뿐이다. 레인 직렬화·허가 계약은 S3
 * (`service-worker.integration.test.ts`)가 진짜 어댑터 위에서 본다.
 */
type ResetStorage = Pick<ResetEffects, 'readBackupKV' | 'removeBackupKeys' | 'clearSummary'>;

/**
 * 초기화가 만지는 저장소 효과는 이제 **쓰기 문이 소유한다** (structure r2 R-2) — 호출부가
 * 인자로 건네주면 그 콜백이 레인 작업 안에서 돌아 백업 쓰기를 fan-out할 수 있기 때문이다.
 * 그래서 대역도 부트스트랩 deps가 아니라 여기서 받는다.
 */
const noopResetStorage: ResetStorage = {
  readBackupKV: async () => ({}),
  removeBackupKeys: async () => {},
  clearSummary: async () => {},
};

function fakeWriter(
  overrides: Partial<StateWriter> = {},
  storage: Partial<ResetStorage> = {},
): StateWriter {
  const effects = { ...noopResetStorage, ...storage };
  return {
    execute: async () => createDefaultState(),
    commitMigration: async () => false,
    snapshot: async () => ({ status: 'written', kind: 'write' }),
    mutateBackup: async () => ({ ok: true }),
    fullReset: async (policy) => {
      const applied: { state?: StoredState } = {};
      const result = await performFullReset({
        ...effects,
        ...policy,
        resetState: async () => {
          applied.state = createDefaultState();
        },
      });
      return { result, state: applied.state };
    },
    ...overrides,
  };
}

/** 상태 리셋 단계에서 멈추는 초기화 — 삭제는 이미 끝난 뒤다(멱등이라 되돌리지 않는다). */
const failingReset =
  (storage: Partial<ResetStorage> = {}): StateWriter['fullReset'] =>
  async (policy) => ({
    result: await performFullReset({
      ...noopResetStorage,
      ...storage,
      ...policy,
      resetState: async () => {
        throw new Error('storage write failed');
      },
    }),
  });

/** 모든 효과·리스너를 no-op으로 채운 기본 deps — 테스트가 필요한 것만 덮어쓴다. */
function fakeDeps(overrides: Partial<BackgroundDeps> = {}): BackgroundDeps {
  return {
    loadState: async () => createDefaultState(),
    stateWriter: fakeWriter(),
    publishSummary: async () => {},
    queryTabInfos: async () => [],
    onBackupMutation: () => {},
    replaceSessionRules: async () => {},
    applyBadge: async () => {},
    scheduleExpiryAlarm: async () => {},
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
   * 읽을 수 없는 상태를 백업하지 않는 **가드 자체**는 쓰기 문으로 옮겨 갔다 (티켓 02) — 이제
   * `snapshot()`이 권위 상태를 스스로 읽고 판정한다. 진짜 어댑터 위에서의 그 판정은 S3
   * (`service-worker.integration.test.ts`)가 본다. 여기 남는 것은 부트스트랩의 몫뿐이다:
   * **건너뛴 사실이 조용히 묻히지 않는다.** 저장소가 읽히지 않는다는 것이 백업이 멈춘 이유이므로
   * 드러나야 한다.
   */
  it("문이 건너뛴 백업을 'backup skipped'로 드러낸다", async () => {
    let fire = () => {};
    const logged: string[] = [];
    bootstrap(
      fakeDeps({
        setTimer: (cb) => {
          fire = cb;
        },
        stateWriter: fakeWriter({
          snapshot: async () => ({
            status: 'skipped',
            reason: 'stored state is unreadable (newer, v99)',
          }),
        }),
        logError: (context) => logged.push(context),
      }),
    );
    await flush();
    fire(); // 예약된 백업 실행
    await flush();
    expect(logged).toContain('backup skipped');
  });

  it('예약된 백업이 발화하면 문의 스냅샷을 태운다', async () => {
    let fire = () => {};
    let snapshots = 0;
    bootstrap(
      fakeDeps({
        setTimer: (cb) => {
          fire = cb;
        },
        stateWriter: fakeWriter({
          snapshot: async () => {
            snapshots += 1;
            return { status: 'written', kind: 'write' };
          },
        }),
      }),
    );
    await flush();
    fire();
    await flush();
    expect(snapshots).toBe(1);
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
        stateWriter: fakeWriter({
          execute: async (command) => {
            persisted = applyCommand(base, command);
            return persisted;
          },
        }),
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
        stateWriter: fakeWriter({
          execute: async (command) => {
            persisted = applyCommand(base, command);
            return persisted;
          },
        }),
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
        onCommand: (h) => {
          handler = h;
        },
        stateWriter: fakeWriter(
          {
            snapshot: async () => {
              backups += 1;
              if (resetting) backupsWhileResetting += 1;
              return { status: 'written', kind: 'write' };
            },
          },
          {
            readBackupKV: async (target) => ({ ...areas[target] }),
            removeBackupKeys: async (target, keys) => {
              // 디바운스된 자동 백업이 하필 삭제 도중에 내려앉는다 — 무효화가 없으면 되살아난다.
              for (const fire of timers.splice(0)) fire();
              await flush();
              for (const key of keys) delete areas[target]![key];
            },
            clearSummary: async () => {
              summaryCleared = true;
            },
          },
        ),
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
        // 상태 리셋만 실패한다 — 삭제는 이미 끝난 뒤다(멱등이라 되돌리지 않는다).
        stateWriter: fakeWriter({
          snapshot: async () => {
            backups += 1;
            areas.sync!['bk:late:0'] = 'payload';
            return { status: 'written', kind: 'write' };
          },
          fullReset: failingReset({
            readBackupKV: async (target) => ({ ...areas[target] }),
            removeBackupKeys: async (target, keys) => {
              for (const key of keys) delete areas[target]![key];
            },
          }),
        }),
        onCommand: (h) => {
          handler = h;
        },
        setTimer: (cb) => {
          timers.push(cb);
        },
      }),
    );
    await flush();
    expect(timers.length).toBeGreaterThan(0); // 무효화 전에 걸린 예약

    await expect(handler!({ type: 'full-reset' })).rejects.toThrow();

    // 실패로 중단이 풀린 **뒤에** 옛 예약이 발화한다.
    for (const fire of timers.splice(0)) fire();
    await flush();

    expect(backups).toBe(0);
    expect(Object.keys(areas.sync!)).toEqual([]); // 지운 스냅샷이 그대로 비어 있다
  });

  /*
   * 삭제 ↔ 자동 Backup과 겹친 삭제끼리의 경합 테스트 둘이 여기서 **S3로 옮겨 갔다** (티켓 02).
   * 겨누던 기계가 사라졌기 때문이다 — 드레인 await와 중단 깊이 카운터를 레인이 흡수했다.
   * 옮긴 단언의 행 단위 대응은 티켓 저널에 있다.
   *
   * 아래 둘은 남는다: 이들이 보는 것은 경합이 아니라 **예약 정책**이고(D8), 그것은 레인이
   * 대체하지 않는다.
   */
  /*
   * 삭제는 `storage.local.state`를 건드리지 않아 `onStateChanged` → `scheduleBackup`이
   * 뒤따르지 않는다. 그래서 삭제가 예약을 잃으면 그 백업은 다음 사용자 조작까지 영구히
   * 사라진다.
   *
   * 티켓 02 이전에는 삭제가 중단→재개로 그 자리를 눌렀다 되살렸다. 지금은 **아예 누르지
   * 않는다** — 겹침을 막던 것이 레인이 되었으므로 삭제가 예약에 손댈 이유가 없다. 성질은
   * 같고 기제가 없어진 것이라, 여기서 보는 것은 "삭제가 예약을 건드리지 않는다"다. 누군가
   * 중단만 되살리고 재개를 빠뜨리면 이 테스트가 잡는다.
   */
  it('삭제는 걸려 있던 백업 예약을 건드리지 않는다 — 상태 변경이 뒤따르지 않는 경로다', async () => {
    const timers: (() => void)[] = [];
    let mutate: ((mutation: BackupMutation) => Promise<BackupMutationResult>) | undefined;
    let snapshots = 0;

    bootstrap(
      fakeDeps({
        stateWriter: fakeWriter({
          snapshot: async () => {
            snapshots += 1;
            return { status: 'written', kind: 'write' };
          },
          mutateBackup: async () => ({ ok: false, error: 'storage unavailable' }),
        }),
        onBackupMutation: (handler) => {
          mutate = handler;
        },
        setTimer: (cb) => {
          timers.push(cb);
        },
      }),
    );
    await flush();
    expect(timers.length).toBeGreaterThan(0); // 초기 예약

    // 실패하는 삭제 — 결과는 오류 객체이고 던지지 않는다.
    expect(await mutate!({ op: 'delete-snapshot', snapshotId: 's1', target: 'sync' })).toMatchObject(
      { ok: false },
    );
    await flush();

    // 걸려 있던 예약이 그대로 살아 발화한다 — 무효화되지 않았다.
    for (const fire of timers.splice(0)) fire();
    await flush();
    expect(snapshots).toBe(1);
  });

  /*
   * 여기 있던 `요구가 엇갈린 겹침에서도 삭제의 재예약은 살아남는다` (릴리스 r2 R-11)는
   * **삭제됐다** (티켓 02).
   *
   * 그 결함은 참여자가 둘일 때만 성립했다 — 삭제는 재예약을 무조건 요구하고 초기화는 성공
   * 때만 요구하므로, 요구하지 않은 쪽이 마지막에 풀리면 삭제의 요구가 삼켜졌다. 지금 정책에
   * 참여하는 것은 초기화 하나뿐이다(삭제는 예약에 손대지 않는다). 요구가 엇갈릴 상대가 없다.
   *
   * 초기화 둘이 겹치는 경우의 동작은 **바뀌지 않았다**: 옛 코드도 첫 초기화가 요구를 소비한
   * 뒤 둘째의 중단이 그 예약을 눌렀고, 둘째가 실패하면 예약 없이 남아 다음 상태 변경을
   * 기다렸다. 새 코드도 같다 — 회귀가 아니라 같은 계약이다.
   */

  it('onExpiryAlarm이 실행자를 지나 만료 전이를 태운다 (persist)', async () => {
    let expiryAlarm = () => {};
    let persistCalls = 0;
    bootstrap(
      fakeDeps({
        onExpiryAlarm: (cb) => {
          expiryAlarm = cb;
        },
        stateWriter: fakeWriter({
          execute: async () => {
            persistCalls += 1;
            return createDefaultState();
          },
        }),
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
        stateWriter: fakeWriter({
          // 실제 커밋은 storage.local.set이라 onStateChanged가 뒤따른다 — 그 왕복을 흉낸다.
          commitMigration: async () => {
            order.push('commit');
            stateChanged();
            return true;
          },
          execute: async () => {
            persistCalls += 1;
            return createDefaultState();
          },
        }),
        onStateChanged: (cb) => {
          stateChanged = cb;
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
