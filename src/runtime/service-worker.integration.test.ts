import { describe, expect, it } from 'vitest';
import type { Command } from '@/core/commands';
import {
  createDefaultState,
  isBlockedFromOverwrite,
  SCHEMA_VERSION,
  type StoredState,
} from '@/core/schema';
import { createWriterLane } from '@/core/writer-lane';
import {
  clearSummary,
  commitMigration,
  loadState,
  persistState,
  publishSummary,
  readState,
} from '@/platform/stateStore';
import { readBackupKV, removeBackupKeys } from '@/platform/backupStore';
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
  seed: Kv,
  scheduler: Scheduler,
  violations: Violations,
  options: FakeOptions,
): { local: Kv; stateWrites: () => number } {
  const local: Kv = structuredClone(seed);
  const sync: Kv = {};
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
    },
    remove: async (query: string | string[]): Promise<void> => {
      if (parked) await scheduler.park(`${name}.remove`);
      for (const key of typeof query === 'string' ? [query] : query) delete kv[key];
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
      onChanged: { addListener: () => {} },
    },
  };

  return { local, stateWrites: () => stateWrites };
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
  /** 저장소의 현재 내용 (local 구역) */
  local: Kv;
  /** `state` 키에 착지한 쓰기 횟수 — "아무것도 쓰지 않았다"는 횟수로만 관측된다. */
  stateWrites: () => number;
  /** `logError`로 올라온 맥락 문자열 */
  errors: string[];
}

interface Scenario {
  /** 매 순서마다 새로 깔리는 저장소 시드 */
  seed: () => Kv;
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
  const { local, stateWrites } = installStorageFake(scenario.seed(), scheduler, violations, {
    onStateWrite: scenario.onStateWrite,
    afterStateRead: scenario.afterStateRead,
  });

  let command: (c: Command) => Promise<StoredState> = async () => {
    throw new Error('onCommand 핸들러가 등록되지 않았다');
  };
  let togglePause = (): void => {};
  let expiryAlarm = (): void => {};
  let stateChanged = (): void => {};
  let early: Promise<StoredState> | undefined;
  const errors: string[] = [];

  bootstrap({
    // ── 진짜 저장소 어댑터 (S3의 본령) ──
    loadState,
    readState,
    persistState,
    commitMigration,
    publishSummary,
    clearSummary,
    readBackupKV,
    removeBackupKeys,
    // ── 저장소 밖 효과 — 이 티켓의 불변식과 무관하다 ──
    queryTabInfos: async () => [],
    performBackup: async () => undefined,
    deleteBackupSnapshot: async () => ({ ok: true }),
    onSnapshotDeleteRequest: () => {},
    replaceSessionRules: async () => {},
    applyBadge: async () => {},
    scheduleExpiryAlarm: async () => {},
    validateCommand: async () => null,
    now: () => scenario.now ?? 1000,
    // 백업 타이머는 걸리기만 하고 발화하지 않는다 — 자동 Backup은 티켓 02가 레인에 넣는다.
    setTimer: () => {},
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
    onExpiryAlarm: (callback) => {
      expiryAlarm = callback;
    },
    onStateChanged: (callback) => {
      stateChanged = callback;
    },
    onTabsChanged: () => {},
    onStartup: () => {},
    onInstalled: () => {},
    logError: (context) => errors.push(context),
  } satisfies BackgroundDeps);

  const harness: Harness = {
    command: (c) => command(c),
    togglePause: () => togglePause(),
    expiryAlarm: () => expiryAlarm(),
    stateChanged: () => stateChanged(),
    local,
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

  for (let guard = 0; guard <= 500; guard += 1) {
    await settle();
    if (scheduler.parked.length === 0) break;
    scheduler.step();
    if (guard === 500) throw new Error('스케줄러가 수렴하지 않았다');
  }

  // 보류 중인 저장소 작업이 없는데 아직 끝나지 않은 조작이 있으면 그것은 교착이다.
  await settle();
  if (pending.size > 0) {
    throw new Error(`교착: 저장소가 조용한데 끝나지 않은 조작이 남았다 — ${[...pending]}`);
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
      { id: 'p1', name: 'One', active: false, shortLabel: '1', color: '#2563eb', modifications: [] },
      { id: 'p2', name: 'Two', active: false, shortLabel: '2', color: '#16a34a', modifications: [] },
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

/** p1은 활성이고 지난 만료를 하나 들고 있다 — 만료 전이가 실제로 무언가를 바꾸도록. */
function expiredRuleState(): StoredState {
  return {
    ...createDefaultState(),
    profiles: [
      {
        id: 'p1',
        name: 'One',
        active: true,
        shortLabel: '1',
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
      { id: 'p2', name: 'Two', active: false, shortLabel: '2', color: '#16a34a', modifications: [] },
    ],
  };
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
      seed: () => ({ [STATE_KEY]: v1State() }),
      onStateWrite: noLostEdits,
      start: (harness) => ({
        toggle: harness.command({ type: 'toggle-profile', profileId: 'p1', active: true }),
      }),
      check: (outcomes, harness) => {
        expect(outcomes.toggle?.status).toBe('fulfilled');
        const stored = harness.local[STATE_KEY] as StoredState;
        // 커밋이 굳혔고, 명령은 그 v2 위에서 계산됐다 — 규칙도 편집도 남는다.
        expect(stored.schemaVersion).toBe(SCHEMA_VERSION);
        expect(activeIds(stored)).toEqual(['p1']);
        expect(stored.profiles[0]?.modifications.map((m) => m.id)).toEqual(['m1']);
        expect(harness.errors).not.toContain('migration commit failed');
      },
    });
    expect(orderings).toBeGreaterThan(1);
  });

  it('명령이 먼저면 커밋이 "할 일 없음"으로 물러나고 편집이 최종값으로 남는다', async () => {
    const orderings = await forEachInterleaving({
      seed: () => ({ [STATE_KEY]: v1State() }),
      onStateWrite: noLostEdits,
      commandBeforeMigration: { type: 'toggle-profile', profileId: 'p1', active: true },
      start: () => ({}),
      check: (outcomes, harness) => {
        expect(outcomes.early?.status).toBe('fulfilled');
        const stored = harness.local[STATE_KEY] as StoredState;
        expect(stored.schemaVersion).toBe(SCHEMA_VERSION);
        expect(activeIds(stored)).toEqual(['p1']);
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
   * R-1이었다. 아래 셋은 명령 채널을 거치지 않고 실행자를 직접 부르던 자리이고, 각각을 다른
   * 상태 쓰기와 겹쳐 세워 겹친 편집이 살아남는지 본다. 나머지 셋(전이 명령 수신 · 부트스트랩
   * 마이그레이션 커밋 · 전체 초기화)은 위·아래 시나리오가 각각 덮는다.
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
    {
      name: '만료 알람',
      seed: () => ({ [STATE_KEY]: expiredRuleState() }),
      fire: (harness) => harness.expiryAlarm(),
      verify: (stored) => expect(stored.profiles[0]?.modifications[0]?.enabled).toBe(false),
    },
    {
      name: '재조정 중 발견된 지난 만료',
      seed: () => ({ [STATE_KEY]: expiredRuleState() }),
      // 부트스트랩의 첫 converge가 스스로 찾아 태운다 — 두드릴 손잡이가 따로 없는 진입점이다.
      fire: () => {},
      verify: (stored) => expect(stored.profiles[0]?.modifications[0]?.enabled).toBe(false),
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

/**
 * 레인 획득이 **타입으로 강제된다** (D3).
 *
 * 이 함수는 실행되지 않는다 — `tsc --noEmit`(`bun run check`)만이 읽는다. 아래 호출이 언젠가
 * 유효해지면 `@ts-expect-error`가 쓸모없어져 **타입 검사가 실패한다.** 즉 이 블록이 green인
 * 동안에는 레인 밖에서 권위 상태를 쓸 방법이 없다는 뜻이다.
 */
export function _laneAcquisitionIsTypeEnforced(): void {
  // @ts-expect-error 토큰 없이는 권위 상태를 쓸 수 없다
  void persistState(createDefaultState());
  // @ts-expect-error 레인 밖에서 지어낸 객체는 토큰이 아니다
  void persistState({}, createDefaultState());
  // @ts-expect-error 마이그레이션 커밋도 토큰을 요구한다
  void commitMigration();
  // 레인 안에서는 통과한다.
  void createWriterLane().run((held) => persistState(held, createDefaultState()));
}
