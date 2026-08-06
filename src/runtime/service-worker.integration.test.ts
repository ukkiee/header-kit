import { describe, expect, it } from 'vitest';
import {
  BACKUP_MANIFEST_KEY,
  chunkKey,
  checksum,
  readManifest,
  type BackupTarget,
  type ManifestEntry,
  type SnapshotStatus,
} from '@/core/backup';
import type { Command } from '@/core/commands';
import type { BackupMutation, BackupMutationResult } from '@/core/state-writer';
import {
  createDefaultState,
  isBlockedFromOverwrite,
  SCHEMA_VERSION,
  type StoredState,
} from '@/core/schema';
import { createWriterLane, type WritePermit } from '@/core/writer-lane';
import {
  clearSummary,
  commitMigration,
  loadState,
  persistState,
  publishSummary,
} from '@/platform/stateStore';
import { listBackupSnapshots } from '@/platform/backupStore';
import { createStateWriter } from '@/platform/state-writer';
import { bootstrap, type BackgroundDeps } from './background-bootstrap';


/**
 * S3 — 서비스워커 통합 시임 (ADR 0016, spec.md Testing Decisions).
 *
 * 프로덕션 컴포지션을 그대로 시험대에 올린다: `bootstrap()`을 **진짜 저장소 어댑터**
 * (`platform/stateStore`·`platform/backupStore`)로 배선하고, 그 밑에 제어형 저장소 fake를
 * 깐다. fake는 모든 읽기·쓰기를 스케줄러에 세우고, 스케줄러는 보류 중인 작업들의 **가능한
 * 모든 순서를 열거**한다. 각 순서마다 불변식을 단언한다.
 *
 * 이 시임이 필요한 이유는 규모가 아니라 **배선**이다. 고립된 부품 테스트는 자기 fake 위에서
 * 돌아 "레인이 실제로 배선됐는가"를 증명하지 못한다 — 새 쓰기 경로를 레인 밖에 달아도 전부
 * green이다. 릴리스 게이트 r1·r2·r3가 세 라운드 연속으로 지적한 것이 정확히 그것이었다.
 */

// ── 제어형 저장소 fake ───────────────────────────────────────────────────────

const STATE_KEY = 'state';

interface Parked {
  label: string;
  release: () => void;
}

/**
 * 보류 중인 저장소 작업 중 **어느 것을 다음에 진행시킬지**를 정하는 결정론적 스케줄러.
 *
 * `prefix`가 앞쪽 결정을 그대로 재현하고, 그 뒤로는 항상 0번을 고른다. 탐색기는 이 실행이
 * 남긴 `picks`/`optionCounts`를 읽어 아직 안 가본 갈래를 새 prefix로 만든다.
 */
class Scheduler {
  readonly parked: Parked[] = [];
  readonly picks: number[] = [];
  readonly optionCounts: number[] = [];

  constructor(private readonly prefix: readonly number[]) {}

  park(label: string): Promise<void> {
    return new Promise<void>((resolve) => {
      this.parked.push({ label, release: resolve });
    });
  }

  step(): void {
    const pick = this.prefix[this.picks.length] ?? 0;
    if (pick >= this.parked.length) {
      throw new Error(`탐색 prefix가 실행과 어긋났다 (pick ${pick}, 보류 ${this.parked.length})`);
    }
    this.optionCounts.push(this.parked.length);
    this.picks.push(pick);
    this.parked.splice(pick, 1)[0]?.release();
  }
}

/** 순서를 세울 필요가 없는 계약 확인용 — 모든 저장소 작업이 즉시 진행한다. */
class ImmediateScheduler extends Scheduler {
  override park(): Promise<void> {
    return Promise.resolve();
  }
}

type Kv = Record<string, unknown>;

/** 저장소 fake가 관측한 불변식 위반 — 테스트 본문이 아니라 fake가 즉시 잡는다. */
type Violations = string[];

interface FakeOptions {
  /**
   * `state` 키에 쓰기가 착지할 때마다 부른다. 시나리오가 여기서 "직전 저장값이 담고 있던
   * 편집이 이 쓰기에도 살아 있는가"를 본다 — lost update는 **쓰는 순간** 잡힌다.
   */
  onStateWrite?: (previous: unknown, next: unknown) => string | null;
  /**
   * `state`를 읽어 넘겨준 직후에 부른다. 저장소는 여러 컨텍스트가 공유하므로, 읽기와 쓰기
   * 사이에 **바깥에서** 값이 바뀌는 순서가 실제로 존재한다 — 그 순서를 세우는 손잡이다.
   */
  afterStateRead?: (reads: number, kv: Kv) => void;
}

/**
 * `browser.storage`를 대신한다. local·sync 구역의 모든 작업을 스케줄러에 세우고, 값의
 * 반영(읽기 스냅샷·쓰기 착지)은 **풀려나는 시점**에 일어난다 — 그래야 스케줄러의 선택이
 * 저장소 효과의 실제 순서가 된다.
 *
 * session 구역만 세우지 않는다. 거기 사는 것은 파생 데이터(상태 요약)뿐이라 이 티켓의
 * 불변식 어디에도 들어오지 않는데, 세우면 순서 수만 배로 늘린다.
 */
function installStorageFake(
  seed: { local: Kv; sync: Kv },
  scheduler: Scheduler,
  violations: Violations,
  options: FakeOptions,
): { local: Kv; sync: Kv; stateWrites: () => number } {
  const local: Kv = structuredClone(seed.local);
  const sync: Kv = structuredClone(seed.sync);
  const session: Kv = {};
  let stateWrites = 0;
  let stateReads = 0;

  const select = (kv: Kv, query: unknown): Kv => {
    if (query === null || query === undefined) return structuredClone(kv);
    const keys = typeof query === 'string' ? [query] : (query as string[]);
    const out: Kv = {};
    for (const key of keys) if (key in kv) out[key] = structuredClone(kv[key]);
    return out;
  };

  /**
   * `browser.storage.onChanged` 구독자들. 티켓 04의 읽기 펜스가 매니페스트 변경을 기다리므로
   * fake가 실제로 이벤트를 내야 한다 — no-op으로 두면 펜스가 늘 유계 시간까지 기다린다.
   */
  const changeListeners: ((changes: Kv, area: string) => void)[] = [];
  const emitChange = (name: string, keys: string[]): void => {
    if (keys.length === 0) return;
    const changes: Kv = {};
    for (const key of keys) changes[key] = {};
    for (const listener of [...changeListeners]) listener(changes, name);
  };

  const area = (kv: Kv, name: 'local' | 'sync', parked: boolean) => ({
    get: async (query?: unknown): Promise<Kv> => {
      if (parked) await scheduler.park(`${name}.get`);
      const read = select(kv, query);
      if (name === 'local' && STATE_KEY in read) {
        stateReads += 1;
        options.afterStateRead?.(stateReads, kv);
      }
      return read;
    },
    set: async (items: Kv): Promise<void> => {
      if (parked) await scheduler.park(`${name}.set`);
      if (name === 'local' && STATE_KEY in items) {
        stateWrites += 1;
        const previous = kv[STATE_KEY];
        // 불변식 (d) — 이 버전이 읽을 수 없는 상태 위에는 아무것도 쓰이지 않는다.
        if (isBlockedFromOverwrite(previous)) {
          violations.push('읽을 수 없는 상태(blocked) 위에 썼다');
        }
        const stale = options.onStateWrite?.(previous, items[STATE_KEY]);
        if (stale !== null && stale !== undefined) violations.push(stale);
      }
      Object.assign(kv, structuredClone(items));
      emitChange(name, Object.keys(items));
    },
    remove: async (query: string | string[]): Promise<void> => {
      if (parked) await scheduler.park(`${name}.remove`);
      const keys = typeof query === 'string' ? [query] : query;
      const removed = keys.filter((key) => key in kv);
      for (const key of keys) delete kv[key];
      emitChange(name, removed);
    },
  });

  (globalThis as unknown as { browser: unknown }).browser = {
    storage: {
      local: area(local, 'local', true),
      sync: area(sync, 'sync', true),
      session: {
        get: async (query?: unknown): Promise<Kv> => select(session, query),
        set: async (items: Kv): Promise<void> => {
          Object.assign(session, structuredClone(items));
        },
        remove: async (query: string | string[]): Promise<void> => {
          for (const key of typeof query === 'string' ? [query] : query) delete session[key];
        },
      },
      onChanged: {
        addListener: (listener: (changes: Kv, area: string) => void) => {
          changeListeners.push(listener);
        },
        removeListener: (listener: (changes: Kv, area: string) => void) => {
          const at = changeListeners.indexOf(listener);
          if (at >= 0) changeListeners.splice(at, 1);
        },
      },
    },
  };

  return { local, sync, stateWrites: () => stateWrites };
}

// ── 시험대 ──────────────────────────────────────────────────────────────────

/** 시나리오가 진입점을 두드리는 손잡이 — 프로덕션이 리스너로 받는 그 자리들이다. */
interface Harness {
  /** 전이 명령 수신 (`onCommand`) — 전체 초기화도 이 문으로 온다. */
  command(command: Command): Promise<StoredState>;
  /** 전역 Pause 토글 (브라우저 커맨드) */
  togglePause(): void;
  /** 만료 알람 */
  expiryAlarm(): void;
  /** 저장소 변경 — 재조정을 촉발한다(재조정 중 발견된 지난 만료가 여기서 나온다). */
  stateChanged(): void;
  /** 자동 Backup 디바운스 타이머를 터뜨린다 — 걸려 있는 것 전부. */
  fireBackupTimers(): void;
  /** 렌더러가 시작한 백업 변이 요청 — 문은 하나다 (`onBackupMutation`). */
  mutateBackup(mutation: BackupMutation): Promise<BackupMutationResult>;
  /** 저장소의 현재 내용 (local 구역 — 권위 상태와 `bk:`가 함께 산다) */
  local: Kv;
  /** 클라우드(sync) 구역 — 초기화가 `syncBackup`을 기본값으로 되돌리면 그 뒤 백업이 여기로 간다. */
  sync: Kv;
  /** `state` 키에 착지한 쓰기 횟수 — "아무것도 쓰지 않았다"는 횟수로만 관측된다. */
  stateWrites: () => number;
  /** `logError`로 올라온 맥락 문자열 */
  errors: string[];
}

interface Scenario {
  /** 매 순서마다 새로 깔리는 local 구역 시드 (권위 상태와 `bk:`가 함께 산다) */
  seed: () => Kv;
  /** 클라우드(sync) 구역 시드 — 클라우드 삭제를 세우려면 여기에 백업이 있어야 한다. */
  seedSync?: () => Kv;
  /**
   * `onCommand` 리스너가 **등록되는 그 자리에서** 태우는 명령 — 부트스트랩이 마이그레이션
   * 커밋을 레인에 세우기 **전**이므로, 이 명령이 레인의 첫 작업이 된다.
   *
   * 현재 배선에서는 프로덕션에서 관측되지 않는 순서다(리스너 등록과 커밋 enqueue가 같은
   * 동기 턴에 있고 메시지는 그 턴에 배달되지 않는다). 그래도 세워 두는 이유는 D2가 못 박은
   * 것이 **우선순위 없는 도착 순서 FIFO**이기 때문이다 — 커밋 enqueue가 언젠가 await 뒤로
   * 밀리면 그 순간 살아나는 순서이고, 그때 결과가 정의돼 있어야 한다.
   */
  commandBeforeMigration?: Command;
  /** 겹쳐 세울 작업들을 **await 없이** 시작한다. 반환한 promise들은 탐색기가 정착시킨다. */
  start: (harness: Harness) => Record<string, Promise<unknown>>;
  /** 한 순서가 끝난 뒤의 관측 가능한 결과 */
  check: (outcomes: Record<string, PromiseSettledResult<unknown>>, harness: Harness) => void;
  /**
   * `check`가 새로 시작한 작업(예: 재예약된 백업 타이머)까지 정착시킨 뒤 보는 결과.
   * `check`에서 촉발한 것이 저장소를 더 만질 때 필요하다.
   */
  after?: (harness: Harness) => void;
  /** 불변식 (a) — 이 쓰기가 직전 저장값의 편집을 지우는가. 지우면 문자열을 돌려준다. */
  onStateWrite?: FakeOptions['onStateWrite'];
  /** 읽기와 쓰기 사이에 저장소가 바깥에서 바뀌는 순서를 세운다. */
  afterStateRead?: FakeOptions['afterStateRead'];
  /** 시계 (기본 1000) */
  now?: number;
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** 이 수를 넘으면 시나리오가 너무 크다 — 조용히 잘라내지 않고 실패시킨다. */
const MAX_ORDERINGS = 400;

async function runOnce(scenario: Scenario, prefix: readonly number[]): Promise<Scheduler> {
  const scheduler = new Scheduler(prefix);
  const violations: Violations = [];
  const { local, sync, stateWrites } = installStorageFake(
    { local: scenario.seed(), sync: scenario.seedSync?.() ?? {} },
    scheduler,
    violations,
    {
      onStateWrite: scenario.onStateWrite,
      afterStateRead: scenario.afterStateRead,
    },
  );

  let command: (c: Command) => Promise<StoredState> = async () => {
    throw new Error('onCommand 핸들러가 등록되지 않았다');
  };
  let togglePause = (): void => {};
  let expiryAlarm = (): void => {};
  let stateChanged = (): void => {};
  const backupTimers: (() => void)[] = [];
  let mutateRequest: (mutation: BackupMutation) => Promise<BackupMutationResult> = async () => {
    throw new Error('onBackupMutation 핸들러가 등록되지 않았다');
  };
  let early: Promise<StoredState> | undefined;
  const errors: string[] = [];

  bootstrap({
    // ── 진짜 저장소 어댑터 (S3의 본령) ──
    loadState,
    // 쓰기 문도 **진짜**다 — 레인·허가·직렬화가 프로덕션과 같은 코드로 돈다.
    stateWriter: createStateWriter({ validateCommand: async () => null }),
    publishSummary,
    // ── 저장소 밖 효과 — 이 티켓의 불변식과 무관하다 ──
    onBackupMutation: (handler) => {
      mutateRequest = handler;
    },
    replaceSessionRules: async () => {},
    applyBadge: async () => {},
    now: () => scenario.now ?? 1000,
    // 백업 타이머는 시나리오가 터뜨릴 때만 발화한다 — 예약 정책은 부트스트랩의 몫이므로
    // 그 발화 시점을 시나리오가 정해야 겹침을 세울 수 있다.
    setTimer: (callback) => {
      backupTimers.push(callback);
    },
    // 리스너 등록은 프로덕션에서도 주입 dep다. 시나리오가 이 손잡이로 진입점을 두드린다.
    onCommand: (handler) => {
      command = handler;
      if (scenario.commandBeforeMigration !== undefined) {
        early = handler(scenario.commandBeforeMigration);
      }
    },
    onTogglePause: (callback) => {
      togglePause = callback;
    },
    onStateChanged: (callback) => {
      stateChanged = callback;
    },
    onStartup: () => {},
    onInstalled: () => {},
    logError: (context) => errors.push(context),
  } satisfies BackgroundDeps);

  const harness: Harness = {
    command: (c) => command(c),
    togglePause: () => togglePause(),
    expiryAlarm: () => expiryAlarm(),
    stateChanged: () => stateChanged(),
    fireBackupTimers: () => {
      for (const fire of backupTimers.splice(0)) fire();
    },
    mutateBackup: (mutation) => mutateRequest(mutation),
    local,
    sync,
    stateWrites,
    errors,
  };

  const started: Record<string, Promise<unknown>> = {
    ...(early === undefined ? {} : { early }),
    ...scenario.start(harness),
  };
  const pending = new Set(Object.keys(started));
  for (const [name, promise] of Object.entries(started)) {
    void promise.then(
      () => pending.delete(name),
      () => pending.delete(name),
    );
  }

  /*
   * 정착은 **보류 중인 저장소 작업이 없고 시작한 조작이 전부 끝났을 때**다.
   *
   * 앞의 조건만 보면 안 된다 (티켓 04): 읽기 펜스는 저장소를 만지지 않고 타이머를 기다리므로,
   * 그 사이 보류 목록이 비어 루프가 일찍 빠져나가고 펜스가 시간 초과 뒤에 내는 재읽기를 아무도
   * 풀어 주지 않는다 — 멀쩡한 구현이 교착으로 보고된다.
   */
  for (let guard = 0; ; guard += 1) {
    await settle();
    if (scheduler.parked.length === 0 && pending.size === 0) break;
    if (scheduler.parked.length > 0) scheduler.step();
    if (guard >= 1_000) {
      throw new Error(
        scheduler.parked.length > 0
          ? '스케줄러가 수렴하지 않았다'
          : `교착: 저장소가 조용한데 끝나지 않은 조작이 남았다 — ${[...pending]}`,
      );
    }
  }

  const outcomes: Record<string, PromiseSettledResult<unknown>> = {};
  for (const [name, promise] of Object.entries(started)) {
    outcomes[name] = await promise.then(
      (value) => ({ status: 'fulfilled', value }) as const,
      (reason: unknown) => ({ status: 'rejected', reason }) as const,
    );
  }

  expect(violations, `불변식 위반 (순서 ${scheduler.picks.join('·')})`).toEqual([]);
  scenario.check(outcomes, harness);
  if (scenario.after !== undefined) {
    // `check`가 촉발한 작업을 끝까지 돌린다 — 남은 저장소 작업을 순서대로 풀어 준다.
    for (let guard = 0; guard <= 200; guard += 1) {
      await settle();
      if (scheduler.parked.length === 0) break;
      scheduler.step();
    }
    expect(violations, `불변식 위반 (after, 순서 ${scheduler.picks.join('·')})`).toEqual([]);
    scenario.after(harness);
  }
  delete (globalThis as unknown as { browser?: unknown }).browser;
  return scheduler;
}

/**
 * 시나리오를 **가능한 모든 순서**로 돌린다.
 *
 * 한 번 돌 때마다 결정 지점의 선택지 수를 기록해 두고, 아직 안 가본 갈래를 새 prefix로
 * 만들어 다시 돈다. 갈래가 마르면 열거가 끝난 것이다.
 */
async function forEachInterleaving(scenario: Scenario): Promise<number> {
  const frontier: number[][] = [[]];
  let runs = 0;

  while (frontier.length > 0) {
    const prefix = frontier.pop() ?? [];
    const scheduler = await runOnce(scenario, prefix);
    runs += 1;
    if (runs > MAX_ORDERINGS) {
      throw new Error(`순서가 ${MAX_ORDERINGS}개를 넘었다 — 시나리오를 줄여라`);
    }
    // 앞쪽 결정의 갈래는 이 prefix를 만든 조상이 이미 냈다. 새로 낼 것은 그 뒤뿐이다.
    for (let step = prefix.length; step < scheduler.optionCounts.length; step += 1) {
      for (let alt = (scheduler.picks[step] ?? 0) + 1; alt < (scheduler.optionCounts[step] ?? 0); alt += 1) {
        frontier.push([...scheduler.picks.slice(0, step), alt]);
      }
    }
  }
  return runs;
}

// ── 픽스처 ──────────────────────────────────────────────────────────────────

/**
 * 픽스처 빌더는 **반환 타입을 명시한다** (spec.md Testing Decisions). 백업 저장소 테스트의
 * 빌더에 이 annotation이 없어 필드 이름이 틀린 객체가 통과했고, 검증하려던 분기가 한 번도
 * 실행되지 않은 채 green이었다 — 릴리스 r3의 R-3이 그것이다.
 */
function twoProfiles(): StoredState {
  return {
    ...createDefaultState(),
    profiles: [
      { id: 'p1', name: 'One', active: false, color: '#2563eb', modifications: [] },
      { id: 'p2', name: 'Two', active: false, color: '#16a34a', modifications: [] },
    ],
  };
}

/**
 * v1 저장 형태 — 지금 타입이 아니므로 **따로 못 박는다.** 아래 빌더가 이 타입을 반환하지
 * 않으면 필드 이름이 틀린 픽스처가 조용히 통과하고, 마이그레이션 커밋이 검증하려던 분기에
 * 도달조차 못 한다.
 */
interface StoredV1 {
  schemaVersion: 1;
  paused: boolean;
  profiles: Array<{
    id: string;
    name: string;
    color: string;
    shortLabel: string;
    active: boolean;
    modifications: Array<{
      kind: 'request-header';
      id: string;
      name: string;
      value: string;
      enabled: boolean;
      mode: 'override';
      emptyMeans: 'remove';
      comment: string;
    }>;
  }>;
  materialized: Record<string, string>;
  customHeaderNames: string[];
}

function v1State(): StoredV1 {
  return {
    schemaVersion: 1,
    paused: false,
    profiles: [
      {
        id: 'p1',
        name: 'Legacy',
        color: '#2563eb',
        // 진짜 v1은 두 글자 라벨을 갖고 있었다 — 올라오면서 걷히는지가 아래 단언이다 (티켓 04).
        shortLabel: 'LG',
        active: false,
        modifications: [
          {
            kind: 'request-header',
            id: 'm1',
            name: 'Authorization',
            value: 'Bearer dev',
            enabled: true,
            mode: 'override',
            emptyMeans: 'remove',
            comment: '',
          },
        ],
      },
    ],
    materialized: {},
    customHeaderNames: ['X-Custom'],
  };
}

/**
 * 프로필 **둘**을 담은 v1 (티켓 10) — 만료 알람이 표본으로 들고 있던 성질이 여기로 옮겨 온다.
 *
 * 겹치는 편집이 `toggle-profile p2`이므로 p2가 있어야 한다. 한 프로필짜리로는 커밋이 지울
 * 편집 자체가 없어 "겹친 편집이 살아남는다"를 물을 수 없다.
 */
function v1StateTwoProfiles(): StoredV1 {
  const base = v1State();
  return {
    ...base,
    profiles: [
      ...base.profiles,
      { ...base.profiles[0]!, id: 'p2', name: 'Legacy Two', modifications: [] },
    ],
  };
}

/** p1은 활성이고 지난 만료를 하나 들고 있다 — 만료 전이가 실제로 무언가를 바꾸도록. */
function expiredRuleState(): StoredState {
  return {
    ...createDefaultState(),
    profiles: [
      {
        id: 'p1',
        name: 'One',
        active: true,
        color: '#2563eb',
        modifications: [
          {
            kind: 'request-header',
            id: 'm1',
            name: 'X-Debug',
            value: '1',
            enabled: true,
            mode: 'override',
            emptyMeans: 'remove',
            comment: '',
            conditions: { expiresAt: 500 },
          },
        ],
      },
      { id: 'p2', name: 'Two', active: false, color: '#16a34a', modifications: [] },
    ],
  };
}

/**
 * 유효한 매니페스트 항목 — **반환 타입을 명시한다** (티켓 02).
 *
 * 여기 있던 이유가 실측된 것이다: `backupStore.test.ts`의 옛 빌더는
 * `{ id, at, profileCount, chunkCount, bytes }`를 만들어 `ManifestEntry`의 `createdAt`·
 * `checksum`을 빠뜨렸고, 그래서 `readManifest`가 빈 목록을 돌려주어 **삭제가 매니페스트를
 * 쓰는 분기가 한 번도 실행되지 않았다.** 반환 타입 하나가 그 상태를 타입 검사에서 막는다.
 */
function manifestEntry(id: string, text: string): ManifestEntry {
  return { id, createdAt: 1, chunkCount: 1, checksum: checksum(text), profileCount: 1 };
}

/** 매니페스트 항목 셋과 그 청크가 든 백업 구역 시드. */
function seededBackups(ids: string[]): Kv {
  const kv: Kv = {
    [BACKUP_MANIFEST_KEY]: { snapshots: ids.map((id) => manifestEntry(id, `text-${id}`)) },
  };
  for (const id of ids) kv[chunkKey(id, 0)] = `text-${id}`;
  return kv;
}

/**
 * 불변식 (b) — 매니페스트에 남은 항목은 전부 실제 데이터가 있다.
 *
 * **각 순서의 끝에서만** 본다. 백업 계획에는 공간 확보용 사전 정리가 있고 그 청크들은 매니페스트
 * 교체보다 먼저 지워지므로, 커밋 앞 창에서는 일시적으로 불일치가 정상이다(D7). 그 창을 읽기
 * 쪽에서 막는 것이 티켓 04의 펜스이고, 여기서는 **정착한 결과**만 판정한다.
 */
function manifestBacked(kv: Kv): string[] {
  const missing: string[] = [];
  for (const entry of readManifest(kv).snapshots) {
    for (let i = 0; i < entry.chunkCount; i += 1) {
      if (!(chunkKey(entry.id, i) in kv)) missing.push(chunkKey(entry.id, i));
    }
  }
  return missing;
}

/**
 * 매니페스트가 열거하지 않는 `bk:` 청크 — **역방향** 손실의 자취다.
 *
 * 매니페스트를 통째로 쓰는 동작이 그 사이 커밋된 항목을 지우면 그 청크만 남는다. 목록→데이터
 * 방향(`manifestBacked`)만 보면 그 손실이 보이지 않는다: 목록에서 사라진 것은 짝을 확인할
 * 대상이 아니기 때문이다.
 */
function orphanChunks(kv: Kv): string[] {
  const listed = new Set<string>();
  for (const entry of readManifest(kv).snapshots) {
    for (let i = 0; i < entry.chunkCount; i += 1) listed.add(chunkKey(entry.id, i));
  }
  return Object.keys(kv)
    .filter((key) => key.startsWith('bk:') && key !== BACKUP_MANIFEST_KEY && !listed.has(key))
    .sort();
}

/** 매니페스트에 남은 스냅샷 id (정렬) — 목록에 무엇이 보이는가. */
function snapshotIds(kv: Kv): string[] {
  return readManifest(kv).snapshots.map((entry) => entry.id).sort();
}

/** 활성 Profile id 집합 — 편집이 살아남았는지를 값 하나로 본다. */
function activeIds(state: unknown): string[] {
  const profiles = (state as StoredState | undefined)?.profiles ?? [];
  return profiles.filter((profile) => profile.active).map((profile) => profile.id).sort();
}

/**
 * 불변식 (a) — 두 read-modify-write가 겹치면 뒤 쓰기가 앞의 편집을 지운 채 착지한다.
 * 끝 상태만 보지 않고 **쓰는 순간** 잡는다: 어느 순서에서 깨졌는지가 그대로 남는다.
 *
 * 편집이 쌓이기만 하는 시나리오에서만 쓸 수 있다. 전체 초기화는 설계상 편집을 지우므로
 * 이 잣대를 댈 수 없고, 거기서는 결과 불변식(옛 Profile이 남지 않는다)으로 본다.
 */
const noLostEdits: FakeOptions['onStateWrite'] = (previous, next) => {
  const lost = activeIds(previous).filter((id) => !activeIds(next).includes(id));
  return lost.length > 0 ? `직전 저장값의 편집이 지워졌다 (${lost.join(',')})` : null;
};

describe('S3 — 서비스워커 통합 시임', () => {
  it('전이 명령 하나가 진짜 저장소 어댑터를 지나 저장된다', async () => {
    const orderings = await forEachInterleaving({
      seed: () => ({ [STATE_KEY]: twoProfiles() }),
      start: (harness) => ({
        toggle: harness.command({ type: 'toggle-profile', profileId: 'p1', active: true }),
      }),
      check: (outcomes, harness) => {
        expect(outcomes.toggle?.status).toBe('fulfilled');
        expect(activeIds(harness.local[STATE_KEY])).toEqual(['p1']);
        expect((harness.local[STATE_KEY] as StoredState).schemaVersion).toBe(SCHEMA_VERSION);
      },
    });
    expect(orderings).toBeGreaterThan(0);
  });

  /*
   * `executor.test.ts:31`의 `겹쳐 도착한 두 전이가 모두 최종 상태에 남는다 (lost update 차단)`이
   * 여기로 옮겨 왔다 (D4). 원래 것은 실행자 자체 큐를 겨눴고 그 큐는 이제 없다 — 같은 성질을
   * **프로덕션에서 실제로 도는 기계**(레인 + 진짜 저장소 어댑터)에 대고, 한 순서가 아니라
   * 모든 순서에서 단언한다.
   */
  it('겹쳐 도착한 두 전이가 모두 최종 상태에 남는다 — 어떤 순서에서도', async () => {
    const orderings = await forEachInterleaving({
      seed: () => ({ [STATE_KEY]: twoProfiles() }),
      onStateWrite: noLostEdits,
      start: (harness) => ({
        // 팝업의 빠른 연속 조작: await 없이 두 명령이 겹친다.
        first: harness.command({ type: 'toggle-profile', profileId: 'p1', active: true }),
        second: harness.command({ type: 'toggle-profile', profileId: 'p2', active: true }),
      }),
      check: (outcomes, harness) => {
        expect(outcomes.first?.status).toBe('fulfilled');
        expect(outcomes.second?.status).toBe('fulfilled');
        expect(activeIds(harness.local[STATE_KEY])).toEqual(['p1', 'p2']);
      },
    });
    expect(orderings).toBeGreaterThan(1);
  });

  /*
   * `executor.test.ts:55`의 `명령은 도착 순서대로 적용된다`가 여기로 옮겨 왔다. 겨누는 기계가
   * 실행자 자체 큐에서 레인으로 바뀌었을 뿐 성질은 같다 — 레인은 도착 순서 FIFO이고
   * 우선순위가 없다 (D2). 같은 Profile을 켰다 끄면 끈 것이 남아야 한다.
   */
  it('명령은 도착 순서대로 적용된다 — 레인은 우선순위가 없다', async () => {
    const orderings = await forEachInterleaving({
      seed: () => ({ [STATE_KEY]: twoProfiles() }),
      // `noLostEdits`를 걸지 않는다 — 두 번째 명령이 **일부러** 첫 편집을 되돌리므로
      // 편집이 쌓이기만 한다는 그 잣대의 전제가 여기서는 성립하지 않는다.
      start: (harness) => ({
        on: harness.command({ type: 'toggle-profile', profileId: 'p1', active: true }),
        off: harness.command({ type: 'toggle-profile', profileId: 'p1', active: false }),
      }),
      check: (outcomes, harness) => {
        expect(outcomes.on?.status).toBe('fulfilled');
        expect(outcomes.off?.status).toBe('fulfilled');
        expect(activeIds(harness.local[STATE_KEY])).toEqual([]);
      },
    });
    expect(orderings).toBeGreaterThan(1);
  });

  /*
   * 마이그레이션 커밋 ↔ 전이 명령을 **양쪽 순서로** 세운다 (수용 기준 1, 플랜 게이트 r1 R-1).
   *
   * `stateStore.test.ts`의 `commitMigration — 두 writer 인터리빙` 두 건이 여기로 옮겨 왔다.
   * 원래 것은 `get`의 해결을 손으로 붙잡아 **한 순서만** 표현할 수 있었고, 지켜보던 것은
   * 커밋의 compare-and-swap이었다. 그 술어는 레인 아래에서 항상 참이라 걷혔고(D5), 같은
   * 성질 — "사용자가 한 편집이 사라지지 않는다" — 을 이제 기제가 아니라 결과로 본다.
   *   · `stateStore.test.ts:109` `첫 읽기 뒤 착지한 편집본 위에는 굳히지 않고 물러난다`
   *     → 아래 `명령이 먼저면 …` (커밋이 `할 일 없음`으로 물러나고 편집본이 최종값)
   *   · `stateStore.test.ts:133` `아무도 끼어들지 않으면 지연되어도 정상적으로 굳힌다`
   *     → 아래 `마이그레이션이 먼저면 …` (굳힌 뒤 그 위에서 명령이 계산된다)
   */
  it('마이그레이션이 먼저면 명령이 올라간 상태 위에서 계산된다', async () => {
    const orderings = await forEachInterleaving({
      // 프로필 **둘**이다 (티켓 10) — 만료 알람이 표본으로 들고 있던 성질이 여기로 옮겨 왔다:
      // 상태 전체를 되쓰는 직접 실행 경로가 **다른 프로필의 편집**을 지우지 않는지.
      seed: () => ({ [STATE_KEY]: v1StateTwoProfiles() }),
      onStateWrite: noLostEdits,
      start: (harness) => ({
        toggle: harness.command({ type: 'toggle-profile', profileId: 'p2', active: true }),
      }),
      check: (outcomes, harness) => {
        expect(outcomes.toggle?.status).toBe('fulfilled');
        const stored = harness.local[STATE_KEY] as StoredState;
        // 커밋이 굳혔고, 명령은 그 v3 위에서 계산됐다 — 규칙도 편집도 남는다.
        expect(stored.schemaVersion).toBe(SCHEMA_VERSION);
        expect(activeIds(stored)).toEqual(['p2']);
        // 커밋이 올린 p1도 그대로다 — 명령이 자기가 읽은 옛 상태로 되쓰지 않았다.
        expect(stored.profiles.map((profile) => profile.id)).toEqual(['p1', 'p2']);
        expect(stored.profiles[0]?.modifications.map((m) => m.id)).toEqual(['m1']);
        // 두 글자 라벨은 굳힌 v3에 **남아 있지 않다** (티켓 04) — 권위 저장소에서 실측한다.
        expect('shortLabel' in stored.profiles[0]!).toBe(false);
        expect(harness.errors).not.toContain('migration commit failed');
      },
    });
    expect(orderings).toBeGreaterThan(1);
  });

  it('명령이 먼저면 커밋이 "할 일 없음"으로 물러나고 편집이 최종값으로 남는다', async () => {
    const orderings = await forEachInterleaving({
      seed: () => ({ [STATE_KEY]: v1StateTwoProfiles() }),
      onStateWrite: noLostEdits,
      // 겹치게 하는 **유일한 손잡이** — 커밋은 부트스트랩이 스스로 태우므로 리스너 등록
      // 시점에 명령을 밀어 넣어야 둘이 실제로 겹친다.
      commandBeforeMigration: { type: 'toggle-profile', profileId: 'p2', active: true },
      start: () => ({}),
      check: (outcomes, harness) => {
        expect(outcomes.early?.status).toBe('fulfilled');
        const stored = harness.local[STATE_KEY] as StoredState;
        expect(stored.schemaVersion).toBe(SCHEMA_VERSION);
        expect(activeIds(stored)).toEqual(['p2']);
        expect(stored.profiles.map((profile) => profile.id)).toEqual(['p1', 'p2']);
        expect(stored.profiles[0]?.modifications.map((m) => m.id)).toEqual(['m1']);
        // 커밋은 굳힐 것이 없어 아무것도 쓰지 않는다 — 저장소에 착지한 쓰기는 명령의 것 하나뿐.
        expect(harness.stateWrites()).toBe(1);
        expect(harness.errors).not.toContain('migration commit failed');
      },
    });
    expect(orderings).toBeGreaterThan(0);
  });

  /*
   * 진입점 전수 확인 (수용 기준 2, 플랜 게이트 r1 R-1).
   *
   * "명령 수신"만 레인에 넣으면 **실행자를 직접 부르던 경로들**이 목록 밖에 남는다 — 그것이
   * R-1이었다. 아래 것은 명령 채널을 거치지 않고 실행자를 직접 부르던 자리이고, 다른 상태
   * 쓰기와 겹쳐 세워 겹친 편집이 살아남는지 본다.
   *
   * **만료 알람 두 행이 여기서 빠졌다** (티켓 10) — 그 서브시스템이 철거됐다. 증명은 지우지
   * 않고 **마이그레이션 커밋 쪽으로 옮겼다**: 위 두 시나리오(`마이그레이션이 먼저면…`,
   * `명령이 먼저면…`)가 프로필 **둘**짜리 v1을 심고 다른 프로필의 편집이 커밋을 살아남는지
   * 본다. 여기에 행으로 얹지 않은 이유는 그러면 헛돌기 때문이다 — 커밋은 부트스트랩이 스스로
   * 태우므로 `fire`로 두드릴 손잡이가 없고, `start`가 명령을 내는 시점엔 커밋이 이미 끝나 있어
   * 어떤 순서에서도 겹치지 않는다(행으로 넣어 보고 실측했다: 레인을 벗어나게 만들어도 통과했다).
   * 겹치게 하는 손잡이는 `commandBeforeMigration`이고, 그것을 쓰는 자리가 위 두 시나리오다.
   *
   * 남는 직접 경로 넷의 증거: **전역 Pause 토글**은 아래 표, **마이그레이션 커밋**은 위 둘,
   * **전체 초기화**와 **백업 변이**는 각자의 시나리오.
   *
   * 겹치는 쪽을 `toggle-profile p2`로 두는 이유: 이 진입점들의 쓰기는 자기가 읽은 상태를
   * **통째로** 되쓰므로, 레인 밖에 있으면 p2 편집을 그대로 지운다.
   */
  const directExecutorPaths: Array<{
    name: string;
    seed: () => Kv;
    fire: (harness: Harness) => void;
    verify: (stored: StoredState) => void;
  }> = [
    {
      name: '전역 Pause 토글',
      seed: () => ({ [STATE_KEY]: twoProfiles() }),
      fire: (harness) => harness.togglePause(),
      verify: (stored) => expect(stored.paused).toBe(true),
    },
  ];

  for (const path of directExecutorPaths) {
    it(`${path.name}이 레인을 지난다 — 겹친 편집이 살아남는다`, async () => {
      const orderings = await forEachInterleaving({
        seed: path.seed,
        onStateWrite: noLostEdits,
        start: (harness) => {
          path.fire(harness);
          return {
            toggle: harness.command({ type: 'toggle-profile', profileId: 'p2', active: true }),
          };
        },
        check: (outcomes, harness) => {
          expect(outcomes.toggle?.status).toBe('fulfilled');
          const stored = harness.local[STATE_KEY] as StoredState;
          expect(activeIds(stored)).toContain('p2');
          path.verify(stored);
        },
      });
      expect(orderings).toBeGreaterThan(1);
    });
  }

  /*
   * 전체 초기화는 레인을 잡은 채 **안에서 실행자를 다시 부른다** (`fullReset` → `resetState`
   * → `executor.execute`). 안쪽이 레인을 다시 잡으면 자기 자신을 기다려 교착한다 — 그래서
   * 받은 증표를 그대로 넘긴다. 시험대는 "저장소가 조용한데 끝나지 않은 조작이 남았다"를
   * 교착으로 보고하므로, 이 시나리오가 그 배선을 지킨다.
   */
  it('전체 초기화가 겹친 명령과 다투지 않고, 안쪽 재호출로 교착하지도 않는다', async () => {
    const orderings = await forEachInterleaving({
      seed: () => ({ [STATE_KEY]: twoProfiles() }),
      start: (harness) => ({
        reset: harness.command({ type: 'full-reset' }),
        toggle: harness.command({ type: 'toggle-profile', profileId: 'p2', active: true }),
      }),
      check: (outcomes, harness) => {
        expect(outcomes.reset?.status).toBe('fulfilled');
        expect(outcomes.toggle?.status).toBe('fulfilled');
        const stored = harness.local[STATE_KEY] as StoredState;
        // 어느 순서든 결과가 정의돼 있다: 초기화가 나중이면 기본값이 남고, 먼저면 뒤따른
        // 명령이 없어진 p2를 못 찾아 기본값 그대로다. 옛 Profile은 어느 쪽에서도 안 남는다.
        expect(stored.profiles.map((profile) => profile.id)).not.toContain('p1');
        expect(stored.profiles.map((profile) => profile.id)).not.toContain('p2');
        expect(stored.schemaVersion).toBe(SCHEMA_VERSION);
      },
    });
    expect(orderings).toBeGreaterThan(1);
  });

  /*
   * 거부 후 전진 (수용 기준 3, 플랜 게이트 r1 R-2).
   *
   * 실행자의 tail 체인은 결과와 무관하게 이어지도록 **명시적으로** 만들어져 있었고, 그것이
   * "실패한 명령이 뒤 명령을 막지 않는다"를 보장했다. D4가 그 장치를 걷어내면서 대체 규정을
   * 두지 않으면 거부된 promise가 레인의 꼬리가 되어 그 뒤의 모든 작업이 서비스워커 재시작까지
   * 막힌다. `executor.test.ts:104` `실패한 명령은 뒤 명령을 막지 않는다`가 여기로 옮겨 왔고,
   * 입력이 **지어낸 오류에서 설계된 거부 경로로** 바뀌었다 — 이 버전이 읽을 수 없는 상태
   * 위에 쓰라는 요청. 그 거부는 드문 사고가 아니라 정상 동작의 일부다.
   *
   * 이 시나리오에서 레인의 **첫** 작업은 부트스트랩의 마이그레이션 커밋이고, 그것부터 던진다.
   * 꼬리가 거부를 물고 있으면 뒤 명령이 영영 끝나지 않아 시험대가 교착으로 잡는다.
   */
  it('설계된 거부 뒤에도 레인이 전진하고, 실패는 그것을 요청한 쪽에만 간다', async () => {
    const orderings = await forEachInterleaving({
      // 이 버전이 읽을 수 없는 더 새 포맷 — 저장 경로는 여기에 쓰기를 거부해야 한다.
      seed: () => ({ [STATE_KEY]: { ...createDefaultState(), schemaVersion: SCHEMA_VERSION + 1 } }),
      start: (harness) => {
        const refused = harness.command({ type: 'toggle-profile', profileId: 'p1', active: true });
        const afterwards = refused.then(
          () => {
            throw new Error('읽을 수 없는 상태 위의 쓰기가 거부되지 않았다');
          },
          () => {
            // 더 새 버전을 쓰던 쪽이 이 버전도 읽을 수 있는 값을 남기고 물러난 상황.
            // `browser.storage`는 여러 컨텍스트가 공유하므로 실제로 일어나는 변화다.
            harness.local[STATE_KEY] = twoProfiles();
            return harness.command({ type: 'toggle-profile', profileId: 'p1', active: true });
          },
        );
        return { refused, afterwards };
      },
      check: (outcomes, harness) => {
        expect(outcomes.refused?.status).toBe('rejected');
        // 뒤 작업은 남의 오류를 받지 않고, 실행되어 **저장까지** 끝난다.
        expect(outcomes.afterwards?.status).toBe('fulfilled');
        expect(activeIds(harness.local[STATE_KEY])).toEqual(['p1']);
        // 불변식 (d): 읽을 수 없는 상태 위에는 아무것도 쓰이지 않았다 — 착지한 쓰기는
        // 저장소가 읽을 수 있게 된 뒤의 그 하나뿐이다.
        expect(harness.stateWrites()).toBe(1);
      },
    });
    expect(orderings).toBeGreaterThan(0);
  });

/*
   * ── 티켓 02: 백업 네임스페이스 (`bk:`) ─────────────────────────────────────
   *
   * `backupStore.test.ts`의 `스냅샷 삭제 ↔ 동시 자동 Backup (어댑터)` 두 건과
   * `background-bootstrap.test.ts`의 `삭제는 진행 중인 자동 Backup을 드레인한 뒤에야
   * 매니페스트를 읽는다` · `겹친 중단은 재진입 안전하다`가 여기로 옮겨 왔다. 행 단위 대응은
   * 티켓 저널에 있다.
   *
   * 옛 자리들이 겨눈 것은 **기계**였다(드레인 await·중단 깊이 카운터). 레인이 그 둘을 흡수했고,
   * 옛 픽스처는 `ManifestEntry`를 만족하지 않아 검증하려던 분기에 도달조차 못 했다. 여기서는
   * 진짜 어댑터와 유효한 픽스처로 **결과**를 본다 — 그것도 모든 순서에서.
   *
   * 대상 저장소를 `local`로 둔다(`syncBackup: false`). `bk:`와 권위 상태가 같은 구역에 사는
   * 쪽이 더 까다롭다 — 백업 정리가 `state`를 넘보면 여기서 드러난다.
   */
  const localBackupState = (): StoredState => ({ ...twoProfiles(), syncBackup: false });

  it('겹쳐 도착한 두 삭제가 둘 다 완료되고 서로의 결과를 지우지 않는다', async () => {
    const orderings = await forEachInterleaving({
      seed: () => ({ [STATE_KEY]: localBackupState(), ...seededBackups(['s1', 's2', 's3']) }),
      start: (harness) => ({
        first: harness.mutateBackup({ op: 'delete-snapshot', snapshotId: 's1', target: 'local' }),
        second: harness.mutateBackup({ op: 'delete-snapshot', snapshotId: 's2', target: 'local' }),
      }),
      check: (outcomes, harness) => {
        expect(outcomes.first).toMatchObject({ status: 'fulfilled', value: { ok: true } });
        expect(outcomes.second).toMatchObject({ status: 'fulfilled', value: { ok: true } });
        // 지운 둘만 사라지고 세 번째는 목록에도, 데이터에도 남는다.
        expect(snapshotIds(harness.local)).toEqual(['s3']);
        expect(harness.local[chunkKey('s3', 0)]).toBe('text-s3');
        expect(harness.local[chunkKey('s1', 0)]).toBeUndefined();
        expect(harness.local[chunkKey('s2', 0)]).toBeUndefined();
        // 불변식 (b) — 목록에 남은 항목은 전부 실제 데이터가 있다.
        expect(manifestBacked(harness.local)).toEqual([]);
        // 역방향 — 목록에 없는 청크도 남지 않는다.
        expect(orphanChunks(harness.local)).toEqual([]);
        // 권위 상태는 백업 정리에 휩쓸리지 않는다.
        expect(activeIds(harness.local[STATE_KEY])).toEqual([]);
      },
    });
    expect(orderings).toBeGreaterThan(1);
  });

  it('삭제와 자동 Backup이 겹쳐도 결과가 정합하다', async () => {
    const orderings = await forEachInterleaving({
      seed: () => ({ [STATE_KEY]: localBackupState(), ...seededBackups(['s1']) }),
      start: (harness) => {
        // 예약을 **실제로** 하나 걸어 둔다. 부트스트랩의 초기 예약은 마이그레이션 커밋이
        // 정착한 뒤에야 걸리므로, `start`에서 그냥 터뜨리면 빈 목록을 터뜨려 아무것도
        // 검증하지 않는다 (티켓 02 코드리뷰가 잡은 것).
        harness.stateChanged();
        harness.fireBackupTimers(); // 디바운스된 자동 Backup이 삭제와 겹친다
        return { deleting: harness.mutateBackup({ op: 'delete-snapshot', snapshotId: 's1', target: 'local' }) };
      },
      check: (outcomes, harness) => {
        // **정방향**: 삭제가 성공을 보고한다. `verifySnapshotDeleteComplete`가 그 사이 커밋된
        // 스냅샷이 우리 쓰기에 지워진 것을 잡으면 `{ok:false, remaining}`이 온다.
        expect(outcomes.deleting).toMatchObject({ status: 'fulfilled', value: { ok: true } });
        // 지운 행은 어느 순서에서도 되살아나지 않는다.
        expect(snapshotIds(harness.local)).not.toContain('s1');
        expect(harness.local[chunkKey('s1', 0)]).toBeUndefined();
        // 자동 Backup이 남긴 것이 있으면 그 데이터도 함께 있다.
        expect(manifestBacked(harness.local)).toEqual([]);
        // **역방향**: 목록에 없는 청크가 남지 않는다. 통째 교체가 그 사이 커밋된 항목을
        // 지웠다면 그 청크만 고아로 남으므로, 이 단언이 그 손실을 잡는다.
        expect(orphanChunks(harness.local)).toEqual([]);
      },
    });
    expect(orderings).toBeGreaterThan(1);
  });

  /*
   * 무효화된 예약은 초기화 **뒤에** 발화해도 쓰지 않는다 (D8, 티켓 02).
   *
   * 티켓 02가 백업 본문의 이중 중단 검사를 걷어냈으므로, 무효화가 요청 경계로 올라갔다.
   * 여기서 세우는 순서가 바로 그 이유다: 초기화 요청이 레인에 선 **직후**(본문은 아직
   * 시작하지 않았다) 타이머가 발화한다. 무효화가 본문 안에만 있으면 이 스냅샷이 초기화 뒤에
   * 돌아, 실패 경로에서 옛 Profile을 되살린다.
   */
  it('초기화 요청 직후 발화한 예약은 백업을 되살리지 않는다', async () => {
    const orderings = await forEachInterleaving({
      seed: () => ({ [STATE_KEY]: localBackupState(), ...seededBackups(['s1', 's2']) }),
      start: (harness) => {
        // 예약을 하나 걸어 둔다. 부트스트랩의 초기 예약은 마이그레이션 커밋이 정착한 뒤에야
        // 걸리므로, 여기서는 상태 변경으로 **동기적으로** 하나 만든다 — 그러지 않으면
        // 아래 발화가 빈 목록을 터뜨려 아무것도 검증하지 않는다.
        harness.stateChanged();
        const resetting = harness.command({ type: 'full-reset' }); // 경계에서 무효화
        harness.fireBackupTimers(); // 무효화된 예약 — 발화해도 쓰지 않아야 한다
        return { resetting };
      },
      check: (outcomes, harness) => {
        expect(outcomes.resetting?.status).toBe('fulfilled');
        // 백업이 **두 구역 모두** 비워진 채로 남는다 — 무효화된 예약이 아무것도 쓰지 않았다.
        // sync까지 보는 이유: 초기화는 `syncBackup`을 기본값(true)으로 되돌리므로, 그 뒤에 도는
        // 스냅샷은 local이 아니라 sync로 간다. local만 보면 이 단언이 조용히 통과한다.
        // (초기화 성공이 요구한 **새** 예약은 이 시나리오가 터뜨리지 않으므로, 남은 것이 있다면
        // 그것은 무효화됐어야 할 옛 예약이 쓴 것이다.)
        expect(Object.keys(harness.local).filter((key) => key.startsWith('bk:'))).toEqual([]);
        expect(Object.keys(harness.sync).filter((key) => key.startsWith('bk:'))).toEqual([]);
        // 권위 상태는 기본값으로 돌아갔고 옛 Profile은 없다.
        const stored = harness.local[STATE_KEY] as StoredState;
        expect(stored.profiles.map((profile) => profile.id)).not.toContain('p1');
      },
    });
    expect(orderings).toBeGreaterThan(0);
  });

  /*
   * 초기화가 끝까지 가면 곧바로 깨끗한 기본 상태의 스냅샷이 잡힌다 (티켓 02 수용 기준).
   *
   * 재예약만 확인하면 절반이다 — 예약이 실제로 발화했을 때 **무엇이** 스냅샷되는지가 이
   * 계약의 요점이다. `snapshot()`이 payload를 스스로 만들므로 여기서 값으로 확인할 수 있다.
   */
  it('초기화가 끝까지 가면 곧바로 깨끗한 기본 상태의 스냅샷이 잡힌다', async () => {
    const orderings = await forEachInterleaving({
      seed: () => ({ [STATE_KEY]: localBackupState(), ...seededBackups(['s1']) }),
      start: (harness) => ({ resetting: harness.command({ type: 'full-reset' }) }),
      check: (outcomes, harness) => {
        expect(outcomes.resetting?.status).toBe('fulfilled');
        // 초기화가 요구한 재예약이 걸려 있다 — 그것을 터뜨린다.
        harness.fireBackupTimers();
      },
      // 재예약된 스냅샷이 정착한 뒤의 결과를 본다.
      after: (harness) => {
        // 기본값은 `syncBackup: true`이므로 스냅샷은 클라우드 구역으로 간다.
        expect(snapshotIds(harness.sync)).toHaveLength(1);
        expect(manifestBacked(harness.sync)).toEqual([]);
        // 옛 스냅샷은 되살아나지 않았다.
        expect(Object.keys(harness.local).filter((key) => key.startsWith('bk:'))).toEqual([]);
      },
    });
    expect(orderings).toBeGreaterThan(0);
  });

  /*
   * 초기화 **도중에** 요청된 스냅샷도 그 뒤에 착지하지 않는다 (티켓 02 코드리뷰).
   *
   * 경계 무효화는 요청 **앞**에 걸린 예약만 막는다. 초기화가 레인에 선 뒤 걸린 예약은 새 세대를
   * 들고 있어 그 검사를 통과하고, 발화하면 스냅샷이 초기화 **뒤**에 선다 — 초기화가
   * reset-state에서 실패하면 상태가 아직 옛 Profile이라 방금 지운 백업이 되살아난다. 그래서
   * 쓰기 문이 완료된 초기화 횟수를 세고, 요청 시점보다 값이 달라진 스냅샷은 쓰지 않는다.
   */
  it('초기화 도중에 요청된 스냅샷은 초기화 뒤에 쓰지 않는다', async () => {
    const orderings = await forEachInterleaving({
      seed: () => ({ [STATE_KEY]: localBackupState(), ...seededBackups(['s1']) }),
      start: (harness) => {
        const resetting = harness.command({ type: 'full-reset' }); // 경계에서 세대 무효화
        harness.stateChanged(); // 초기화가 레인에 선 **뒤** 걸린 새 예약 (새 세대)
        harness.fireBackupTimers(); // 세대 검사를 통과한다 — 문이 막아야 한다
        return { resetting };
      },
      check: (outcomes, harness) => {
        expect(outcomes.resetting?.status).toBe('fulfilled');
        // 어느 구역에도 스냅샷이 남지 않는다. 초기화 성공이 요구한 **새** 예약은 이 시나리오가
        // 터뜨리지 않으므로, 남은 것이 있다면 초기화 도중 요청된 그 스냅샷이 쓴 것이다.
        expect(Object.keys(harness.local).filter((key) => key.startsWith('bk:'))).toEqual([]);
        expect(Object.keys(harness.sync).filter((key) => key.startsWith('bk:'))).toEqual([]);
      },
    });
    expect(orderings).toBeGreaterThan(0);
  });

  it('전체 초기화가 겹친 삭제와 다투지 않는다', async () => {
    const orderings = await forEachInterleaving({
      seed: () => ({ [STATE_KEY]: localBackupState(), ...seededBackups(['s1', 's2']) }),
      start: (harness) => ({
        resetting: harness.command({ type: 'full-reset' }),
        deleting: harness.mutateBackup({ op: 'delete-snapshot', snapshotId: 's1', target: 'local' }),
      }),
      check: (outcomes, harness) => {
        expect(outcomes.resetting?.status).toBe('fulfilled');
        expect(outcomes.deleting?.status).toBe('fulfilled');
        // 어느 순서든 결과가 정의돼 있다: 백업은 비고, 남은 것이 있어도 데이터와 짝이 맞는다.
        expect(manifestBacked(harness.local)).toEqual([]);
        expect(manifestBacked(harness.sync)).toEqual([]);
        expect(Object.keys(harness.local).filter((key) => key.startsWith('bk:'))).toEqual([]);
      },
    });
    expect(orderings).toBeGreaterThan(1);
  });

  /*
   * 클라우드 삭제 ↔ 자동 Backup (티켓 03).
   *
   * 티켓 03 이전에는 클라우드 삭제만 **화면에서** 직접 실행되어 `bk:` writer가 두 실행
   * 컨텍스트에 서 있었다 — 서비스워커의 자동 Backup과 화면의 삭제가 서로를 모른 채 같은
   * 네임스페이스를 고쳤다. 지금은 둘이 같은 레인 작업이라 겹칠 수 없다.
   *
   * 자동 Backup의 대상이 sync가 되도록 `syncBackup: true`(기본값)를 쓴다 — 삭제와 백업이
   * **같은 구역**을 다투는 것이 이 조합의 요점이다.
   */
  it('클라우드 삭제와 자동 Backup이 겹쳐도 결과가 정합하다', async () => {
    const orderings = await forEachInterleaving({
      seed: () => ({ [STATE_KEY]: twoProfiles() }), // syncBackup 기본값 true → 백업은 sync로
      seedSync: () => seededBackups(['c1', 'c2']),
      start: (harness) => {
        harness.stateChanged(); // 예약을 실제로 걸고
        harness.fireBackupTimers(); // 그것을 삭제와 겹친다
        return { clearing: harness.mutateBackup({ op: 'clear-cloud' }) };
      },
      check: (outcomes, harness) => {
        // 레인이 작업 순서를 고정한다(백업 → 삭제). 그래서 결과는 한 가지다: 삭제가 마지막에
        // 돌아 **정말로** 비운다. 잔재가 남는 갈래를 `if`로 열어 두면 도달하지 않는 가지가
        // 검증하는 척하게 되므로, 여기서는 그 결정된 값을 그대로 단언한다.
        expect(outcomes.clearing).toMatchObject({ status: 'fulfilled', value: { ok: true } });
        expect(Object.keys(harness.sync).filter((key) => key.startsWith('bk:'))).toEqual([]);
        // 그리고 어느 저장소 순서에서도 목록과 데이터가 어긋나지 않는다.
        expect(manifestBacked(harness.sync)).toEqual([]);
        expect(orphanChunks(harness.sync)).toEqual([]);
      },
    });
    expect(orderings).toBeGreaterThan(1);
  });

  it('클라우드 삭제와 스냅샷 삭제가 겹쳐도 서로의 결과를 덮지 않는다', async () => {
    const orderings = await forEachInterleaving({
      seed: () => ({ [STATE_KEY]: twoProfiles() }),
      seedSync: () => seededBackups(['c1', 'c2', 'c3']),
      start: (harness) => ({
        clearing: harness.mutateBackup({ op: 'clear-cloud' }),
        deleting: harness.mutateBackup({
          op: 'delete-snapshot',
          snapshotId: 'c1',
          target: 'sync',
        }),
      }),
      check: (outcomes, harness) => {
        expect(outcomes.clearing?.status).toBe('fulfilled');
        expect(outcomes.deleting?.status).toBe('fulfilled');
        // 두 동작이 같은 방향이므로 끝은 하나다: 클라우드가 비어 있다.
        expect(Object.keys(harness.sync).filter((key) => key.startsWith('bk:'))).toEqual([]);
        // 그리고 어느 쪽도 목록만 남기거나 데이터만 남기지 않았다.
        expect(manifestBacked(harness.sync)).toEqual([]);
        expect(orphanChunks(harness.sync)).toEqual([]);
      },
    });
    expect(orderings).toBeGreaterThan(1);
  });

  it('이미 지운 행을 다시 지워도 오류가 나지 않는다', async () => {
    const orderings = await forEachInterleaving({
      seed: () => ({ [STATE_KEY]: localBackupState(), ...seededBackups(['s1']) }),
      start: (harness) => ({
        first: harness.mutateBackup({ op: 'delete-snapshot', snapshotId: 's1', target: 'local' }),
        again: harness.mutateBackup({ op: 'delete-snapshot', snapshotId: 's1', target: 'local' }),
      }),
      check: (outcomes, harness) => {
        expect(outcomes.first).toMatchObject({ status: 'fulfilled', value: { ok: true } });
        expect(outcomes.again).toMatchObject({ status: 'fulfilled', value: { ok: true } });
        expect(snapshotIds(harness.local)).toEqual([]);
        expect(manifestBacked(harness.local)).toEqual([]);
        expect(orphanChunks(harness.local)).toEqual([]);
      },
    });
    expect(orderings).toBeGreaterThan(1);
  });

  /*
   * ── 티켓 04: 축출 중 읽기 펜스 (D7) ───────────────────────────────────────
   *
   * 백업 계획의 **사전 정리**는 링에서 밀려나는 항목의 청크를 지우고, 그 청크들은 아직 커밋된
   * 옛 매니페스트가 열거하고 있다. 사전 정리는 매니페스트 교체보다 **먼저** 일어나므로 그 사이에
   * 읽으면 목록에는 있고 데이터는 없는 항목을 보게 되어 멀쩡한 Backup이 '손상됨'으로 그려진다.
   *
   * `MAX_SNAPSHOTS`(5)만큼 깔아 두면 다음 백업이 가장 오래된 것을 링에서 밀어내므로 `preRemoves`가
   * 실제로 생긴다 — 창을 흉내내지 않고 프로덕션 계획이 만들게 한다.
   *
   * 펜스가 **유계** 시간을 넉넉히 잡아도 이 시나리오는 결정론적이다: 탐색기가 보류 중인 저장소
   * 작업을 모두 풀어 주므로 매니페스트 커밋은 어떤 순서에서도 결국 착지하고, 그때 변경 이벤트가
   * 온다. 커밋이 영영 오지 않는 순서는 아래 별 시나리오가 본다.
   */
  const FENCE_WAIT_MS = 5_000;

  it('축출 중에 히스토리를 읽어도 멀쩡한 Backup이 손상으로 보이지 않는다', async () => {
    const orderings = await forEachInterleaving({
      seed: () => ({ [STATE_KEY]: twoProfiles() }), // syncBackup 기본값 true → 백업은 sync로
      seedSync: () => seededBackups(['c1', 'c2', 'c3', 'c4', 'c5']), // 링이 꽉 찼다
      start: (harness) => {
        harness.stateChanged();
        harness.fireBackupTimers(); // 축출을 일으키는 백업
        return { listing: listBackupSnapshots('sync', FENCE_WAIT_MS) };
      },
      check: (outcomes, harness) => {
        const listing = outcomes.listing as PromiseFulfilledResult<SnapshotStatus[]>;
        expect(listing.status).toBe('fulfilled');
        // 어떤 순서에서도 손상으로 그려지는 항목이 없다. 단순 재시도는 사전 정리 뒤 커밋 앞
        // 창에 **두 읽기가 모두** 드는 순서에서 여기서 깨진다.
        expect(listing.value.filter((entry) => entry.status === 'corrupt')).toEqual([]);
        /*
         * **축출이 정말 일어났는지 못 박는다.** 이것이 없으면 링을 덜 채워 창이 아예 열리지
         * 않게 만들어도 위 단언이 그대로 통과한다 — 검증하려던 분기에 도달조차 못 하는 그 모양이다.
         *
         * 단언 대상은 **끝 상태**다. 읽기가 쓰기보다 먼저 이기는 순서에서는 목록이 축출 전
         * 다섯을 그대로 보여 주는 것이 정답이므로, 목록에 축출을 요구하면 그 순서가 거짓
         * 실패가 된다. 창이 열렸는지는 저장소가 답한다.
         */
        const settled = snapshotIds(harness.sync);
        expect(settled).toHaveLength(5); // 새 스냅샷 + 살아남은 넷 (MAX_SNAPSHOTS)
        expect(settled).not.toContain('c5'); // 가장 오래된 것이 링에서 밀려났다
        expect(settled).toContain('c1'); // 직전 정상본은 남는다
        // 그리고 저장소는 정합하다 — 목록에 남은 항목은 전부 데이터가 있다.
        expect(manifestBacked(harness.sync)).toEqual([]);
      },
    });
    expect(orderings).toBeGreaterThan(1);
  });

  /*
   * 사전 정리 뒤 워커가 종료돼 **커밋이 영영 오지 않는** 순서 (티켓 04 수용 기준).
   *
   * 그 시점의 저장소는 정말로 불일치이므로 유계 시간 뒤 손상 판정이 사실상 옳다 — 다음 백업
   * 계획의 self-healing이 그 항목을 치운다. **이 케이스가 없으면 펜스를 무한 대기로 구현해도
   * 통과한다.** 그래서 쓰기를 아예 세우지 않고, 불일치한 저장소를 그대로 둔 채 읽는다.
   */
  it('커밋이 오지 않으면 유계 시간 뒤 손상으로 판정한다 — 무한히 기다리지 않는다', async () => {
    const orderings = await forEachInterleaving({
      seed: () => ({ [STATE_KEY]: twoProfiles() }),
      // 매니페스트는 c1·c2를 열거하는데 c1의 청크가 없다 — 중단된 축출이 남긴 모양.
      seedSync: () => {
        const kv = seededBackups(['c1', 'c2']);
        delete kv[chunkKey('c1', 0)];
        return kv;
      },
      start: () => ({ listing: listBackupSnapshots('sync', 1) }),
      check: (outcomes) => {
        const listing = outcomes.listing as PromiseFulfilledResult<SnapshotStatus[]>;
        expect(listing.status).toBe('fulfilled');
        // 진짜로 유실된 것은 그대로 손상이고, 사유가 함께 온다.
        const corrupt = listing.value.filter((entry) => entry.status === 'corrupt');
        expect(corrupt.map((entry) => entry.id)).toEqual(['c1']);
        expect(corrupt[0]?.reason).toBeDefined();
        // 멀쩡한 것은 손상으로 번지지 않는다.
        expect(listing.value.find((entry) => entry.id === 'c2')?.status).toBe('ok');
      },
    });
    expect(orderings).toBeGreaterThan(0);
  });

  /*
   * 불변식 (d)의 **쓰기측** 계약 (D5가 남긴 둘 중 하나).
   *
   * 위 시나리오는 읽기가 먼저 막혀 저장 경로까지 가지 않는다. 여기서는 읽기가 **성공한 뒤**
   * 저장소가 이 버전이 읽을 수 없는 값으로 바뀌는 순서를 세운다 — 더 새 버전의 확장이 같은
   * `browser.storage`에 쓰면 실제로 일어나는 일이다. 그때 `persistState`의 덮어쓰기 가드가
   * 읽어 온 값을 되쓰지 않고 거부해야 한다. 레인은 이 가드를 대체하지 않는다: 동시성이
   * 아니라 Schema Version 호환성 계약이다.
   */
  it('읽은 뒤 저장소가 읽을 수 없는 값으로 바뀌면 되쓰지 않고 거부한다', async () => {
    const orderings = await forEachInterleaving({
      seed: () => ({ [STATE_KEY]: twoProfiles() }),
      // 명령을 레인의 **첫** 작업으로 세운다 — 그래야 이 명령의 load가 `state`의 첫 읽기이고,
      // 마이그레이션 커밋·재조정의 읽기가 순번에 섞이지 않는다.
      commandBeforeMigration: { type: 'toggle-profile', profileId: 'p1', active: true },
      // load가 집어 간 직후, 쓰기 직전 가드가 읽기 전에 바깥에서 값이 바뀐다.
      afterStateRead: (reads, kv) => {
        if (reads === 1) {
          kv[STATE_KEY] = { ...createDefaultState(), schemaVersion: SCHEMA_VERSION + 1 };
        }
      },
      start: () => ({}),
      check: (outcomes, harness) => {
        expect(outcomes.early?.status).toBe('rejected');
        expect(String((outcomes.early as PromiseRejectedResult).reason)).toContain(
          'Refusing to overwrite',
        );
        // 저장소에는 더 새 포맷이 그대로 남는다 — 이 버전이 아무것도 덮지 않았다.
        expect((harness.local[STATE_KEY] as StoredState).schemaVersion).toBe(SCHEMA_VERSION + 1);
        expect(harness.stateWrites()).toBe(0);
      },
    });
    expect(orderings).toBeGreaterThan(0);
  });
});

/*
 * 쓰기 허가는 콜러에게 나가지 않는다 (structure 게이트 r1 + 그 뒤 적대적 검증).
 *
 * 처음 만든 것은 허가를 진입점들에 나눠 주는 시임이었고, 그래서 **한 획득 안에서 fan-out하면
 * 릴리스 r3의 R-2가 되살아났다** — 두 `execute`가 서로 겹쳐 앞 전이가 조용히 사라졌다.
 * 지금은 저장소를 고치려는 쪽이 쓰기 서비스의 매소드를 부르고, 매소드마다 자기 레인 작업이
 * 되므로 겹쳐 불러도 정상적으로 직렬화된다. 그것이 여기서 세우는 첫 단언이다.
 *
 * 허가 자체의 유효 기간 계약도 함께 세운다 — 허가가 이 모듈 밖으로 나가지 않는 것이 1차
 * 방어이고, 유효 기간은 그 방어가 뚫렸을 때 조용한 손상 대신 오류가 나게 하는 2차 방어다.
 */
describe('쓰기 서비스가 저장소를 고치는 유일한 문이다', () => {
  const seeded = (seed: StoredState): { local: Kv; sync: Kv; stateWrites: () => number } =>
    installStorageFake({ local: { [STATE_KEY]: seed }, sync: {} }, new ImmediateScheduler([]), [], {});

  const writerOn = (): ReturnType<typeof createStateWriter> =>
    createStateWriter({ validateCommand: async () => null });

  it('겹쳐 부른 매소드는 직렬화된다 — 두 전이가 모두 최종 상태에 남는다', async () => {
    const store = seeded({ ...twoProfiles(), paused: false, badgeVisible: true });
    const writer = writerOn();

    // 이 모양이 앞선 시임에서 lost update였다: 한 획득 안의 `Promise.all`.
    // 이제는 두 레인 작업이 되어 서로 겹치지 않는다.
    const [first, second] = await Promise.all([
      writer.execute({ type: 'set-paused', paused: true }),
      writer.execute({ type: 'set-badge-visible', visible: false }),
    ]);

    expect(first.paused).toBe(true);
    expect(second.badgeVisible).toBe(false);
    const stored = store.local[STATE_KEY] as StoredState;
    // 둘 다 남아야 한다 — 앞 전이가 사라지면 그것이 R-2다.
    expect(stored.paused).toBe(true);
    expect(stored.badgeVisible).toBe(false);
    expect(store.stateWrites()).toBe(2);
  });

  it('겹쳐 부른 매소드가 셋이어도 전부 남는다', async () => {
    const store = seeded({ ...twoProfiles(), paused: false, badgeVisible: true, theme: 'system' });
    const writer = writerOn();

    await Promise.all([
      writer.execute({ type: 'set-paused', paused: true }),
      writer.execute({ type: 'set-badge-visible', visible: false }),
      writer.execute({ type: 'set-theme', theme: 'dark' }),
    ]);

    const stored = store.local[STATE_KEY] as StoredState;
    expect({ paused: stored.paused, badge: stored.badgeVisible, theme: stored.theme }).toEqual({
      paused: true,
      badge: false,
      theme: 'dark',
    });
  });

  /** 작업 안에서 허가를 빼내 온다 — 지연 콜백이 붙잡아 두는 그 모양. */
  const capturePermit = async (): Promise<WritePermit> => {
    let captured: WritePermit | undefined;
    await createWriterLane().run(async (permit) => {
      captured = permit;
    });
    if (captured === undefined) throw new Error('허가를 잡지 못했다');
    return captured;
  };

  it('작업이 끝난 뒤 붙잡아 둔 허가로는 권위 상태를 쓸 수 없다', async () => {
    const store = seeded(twoProfiles());
    const stale = await capturePermit();

    await expect(persistState(stale, createDefaultState())).rejects.toThrow('no longer held');

    expect(store.stateWrites()).toBe(0);
    expect((store.local[STATE_KEY] as StoredState).profiles.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('붙잡아 둔 허가로는 마이그레이션 커밋도 할 수 없다', async () => {
    const store = seeded(twoProfiles());
    const stale = await capturePermit();

    await expect(commitMigration(stale)).rejects.toThrow('no longer held');
    expect(store.stateWrites()).toBe(0);
  });

  it('허가는 동결되어 검사기를 갈아끼울 수 없다', async () => {
    const store = seeded(twoProfiles());
    const stale = await capturePermit();

    // 얼리지 않았다면 이 한 줄이 캐스트 없이 검사기를 무력화했다.
    expect(() => {
      (stale as unknown as { assertLive: () => void }).assertLive = () => {};
    }).toThrow();
    await expect(persistState(stale, createDefaultState())).rejects.toThrow('no longer held');
    expect(store.stateWrites()).toBe(0);
  });

  /*
   * `runtime/executor.test.ts:60`의 `validate가 거부한 명령은 상태를 바꾸지 않는다`가 여기로
   * 옮겨 왔다 — 그 모듈은 쓰기 문에 흡수되어 사라졌다(D4가 이미 10줄로 줄여 둔 것을 폐기합).
   * 경합과 무관한 단위 성질이지만 겨눌 자리가 이제 이 문뿐이다.
   */
  it('검증이 거부한 명령은 상태를 바꾸지 않는다', async () => {
    const store = seeded(twoProfiles());
    const writer = createStateWriter({
      validateCommand: async (command) =>
        command.type === 'add-modification' ? 'Invalid regex' : null,
    });

    await expect(
      writer.execute({
        type: 'add-modification',
        profileId: 'p1',
        modification: {
          kind: 'redirect',
          id: 'm1',
          pattern: '(',
          substitution: '',
          comment: '',
          enabled: true,
        },
      }),
    ).rejects.toThrow('Invalid regex');

    expect(store.stateWrites()).toBe(0);
    // 거부 뒤에도 문은 전진한다 — 다음 명령이 저장까지 끝난다.
    await writer.execute({ type: 'toggle-profile', profileId: 'p1', active: true });
    expect(activeIds(store.local[STATE_KEY])).toEqual(['p1']);
  });

  it('작업이 도는 동안에는 그 허가로 쓸 수 있다 — 검사가 정상 경로를 막지 않는다', async () => {
    const store = seeded(twoProfiles());

    await createWriterLane().run(async (permit) => {
      await persistState(permit, { ...twoProfiles(), paused: true });
    });

    expect(store.stateWrites()).toBe(1);
    expect((store.local[STATE_KEY] as StoredState).paused).toBe(true);
  });
});

/**
 * 레인 획득이 **타입으로 강제된다** (D3).
 *
 * 이 함수는 실행되지 않는다 — `tsc --noEmit`(`bun run check`)만이 읽는다. 아래 호출이 언젠가
 * 유효해지면 `@ts-expect-error`가 쓸모없어져 **타입 검사가 실패한다.** 즉 이 블록이 green인
 * 동안에는 여기 적힌 우회들이 컴파일되지 않는다는 뜻이다.
 *
 * **타입이 막는 것과 막지 못하는 것을 함께 적는다.** 타입은 증표 없는 호출, 지어낸 모양,
 * 반환값을 통한 탈출을 막는다. 막지 못하는 것은 (1) 클로저로 붙잡아 두는 것 — 위
 * `증표는 레인 밖에서 쓸 수 없다`가 런타임에서 잡는다 — 과 (2) `as unknown as Held`로 이중
 * 캐스트하며 `assertLive`를 스텁으로 지어내는 것이다. (2)는 어떤 리팩터링에서도 우연히
 * 나오지 않는 의도적 행위이고(캐스트 둘 + 가짜 검사기), 화면이 **유효한** 증표를 얻는 경로는
 * `scripts/writer-lane-gate.mjs`가 번들에서 막는다. 두 기제가 서로 다른 구멍을 맡는다.
 */
export async function _laneAcquisitionIsTypeEnforced(): Promise<void> {
  // @ts-expect-error 허가 없이는 권위 상태를 쓸 수 없다
  void persistState(createDefaultState());
  // @ts-expect-error 지어낸 객체는 허가가 아니다
  void persistState({ assertLive: () => {} }, createDefaultState());
  // @ts-expect-error 마이그레이션 커밋도 허가를 요구한다
  void commitMigration();
  // @ts-expect-error 허가는 작업의 반환값으로 레인을 빠져나갈 수 없다 (structure r1 R-1)
  const escaped: WritePermit = await createWriterLane().run(async (permit) => permit);
  void escaped;
  // 레인 안에서는 통과한다 — 그리고 이 자리가 `runtime/state-writer.ts` 하나뿐이다.
  void createWriterLane().run((permit) => persistState(permit, createDefaultState()));
}
