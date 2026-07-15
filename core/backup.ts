import { isRecord, type StoredState } from './schema';
import { exportProfiles, serializeExport } from './transfer';

/**
 * Backup — 브라우저 계정 동기화 저장소(storage.sync)에 Profile 스냅샷을
 * 분할 저장한다. 이 모듈은 순수하다: KV 스냅샷을 받아 "무엇을 어떤 순서로
 * 쓰고 지울지" 계획만 만든다. 적용 순서(청크 → 매니페스트 → 정리)는
 * 어댑터가 지키며, 그 순서가 manifest-last 원자성과 정상본 보존을 보장한다.
 */

export const BACKUP_MANIFEST_KEY = 'bk:manifest';

/**
 * storage.sync 항목당 quota(8,192)는 키 + JSON.stringify(값)의 "바이트" 수다 —
 * UTF-16 문자 수가 아니다 (한글 3바이트, 따옴표 이스케이프 2배). 모든 크기
 * 계산은 이 인코딩 기준으로 한다.
 */
export const CHUNK_BYTE_LIMIT = 7_500;
/** 전체 102,400B quota 아래의 보수적 예산 (매니페스트 항목 포함해 검사한다). */
export const SYNC_BUDGET = 90_000;
export const MAX_SNAPSHOTS = 5;

const encoder = new TextEncoder();

/** storage.sync가 과금하는 방식 그대로: JSON.stringify 직렬화의 UTF-8 바이트 수. */
export function jsonBytes(value: unknown): number {
  return encoder.encode(JSON.stringify(value)).length;
}

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

/** Backup 페이로드 — Export와 동일 형식(템플릿만), 전체 Profile 대상. */
export function backupPayload(state: StoredState): string {
  return serializeExport(exportProfiles(state, state.profiles.map((p) => p.id)));
}

/**
 * 청크의 JSON 직렬화 바이트가 한도를 넘지 않도록 분할한다.
 * 각 청크의 최대 접두를 이진 탐색으로 찾는다 (서로게이트 쌍을 쪼개지 않는다).
 */
export function chunkString(text: string, maxBytes: number = CHUNK_BYTE_LIMIT): string[] {
  if (text.length === 0) return [''];

  const chunks: string[] = [];
  let offset = 0;
  while (offset < text.length) {
    let low = 1;
    let high = text.length - offset;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (jsonBytes(text.slice(offset, offset + mid)) <= maxBytes) low = mid;
      else high = mid - 1;
    }
    let take = low;
    // 서로게이트 쌍 경계 보호 — 쪼개면 인코딩이 깨진다
    if (
      take < text.length - offset &&
      text.charCodeAt(offset + take - 1) >= 0xd800 &&
      text.charCodeAt(offset + take - 1) <= 0xdbff
    ) {
      take = Math.max(1, take - 1);
    }
    chunks.push(text.slice(offset, offset + take));
    offset += take;
  }
  return chunks;
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
    return sum + key.length + (typeof value === 'string' ? jsonBytes(value) : 0);
  }, 0);
}

/**
 * 청크가 전부 남아 있고 체크섬까지 일치하는가 — 유실·변조된 스냅샷은 복원
 * 불가이므로 링 슬롯을 차지하지 않고 정리된다 (RL-3 self-healing).
 */
function isIntact(entry: ManifestEntry, kv: SyncKV): boolean {
  return decodeSnapshotText(kv, entry).ok;
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
  // 최신 스냅샷이 같은 내용이고 무결성까지 통과할 때만 스킵한다 — 최신 스냅샷의
  // 청크가 유실·변조됐으면(RL-3) 스킵하지 않고 아래에서 온전한 대체본을 만들어
  // self-healing 한다 (isIntact 필터가 손상본을 링에서 밀어내 정리한다).
  const latest = existing[0];
  if (latest && latest.checksum === sum && decodeSnapshotText(kv, latest).ok) {
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
  const newBytes = chunks.reduce(
    (s, c, i) => s + jsonBytes(c) + chunkKey(entry.id, i).length,
    0,
  );
  // 매니페스트 항목 자체도 quota를 먹는다 — 최대 보존 개수 기준으로 보수 추정.
  const manifestBytes =
    BACKUP_MANIFEST_KEY.length +
    jsonBytes({ snapshots: Array.from({ length: MAX_SNAPSHOTS }, () => entry) });
  if (newBytes + manifestBytes > SYNC_BUDGET) {
    return { kind: 'too-large' };
  }

  // 손상·유실(청크 불완전) 스냅샷은 복원 불가이므로 링 후보에서 제외한다 —
  // 링 슬롯을 영구 점유하는 "corrupt 좀비"를 만들지 않는다.
  const intact = existing.filter((e) => isIntact(e, kv));
  const latestIntact = intact[0];
  const latestIntactBytes = latestIntact ? snapshotBytes(latestIntact, kv) : 0;
  if (latestIntact && newBytes + manifestBytes + latestIntactBytes > SYNC_BUDGET) {
    // 전환 기간 동안 직전 정상본과 공존이 불가능 — 정상본을 지키고 실패한다.
    return { kind: 'too-large' };
  }

  // 링 보존 + 예산: 최신 것부터 유지 목록에 담는다. 새 항목과 직전 정상본이
  // 우선이고, 그 외 오래된 것은 공간이 남을 때만 살아남는다.
  const kept: ManifestEntry[] = [entry];
  let used = newBytes + manifestBytes;
  for (const candidate of intact) {
    if (kept.length >= MAX_SNAPSHOTS) break;
    const bytes = snapshotBytes(candidate, kv);
    if (used + bytes > SYNC_BUDGET) {
      if (candidate === latestIntact) break; // 직전 정상본이 밀리면 그 뒤도 전부 밀린다
      continue;
    }
    kept.push(candidate);
    used += bytes;
  }

  const keptKeys = new Set(kept.flatMap(chunkKeysOf));
  const newKeys = new Set(chunks.map((_, i) => chunkKey(entry.id, i)));
  const latestKeys = new Set(latestIntact ? chunkKeysOf(latestIntact) : []);

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
