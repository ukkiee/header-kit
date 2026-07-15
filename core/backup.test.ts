import { describe, expect, it } from 'vitest';
import {
  BACKUP_MANIFEST_KEY,
  checksum,
  chunkKey,
  chunkString,
  decodeSnapshotText,
  listSnapshots,
  planBackup,
  readManifest,
  type SyncKV,
} from './backup';

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

  it('최신 스냅샷과 내용이 같으면 계획 없이 스킵한다', () => {
    const kv = committedBackup({}, 'same-text', 's1', 1);
    const plan = planBackup(kv, 'same-text', { profileCount: 1 }, deps('s2', 2));

    expect(plan.kind).toBe('skip');
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
