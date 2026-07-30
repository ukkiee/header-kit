import { afterEach, describe, expect, it } from 'vitest';
import { BACKUP_MANIFEST_KEY, chunkKey, checksum, type ManifestEntry } from '@/core/backup';
import { createWriterLane } from '@/core/writer-lane';
import { clearCloudBackups, deleteBackupSnapshot, listBackupSnapshots } from '@/platform/backupStore';

/**
 * 클라우드 삭제는 순수 함수가 아니라 **remove → 재조회 → 검증** 경로다. core 단위 테스트
 * (`backup.test.ts`)는 `backupKeys`/`verifyBackupsCleared`가 무엇을 답하는지만 알 뿐,
 * 어댑터가 그 답을 실제로 존중하는지는 모른다 — remove가 일부만 지우거나 던졌을 때
 * 성공으로 접히면 "지웠다"가 거짓 표시가 된다. 두 경로를 여기서 못 박는다.
 */

type KV = Record<string, unknown>;

/**
 * 백업 키와 **권위 상태가 함께 사는** 저장소 구역을 흉내 낸다.
 *
 * `onChanged` 구독자를 세어 둔다 (티켓 04) — 읽기 펜스가 읽기 한 번마다 구독을 열었다 닫으므로,
 * 남기지 않는지를 그 수로 관측한다.
 */
const fakeListeners: unknown[] = [];

function installFakeStorage(seed: KV, removeImpl?: (keys: string[], kv: KV) => void): KV {
  const kv: KV = structuredClone(seed);
  fakeListeners.length = 0;
  const area = {
    get: async () => structuredClone(kv),
    set: async (items: KV) => {
      Object.assign(kv, items);
    },
    remove: async (keys: string[]) => {
      if (removeImpl) return removeImpl(keys, kv);
      for (const key of keys) delete kv[key];
    },
  };
  (globalThis as unknown as { browser: unknown }).browser = {
    storage: {
      sync: area,
      local: area,
      onChanged: {
        addListener: (listener: unknown) => fakeListeners.push(listener),
        removeListener: (listener: unknown) => {
          const at = fakeListeners.indexOf(listener);
          if (at >= 0) fakeListeners.splice(at, 1);
        },
      },
    },
  };
  return kv;
}

const SEED: KV = {
  [BACKUP_MANIFEST_KEY]: { version: 1, snapshots: [] },
  'bk:s1:0': 'chunk-0',
  'bk:s1:1': 'chunk-1',
  state: { profiles: ['keep-me'] },
};

afterEach(() => {
  delete (globalThis as unknown as { browser?: unknown }).browser;
});

/**
 * 두 변이 모두 레인 안에서만 돈다 — 허가는 `lane.run` 밖에서 만들 수 없다 (ADR 0016).
 * 티켓 03 이전에는 클라우드 삭제가 **화면에서** 직접 불렸고, 그래서 `bk:` writer가 두 실행
 * 컨텍스트에 서 있었다.
 */
const clearCloudInLane = () => createWriterLane().run((permit) => clearCloudBackups(permit));

describe('클라우드 백업 삭제 (어댑터)', () => {
  it('백업 네임스페이스만 지우고, 재조회 검증이 비었을 때 성공을 보고한다', async () => {
    const kv = installFakeStorage(SEED);

    const result = await clearCloudInLane();

    expect(result).toEqual({ ok: true });
    expect(Object.keys(kv).filter((key) => key.startsWith('bk:'))).toEqual([]);
    // 권위 상태는 같은 구역에 있어도 살아남는다 — 삭제가 구역 비우기로 번역되면 안 된다.
    expect(kv.state).toEqual({ profiles: ['keep-me'] });
  });

  it('remove가 청크를 남기면 성공으로 접지 않고 잔재를 남긴 채 실패를 보고한다', async () => {
    // 매니페스트만 지우고 청크를 남기는 부분 삭제 — 잔재가 조용히 사라지는 경우.
    const kv = installFakeStorage(SEED, (_keys, store) => {
      delete store[BACKUP_MANIFEST_KEY];
    });

    const result = await clearCloudInLane();

    expect(result.ok).toBe(false);
    expect(Object.keys(kv).filter((key) => key.startsWith('bk:'))).toEqual(['bk:s1:0', 'bk:s1:1']);
  });

  it('저장소가 던지면 예외를 삼키지 않고 사유와 함께 실패를 돌려준다', async () => {
    installFakeStorage(SEED, () => {
      throw new Error('QUOTA_BYTES quota exceeded');
    });

    const result = await clearCloudInLane();

    expect(result).toEqual({ ok: false, error: 'QUOTA_BYTES quota exceeded' });
  });
});

/*
 * `스냅샷 삭제 ↔ 동시 자동 Backup (어댑터)` 두 건과 그 전용 지연 fake가 여기서 **S3로 옮겨
 * 갔다** (티켓 02). 옮긴 단언의 행 단위 대응은 티켓 저널에 있다.
 *
 * 이동이 약화가 아닌 근거는 실측이다: 그 테스트의 픽스처
 * `{ id, at, profileCount, chunkCount, bytes }`는 `ManifestEntry`가 요구하는 `createdAt`·
 * `checksum`을 갖지 않는다. 그래서 `readManifest`가 **빈 목록**을 돌려주고
 * `planSnapshotDelete(...).found === false`가 되어, **삭제가 매니페스트를 쓰는 분기가 한 번도
 * 실행되지 않았다.** 두 테스트는 green이었지만 자기가 검증한다고 적은 분기에 도달하지
 * 못했다 — 릴리스 r3의 R-3이 살아 있던 자리가 정확히 이것이다.
 *
 * S3는 진짜 어댑터와 유효한 픽스처로 같은 성질을 보고, 한 순서가 아니라 모든 순서를 본다.
 * 그리고 경합 자체는 이제 레인이 닫는다 — 겹친 삭제가 성립하지 않는다.
 *
 * 아래 클라우드 삭제 테스트 셋은 남는다: 경합이 아니라 remove → 재조회 → 검증 경로를 본다.
 */

/**
 * 삭제의 **검증 실패 보고** (릴리스 r2 R2-3) — 경합이 아니라 remove → 재조회 → 검증 경로다.
 *
 * 경합 테스트 둘은 S3로 옮겨 갔지만(위 주석), 이 계약은 스펙이 원래 자리에 남긴다고 적은
 * 것이다: "경합과 무관한 단위 테스트(삭제의 멱등성, **검증 실패 보고**, 덮어쓰기 거부)는
 * 원래 자리에 남는다." 옮기면서 함께 사라져 `verifySnapshotDeleteComplete`가 저장소 전체에서
 * 커버리지 0이 됐던 것을 되살린다(티켓 02 코드리뷰).
 *
 * 픽스처 빌더는 **반환 타입을 명시한다** — 옛 빌더가 `ManifestEntry`의 `createdAt`·`checksum`을
 * 빠뜨려 매니페스트가 빈 목록으로 읽히고, 삭제가 매니페스트를 쓰는 분기가 한 번도 실행되지
 * 않았던 것이 릴리스 r3의 R-3이다.
 */
function entry(id: string, text: string): ManifestEntry {
  return { id, createdAt: 1, chunkCount: 1, checksum: checksum(text), profileCount: 1 };
}

/** 삭제는 레인 안에서만 돈다 — 허가는 `lane.run` 밖에서 만들 수 없다 (ADR 0016). */
const deleteInLane = (id: string, target: 'sync' | 'local') =>
  createWriterLane().run((permit) => deleteBackupSnapshot(permit, id, target));

describe('스냅샷 삭제 — 검증 실패 보고 (어댑터)', () => {
  it('remove가 청크를 남기면 성공으로 접지 않고 잔여를 보고한다', async () => {
    // 매니페스트 커밋만 통하고 청크 정리가 통째로 실패하는 저장소.
    installFakeStorage(
      {
        [BACKUP_MANIFEST_KEY]: { snapshots: [entry('s1', 'text-s1')] },
        [chunkKey('s1', 0)]: 'text-s1',
      },
      () => {}, // remove가 아무것도 지우지 않는다
    );

    const result = await deleteInLane('s1', 'sync');

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ remaining: expect.any(Number) });
  });

  it('읽기 전부터 있던 고아 청크는 실패 근거가 아니다 — 정상 삭제가 매번 실패로 보고되지 않게', async () => {
    const kv = installFakeStorage({
      [BACKUP_MANIFEST_KEY]: { snapshots: [entry('s1', 'text-s1'), entry('s2', 'text-s2')] },
      [chunkKey('s1', 0)]: 'text-s1',
      [chunkKey('s2', 0)]: 'text-s2',
      // 손상 스냅샷의 잔해 — 매니페스트가 세지 않는 청크.
      'bk:ghost:0': 'orphan',
    });

    expect(await deleteInLane('s1', 'sync')).toEqual({ ok: true });
    // 지운 것만 사라지고 나머지와 잔해는 그대로다.
    expect(kv[chunkKey('s2', 0)]).toBe('text-s2');
    expect(kv['bk:ghost:0']).toBe('orphan');
  });

  /*
   * 손상된 스냅샷도 지울 수 있어야 한다 (티켓 03 수용 기준) — 복원이 막힌 행을 치울 길은
   * 그것뿐이다. 계획은 청크를 `chunkCount`만이 아니라 `bk:<id>:` 접두 전체에서 모으므로,
   * 매니페스트가 세는 수와 실제 청크 수가 어긋난 행도 항목과 잔해가 함께 사라진다.
   */
  it('청크가 유실된 손상 스냅샷도 지워진다 — 항목과 잔해가 함께', async () => {
    const kv = installFakeStorage({
      // chunkCount는 2인데 청크는 하나뿐 — 복원이 막히는 손상 스냅샷.
      [BACKUP_MANIFEST_KEY]: {
        snapshots: [{ ...entry('broken', 'text'), chunkCount: 2 }, entry('ok', 'text-ok')],
      },
      [chunkKey('broken', 0)]: 'half',
      [chunkKey('ok', 0)]: 'text-ok',
    });

    expect(await deleteInLane('broken', 'sync')).toEqual({ ok: true });

    expect(kv[BACKUP_MANIFEST_KEY]).toMatchObject({ snapshots: [{ id: 'ok' }] });
    expect(kv[chunkKey('broken', 0)]).toBeUndefined();
    expect(kv[chunkKey('ok', 0)]).toBe('text-ok');
  });

  it('저장소가 던지면 사유와 함께 실패를 돌려준다 — 던지지 않는다', async () => {
    installFakeStorage(
      { [BACKUP_MANIFEST_KEY]: { snapshots: [entry('s1', 'text-s1')] } },
      () => {
        throw new Error('QUOTA_BYTES quota exceeded');
      },
    );

    expect(await deleteInLane('s1', 'sync')).toEqual({
      ok: false,
      error: 'QUOTA_BYTES quota exceeded',
    });
  });
});

/**
 * 축출 중 읽기 펜스 (티켓 04) — 근거는 `listBackupSnapshots`의 주석이 정본이다. 여기서 보는
 * 것은 그 펜스가 **리스너를 남기지 않는가**와, 구독을 첫 읽기보다 먼저 여는가다.
 */
describe('축출 중 읽기 펜스 — 구독 정리 (어댑터)', () => {
  it('유계 시간으로 끝나도 구독을 남기지 않는다', async () => {
    // 매니페스트는 열거하는데 청크가 없다 — 펜스가 열리고, 변경은 오지 않는다.
    installFakeStorage({ [BACKUP_MANIFEST_KEY]: { snapshots: [entry('c1', 'text')] } });

    for (let i = 0; i < 3; i += 1) {
      const listed = await listBackupSnapshots('sync', 1);
      expect(listed.map((snapshot) => snapshot.status)).toEqual(['corrupt']);
    }

    expect(fakeListeners).toHaveLength(0);
  });

  /*
   * 구독은 **첫 읽기보다 먼저** 열려야 한다 (티켓 04 코드리뷰).
   *
   * 읽은 뒤에 열면 그 사이에 착지한 커밋의 이벤트를 놓친다. 쓰기는 서비스워커에 있고 읽기는
   * 화면에 있으므로 그 틈은 프로세스 간 지연이다 — 여기서는 `get`이 값을 집어 준 직후에 커밋이
   * 착지하는 것으로 그 틈을 만든다.
   *
   * 늦게 여는 구현은 이벤트를 놓쳐 유계 시간을 태우고 **손상**을 보고한다. 먼저 여는 구현은
   * 그 이벤트를 잡아 다시 읽고 **정합한** 목록을 보인다 — 값으로 구분된다.
   */
  it('첫 읽기와 구독 사이에 착지한 커밋도 놓치지 않는다', async () => {
    const kv: KV = {
      // 축출 중 모양: 매니페스트는 c1을 열거하는데 그 청크가 이미 지워졌다.
      [BACKUP_MANIFEST_KEY]: { snapshots: [entry('c1', 'text-c1'), entry('c2', 'text-c2')] },
      [chunkKey('c2', 0)]: 'text-c2',
    };
    const listeners: ((changes: KV, area: string) => void)[] = [];
    let committed = false;
    (globalThis as unknown as { browser: unknown }).browser = {
      storage: {
        sync: {
          get: async () => {
            const snapshot = structuredClone(kv);
            if (!committed) {
              committed = true;
              // 값을 집어 준 **직후** 커밋이 착지한다 — 축출이 끝나 c1이 목록에서 빠진다.
              queueMicrotask(() => {
                kv[BACKUP_MANIFEST_KEY] = { snapshots: [entry('c2', 'text-c2')] };
                for (const listener of [...listeners]) {
                  listener({ [BACKUP_MANIFEST_KEY]: {} }, 'sync');
                }
              });
            }
            return snapshot;
          },
          set: async () => {},
          remove: async () => {},
        },
        onChanged: {
          addListener: (listener: (changes: KV, area: string) => void) => listeners.push(listener),
          removeListener: (listener: unknown) => {
            const at = listeners.indexOf(listener as never);
            if (at >= 0) listeners.splice(at, 1);
          },
        },
      },
    };

    const listed = await listBackupSnapshots('sync', 50);

    // 새 매니페스트로 다시 판정했다 — 손상으로 보고하지 않는다.
    expect(listed.map((snapshot) => snapshot.id)).toEqual(['c2']);
    expect(listed.every((snapshot) => snapshot.status === 'ok')).toBe(true);
    expect(listeners).toHaveLength(0); // 이 시나리오는 자기 fake를 쓴다 — 구독이 닫혔다
  });

  /*
   * **기본 유계 시간**(`MANIFEST_FENCE_MS`)으로 부르는 경로도 지난다 (티켓 04 코드리뷰).
   *
   * 나머지 테스트는 짧은 값을 넘겨 결정론을 얻는데, 그러면 배포되는 상수가 어느 테스트도 지나지
   * 않는다. 여기서는 변경이 **즉시** 오게 해 기다림 없이 그 경로를 태운다 — 상수의 길이에
   * 의존하지 않으면서 기본값 호출이 성립하는지를 본다.
   */
  it('기본 유계 시간으로 불러도 변경이 오면 곧바로 다시 판정한다', async () => {
    const kv: KV = {
      [BACKUP_MANIFEST_KEY]: { snapshots: [entry('c1', 'text-c1'), entry('c2', 'text-c2')] },
      [chunkKey('c2', 0)]: 'text-c2',
    };
    const listeners: ((changes: KV, area: string) => void)[] = [];
    (globalThis as unknown as { browser: unknown }).browser = {
      storage: {
        sync: {
          get: async () => structuredClone(kv),
          set: async () => {},
          remove: async () => {},
        },
        onChanged: {
          addListener: (listener: (changes: KV, area: string) => void) => {
            listeners.push(listener);
            // 구독이 열리는 순간 축출이 끝난다 — 펜스가 기다리지 않고 다시 읽는다.
            kv[BACKUP_MANIFEST_KEY] = { snapshots: [entry('c2', 'text-c2')] };
            listener({ [BACKUP_MANIFEST_KEY]: {} }, 'sync');
          },
          removeListener: (listener: unknown) => {
            const at = listeners.indexOf(listener as never);
            if (at >= 0) listeners.splice(at, 1);
          },
        },
      },
    };

    // 두 번째 인자를 넘기지 않는다 — 배포되는 기본값을 그대로 쓴다.
    const listed = await listBackupSnapshots('sync');

    expect(listed.map((snapshot) => snapshot.id)).toEqual(['c2']);
    expect(listed.every((snapshot) => snapshot.status === 'ok')).toBe(true);
    expect(listeners).toHaveLength(0);
  });

  it('정합한 목록에서는 구독을 아예 열지 않는다 — 펜스는 불일치에만 붙는다', async () => {
    installFakeStorage({
      [BACKUP_MANIFEST_KEY]: { snapshots: [entry('c1', 'text-c1')] },
      [chunkKey('c1', 0)]: 'text-c1',
    });

    expect((await listBackupSnapshots('sync', 1)).map((snapshot) => snapshot.status)).toEqual(['ok']);
    expect(fakeListeners).toHaveLength(0);
  });
});
