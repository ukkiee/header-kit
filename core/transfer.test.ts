import { describe, expect, it } from 'vitest';
import { applyCommand } from './commands';
import type { MaterializeDeps } from './placeholder';
import type { Filter, Modification, Profile, StoredState } from './schema';
import { SCHEMA_VERSION, UNSET_ID } from './schema';
import { exportProfiles, parseImport, serializeExport } from './transfer';

function stubDeps(): MaterializeDeps {
  let n = 0;
  return { uuid: () => `uuid-${++n}`, now: () => 42 };
}

function mod(id: string, value = 'v'): Modification {
  return { kind: 'request-header', id, name: `X-${id}`, value, enabled: true };
}

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    name: 'Alpha',
    active: false,
    shortLabel: 'A',
    color: '#2563eb',
    modifications: [mod('m1', 'trace-{{uuid}}')],
    filters: [
      { kind: 'url', id: 'f1', enabled: true, pattern: 'api\\.example\\.com' },
      { kind: 'tab', id: 'f2', enabled: true, tabId: 123 },
      { kind: 'tab-domain', id: 'f3', enabled: true, domain: 'example.com' },
    ],
    ...overrides,
  };
}

function state(profiles: Profile[], materialized: Record<string, string> = {}): StoredState {
  return { schemaVersion: SCHEMA_VERSION, paused: false, profiles, materialized };
}

describe('exportProfiles', () => {
  it('선택한 Profile만 목록 순서대로 내보낸다', () => {
    const s = state([
      profile({ id: 'a', name: 'A' }),
      profile({ id: 'b', name: 'B' }),
      profile({ id: 'c', name: 'C' }),
    ]);

    const file = exportProfiles(s, ['c', 'a']);
    expect(file.profiles.map((p) => p.name)).toEqual(['A', 'C']);
    expect(file.headerkit).toBe(1);
  });

  it('실체화 값은 Export에 절대 포함되지 않는다 (템플릿만)', () => {
    const s = state([profile({ id: 'a', active: true })], { m1: 'trace-SECRET-VALUE' });

    const text = serializeExport(exportProfiles(s, ['a']));
    expect(text).toContain('trace-{{uuid}}');
    expect(text).not.toContain('SECRET-VALUE');
    expect(text).not.toContain('materialized');
  });
});

describe('parseImport', () => {
  it('Export→Import 라운드트립은 id만 재생성하고 의미를 보존한다', () => {
    const original = profile({ id: 'a', active: true });
    const text = serializeExport(exportProfiles(state([original]), ['a']));

    const result = parseImport(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const imported = result.profiles[0]!;
    expect(imported.name).toBe(original.name);
    expect(imported.active).toBe(true);
    expect(imported.id).not.toBe(original.id);
    expect(imported.modifications[0]).toMatchObject({ name: 'X-m1', value: 'trace-{{uuid}}' });
    expect(imported.modifications[0]?.id).not.toBe('m1');
    expect(imported.filters.find((f) => f.kind === 'url')).toMatchObject({
      pattern: 'api\\.example\\.com',
    });
  });

  it('두 번 Import해도 id가 전부 새로 나와 충돌하지 않는다', () => {
    const text = serializeExport(exportProfiles(state([profile()]), ['p1']));
    const first = parseImport(text);
    const second = parseImport(text);
    if (!first.ok || !second.ok) throw new Error('unexpected');

    expect(first.profiles[0]?.id).not.toBe(second.profiles[0]?.id);
    expect(first.profiles[0]?.modifications[0]?.id).not.toBe(
      second.profiles[0]?.modifications[0]?.id,
    );
  });

  it('탭·그룹·창 참조는 정리(UNSET_ID)되고 알림이 남는다 — 다른 세션의 id는 무의미', () => {
    const text = serializeExport(exportProfiles(state([profile()]), ['p1']));
    const result = parseImport(text);
    if (!result.ok) throw new Error('unexpected');

    const tabFilter = result.profiles[0]!.filters.find((f) => f.kind === 'tab');
    expect(tabFilter).toMatchObject({ tabId: UNSET_ID });
    expect(result.notices).toContainEqual(expect.stringContaining('Alpha'));

    // tab-domain은 도메인 문자열이라 보존된다
    const domainFilter = result.profiles[0]!.filters.find((f) => f.kind === 'tab-domain');
    expect(domainFilter).toMatchObject({ domain: 'example.com' });
  });

  it('깨진 JSON은 거부된다', () => {
    const result = parseImport('{not json');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/JSON/i);
  });

  it('envelope가 아니면 거부된다', () => {
    const result = parseImport(JSON.stringify({ something: [] }));

    expect(result.ok).toBe(false);
  });

  it('스키마 위반은 전량 거부되고 항목 단위 오류를 낸다', () => {
    const bad = {
      headerkit: 1,
      profiles: [
        JSON.parse(serializeExport(exportProfiles(state([profile()]), ['p1']))).profiles[0],
        { id: 'x', name: 'Broken', active: 'yes' },
      ],
    };

    const result = parseImport(JSON.stringify(bad));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join('\n')).toMatch(/profiles\[1\]/);
    expect(result.errors.join('\n')).toMatch(/Broken|active/);
  });
});

describe('import-profiles 명령 (활성화 경계)', () => {
  it('활성 상태로 Import된 Placeholder Profile은 원자적으로 실체화된다', () => {
    const text = serializeExport(exportProfiles(state([profile({ active: true })]), ['p1']));
    const parsed = parseImport(text);
    if (!parsed.ok) throw new Error('unexpected');

    const next = applyCommand(
      state([profile({ id: 'existing', name: 'Existing' })]),
      { type: 'import-profiles', profiles: parsed.profiles },
      stubDeps(),
    );

    expect(next.profiles.map((p) => p.name)).toEqual(['Existing', 'Alpha']);
    const importedMod = next.profiles[1]!.modifications[0]!;
    expect(next.materialized[importedMod.id]).toBe('trace-uuid-1');
  });
});
