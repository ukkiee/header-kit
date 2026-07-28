import { describe, expect, it } from 'vitest';
import {
  BACKUP_MANIFEST_KEY,
  backupKeys,
  backupLimits,
  backupTarget,
  checksum,
  chunkKey,
  chunkString,
  decodeSnapshotText,
  listSnapshots,
  planBackup,
  planSnapshotDelete,
  readManifest,
  verifyBackupsCleared,
  verifySnapshotDeleted,
  type BackupTarget,
  type SyncKV,
} from './backup';
import { applyCommand } from './commands';
import { createDefaultState, parseStoredState } from './schema';

const deps = (id = 'snap-1', now = 1_000) => ({ id: () => id, now: () => now });

function committedBackup(kv: SyncKV, text: string, id: string, now: number): SyncKV {
  const plan = planBackup(kv, text, { profileCount: 1 }, deps(id, now));
  if (plan.kind !== 'write') throw new Error(`unexpected plan: ${plan.kind}`);
  const next: SyncKV = { ...kv };
  for (const key of plan.preRemoves) delete next[key];
  Object.assign(next, plan.chunkWrites, { [BACKUP_MANIFEST_KEY]: plan.manifest });
  for (const key of plan.postRemoves) delete next[key];
  return next;
}

describe('chunkString / checksum', () => {
  it('분할·결합 라운드트립이 항등이다', () => {
    const text = 'x'.repeat(15_000) + '끝';
    const chunks = chunkString(text, 6_000);

    expect(chunks.length).toBe(3);
    expect(chunks.join('')).toBe(text);
  });

  it('한도는 JSON 직렬화의 UTF-8 바이트 기준이다 — 한글·이스케이프에서도 항목 quota를 넘지 않는다', async () => {
    const { jsonBytes } = await import('./backup');
    const korean = '한글값과 "따옴표" \\역슬래시\\ 를 섞은 페이로드 — '.repeat(500);
    const chunks = chunkString(korean, 7_500);

    expect(chunks.join('')).toBe(korean);
    for (const chunk of chunks) {
      expect(jsonBytes(chunk)).toBeLessThanOrEqual(7_500);
    }
  });

  it('checksum은 안정적이고 내용에 민감하다', () => {
    expect(checksum('abc')).toBe(checksum('abc'));
    expect(checksum('abc')).not.toBe(checksum('abd'));
  });
});

describe('planBackup', () => {
  it('청크 쓰기 → 매니페스트 → 정리의 3단계 계획을 만든다 (manifest-last)', () => {
    const plan = planBackup({}, 'payload-text', { profileCount: 2 }, deps());
    if (plan.kind !== 'write') throw new Error('expected write plan');

    expect(Object.keys(plan.chunkWrites)).toEqual([chunkKey('snap-1', 0)]);
    expect(plan.manifest.snapshots[0]).toMatchObject({
      id: 'snap-1',
      createdAt: 1_000,
      chunkCount: 1,
      checksum: checksum('payload-text'),
      profileCount: 2,
    });
    expect(plan.preRemoves).toEqual([]);
    expect(plan.postRemoves).toEqual([]);
  });

  it('최신 스냅샷과 내용이 같고 무결하면 계획 없이 스킵한다', () => {
    const kv = committedBackup({}, 'same-text', 's1', 1);
    const plan = planBackup(kv, 'same-text', { profileCount: 1 }, deps('s2', 2));

    expect(plan.kind).toBe('skip');
  });

  it('내용은 같지만 최신 스냅샷 청크가 유실됐으면 스킵하지 않고 대체본을 만든다 (RL-3 self-healing)', () => {
    const kv = committedBackup({}, 'same-text', 's1', 1);
    delete kv[chunkKey('s1', 0)]; // 커밋 후 청크 유실

    const plan = planBackup(kv, 'same-text', { profileCount: 1 }, deps('s2', 2));
    expect(plan.kind).toBe('write');
    if (plan.kind !== 'write') return;
    // 손상된 s1은 새 매니페스트에 승계되지 않고, 온전한 s2만 남는다.
    expect(plan.manifest.snapshots.map((s) => s.id)).toEqual(['s2']);
  });

  it('내용은 같지만 최신 스냅샷 청크가 변조됐으면(체크섬 불일치) 대체본을 만든다 (RL-3)', () => {
    const kv = committedBackup({}, 'same-text', 's1', 1);
    kv[chunkKey('s1', 0)] = 'tampered'; // 청크 내용 변조

    const plan = planBackup(kv, 'same-text', { profileCount: 1 }, deps('s2', 2));
    expect(plan.kind).toBe('write');
  });

  it('링 보존: 최대 개수를 넘으면 가장 오래된 스냅샷이 정리되고, 직전 정상본은 pre 단계에서 보호된다', () => {
    let kv: SyncKV = {};
    for (let i = 1; i <= 5; i += 1) {
      kv = committedBackup(kv, `text-${i}`, `s${i}`, i);
    }
    const plan = planBackup(kv, 'text-6', { profileCount: 1 }, deps('s6', 6));
    if (plan.kind !== 'write') throw new Error('expected write plan');

    expect(plan.manifest.snapshots.map((s) => s.id)).toEqual(['s6', 's5', 's4', 's3', 's2']);
    // 링에서 밀려난 s1은 정리 대상이다 (직전 정상본이 아니므로 pre 단계 가능)
    expect([...plan.preRemoves, ...plan.postRemoves]).toContain(chunkKey('s1', 0));
    // 직전 정상본 s5는 어느 단계에서도 정리되지 않는다 (유지 목록에 남는다)
    expect([...plan.preRemoves, ...plan.postRemoves]).not.toContain(chunkKey('s5', 0));
  });

  it('매니페스트에 없는 고아 청크(중단된 쓰기 잔여)는 정리 대상이다', () => {
    const kv = committedBackup({}, 'good', 's1', 1);
    kv[chunkKey('interrupted', 0)] = 'partial-data';

    const plan = planBackup(kv, 'newer', { profileCount: 1 }, deps('s2', 2));
    if (plan.kind !== 'write') throw new Error('expected write plan');

    expect([...plan.preRemoves, ...plan.postRemoves]).toContain(chunkKey('interrupted', 0));
    // 직전 정상본(s1)은 pre 단계에서 절대 지우지 않는다
    expect(plan.preRemoves).not.toContain(chunkKey('s1', 0));
  });

  it('예산 초과 시 오래된 스냅샷부터 이번 커밋 전에 정리하되, 직전 정상본은 pre 단계에서 지키고, 그래도 안 되면 too-large', () => {
    const big = 'b'.repeat(40_000);
    let kv: SyncKV = {};
    kv = committedBackup(kv, `${big}-1`, 's1', 1);
    kv = committedBackup(kv, `${big}-2`, 's2', 2);

    const plan = planBackup(kv, `${big}-3`, { profileCount: 1 }, deps('s3', 3));
    if (plan.kind !== 'write') throw new Error('expected write plan');
    // s1은 pre에서 정리해 공간을 확보하고, 직전 정상본 s2는 커밋 후에만 밀려날 수 있다
    expect(plan.preRemoves.some((k) => k.startsWith('bk:s1:'))).toBe(true);
    expect(plan.preRemoves.some((k) => k.startsWith('bk:s2:'))).toBe(false);

    const huge = 'h'.repeat(200_000);
    const tooLarge = planBackup({}, huge, { profileCount: 1 }, deps());
    expect(tooLarge.kind).toBe('too-large');
  });
});

describe('planBackup — 손상 스냅샷의 링 슬롯 점유 방지', () => {
  it('청크가 유실된 스냅샷은 새 매니페스트에 승계되지 않고 잔여 청크가 정리된다', () => {
    let kv = committedBackup({}, 'text-a', 'sa', 1);
    kv = committedBackup(kv, 'text-b-longer', 'sb', 2);
    delete kv[chunkKey('sa', 0)]; // sa가 유실됨 (크래시 잔해)

    const plan = planBackup(kv, 'text-c', { profileCount: 1 }, deps('sc', 3));
    if (plan.kind !== 'write') throw new Error('expected write plan');

    expect(plan.manifest.snapshots.map((s) => s.id)).toEqual(['sc', 'sb']);
  });
});

describe('sync 저장 스위치 (R-1 — 단순 계약)', () => {
  it('기존 설치 기본값은 sync ON — 필드가 없던 상태도 켜진 채로 읽힌다', () => {
    expect(createDefaultState().syncBackup).toBe(true);
    expect(backupTarget(createDefaultState())).toBe('sync');

    const { syncBackup: _dropped, ...legacy } = createDefaultState();
    expect(parseStoredState(JSON.parse(JSON.stringify(legacy))).syncBackup).toBe(true);
  });

  it('무효값은 기본값으로 치유된다 — 플래그 하나가 프로필을 날리지 않는다', () => {
    const revived = parseStoredState({ ...createDefaultState(), syncBackup: 'yes' });

    expect(revived.syncBackup).toBe(true);
    expect(revived.profiles).toHaveLength(1);
  });

  it('토글은 앞으로의 저장 대상만 바꾼다 — 나머지 상태는 그대로다', () => {
    const on = createDefaultState();
    const off = applyCommand(on, { type: 'set-sync-backup', enabled: false });

    expect(backupTarget(off)).toBe('local');
    expect(off.profiles).toEqual(on.profiles);
    expect(backupTarget(applyCommand(off, { type: 'set-sync-backup', enabled: true }))).toBe('sync');
  });

  it('토글해도 반대쪽 스냅샷은 옮겨지거나 지워지지 않고, 히스토리는 활성 저장소 것을 보여준다', () => {
    const world: Record<BackupTarget, SyncKV> = { sync: {}, local: {} };
    let state = createDefaultState();

    // sync ON — 앞으로의 백업은 클라우드로 간다
    world.sync = committedBackup(world.sync, 'cloud-payload', 'c1', 1);

    // 스위치를 끈다 → 앞으로의 백업만 local로 간다 (이관 없음)
    state = applyCommand(state, { type: 'set-sync-backup', enabled: false });
    world[backupTarget(state)] = committedBackup(world[backupTarget(state)], 'local-payload', 'l1', 2);

    expect(listSnapshots(world.sync).map((s) => s.id)).toEqual(['c1']);
    expect(listSnapshots(world[backupTarget(state)]).map((s) => s.id)).toEqual(['l1']);

    // 다시 켜면 클라우드 히스토리가 다시 보이고, local 스냅샷도 그대로 남아 있다
    state = applyCommand(state, { type: 'set-sync-backup', enabled: true });
    expect(listSnapshots(world[backupTarget(state)]).map((s) => s.id)).toEqual(['c1']);
    expect(listSnapshots(world.local).map((s) => s.id)).toEqual(['l1']);
  });

  it('클라우드 삭제는 백업 네임스페이스만 지운다 — 같은 구역의 다른 키는 건드리지 않는다', () => {
    const kv = committedBackup({}, 'payload', 's1', 1);
    kv.state = { profiles: [] }; // local 구역에는 권위 상태가 함께 산다

    const keys = backupKeys(kv);
    expect(keys).toContain(BACKUP_MANIFEST_KEY);
    expect(keys).toContain(chunkKey('s1', 0));
    expect(keys).not.toContain('state');
  });

  it('삭제 후 잔재가 없어야 성공이다 — 남아 있으면 사유와 함께 실패로 표면화한다', () => {
    const kv = committedBackup({}, 'payload', 's1', 1);
    expect(verifyBackupsCleared({ state: { profiles: [] } })).toEqual({ ok: true });

    // remove가 조용히 일부만 지웠다 (quota·경합·권한) — 성공으로 보고하면 "이 브라우저에만"이 거짓이 된다
    const partial = { ...kv };
    delete partial[BACKUP_MANIFEST_KEY];
    const result = verifyBackupsCleared(partial);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.remaining).toEqual([chunkKey('s1', 0)]);
  });

  it('클라우드 잔존 여부는 상태 문구가 읽는다 — 스위치를 꺼도 잔재가 있으면 있다고 말한다', () => {
    const kv = committedBackup({}, 'payload', 's1', 1);

    expect(backupKeys({}).length > 0).toBe(false);
    expect(backupKeys(kv).length > 0).toBe(true);
  });

  it('quota는 대상 저장소에 맞춘다 — sync 예산을 넘는 페이로드도 local에는 들어간다', () => {
    const big = 'x'.repeat(120_000);

    expect(planBackup({}, big, { profileCount: 1 }, deps(), backupLimits('sync')).kind).toBe(
      'too-large',
    );
    expect(planBackup({}, big, { profileCount: 1 }, deps(), backupLimits('local')).kind).toBe(
      'write',
    );
  });
});

/**
 * 개별 스냅샷 삭제 (티켓 12) — 히스토리 한 행을 지우는 것은 "백업을 지운다"의
 * **가장 좁은** 단위다. 일괄 클라우드 삭제(R-1)·전체 초기화(R-3)와 같은 경로를 쓰면
 * 한 행을 정리하려던 손이 저장소를 통째로 비운다. 계획이 무엇을 지울지 여기서 못박는다.
 */
describe('planSnapshotDelete / verifySnapshotDeleted (티켓 12)', () => {
  /** 어댑터가 지킬 순서 그대로: 매니페스트 커밋 → 청크 정리. */
  function appliedDelete(kv: SyncKV, snapshotId: string): SyncKV {
    const plan = planSnapshotDelete(kv, snapshotId);
    const next: SyncKV = { ...kv };
    if (plan.found) next[BACKUP_MANIFEST_KEY] = plan.manifest;
    for (const key of plan.removeKeys) delete next[key];
    return next;
  }

  it('그 스냅샷의 매니페스트 항목과 청크 키만 지운다 — 다른 스냅샷·비백업 키는 그대로다', () => {
    let kv = committedBackup({}, 'payload-A', 'sa', 1);
    kv = committedBackup(kv, 'payload-B', 'sb', 2);
    kv.state = { profiles: ['keep-me'] }; // 같은 구역의 권위 상태

    const plan = planSnapshotDelete(kv, 'sa');
    expect(plan.found).toBe(true);
    expect(plan.removeKeys).toEqual([chunkKey('sa', 0)]);
    expect(plan.manifest.snapshots.map((s) => s.id)).toEqual(['sb']);

    const after = appliedDelete(kv, 'sa');
    expect(listSnapshots(after).map((s) => s.id)).toEqual(['sb']);
    expect(decodeSnapshotText(after, readManifest(after).snapshots[0]!)).toEqual({
      ok: true,
      text: 'payload-B',
    });
    expect(backupKeys(after)).toEqual([BACKUP_MANIFEST_KEY, chunkKey('sb', 0)]);
    expect(after.state).toEqual({ profiles: ['keep-me'] });
  });

  it('복원이 막히는 손상 스냅샷도 지운다 — 남은 청크까지 함께 정리한다', () => {
    let kv = committedBackup({}, 'payload-long-enough-to-split-into-two', 'sa', 1);
    kv = committedBackup(kv, 'payload-B', 'sb', 2);
    kv[chunkKey('sa', 0)] = 'tampered'; // 체크섬 불일치 → corrupt (복원 불가)
    kv[chunkKey('sa', 1)] = 'orphan-leftover'; // 매니페스트가 세지 않는 잔여 청크

    expect(listSnapshots(kv).find((s) => s.id === 'sa')).toMatchObject({ status: 'corrupt' });

    const after = appliedDelete(kv, 'sa');
    expect(listSnapshots(after).map((s) => s.id)).toEqual(['sb']);
    expect(backupKeys(after).some((key) => key.startsWith('bk:sa:'))).toBe(false);
  });

  it('이미 없는 id를 다시 지워도 무해하다 (멱등) — 매니페스트를 건드리지 않는다', () => {
    const kv = committedBackup({}, 'payload-A', 'sa', 1);
    const once = appliedDelete(kv, 'sa');
    const twice = appliedDelete(once, 'sa');

    expect(planSnapshotDelete(once, 'sa')).toEqual({
      found: false,
      removeKeys: [],
      manifest: { snapshots: [] },
    });
    expect(twice).toEqual(once);
    // 비어 있던 저장소에서도 계획은 아무것도 지우지 않는다.
    expect(planSnapshotDelete({}, 'never-existed').removeKeys).toEqual([]);
  });

  it('삭제 검증은 다시 읽은 KV로 한다 — 잔재가 남으면 성공으로 접지 않는다', () => {
    let kv = committedBackup({}, 'payload-A', 'sa', 1);
    kv = committedBackup(kv, 'payload-B', 'sb', 2);

    expect(verifySnapshotDeleted(appliedDelete(kv, 'sa'), 'sa')).toEqual({ ok: true });

    // remove가 청크를 남겼다 — 목록에서 사라졌다고 지워진 것은 아니다.
    const chunkLeft = appliedDelete(kv, 'sa');
    chunkLeft[chunkKey('sa', 0)] = 'still-here';
    expect(verifySnapshotDeleted(chunkLeft, 'sa')).toEqual({
      ok: false,
      remaining: [chunkKey('sa', 0)],
    });

    // 매니페스트 커밋이 실패했다 — 행이 그대로 남는다.
    const entryLeft = { ...kv };
    delete entryLeft[chunkKey('sa', 0)];
    const stillListed = verifySnapshotDeleted(entryLeft, 'sa');
    expect(stillListed.ok).toBe(false);
    if (stillListed.ok) return;
    expect(stillListed.remaining).toContain(BACKUP_MANIFEST_KEY);
  });
});

describe('listSnapshots / decodeSnapshotText', () => {
  it('정상 스냅샷은 ok, 청크 누락·체크섬 불일치는 corrupt로 표시된다', () => {
    let kv = committedBackup({}, 'payload-A', 'sa', 1);
    kv = committedBackup(kv, 'payload-B', 'sb', 2);

    // sa의 청크를 손상시킨다
    kv[chunkKey('sa', 0)] = 'tampered';

    const listed = listSnapshots(kv);
    expect(listed.find((s) => s.id === 'sb')).toMatchObject({ status: 'ok' });
    expect(listed.find((s) => s.id === 'sa')).toMatchObject({ status: 'corrupt' });

    const manifest = readManifest(kv);
    const okEntry = manifest.snapshots.find((s) => s.id === 'sb')!;
    const decoded = decodeSnapshotText(kv, okEntry);
    expect(decoded).toEqual({ ok: true, text: 'payload-B' });

    const badEntry = manifest.snapshots.find((s) => s.id === 'sa')!;
    expect(decodeSnapshotText(kv, badEntry).ok).toBe(false);
  });

  it('청크가 아예 없으면 corrupt(missing chunk)다', () => {
    const kv = committedBackup({}, 'payload', 's1', 1);
    delete kv[chunkKey('s1', 0)];

    expect(listSnapshots(kv)[0]).toMatchObject({ status: 'corrupt' });
  });
});
