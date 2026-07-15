import { isRecord } from './schema';

/**
 * Backup — 브라우저 계정 동기화 저장소(storage.sync)에 Profile 스냅샷을
 * 분할 저장한다. 이 모듈은 순수하다: KV 스냅샷을 받아 "무엇을 어떤 순서로
 * 쓰고 지울지" 계획만 만든다. 적용 순서(청크 → 매니페스트 → 정리)는
 * 어댑터가 지키며, 그 순서가 manifest-last 원자성과 정상본 보존을 보장한다.
 */

export const BACKUP_MANIFEST_KEY = 'bk:manifest';

/** storage.sync 항목당 8,192B — 키 길이·JSON 인용 여유를 둔 보수적 청크 크기. */
export const CHUNK_SIZE = 6_000;
/** 전체 102,400B quota 아래의 보수적 예산 (매니페스트·오버헤드 여유 포함). */
export const SYNC_BUDGET = 90_000;
export const MAX_SNAPSHOTS = 5;

export interface ManifestEntry {
  id: string;
  createdAt: number;
  chunkCount: number;
  checksum: string;
  profileCount: number;
}

export interface Manifest {
  snapshots: ManifestEntry[];
}

export type SyncKV = Record<string, unknown>;

export type BackupPlan =
  | { kind: 'skip'; reason: 'unchanged' }
  | { kind: 'too-large' }
  | {
      kind: 'write';
      /** 공간 확보용 사전 정리 — 직전 정상 스냅샷은 절대 포함하지 않는다. */
      preRemoves: string[];
      chunkWrites: Record<string, string>;
      /** 청크가 모두 쓰인 뒤에만 기록한다 (manifest-last 커밋). */
      manifest: Manifest;
      /** 커밋 완료 후에만 지운다 — 링에서 밀려난 스냅샷·잔여 고아 청크. */
      postRemoves: string[];
      entry: ManifestEntry;
    };

export function chunkKey(snapshotId: string, index: number): string {
  return `bk:${snapshotId}:${index}`;
}

export function chunkString(text: string, size: number = CHUNK_SIZE): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks.length > 0 ? chunks : [''];
}

/** FNV-1a 32비트 — 손상 감지용 무결성 체크섬 (암호학적 용도 아님). */
export function checksum(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function isManifestEntry(value: unknown): value is ManifestEntry {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.createdAt === 'number' &&
    typeof value.chunkCount === 'number' &&
    typeof value.checksum === 'string' &&
    typeof value.profileCount === 'number'
  );
}

export function readManifest(kv: SyncKV): Manifest {
  const raw = kv[BACKUP_MANIFEST_KEY];
  if (isRecord(raw) && Array.isArray(raw.snapshots) && raw.snapshots.every(isManifestEntry)) {
    return { snapshots: raw.snapshots };
  }
  return { snapshots: [] };
}

function chunkKeysOf(entry: ManifestEntry): string[] {
  return Array.from({ length: entry.chunkCount }, (_, i) => chunkKey(entry.id, i));
}

function snapshotBytes(entry: ManifestEntry, kv: SyncKV): number {
  return chunkKeysOf(entry).reduce((sum, key) => {
    const value = kv[key];
    return sum + key.length + (typeof value === 'string' ? value.length : 0);
  }, 0);
}

/**
 * 새 스냅샷의 커밋 계획을 만든다.
 * - 최신 스냅샷과 내용이 같으면 skip.
 * - 예산이 부족하면 오래된 스냅샷부터 pre 단계에서 정리하되, 직전 정상
 *   스냅샷은 커밋 완료 전에는 정리하지 않는다. 직전 정상본과 새 스냅샷이
 *   공존할 수 없으면 too-large로 실패한다 (정상본 보존이 우선).
 */
export function planBackup(
  kv: SyncKV,
  text: string,
  meta: { profileCount: number },
  deps: { id: () => string; now: () => number },
): BackupPlan {
  const existing = readManifest(kv).snapshots;
  const sum = checksum(text);
  if (existing[0]?.checksum === sum) {
    return { kind: 'skip', reason: 'unchanged' };
  }

  const chunks = chunkString(text);
  const entry: ManifestEntry = {
    id: deps.id(),
    createdAt: deps.now(),
    chunkCount: chunks.length,
    checksum: sum,
    profileCount: meta.profileCount,
  };
  const newBytes = chunks.reduce((s, c, i) => s + c.length + chunkKey(entry.id, i).length, 0);
  if (newBytes > SYNC_BUDGET) {
    return { kind: 'too-large' };
  }

  const latest = existing[0];
  const latestBytes = latest ? snapshotBytes(latest, kv) : 0;
  if (latest && newBytes + latestBytes > SYNC_BUDGET) {
    // 전환 기간 동안 직전 정상본과 공존이 불가능 — 정상본을 지키고 실패한다.
    return { kind: 'too-large' };
  }

  // 링 보존 + 예산: 최신 것부터 유지 목록에 담는다. 새 항목과 직전 정상본이
  // 우선이고, 그 외 오래된 것은 공간이 남을 때만 살아남는다.
  const kept: ManifestEntry[] = [entry];
  let used = newBytes;
  for (const candidate of existing) {
    if (kept.length >= MAX_SNAPSHOTS) break;
    const bytes = snapshotBytes(candidate, kv);
    if (used + bytes > SYNC_BUDGET) {
      if (candidate === latest) break; // 직전 정상본이 밀리면 그 뒤도 전부 밀린다
      continue;
    }
    kept.push(candidate);
    used += bytes;
  }

  const keptKeys = new Set(kept.flatMap(chunkKeysOf));
  const newKeys = new Set(chunks.map((_, i) => chunkKey(entry.id, i)));
  const latestKeys = new Set(latest ? chunkKeysOf(latest) : []);

  const preRemoves: string[] = [];
  const postRemoves: string[] = [];
  for (const key of Object.keys(kv)) {
    if (!key.startsWith('bk:') || key === BACKUP_MANIFEST_KEY) continue;
    if (keptKeys.has(key) || newKeys.has(key)) continue;
    // 직전 정상본의 청크는 커밋(매니페스트 기록) 후에만 정리할 수 있다.
    if (latestKeys.has(key)) postRemoves.push(key);
    else preRemoves.push(key);
  }
  // 유지 목록에서 밀려난 직전 정상본 외 항목 중, 위 루프에서 pre로 분류된 것은
  // 공간 확보용으로 즉시 정리된다. 링에서 밀려난 것도 같은 경로다.

  const chunkWrites: Record<string, string> = {};
  chunks.forEach((chunk, i) => {
    chunkWrites[chunkKey(entry.id, i)] = chunk;
  });

  return {
    kind: 'write',
    preRemoves: preRemoves.sort(),
    chunkWrites,
    manifest: { snapshots: kept },
    postRemoves: postRemoves.sort(),
    entry,
  };
}

export type SnapshotStatus = ManifestEntry & {
  status: 'ok' | 'corrupt';
  reason?: string;
};

export function decodeSnapshotText(
  kv: SyncKV,
  entry: ManifestEntry,
): { ok: true; text: string } | { ok: false; reason: string } {
  const parts: string[] = [];
  for (const key of chunkKeysOf(entry)) {
    const value = kv[key];
    if (typeof value !== 'string') {
      return { ok: false, reason: `missing chunk ${key}` };
    }
    parts.push(value);
  }
  const text = parts.join('');
  if (checksum(text) !== entry.checksum) {
    return { ok: false, reason: 'checksum mismatch' };
  }
  return { ok: true, text };
}

/** 복원 목록 — 손상 스냅샷도 사유와 함께 표시한다 (조용히 숨기지 않는다). */
export function listSnapshots(kv: SyncKV): SnapshotStatus[] {
  return readManifest(kv).snapshots.map((entry) => {
    const decoded = decodeSnapshotText(kv, entry);
    return decoded.ok
      ? { ...entry, status: 'ok' as const }
      : { ...entry, status: 'corrupt' as const, reason: decoded.reason };
  });
}
