import {
  backfillModification,
  dropRetiredKinds,
  isFilter,
  isModification,
  isRecord,
  migrateProfileFilters,
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

  // 레거시 export의 프로필 필터 — 선택 필드, 있으면 형만 검증(마이그레이션 대상).
  if (value.filters !== undefined) {
    if (!Array.isArray(value.filters)) {
      errors.push(`${label}.filters: expected array`);
    } else {
      value.filters.forEach((f, i) => {
        if (!isFilter(f)) errors.push(`${label}.filters[${i}]: invalid filter`);
      });
    }
  }

  return errors;
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
    profiles: profiles.map((p) => {
      const raw = p as unknown as Record<string, unknown>;
      // 레거시 export의 프로필 필터를 규칙 conditions로 이주한다 (ADR 0010).
      // 공지는 enabled 기준으로 정확하게: 소실 종류·이주·꺼진 필터 폐기를 구분한다.
      const legacyFilters = (Array.isArray(raw.filters) ? raw.filters : []).filter(isRecord);
      const enabledFilters = legacyFilters.filter((f) => f.enabled === true);
      const isLostKind = (f: Record<string, unknown>) =>
        f.kind === 'exclude-url' || f.kind === 'tab' || f.kind === 'tab-group' || f.kind === 'window';
      const lost = enabledFilters.filter(isLostKind);
      const disabledCount = legacyFilters.length - enabledFilters.length;
      if (lost.length > 0) {
        notices.push(
          `"${p.name}": ${lost.length} legacy filter(s) (exclude-url/tab/group/window) have no per-rule equivalent and were dropped.`,
        );
      }
      if (enabledFilters.some((f) => !isLostKind(f))) {
        notices.push(`"${p.name}": legacy profile filters were migrated to per-rule conditions.`);
      }
      if (disabledCount > 0) {
        notices.push(`"${p.name}": ${disabledCount} disabled legacy filter(s) were dropped.`);
      }
      const migrated = migrateProfileFilters(raw) as unknown as Profile;
      return {
        ...migrated,
        id: newId(),
        shortLabel: migrated.shortLabel.slice(0, 2),
        modifications: migrated.modifications.map((m) => ({ ...m, id: newId() })),
      };
    }),
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

  // 퇴역 종류(csp — ADR 0013)는 **검증 전에** 걷어낸다. validateProfileEntry가
  // 먼저 보면 무효 수정으로 판정해 파일 전체가 거부된다. 정규화 단계에서 거르면
  // 이미 늦다. 로드 경로와 마찬가지로 조용히 버리고 알림은 남기지 않는다.
  const entries = raw.profiles.map((p) =>
    isRecord(p) && Array.isArray(p.modifications)
      ? { ...p, modifications: dropRetiredKinds(p.modifications) }
      : p,
  );

  const errors = entries.flatMap((p, i) => validateProfileEntry(p, i));
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // 검증 통과분을 backfill해 신규 필드를 채운 뒤 정규화한다.
  const backfilled = (entries as Profile[]).map((p) => ({
    ...p,
    modifications: p.modifications.map(
      (m) => backfillModification(m) as Profile['modifications'][number],
    ),
  }));
  const { profiles, notices } = normalizeImportedProfiles(backfilled, newId);
  return { ok: true, profiles, notices };
}
