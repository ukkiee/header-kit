import { describe, expect, it } from 'vitest';
import { applyCommand } from './commands';
import type { MaterializeDeps } from './placeholder';
import type { Filter, Profile, RequestHeaderModification, StoredState } from './schema';
import { SCHEMA_VERSION } from './schema';
import {
  exportProfiles,
  normalizeImportedProfiles,
  parseImport,
  serializeExport,
} from './transfer';

function stubDeps(): MaterializeDeps {
  let n = 0;
  return { uuid: () => `uuid-${++n}`, now: () => 42 };
}

function mod(id: string, value = 'v'): RequestHeaderModification {
  return {
    kind: 'request-header',
    id,
    name: `X-${id}`,
    value,
    mode: 'override',
    emptyMeans: 'remove',
    comment: '',
    enabled: true,
  };
}

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    name: 'Alpha',
    active: false,
    shortLabel: 'A',
    color: '#2563eb',
    modifications: [mod('m1', 'trace-{{uuid}}')],
    ...overrides,
  };
}

/** 레거시 export 항목 — Profile 타입에서 제거된 filters 배열을 실은 형태 (ADR 0010 이전). */
function legacyEntry(filters: Filter[], overrides: Partial<Profile> = {}): Record<string, unknown> {
  return { ...profile(overrides), filters };
}

function importText(profiles: unknown[]): string {
  return JSON.stringify({ headerkit: 1, profiles });
}

function state(profiles: Profile[], materialized: Record<string, string> = {}): StoredState {
  return { schemaVersion: SCHEMA_VERSION, paused: false, profiles, materialized, customHeaderNames: [] };
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
    // Profile 필터는 제거됐다 (ADR 0010) — export에 filters 구역이 없다
    expect(text).not.toContain('"filters"');
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
    // 현행 export에는 레거시 필터가 없다 — 알림도, filters 잔재도 없다
    expect('filters' in imported).toBe(false);
    expect(result.notices).toEqual([]);
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

  it('레거시 filters는 규칙 단위 조건으로 이주된다 — URL은 OR 조인, 나머지는 conditions 복사', () => {
    const text = importText([
      legacyEntry(
        [
          { kind: 'url', id: 'f1', enabled: true, pattern: 'api\\.example\\.com' },
          { kind: 'url', id: 'f2', enabled: true, pattern: 'cdn\\.example\\.com' },
          { kind: 'url', id: 'f3', enabled: false, pattern: 'disabled\\.example' },
          { kind: 'request-method', id: 'f4', enabled: true, methods: ['get', 'post'] },
          { kind: 'tab-domain', id: 'f5', enabled: true, domain: 'example.com' },
          { kind: 'time', id: 'f6', enabled: true, expiresAt: 500 },
          { kind: 'time', id: 'f7', enabled: true, expiresAt: 200 },
        ],
        {
          modifications: [
            mod('m1'),
            { ...mod('m2'), urlFilter: 'own\\.example', urlMatchType: 'contains' },
          ],
        },
      ),
    ]);

    const result = parseImport(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const imported = result.profiles[0]!;
    // 이주 후 결과에 filters는 남지 않는다
    expect('filters' in imported).toBe(false);
    // 자체 스코프 없는 규칙: 활성 URL 필터만 OR-조인 regex로 이식된다 (비활성 제외)
    expect(imported.modifications[0]).toMatchObject({
      urlFilter: '(?:api\\.example\\.com)|(?:cdn\\.example\\.com)',
      urlMatchType: 'regex',
    });
    // 자체 스코프가 있는 규칙은 건드리지 않는다 (ADR 0007: 자체가 우선)
    expect(imported.modifications[1]).toMatchObject({
      urlFilter: 'own\\.example',
      urlMatchType: 'contains',
    });
    // 리소스/메서드/도메인 계열은 각 규칙의 conditions로 복사되고, 시간은 최솟값이다
    for (const m of imported.modifications) {
      expect(m.conditions).toEqual({
        requestMethods: ['get', 'post'],
        tabDomains: ['example.com'],
        expiresAt: 200,
      });
    }
    expect(result.notices).toContainEqual(
      expect.stringContaining('migrated to per-rule conditions'),
    );
  });

  it('규칙 단위 대응물이 없는 레거시 필터(exclude-url·탭·그룹·창)는 소실되고 알림이 남는다', () => {
    const text = importText([
      legacyEntry([
        { kind: 'exclude-url', id: 'x1', enabled: true, pattern: 'skip\\.example' },
        { kind: 'tab', id: 'x2', enabled: true, tabId: 123 },
        { kind: 'window', id: 'x3', enabled: true, windowId: 7 },
      ]),
    ]);

    const result = parseImport(text);
    if (!result.ok) throw new Error('unexpected');

    const imported = result.profiles[0]!;
    expect('filters' in imported).toBe(false);
    // 대응물이 없으므로 규칙에는 아무것도 이식되지 않는다
    expect(imported.modifications[0]).not.toHaveProperty('urlFilter');
    expect(imported.modifications[0]?.conditions).toBeUndefined();
    expect(result.notices).toEqual([expect.stringContaining('3 legacy filter(s)')]);
    expect(result.notices[0]).toContain('dropped');
    expect(result.notices[0]).toContain('Alpha');
  });

  it('레거시 filters가 있으면 형을 검증한다 — 무효 항목은 전량 거부', () => {
    const bad = {
      headerkit: 1,
      profiles: [
        legacyEntry([{ kind: 'url', id: 'f1', enabled: true } as unknown as Filter]),
        { ...profile(), filters: 'nope' },
      ],
    };

    const result = parseImport(JSON.stringify(bad));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join('\n')).toMatch(/profiles\[0\].*filters\[0\]: invalid filter/);
    expect(result.errors.join('\n')).toMatch(/profiles\[1\].*filters: expected array/);
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

describe('normalizeImportedProfiles', () => {
  it('빈 레거시 filters 배열은 알림 없이 제거된다', () => {
    const { profiles, notices } = normalizeImportedProfiles([
      legacyEntry([]) as unknown as Profile,
    ]);

    expect(notices).toEqual([]);
    expect('filters' in profiles[0]!).toBe(false);
  });

  it('배지 라벨 불변식(2자)을 강제한다', () => {
    const { profiles } = normalizeImportedProfiles([profile({ shortLabel: 'IMPORT' })]);

    expect(profiles[0]?.shortLabel).toBe('IM');
  });
});

describe('restore-profiles 명령 (교체 + 활성화 경계)', () => {
  it('현재 Profile 전체를 교체하고, 활성 스냅샷은 새로 실체화되며, Pause는 보존된다', () => {
    const current = state([profile({ id: 'cur', name: 'Current' })], { stale: 'x' });
    const pausedCurrent = { ...current, paused: true };

    const next = applyCommand(
      pausedCurrent,
      { type: 'restore-profiles', profiles: [profile({ active: true })] },
      stubDeps(),
    );

    expect(next.profiles.map((p) => p.name)).toEqual(['Alpha']);
    expect(next.paused).toBe(true);
    expect(Object.keys(next.materialized)).toHaveLength(1);
    expect(Object.values(next.materialized)[0]).toMatch(/^trace-uuid-\d+$/);
    expect(next.materialized).not.toHaveProperty('stale');
  });
});

describe('import-profiles 명령 (활성화 경계)', () => {
  it('권위 경로는 페이로드를 신뢰하지 않는다 — 기존 id와 겹쳐도 재생성으로 충돌이 없다', () => {
    const existing = profile({ id: 'dup', name: 'Existing' });
    const payload = profile({ id: 'dup', name: 'Injected', shortLabel: 'LONGLABEL' });

    const next = applyCommand(
      state([existing]),
      { type: 'import-profiles', profiles: [payload] },
      stubDeps(),
    );

    const ids = next.profiles.map((p) => p.id);
    expect(new Set(ids).size).toBe(2);
    expect(next.profiles[1]?.shortLabel).toBe('LO');
  });

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
    // id 재생성이 카운터를 소비하므로 정확한 순번 대신 실체화 형태를 고정한다
    expect(next.materialized[importedMod.id]).toMatch(/^trace-uuid-\d+$/);
  });
});
