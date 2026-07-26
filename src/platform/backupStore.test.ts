import { afterEach, describe, expect, it } from 'vitest';
import { BACKUP_MANIFEST_KEY } from '@/core/backup';
import { clearCloudBackups } from '@/platform/backupStore';

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
