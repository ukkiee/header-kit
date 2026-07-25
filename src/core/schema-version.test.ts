import { describe, expect, it } from 'vitest';
import {
  createDefaultState,
  isBlockedFromOverwrite,
  readStoredState,
  SCHEMA_VERSION,
} from './schema';
import { EXPORT_FORMAT_VERSION, exportProfiles, parseImport } from './transfer';

/**
 * 버전 호환성 계약 (티켓 02, ADR 0015).
 *
 * 여기서 지키는 것은 하나다 — **읽는 쪽이 사용자 데이터를 지우지 않는다.** 예전 리더는
 * schemaVersion이 정확히 일치하지 않으면 무엇이든 default 상태로 대체했고, 그 default가
 * 다음 저장에서 원본을 덮어썼다. 새 종류를 담은 v2가 나오면 구버전으로 되돌아갈 때
 * 프로필이 통째로 사라지는 경로다.
 */

/** 저장소에 실제로 들어 있는 모양의 v1 상태(새 종류 없음). */
const v1State = () => ({
  schemaVersion: 1,
  paused: false,
  profiles: [
    {
      id: 'p1',
      name: 'Legacy',
      color: '#2563eb',
      shortLabel: 'LG',
      active: true,
      modifications: [
        {
          kind: 'request-header',
          id: 'm1',
          name: 'Authorization',
          value: 'Bearer dev',
          enabled: true,
          mode: 'override',
          emptyMeans: 'remove',
          comment: '로컬 API 인증',
        },
      ],
    },
  ],
  materialized: {},
  customHeaderNames: ['X-Custom'],
});

describe('readStoredState — 버전 분류', () => {
  it('현재 버전(v2) 상태는 그대로 읽는다', () => {
    const state = createDefaultState();
    const read = readStoredState(JSON.parse(JSON.stringify(state)));
    expect(read.status).toBe('ok');
    if (read.status === 'ok') expect(read.state).toEqual(state);
  });

  it('v1 상태를 v2로 마이그레이션하며 프로필·규칙을 모두 보존한다', () => {
    const read = readStoredState(v1State());
    expect(read.status).toBe('migrated');
    if (read.status !== 'migrated') return;
    expect(read.from).toBe(1);
    expect(read.state.schemaVersion).toBe(SCHEMA_VERSION);
    // 데이터 보존이 이 마이그레이션의 전부다 — 하나라도 잃으면 실패다.
    expect(read.state.profiles).toHaveLength(1);
    expect(read.state.profiles[0]?.name).toBe('Legacy');
    expect(read.state.profiles[0]?.modifications).toHaveLength(1);
    expect(read.state.profiles[0]?.modifications[0]?.id).toBe('m1');
    expect(read.state.customHeaderNames).toEqual(['X-Custom']);
  });

  it('더 새 버전(v3+)은 차단하고 상태를 돌려주지 않는다 — 덮어쓸 default가 없다', () => {
    const future = { ...createDefaultState(), schemaVersion: SCHEMA_VERSION + 1 };
    const read = readStoredState(future);
    expect(read.status).toBe('blocked');
    if (read.status !== 'blocked') return;
    expect(read.reason).toBe('newer');
    expect(read.storedVersion).toBe(SCHEMA_VERSION + 1);
    // 이 분기가 state를 들고 있으면 호출부가 그것을 저장해 원본을 덮을 수 있다.
    expect('state' in read).toBe(false);
  });

  it('깨진 v1은 default로 갈아치우지 않고 차단한다', () => {
    const brokenV1 = { ...v1State(), profiles: [{ id: 'p1' /* name·modifications 없음 */ }] };
    const read = readStoredState(brokenV1);
    expect(read.status).toBe('blocked');
    if (read.status !== 'blocked') return;
    expect(read.reason).toBe('migration-failed');
    expect(read.storedVersion).toBe(1);
  });

  it('저장된 값이 없으면(신규 설치) 기본 상태로 시작한다', () => {
    const read = readStoredState(undefined);
    expect(read.status).toBe('reset');
    // createDefaultState()는 호출마다 새 Profile id를 만들므로 형태로 비교한다.
    if (read.status === 'reset') {
      expect(read.state).toMatchObject({
        schemaVersion: SCHEMA_VERSION,
        paused: false,
        customHeaderNames: [],
        profiles: [{ name: 'Default Profile', active: true, modifications: [] }],
      });
    }
  });

  it('우리 모양이 전혀 아닌 값도 기본 상태로 시작한다', () => {
    const read = readStoredState({ hello: 'world' });
    expect(read.status).toBe('reset');
  });
});

describe('내보내기·가져오기 포맷 버전', () => {
  const profile = () => ({
    id: 'p1',
    name: 'Legacy',
    color: '#2563eb',
    shortLabel: 'LG',
    active: true,
    modifications: [
      {
        kind: 'request-header',
        id: 'm1',
        name: 'Authorization',
        value: 'Bearer dev',
        enabled: true,
        mode: 'override',
        emptyMeans: 'remove',
        comment: '',
      },
    ],
  });

  it('내보내기는 현재 포맷 버전으로 기록한다', () => {
    const file = exportProfiles(
      { ...createDefaultState(), profiles: [profile()] } as never,
      ['p1'],
    );
    expect(file.headerkit).toBe(EXPORT_FORMAT_VERSION);
    expect(file.profiles).toHaveLength(1);
  });

  it('현재 포맷 파일을 왕복으로 읽는다', () => {
    const text = JSON.stringify({ headerkit: EXPORT_FORMAT_VERSION, profiles: [profile()] });
    const result = parseImport(text);
    expect(result.ok).toBe(true);
    // id는 충돌을 피하려 재생성되는 것이 계약이다(스모크 H1) — 내용이 보존됐는지로 본다.
    if (result.ok) {
      const mod = result.profiles[0]?.modifications[0];
      expect(mod).toMatchObject({ kind: 'request-header', name: 'Authorization', value: 'Bearer dev' });
    }
  });

  it('예전 v1 내보내기 파일도 계속 읽는다 — 형태가 호환되므로 거부할 이유가 없다', () => {
    const text = JSON.stringify({ headerkit: 1, profiles: [profile()] });
    const result = parseImport(text);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.profiles).toHaveLength(1);
  });

  it('더 새 포맷 파일은 변형 없이 거부하고 이유를 알린다', () => {
    const text = JSON.stringify({ headerkit: EXPORT_FORMAT_VERSION + 1, profiles: [profile()] });
    const result = parseImport(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/newer/i);
  });

  it('미지의 종류는 조용히 버리지 않고 오류로 거부한다', () => {
    const alien = profile();
    alien.modifications[0]!.kind = 'quantum-header';
    const result = parseImport(JSON.stringify({ headerkit: EXPORT_FORMAT_VERSION, profiles: [alien] }));
    // 조용히 버리면 사용자는 규칙이 사라진 줄 모른 채 성공으로 본다.
    expect(result.ok).toBe(false);
  });
});

describe('isBlockedFromOverwrite — 쓰기 가드', () => {
  it('더 새 버전 위에는 쓰지 못한다', () => {
    expect(isBlockedFromOverwrite({ ...createDefaultState(), schemaVersion: SCHEMA_VERSION + 1 })).toBe(true);
  });

  it('깨진 v1 위에도 쓰지 못한다 — 복구 기회를 남긴다', () => {
    expect(isBlockedFromOverwrite({ ...v1State(), profiles: [{ id: 'only' }] })).toBe(true);
  });

  it('현재 버전·마이그레이션 가능한 v1·빈 저장소 위에는 쓸 수 있다', () => {
    expect(isBlockedFromOverwrite(createDefaultState())).toBe(false);
    expect(isBlockedFromOverwrite(v1State())).toBe(false);
    expect(isBlockedFromOverwrite(undefined)).toBe(false);
  });
});
