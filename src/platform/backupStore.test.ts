import { afterEach, describe, expect, it } from 'vitest';
import { BACKUP_MANIFEST_KEY } from '@/core/backup';
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

/**
 * 삭제의 매니페스트 **통째 교체**와 그 사이 착지한 커밋 (release R2-3).
 *
 * `bk:manifest`에는 writer가 둘 있고 서로 다른 JS 컨텍스트에 산다 — 자동 Backup은
 * 서비스워커, 삭제는 (픽스 전) 렌더러. 삭제는 읽은 매니페스트에서 한 항목만 뺀 것을
 * 통째로 쓰므로, 읽기와 쓰기 사이에 커밋된 스냅샷은 그 쓰기에 조용히 사라진다. 사후
 * 검증이 **지운 id의 부재만** 보면 그 손실이 `{ok:true}`로 보고된다.
 *
 * 즉시 resolve하는 `installFakeStorage`로는 이 인터리빙을 표현할 수 없어 지연 변형을
 * 따로 세운다(기존 헬퍼는 그대로 둔다) — 어댑터 시임의 본령이다.
 */
function installDeferredStorage(seed: KV) {
  const kv: KV = structuredClone(seed);
  let holdNextGet = false;
  let release = () => {};
  const area = {
    // 실제 storage.get도 나중에 착지한 쓰기를 소급해 보여주지 않는다 — 호출 시점의 값을 집는다.
    get: async () => {
      const snapshot = structuredClone(kv);
      if (holdNextGet) {
        holdNextGet = false;
        await new Promise<void>((resolve) => void (release = resolve));
      }
      return snapshot;
    },
    set: async (items: KV) => {
      Object.assign(kv, structuredClone(items));
    },
    remove: async (keys: string[]) => {
      for (const key of keys) delete kv[key];
    },
  };
  (globalThis as unknown as { browser: unknown }).browser = {
    storage: { sync: area, local: area },
  };
  return {
    kv,
    holdNextGet: () => {
      holdNextGet = true;
    },
    release: () => release(),
  };
}

const entry = (id: string) => ({ id, at: 1, profileCount: 1, chunkCount: 1, bytes: 4 });

describe('스냅샷 삭제 ↔ 동시 자동 Backup (어댑터)', () => {
  it('읽기와 쓰기 사이에 커밋된 스냅샷이 사라지면 성공으로 접지 않는다', async () => {
    const store = installDeferredStorage({
      [BACKUP_MANIFEST_KEY]: { version: 1, snapshots: [entry('s1')] },
      'bk:s1:0': 'chunk-s1',
    });

    // 삭제의 계획용 읽기를 공중에 띄운다 — 매니페스트 [s1]을 이미 집었다.
    store.holdNextGet();
    const deleting = deleteBackupSnapshot('s1', 'sync');
    await Promise.resolve();

    // 그 사이 서비스워커의 자동 Backup이 새 스냅샷을 커밋한다.
    store.kv[BACKUP_MANIFEST_KEY] = { version: 1, snapshots: [entry('s1'), entry('s2')] };
    store.kv['bk:s2:0'] = 'chunk-s2';

    store.release();
    const result = await deleting;

    // 지운 id는 사라졌다 — 부분 술어만 보면 여기서 성공으로 접힌다.
    expect(store.kv['bk:s1:0']).toBeUndefined();
    // 그러나 그 사이 커밋된 s2의 매니페스트 항목이 통째 교체에 지워졌고, 청크만 고아로 남았다.
    expect(store.kv['bk:s2:0']).toBe('chunk-s2');
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ remaining: 1 });
  });

  it('아무도 끼어들지 않으면 지연되어도 성공을 보고한다 — 넓힌 검증이 정상 삭제를 막지 않는다', async () => {
    const store = installDeferredStorage({
      [BACKUP_MANIFEST_KEY]: { version: 1, snapshots: [entry('s1'), entry('s2')] },
      'bk:s1:0': 'chunk-s1',
      'bk:s2:0': 'chunk-s2',
      // 읽기 전부터 있던 고아 청크(손상 스냅샷의 잔해)는 실패 근거가 아니다.
      'bk:ghost:0': 'orphan',
    });

    store.holdNextGet();
    const deleting = deleteBackupSnapshot('s1', 'sync');
    await Promise.resolve();
    store.release();

    expect(await deleting).toEqual({ ok: true });
    expect(store.kv['bk:s2:0']).toBe('chunk-s2');
    expect(store.kv['bk:ghost:0']).toBe('orphan');
  });
});
