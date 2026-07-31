import {
  backfillModification,
  dropRetiredKinds,
  isFilter,
  isModification,
  isRecord,
  migrateProfileFilters,
  upgradeProfile,
  type Profile,
  type StoredState,
} from './schema';

/**
 * Import/Export — 자체 스키마 v1 단일 형식 (ADR-0003).
 * Export는 항상 템플릿만 담는다: Profile에는 실체화 구역이 없고,
 * envelope에도 materialized를 싣지 않는다.
 */
import { EXPORT_FORMAT_VERSION, READABLE_FORMAT_VERSIONS } from './format-version';

/** 내보내기 포맷 버전 — 정의는 의존성 없는 `format-version.ts`에 있다(스모크가 직접 읽는다). */
export { EXPORT_FORMAT_VERSION } from './format-version';

export interface ExportFile {
  headerkit: typeof EXPORT_FORMAT_VERSION;
  profiles: Profile[];
}

export type ImportResult =
  | { ok: true; profiles: Profile[]; notices: string[] }
  | { ok: false; errors: string[] };

export function exportProfiles(state: StoredState, profileIds: string[]): ExportFile {
  const wanted = new Set(profileIds);
  return {
    headerkit: EXPORT_FORMAT_VERSION,
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

  return errors;
}

/**
 * 레거시 프로필 필터의 형 검증 — **올리기 전에** 불러야 한다 (structure r1 S-3).
 *
 * 올리면 실체화가 필터 키를 걷어 가므로, 뒤에서 검증하면 무효한 필터가 거부되지 않고
 * 조용히 삼켜진다. 파일 전체를 거부하는 쪽이 옳다 — 사용자는 규칙이 어디로 갔는지 모른 채
 * "가져오기 성공"을 보게 되지 않는다.
 */
function legacyFilterErrors(value: unknown, index: number): string[] {
  if (!isRecord(value) || value.filters === undefined) return [];
  const path = `profiles[${index}]`;
  const label = typeof value.name === 'string' ? `${path} ("${value.name}")` : path;
  if (!Array.isArray(value.filters)) return [`${label}.filters: expected array`];
  return value.filters.flatMap((f, i) =>
    isFilter(f) ? [] : [`${label}.filters[${i}]: invalid filter`],
  );
}

/**
 * Import된 Profile들을 정규화한다: Profile·Modification·Filter id 전체 재생성
 * (기존 상태·실체화 구역과의 충돌 원천 차단), 세션-로컬 탭 참조 정리,
 * 배지 라벨 불변식(2자) 강제. 권위 실행 경로(import-profiles 명령)가
 * 항상 이 함수를 다시 태우므로, UI가 우회해도 불변식은 유지된다.
 */
/**
 * 레거시 프로필 필터가 가져오기에서 무엇을 남기고 무엇을 잃는지 (ADR 0010).
 *
 * **프로필을 올리기 전에** 불러야 한다 — 올리면 필터 키가 사라져 셀 것이 없어진다.
 * enabled 기준으로 소실 종류·이주·꺼진 필터 폐기를 구분한다.
 */
export function legacyFilterNotices(profile: unknown): string[] {
  if (!isRecord(profile)) return [];
  const name = typeof profile.name === 'string' ? profile.name : '';
  const legacyFilters = (Array.isArray(profile.filters) ? profile.filters : []).filter(isRecord);
  const enabled = legacyFilters.filter((f) => f.enabled === true);
  const isLostKind = (f: Record<string, unknown>) =>
    f.kind === 'exclude-url' || f.kind === 'tab' || f.kind === 'tab-group' || f.kind === 'window';
  const lost = enabled.filter(isLostKind);
  const disabledCount = legacyFilters.length - enabled.length;
  const notices: string[] = [];
  if (lost.length > 0) {
    notices.push(
      `"${name}": ${lost.length} legacy filter(s) (exclude-url/tab/group/window) have no per-rule equivalent and were dropped.`,
    );
  }
  if (enabled.some((f) => !isLostKind(f))) {
    notices.push(`"${name}": legacy profile filters were migrated to per-rule conditions.`);
  }
  if (disabledCount > 0) {
    notices.push(`"${name}": ${disabledCount} disabled legacy filter(s) were dropped.`);
  }
  return notices;
}

export function normalizeImportedProfiles(
  profiles: Profile[],
  newId: () => string = () => crypto.randomUUID(),
): { profiles: Profile[]; notices: string[] } {
  const notices: string[] = [];
  return {
    profiles: profiles.map((p) => {
      const raw = p as unknown as Record<string, unknown>;
      // 저장소와 같은 문을 지난다 — 이미 올라간 프로필에는 아무 일도 하지 않는다.
      const migrated = upgradeProfile(raw) as unknown as Profile;
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

  if (
    !isRecord(raw) ||
    !Array.isArray(raw.profiles) ||
    typeof raw.headerkit !== 'number' ||
    !READABLE_FORMAT_VERSIONS.includes(raw.headerkit)
  ) {
    if (isRecord(raw) && typeof raw.headerkit === 'number' && raw.headerkit > EXPORT_FORMAT_VERSION) {
      return {
        ok: false,
        errors: [
          `This file was exported by a newer HeaderKit (format v${raw.headerkit}); this version reads v${EXPORT_FORMAT_VERSION} and older.`,
        ],
      };
    }
    return {
      ok: false,
      errors: [
        `Not a HeaderKit export file (expected { "headerkit": ${EXPORT_FORMAT_VERSION}, "profiles": [...] }).`,
      ],
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

  /*
   * 공지는 **올리기 전에** 센다 (structure r1 S-3) — 올리는 순간 레거시 필터 키가 사라지므로,
   * 뒤에서 세면 "무엇이 이주했고 무엇이 소실됐는지"를 말할 근거가 이미 없다.
   */
  const notices = entries.flatMap(legacyFilterNotices);

  /*
   * 검증보다 **먼저** 올린다. v2 내보내기의 응답 쿠키는 이름도 원시 보존 표시도 없어서,
   * 올리기 전에 검증하면 두 변형 중 어느 쪽도 아니라 파일 전체가 거부된다.
   */
  const upgraded = entries.map(upgradeProfile);

  /*
   * 레거시 필터는 **올리기 전** 모양으로, 나머지는 **올린 뒤** 모양으로 본다. 전자는 올리면
   * 사라져 검증할 것이 없어지고, 후자는 올리기 전에 보면 v2 응답 쿠키가 두 변형 중 어느
   * 쪽도 아니라 파일 전체가 거부된다. 검증하는 모양과 저장하는 모양이 같아야 한다.
   */
  const errors = [
    ...entries.flatMap(legacyFilterErrors),
    ...upgraded.flatMap((p, i) => validateProfileEntry(p, i)),
  ];
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // 검증 통과분을 backfill해 신규 필드를 채운 뒤 정규화한다.
  const backfilled = (upgraded as Profile[]).map((p) => ({
    ...p,
    modifications: p.modifications.map(
      (m) => backfillModification(m) as Profile['modifications'][number],
    ),
  }));
  const { profiles } = normalizeImportedProfiles(backfilled, newId);
  return { ok: true, profiles, notices };
}
