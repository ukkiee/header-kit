import {
  backfillModification,
  isFilter,
  isModification,
  isRecord,
  UNSET_ID,
  type Filter,
  type Profile,
  type StoredState,
} from './schema';

/**
 * Import/Export — 자체 스키마 v1 단일 형식 (ADR-0003).
 * Export는 항상 템플릿만 담는다: Profile에는 실체화 구역이 없고,
 * envelope에도 materialized를 싣지 않는다.
 */
export interface ExportFile {
  headerkit: 1;
  profiles: Profile[];
}

export type ImportResult =
  | { ok: true; profiles: Profile[]; notices: string[] }
  | { ok: false; errors: string[] };

export function exportProfiles(state: StoredState, profileIds: string[]): ExportFile {
  const wanted = new Set(profileIds);
  return {
    headerkit: 1,
    profiles: state.profiles.filter((p) => wanted.has(p.id)),
  };
}

export function serializeExport(file: ExportFile): string {
  return JSON.stringify(file, null, 2);
}

/** 항목 단위 오류 메시지 — 어느 항목이 왜 틀렸는지 (AC). */
function validateProfileEntry(value: unknown, index: number): string[] {
  const path = `profiles[${index}]`;
  if (!isRecord(value)) return [`${path}: expected an object`];

  const label = typeof value.name === 'string' ? `${path} ("${value.name}")` : path;
  const errors: string[] = [];

  for (const field of ['id', 'name', 'shortLabel', 'color'] as const) {
    if (typeof value[field] !== 'string') errors.push(`${label}.${field}: expected string`);
  }
  if (typeof value.color === 'string' && !/^#[0-9a-fA-F]{6}$/.test(value.color)) {
    errors.push(`${label}.color: expected #rrggbb`);
  }
  if (typeof value.active !== 'boolean') errors.push(`${label}.active: expected boolean`);

  if (!Array.isArray(value.modifications)) {
    errors.push(`${label}.modifications: expected array`);
  } else {
    value.modifications.forEach((m, i) => {
      // 구버전 export(신규 필드 없음)도 backfill 후 검증한다.
      if (!isModification(backfillModification(m))) {
        errors.push(`${label}.modifications[${i}]: invalid modification`);
      }
    });
  }

  if (!Array.isArray(value.filters)) {
    errors.push(`${label}.filters: expected array`);
  } else {
    value.filters.forEach((f, i) => {
      if (!isFilter(f)) errors.push(`${label}.filters[${i}]: invalid filter`);
    });
  }

  return errors;
}

/**
 * 탭·그룹·창 참조는 다른 브라우저 세션의 런타임 id라 Import 시 무의미하다 —
 * 미설정으로 정리하고 알림을 남긴다. (tab-domain은 도메인 문자열이라 보존.)
 */
function sanitizeFilter(
  filter: Filter,
  profileName: string,
  newId: () => string,
  notices: string[],
): Filter {
  const withId = { ...filter, id: newId() };
  switch (withId.kind) {
    case 'tab':
      if (withId.tabId !== UNSET_ID) {
        notices.push(`"${profileName}": tab filter reference was cleared (tabs are session-local).`);
        return { ...withId, tabId: UNSET_ID };
      }
      return withId;
    case 'tab-group':
      if (withId.groupId !== UNSET_ID) {
        notices.push(`"${profileName}": tab group filter reference was cleared.`);
        return { ...withId, groupId: UNSET_ID };
      }
      return withId;
    case 'window':
      if (withId.windowId !== UNSET_ID) {
        notices.push(`"${profileName}": window filter reference was cleared.`);
        return { ...withId, windowId: UNSET_ID };
      }
      return withId;
    default:
      return withId;
  }
}

/**
 * Import된 Profile들을 정규화한다: Profile·Modification·Filter id 전체 재생성
 * (기존 상태·실체화 구역과의 충돌 원천 차단), 세션-로컬 탭 참조 정리,
 * 배지 라벨 불변식(2자) 강제. 권위 실행 경로(import-profiles 명령)가
 * 항상 이 함수를 다시 태우므로, UI가 우회해도 불변식은 유지된다.
 */
export function normalizeImportedProfiles(
  profiles: Profile[],
  newId: () => string = () => crypto.randomUUID(),
): { profiles: Profile[]; notices: string[] } {
  const notices: string[] = [];
  return {
    profiles: profiles.map((p) => ({
      ...p,
      id: newId(),
      shortLabel: p.shortLabel.slice(0, 2),
      modifications: p.modifications.map((m) => ({ ...m, id: newId() })),
      filters: p.filters.map((f) => sanitizeFilter(f, p.name, newId, notices)),
    })),
    notices,
  };
}

/**
 * Import 파싱 — 전체 검증 후 전량 수용 또는 전량 거부.
 */
export function parseImport(
  text: string,
  newId: () => string = () => crypto.randomUUID(),
): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['Not valid JSON.'] };
  }

  if (!isRecord(raw) || !Array.isArray(raw.profiles) || raw.headerkit !== 1) {
    if (isRecord(raw) && typeof raw.headerkit === 'number' && raw.headerkit > 1) {
      return {
        ok: false,
        errors: [
          `This file was exported by a newer HeaderKit (format v${raw.headerkit}); this version reads v1 only.`,
        ],
      };
    }
    return {
      ok: false,
      errors: ['Not a HeaderKit export file (expected { "headerkit": 1, "profiles": [...] }).'],
    };
  }

  const errors = raw.profiles.flatMap((p, i) => validateProfileEntry(p, i));
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // 검증 통과분을 backfill해 신규 필드를 채운 뒤 정규화한다.
  const backfilled = (raw.profiles as Profile[]).map((p) => ({
    ...p,
    modifications: p.modifications.map(
      (m) => backfillModification(m) as Profile['modifications'][number],
    ),
  }));
  const { profiles, notices } = normalizeImportedProfiles(backfilled, newId);
  return { ok: true, profiles, notices };
}
