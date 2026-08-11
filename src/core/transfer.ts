import {
  backfillModification,
  dropRetiredKinds,
  isFilter,
  isModification,
  isRecord,
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

/**
 * 가져오기가 말하는 것들 — **문자열이 아니라 코드와 파라미터다** (컴파일 경고와 같은 구조).
 *
 * core는 로케일을 모른다. 여기서 영어 문장을 만들면 한국어 화면에 영어 오류가 뜨고, 그것은
 * 이 저장소가 못박은 "모든 UI 문자열은 카탈로그를 거친다"를 어긴다 — JSX만 훑는 커버리지
 * 테스트가 못 보는 자리라 조용히 어겨져 있었다. `CompileWarning` → `WarningView` →
 * `warning-text`가 이미 같은 문제를 푼 길이고, 가져오기도 그 길을 탄다.
 *
 * `where`는 지역화 대상이 아니다 — `profiles[0] ("Work")`는 파일 안의 **자리**를 가리키는
 * 좌표이고, 사용자가 고칠 곳을 찾는 데 쓰는 그 표기 그대로여야 한다.
 */
export type ImportIssueCode =
  | 'invalid-json'
  | 'newer-format'
  | 'not-export-file'
  | 'entry-not-object'
  | 'field-not-text'
  | 'bad-color'
  | 'active-not-boolean'
  | 'modifications-not-list'
  | 'unreadable-rule'
  | 'filters-not-list'
  | 'unreadable-legacy-filter'
  | 'dropped-lost-filters'
  | 'filters-moved'
  | 'dropped-disabled-filters'
  | 'rules-lost-conditions';

export interface ImportIssue {
  code: ImportIssueCode;
  params: Record<string, string | number>;
}

const issue = (code: ImportIssueCode, params: Record<string, string | number> = {}): ImportIssue => ({
  code,
  params,
});

export type ImportResult =
  | { ok: true; profiles: Profile[]; notices: ImportIssue[] }
  | { ok: false; errors: ImportIssue[] };

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

/** 파일 안의 자리 — 이름이 읽히면 함께 붙인다. 고칠 곳을 찾는 좌표다(지역화 대상 아님). */
function entryLabel(value: unknown, index: number): string {
  const path = `profiles[${index}]`;
  return isRecord(value) && typeof value.name === 'string' ? `${path} ("${value.name}")` : path;
}

/** 항목 단위 오류 — 어느 항목이 왜 틀렸는지 (AC). */
function validateProfileEntry(value: unknown, index: number): ImportIssue[] {
  const where = entryLabel(value, index);
  if (!isRecord(value)) return [issue('entry-not-object', { where })];

  const errors: ImportIssue[] = [];

  for (const field of ['id', 'name', 'color'] as const) {
    if (typeof value[field] !== 'string') errors.push(issue('field-not-text', { where, field }));
  }
  if (typeof value.color === 'string' && !/^#[0-9a-fA-F]{6}$/.test(value.color)) {
    errors.push(issue('bad-color', { where }));
  }
  if (typeof value.active !== 'boolean') errors.push(issue('active-not-boolean', { where }));

  if (!Array.isArray(value.modifications)) {
    errors.push(issue('modifications-not-list', { where }));
  } else {
    value.modifications.forEach((m, i) => {
      // 구버전 export(신규 필드 없음)도 backfill 후 검증한다.
      if (!isModification(backfillModification(m))) {
        errors.push(issue('unreadable-rule', { where, index: i + 1 }));
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
function legacyFilterErrors(value: unknown, index: number): ImportIssue[] {
  if (!isRecord(value) || value.filters === undefined) return [];
  const where = entryLabel(value, index);
  if (!Array.isArray(value.filters)) return [issue('filters-not-list', { where })];
  return value.filters.flatMap((f, i) =>
    isFilter(f) ? [] : [issue('unreadable-legacy-filter', { where, index: i + 1 })],
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
export function legacyFilterNotices(profile: unknown): ImportIssue[] {
  if (!isRecord(profile)) return [];
  const name = typeof profile.name === 'string' ? profile.name : '';
  const legacyFilters = (Array.isArray(profile.filters) ? profile.filters : []).filter(isRecord);
  const enabled = legacyFilters.filter((f) => f.enabled === true);
  const isLostKind = (f: Record<string, unknown>) =>
    f.kind === 'exclude-url' || f.kind === 'tab' || f.kind === 'tab-group' || f.kind === 'window';
  const lost = enabled.filter(isLostKind);
  const disabledCount = legacyFilters.length - enabled.length;
  const notices: ImportIssue[] = [];
  if (lost.length > 0) notices.push(issue('dropped-lost-filters', { name, count: lost.length }));
  if (enabled.some((f) => !isLostKind(f))) notices.push(issue('filters-moved', { name }));
  if (disabledCount > 0) {
    notices.push(issue('dropped-disabled-filters', { name, count: disabledCount }));
  }
  return notices;
}

/**
 * 퇴역 조건을 잃은 규칙이 있으면 그 사실을 공지한다 (티켓 02).
 *
 * 이것이 없으면 바로 위의 "레거시 프로필 필터를 규칙 조건으로 옮겼다"가 **거짓말이 된다** —
 * 옮겨진 조건 중 넷은 같은 업그레이드 안에서 다시 걷혀 나가고, 그 규칙들은 파일에 적혀 있던
 * 것보다 넓게 걸린다. 옮겼다는 말만 남기고 걷어 갔다는 말을 빼면 그 차이를 알 길이 없다.
 *
 * **이 문장이 열거하는 목록의 출처는 `persist.ts`의 `RETIRED_CONDITION_KEYS`·`RETIRED_METHODS`다** —
 * 그쪽이 바뀌면 여기도 함께 고쳐야 하고, 안 고치면 이 공지가 조용히 거짓이 된다.
 */
function retirementNotices({ entry, retired }: { entry: unknown; retired: number }): ImportIssue[] {
  if (retired === 0) return [];
  const name = isRecord(entry) && typeof entry.name === 'string' ? entry.name : '';
  return [issue('rules-lost-conditions', { name, count: retired })];
}

export function normalizeImportedProfiles(
  profiles: Profile[],
  newId: () => string = () => crypto.randomUUID(),
): { profiles: Profile[]; notices: string[] } {
  const notices: string[] = [];
  return {
    profiles: profiles.map((p) => {
      const raw = p as unknown as Record<string, unknown>;
      /*
       * 저장소와 같은 문을 지난다 — 이미 올라간 프로필에는 아무 일도 하지 않는다.
       * 퇴역 수는 여기서 버린다: 이 경로에 닿는 프로필은 parseImport가 이미 올려 세어 둔
       * 것이라, 다시 세면 같은 규칙을 두 번 알리게 된다.
       */
      const migrated = upgradeProfile(raw).profile as unknown as Profile;
      return {
        ...migrated,
        id: newId(),
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
    return { ok: false, errors: [issue('invalid-json')] };
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
        errors: [issue('newer-format', { found: raw.headerkit, readable: EXPORT_FORMAT_VERSION })],
      };
    }
    return { ok: false, errors: [issue('not-export-file', { readable: EXPORT_FORMAT_VERSION })] };
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
   * 레거시 공지는 **올리기 전에** 센다 (structure r1 S-3) — 올리는 순간 레거시 필터 키가
   * 사라지므로, 뒤에서 세면 "무엇이 이주했고 무엇이 소실됐는지"를 말할 근거가 이미 없다.
   */
  const legacyNotices = entries.flatMap(legacyFilterNotices);

  /*
   * 검증보다 **먼저** 올린다. v2 내보내기의 응답 쿠키는 이름도 원시 보존 표시도 없어서,
   * 올리기 전에 검증하면 두 변형 중 어느 쪽도 아니라 파일 전체가 거부된다.
   */
  // 올린 결과를 **원본과 짝지어** 든다 — 인덱스로 다시 찾으면 두 배열의 순서가 계약이 된다.
  const upgrades = entries.map((entry) => ({ entry, ...upgradeProfile(entry) }));
  const upgraded = upgrades.map((u) => u.profile);

  /*
   * 퇴역 공지는 반대로 **올린 뒤**에만 셀 수 있다 — 무엇이 걷혔는지는 올리는 과정이 알고,
   * 레거시 필터에서 실체화된 조건까지 포함해야 수가 맞는다. 두 공지가 함께 나가야 "옮겼다"와
   * "그중 넷은 걷어 갔다"가 한 화면에서 읽힌다.
   */
  const notices = [...legacyNotices, ...upgrades.flatMap(retirementNotices)];

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
