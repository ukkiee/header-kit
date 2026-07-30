import { afterEach, describe, expect, it } from 'vitest';
import { BACKUP_MANIFEST_KEY, chunkKey, checksum, type ManifestEntry } from '@/core/backup';
import { createWriterLane } from '@/core/writer-lane';
import { clearCloudBackups, deleteBackupSnapshot } from '@/platform/backupStore';

/**
 * 클라우드 삭제는 순수 함수가 아니라 **remove → 재조회 → 검증** 경로다. core 단위 테스트
 * (`backup.test.ts`)는 `backupKeys`/`verifyBackupsCleared`가 무엇을 답하는지만 알 뿐,
 * 어댑터가 그 답을 실제로 존중하는지는 모른다 — remove가 일부만 지우거나 던졌을 때
 * 성공으로 접히면 "지웠다"가 거짓 표시가 된다. 두 경로를 여기서 못 박는다.
 */

type KV = Record<string, unknown>;

/** 백업 키와 **권위 상태가 함께 사는** 저장소 구역을 흉내 낸다. */
function installFakeStorage(seed: KV, removeImpl?: (keys: string[], kv: KV) => void): KV {
  const kv: KV = { ...seed };
  const area = {
    get: async () => ({ ...kv }),
    set: async (items: KV) => {
      Object.assign(kv, items);
    },
    remove: async (keys: string[]) => {
      if (removeImpl) return removeImpl(keys, kv);
      for (const key of keys) delete kv[key];
    },
  };
  (globalThis as unknown as { browser: unknown }).browser = {
    storage: { sync: area, local: area },
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

describe('클라우드 백업 삭제 (어댑터)', () => {
  it('백업 네임스페이스만 지우고, 재조회 검증이 비었을 때 성공을 보고한다', async () => {
    const kv = installFakeStorage(SEED);

    const result = await clearCloudBackups();

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

    const result = await clearCloudBackups();

    expect(result.ok).toBe(false);
    expect(Object.keys(kv).filter((key) => key.startsWith('bk:'))).toEqual(['bk:s1:0', 'bk:s1:1']);
  });

  it('저장소가 던지면 예외를 삼키지 않고 사유와 함께 실패를 돌려준다', async () => {
    installFakeStorage(SEED, () => {
      throw new Error('QUOTA_BYTES quota exceeded');
    });

    const result = await clearCloudBackups();

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
