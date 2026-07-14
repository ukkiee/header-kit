export const SCHEMA_VERSION = 1 as const;

export interface RequestHeaderModification {
  id: string;
  /** Header name, e.g. "X-Debug". */
  name: string;
  /** Value template. Placeholder materialization arrives in a later slice. */
  value: string;
  enabled: boolean;
}

export interface Profile {
  id: string;
  name: string;
  active: boolean;
  requestHeaders: RequestHeaderModification[];
}

export interface StoredState {
  schemaVersion: typeof SCHEMA_VERSION;
  paused: boolean;
  profiles: Profile[];
}

export function createProfile(name: string, id: string = crypto.randomUUID()): Profile {
  return { id, name, active: false, requestHeaders: [] };
}

export function createRequestHeaderModification(
  id: string = crypto.randomUUID(),
): RequestHeaderModification {
  return { id, name: '', value: '', enabled: true };
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

function isRequestHeaderModification(value: unknown): value is RequestHeaderModification {
  return (
    isRecord(value) &&
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
    Array.isArray(value.requestHeaders) &&
    value.requestHeaders.every(isRequestHeaderModification)
  );
}

/**
 * 저장소에서 읽은 알 수 없는 값을 StoredState로 검증한다.
 * 스키마 위반은 전량 거부하고 기본 상태로 대체한다 — 반쯤 깨진 상태로
 * 규칙을 컴파일하지 않는다. 이후 슬라이스가 필드 검증을 여기에 확장한다.
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
