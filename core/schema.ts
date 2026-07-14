export const SCHEMA_VERSION = 1 as const;

/**
 * Modification은 종류를 판별자(kind)로 갖는 discriminated union이다.
 * 후속 슬라이스는 이 union에 variant를 추가할 뿐, Profile의 공개 계약
 * (ordered modifications 컬렉션)은 바뀌지 않는다.
 */
export interface RequestHeaderModification {
  kind: 'request-header';
  id: string;
  /** Header name, e.g. "X-Debug". */
  name: string;
  /** Value template. Placeholder materialization arrives in a later slice. */
  value: string;
  enabled: boolean;
}

export type Modification = RequestHeaderModification;

export type ModificationKind = Modification['kind'];

export interface Profile {
  id: string;
  name: string;
  active: boolean;
  /** 툴바 배지에 표시되는 1–2자 라벨. */
  shortLabel: string;
  /** 배지·UI 식별 색 (#rrggbb). */
  color: string;
  /** 종류를 가로지르는 단일 순서 — 충돌 의미론의 우선순위 세분에 쓰인다. */
  modifications: Modification[];
}

export interface StoredState {
  schemaVersion: typeof SCHEMA_VERSION;
  paused: boolean;
  profiles: Profile[];
}

export const PROFILE_COLORS = [
  '#2563eb',
  '#16a34a',
  '#d97706',
  '#dc2626',
  '#9333ea',
  '#0891b2',
] as const;

export function createProfile(
  name: string,
  options: { id?: string; color?: string; shortLabel?: string } = {},
): Profile {
  return {
    id: options.id ?? crypto.randomUUID(),
    name,
    active: false,
    shortLabel: options.shortLabel ?? name.charAt(0).toUpperCase(),
    color: options.color ?? PROFILE_COLORS[0],
    modifications: [],
  };
}

export function createRequestHeaderModification(
  id: string = crypto.randomUUID(),
): RequestHeaderModification {
  return { kind: 'request-header', id, name: '', value: '', enabled: true };
}

export function createDefaultState(): StoredState {
  return {
    schemaVersion: SCHEMA_VERSION,
    paused: false,
    profiles: [{ ...createProfile('Default Profile'), active: true }],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isModification(value: unknown): value is Modification {
  return (
    isRecord(value) &&
    value.kind === 'request-header' &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.value === 'string' &&
    typeof value.enabled === 'boolean'
  );
}

function isProfile(value: unknown): value is Profile {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.active === 'boolean' &&
    typeof value.shortLabel === 'string' &&
    typeof value.color === 'string' &&
    Array.isArray(value.modifications) &&
    value.modifications.every(isModification)
  );
}

/**
 * 저장소에서 읽은 알 수 없는 값을 StoredState로 검증한다.
 * 스키마 위반은 전량 거부하고 기본 상태로 대체한다 — 반쯤 깨진 상태로
 * 규칙을 컴파일하지 않는다. 이후 슬라이스가 variant 검증을 여기에 확장한다.
 */
export function parseStoredState(value: unknown): StoredState {
  if (
    isRecord(value) &&
    value.schemaVersion === SCHEMA_VERSION &&
    typeof value.paused === 'boolean' &&
    Array.isArray(value.profiles) &&
    value.profiles.every(isProfile)
  ) {
    return value as unknown as StoredState;
  }
  return createDefaultState();
}
