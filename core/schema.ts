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
