import { describe, expect, it } from 'vitest';
import {
  isModification,
  toStructuredSetCookie,
  createDefaultState,
  isBlockedFromOverwrite,
  normalizeConditions,
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
    expect(read.reason).toBe('unmigratable');
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
    if (!result.ok) expect(result.errors.map((e) => e.code)).toEqual(['newer-format']);
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


/**
 * v3 경계 (티켓 01, ADR 0017).
 *
 * v3가 존재하는 이유는 응답 쿠키의 `value`가 **뜻을 바꾸기** 때문이다 — v2에서는
 * Set-Cookie 한 줄 전체였고 v3에서는 쿠키의 값이다. 같은 필드의 뜻이 바뀌므로 백필로는
 * 보존할 수 없고, 버전 경계 없이 올리면 구버전 빌드가 새 레코드를 받아 값만 헤더 전체로
 * 컴파일한다.
 *
 * 이 묶음이 지키는 단 하나의 성질: **업그레이드 뒤에도 나가는 헤더가 같다.** 구조화로
 * 옮겨졌든 원시로 남았든 마찬가지다.
 */
describe('v2→v3 — 응답 쿠키 재구조화', () => {
  const v2WithSetCookie = (value: string) => ({
    schemaVersion: 2,
    paused: false,
    profiles: [
      {
        id: 'p1', name: 'P', active: true, shortLabel: 'P', color: '#2563eb',
        modifications: [
          { kind: 'set-cookie', id: 'm1', value, enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
        ],
      },
    ],
    materialized: {},
    customHeaderNames: [],
  });

  const migratedSetCookie = (value: string) => {
    const read = readStoredState(v2WithSetCookie(value));
    if (read.status !== 'migrated') throw new Error(`expected migrated, got ${read.status}`);
    const m = read.state.profiles[0]?.modifications[0];
    if (!m || m.kind !== 'set-cookie') throw new Error('set-cookie 규칙이 사라졌다');
    return m;
  };

  it('v2 상태를 v3로 올린다', () => {
    const read = readStoredState(v2WithSetCookie('sid=abc'));
    expect(read.status).toBe('migrated');
    if (read.status !== 'migrated') return;
    expect(read.from).toBe(2);
    expect(read.state.schemaVersion).toBe(3);
  });

  it('모호함 없는 원시 값은 이름·값·속성으로 갈라진다', () => {
    expect(migratedSetCookie('sid=abc; Domain=localhost; Path=/; Max-Age=60; SameSite=None; Secure; HttpOnly'))
      .toMatchObject({
        name: 'sid', value: 'abc',
        domain: 'localhost', path: '/', maxAge: '60',
        sameSite: 'none', secure: true, httpOnly: true,
      });
  });

  it('갈라진 항목에는 원시 보존값이 남지 않는다', () => {
    expect(migratedSetCookie('sid=abc; Path=/').raw).toBeUndefined();
  });

  // 아래 넷은 전부 "추측하면 다른 쿠키가 나간다"는 한 가지 실패를 가리킨다.
  it.each([
    ['Expires의 쉼표', 'sid=abc; Expires=Wed, 21 Oct 2026 07:28:00 GMT'],
    ['값 안의 =', 'sid=a=b; Path=/'],
    ['모르는 속성', 'sid=abc; Partitioned'],
    ['빈 값', ''],
    ['name=value 꼴이 아님', 'justastring; Path=/'],
    ['이름이 빔', '=abc'],
    ['SameSite 값이 낯섦', 'sid=abc; SameSite=Whatever'],
    ['Max-Age가 숫자가 아님', 'sid=abc; Max-Age=soon'],
    ['Secure에 값이 붙음', 'sid=abc; Secure=yes'],
    ['같은 속성이 두 번', 'sid=abc; Path=/; Path=/x'],
  ])('%s이면 추측하지 않고 원시로 보존한다', (_label, value) => {
    const m = migratedSetCookie(value);
    expect(m.raw).toBe(value);
    // 원시 변형은 구조화 재료를 **하나도** 갖지 않는다 (structure r1 S-2).
    expect(m.name).toBeUndefined();
    expect(m.value).toBeUndefined();
  });

  it('플레이스홀더가 든 줄은 원시로 보존한다 — 갈라 놓으면 실체화 자리가 달라진다', () => {
    const m = migratedSetCookie('sid={{uuid}}; Path=/');
    expect(m.raw).toBe('sid={{uuid}}; Path=/');
  });

  it('올린 상태를 다시 읽으면 그대로다 — 변환이 여러 번 돌아도 같은 결과', () => {
    const once = readStoredState(v2WithSetCookie('sid=abc; Path=/'));
    if (once.status !== 'migrated') throw new Error('첫 읽기가 migrated가 아니다');
    const twice = readStoredState(JSON.parse(JSON.stringify(once.state)));
    expect(twice.status).toBe('ok');
    if (twice.status !== 'ok') return;
    expect(twice.state).toEqual(once.state);
  });
});

/**
 * v1 체인 (티켓 01, plan r3 R3-2).
 *
 * 픽스처가 **레거시 프로필 필터를 담은 진짜 v1**인 것이 이 묶음의 요점이다. 이미 실체화된
 * 조건을 심으면 이 티켓이 세우는 순서(실체화 → v2→v3)를 테스트가 통째로 비껴간다.
 */
describe('v1 → v2 → v3 체인', () => {
  const realV1 = () => ({
    schemaVersion: 1,
    paused: false,
    profiles: [
      {
        id: 'p1', name: 'Legacy', active: true, shortLabel: 'LG', color: '#2563eb',
        modifications: [
          { kind: 'set-cookie', id: 'm1', value: 'sid=abc; Path=/; Secure', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
        ],
        // 실체화되기 **전**의 모습 — 조건은 아직 존재하지 않는다.
        filters: [
          // 퇴역하지 않는 종류 — 실체화가 실제로 돌았는지 보는 감도 대조다.
          { kind: 'resource-type', id: 'f0', enabled: true, resourceTypes: ['script'] },
          { kind: 'request-method', id: 'f1', enabled: true, methods: ['head', 'connect', 'other'] },
          { kind: 'initiator-domain', id: 'f2', enabled: true, domain: 'init.io' },
          { kind: 'tab-domain', id: 'f3', enabled: true, domain: 'tab.io' },
          { kind: 'time', id: 'f4', enabled: true, expiresAt: 500 },
        ],
      },
    ],
    materialized: {},
    customHeaderNames: [],
  });

  it('v1이 v3까지 올라간다', () => {
    const read = readStoredState(realV1());
    expect(read.status).toBe('migrated');
    if (read.status !== 'migrated') return;
    expect(read.from).toBe(1);
    expect(read.state.schemaVersion).toBe(3);
  });

  /*
   * 순서(실체화 먼저)를 재는 방법이 티켓 02에서 **바뀌었다**. 예전에는 실체화 산출물이
   * 조건으로 남아 있는 것을 봤지만, 이제 그중 넷은 같은 변환 안에서 다시 걷혀 나가므로
   * 조건만 봐서는 "실체화가 안 돌았다"와 "돌았고 걷혔다"를 구분할 수 없다.
   *
   * 그래서 퇴역 **집계**로 잰다 — 순서가 뒤집혀 벗기기가 먼저 돌면 아직 태어나지 않은 것을
   * 찾다가 아무것도 못 찾고, 공지가 아예 생기지 않는다. 살아남는 조건 하나를 감도 대조로
   * 함께 본다: 실체화가 통째로 안 돌았다면 그것도 없어야 하므로 두 단언이 서로를 지킨다.
   */
  it('레거시 필터가 실체화된 뒤 퇴역이 걷어 간다 — 순서가 실체화 먼저임을 보인다', () => {
    const read = readStoredState(realV1());
    if (read.status !== 'migrated') throw new Error('migrated가 아니다');
    // 살아남는 종류는 실체화된 그대로 남는다(감도 대조).
    expect(read.state.profiles[0]?.modifications[0]?.conditions).toEqual({
      resourceTypes: ['script'],
    });
    // 퇴역 넷은 실체화된 뒤에야 발견될 수 있었다 — 발견됐다는 증거가 이 수다.
    expect(read.state.retirementNotice).toEqual({ rules: 1 });
  });

  it('v1의 응답 쿠키도 v2를 거친 것과 **같은 곳에 도착한다**', () => {
    const fromV1 = readStoredState(realV1());
    const v2Equivalent = {
      ...realV1(),
      schemaVersion: 2,
      profiles: [{ ...realV1().profiles[0], filters: undefined }],
    };
    const fromV2 = readStoredState(v2Equivalent);
    if (fromV1.status !== 'migrated' || fromV2.status !== 'migrated') throw new Error('둘 다 migrated여야 한다');
    const a = fromV1.state.profiles[0]?.modifications[0];
    const b = fromV2.state.profiles[0]?.modifications[0];
    if (a?.kind !== 'set-cookie' || b?.kind !== 'set-cookie') throw new Error('set-cookie가 아니다');
    expect({ name: a.name, value: a.value, path: a.path, secure: a.secure, raw: a.raw })
      .toEqual({ name: b.name, value: b.value, path: b.path, secure: b.secure, raw: b.raw });
  });

  it('레거시 필터의 검증 케이스가 살아 있어 부분 마이그레이션이 유지된다', () => {
    const withLostKinds = realV1();
    withLostKinds.profiles[0]!.filters.push(
      { kind: 'exclude-url', id: 'f5', enabled: true, pattern: 'gone' } as never,
      { kind: 'tab', id: 'f6', enabled: true, tabId: 3 } as never,
    );
    // 소실 종류가 섞여도 전량 거부가 아니라 나머지가 이주해야 한다.
    const read = readStoredState(withLostKinds);
    expect(read.status).toBe('migrated');
  });
});

/**
 * 가져오기도 같은 변환을 지난다 (티켓 01) — 옛 파일로 들어온 응답 쿠키가 로드 경로와
 * 다른 곳에 도착하면, 같은 데이터가 어느 문으로 들어왔느냐에 따라 다른 쿠키를 내보낸다.
 */
describe('가져오기 — v2 파일의 응답 쿠키', () => {
  const v2File = (value: string) =>
    JSON.stringify({
      headerkit: 2,
      profiles: [
        {
          id: 'p1', name: 'P', active: true, shortLabel: 'P', color: '#2563eb',
          modifications: [
            { kind: 'set-cookie', id: 'm1', value, enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
          ],
        },
      ],
    });

  const imported = (value: string) => {
    const result = parseImport(v2File(value));
    if (!result.ok) throw new Error(`import 실패: ${result.errors.map((e) => e.code).join(', ')}`);
    const m = result.profiles[0]?.modifications[0];
    if (m?.kind !== 'set-cookie') throw new Error('set-cookie가 아니다');
    return m;
  };

  it('v2 내보내기 파일을 계속 읽는다', () => {
    expect(parseImport(v2File('sid=abc')).ok).toBe(true);
  });

  it('모호함 없는 줄은 로드 경로와 같게 갈라진다', () => {
    expect(imported('sid=abc; Path=/')).toMatchObject({ name: 'sid', value: 'abc', path: '/' });
  });

  it('모호한 줄은 로드 경로와 같게 원시로 보존된다', () => {
    expect(imported('sid=abc; Expires=Wed, 21 Oct 2026 07:28:00 GMT').raw)
      .toBe('sid=abc; Expires=Wed, 21 Oct 2026 07:28:00 GMT');
  });
});

/**
 * 응답 쿠키는 **두 표현 중 하나만** 갖는다 (structure r1 S-2).
 *
 * 예전에는 원시 보존이 선택 필드로 얹혀 있어, 구조화 재료와 원시 줄을 동시에 든 레코드가
 * 저장소를 통과했다. 컴파일은 원시를 우선하므로 폼이 이름·값을 고쳐 저장하고 "성공"이라
 * 말한 뒤에도 옛 줄이 계속 나가는 경로가 열려 있었다.
 */
describe('응답 쿠키 — 표현은 하나뿐', () => {
  const record = (over: Record<string, unknown>) => ({
    kind: 'set-cookie', id: 'm1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '',
    ...over,
  });

  it('구조화 재료와 원시 줄을 함께 든 레코드는 무효다', () => {
    expect(isModification(record({ name: 'sid', value: 'abc', raw: 'sid=abc' }))).toBe(false);
  });

  it('둘 중 하나만 들면 유효하다', () => {
    expect(isModification(record({ name: 'sid', value: 'abc' }))).toBe(true);
    expect(isModification(record({ raw: 'sid=abc; Expires=Wed, 21 Oct 2026 07:28:00 GMT' }))).toBe(true);
  });

  it('둘 다 없으면 무효다 — 무엇을 내보낼지 말하지 않은 규칙이다', () => {
    expect(isModification(record({}))).toBe(false);
  });

  it('구조화로 옮기는 문은 원시 줄을 **지우면서** 나간다', () => {
    const raw = record({ raw: 'sid=abc; Partitioned' }) as never;
    const moved = toStructuredSetCookie(raw, { name: 'sid', value: 'abc' });
    expect(moved.raw).toBeUndefined();
    expect(moved).toMatchObject({ name: 'sid', value: 'abc' });
    expect(isModification(moved)).toBe(true);
  });
});

/**
 * 저장소와 가져오기가 **같은 순서 있는 문**을 지난다 (structure r1 S-3).
 *
 * 예전에는 재구조화가 버전을 모르는 백필 안에 숨어 있어, 저장소는 실체화→재구조화로 가는데
 * 가져오기는 그 반대로 갔다. 티켓 02가 퇴역을 얹는 순간 가져오기 문에서만 아직 태어나지
 * 않은 조건을 벗기려 하게 되는 자리였다.
 */
describe('저장소와 가져오기가 같은 곳에 도착한다', () => {
  const legacyProfile = () => ({
    id: 'p1', name: 'Legacy', active: true, shortLabel: 'LG', color: '#2563eb',
    modifications: [
      { kind: 'set-cookie', id: 'm1', value: 'sid=abc; Path=/', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
    ],
    filters: [
      { kind: 'request-method', id: 'f1', enabled: true, methods: ['head'] },
      { kind: 'tab-domain', id: 'f2', enabled: true, domain: 'tab.io' },
    ],
  });

  const fromStorage = () => {
    const read = readStoredState({
      schemaVersion: 1, paused: false, profiles: [legacyProfile()], materialized: {}, customHeaderNames: [],
    });
    if (read.status !== 'migrated') throw new Error('migrated가 아니다');
    return read.state.profiles[0]!.modifications[0]!;
  };

  const fromImport = () => {
    const result = parseImport(JSON.stringify({ headerkit: 1, profiles: [legacyProfile()] }));
    if (!result.ok) throw new Error(`import 실패: ${result.errors.map((e) => e.code).join(', ')}`);
    return result.profiles[0]!.modifications[0]!;
  };

  it('응답 쿠키가 같은 재료로 갈라진다', () => {
    const a = fromStorage();
    const b = fromImport();
    if (a.kind !== 'set-cookie' || b.kind !== 'set-cookie') throw new Error('set-cookie가 아니다');
    expect({ name: a.name, value: a.value, path: a.path, raw: a.raw })
      .toEqual({ name: b.name, value: b.value, path: b.path, raw: b.raw });
  });

  it('레거시 필터도 같은 조건으로 실체화된다', () => {
    expect(fromStorage().conditions).toEqual(fromImport().conditions);
  });

  it('무효한 레거시 필터는 여전히 파일 전체를 거부한다 — 조용히 삼키지 않는다', () => {
    const broken = { ...legacyProfile(), filters: [{ kind: 'request-method', id: 'f1', enabled: true, methods: 'nope' }] };
    const result = parseImport(JSON.stringify({ headerkit: 1, profiles: [broken] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((e) => e.code)).toContain('unreadable-legacy-filter');
  });
});

/**
 * 퇴역 Condition·메서드 벗기기와 집계 (티켓 02, ADR 0017).
 *
 * 넷 다 "여기엔 걸지 말라"를 말하던 것이라 사라지면 규칙이 **조용히 넓어진다**. 그래서
 * 벗기는 것과 **몇 개가 영향받았는지 세는 것**이 한 변환 안에서 함께 일어나야 한다 —
 * 세지 않으면 알릴 것이 없고, 알리지 않으면 사용자는 어느 날 규칙이 넓어진 이유를 모른다.
 */
describe('v2→v3 — 퇴역 조건·메서드', () => {
  const v2With = (conditions: Record<string, unknown>) => ({
    schemaVersion: 2,
    paused: false,
    profiles: [
      {
        id: 'p1', name: 'P', active: true, shortLabel: 'P', color: '#2563eb',
        modifications: [
          { kind: 'request-header', id: 'm1', name: 'X', value: '1', enabled: true,
            mode: 'override', emptyMeans: 'remove', comment: '', conditions },
        ],
      },
    ],
    materialized: {},
    customHeaderNames: [],
  });

  const upgraded = (conditions: Record<string, unknown>) => {
    const read = readStoredState(v2With(conditions));
    if (read.status !== 'migrated') throw new Error(`expected migrated, got ${read.status}`);
    return read.state;
  };

  it.each([
    ['제외 도메인', { excludedDomains: ['skip.io'] }],
    ['요청 출처 도메인', { initiatorDomains: ['init.io'] }],
    ['탭 도메인', { tabDomains: ['tab.io'] }],
    ['자동 해제 시각', { expiresAt: 1_700_000_000_000 }],
  ])('%s는 벗겨지고 영향 수에 세어진다', (_label, conditions) => {
    const state = upgraded(conditions);
    expect(state.profiles[0]?.modifications[0]?.conditions).toBeUndefined();
    expect(state.retirementNotice).toEqual({ rules: 1 });
  });

  it('HEAD·CONNECT·OTHER만 남기고 나머지 메서드는 지킨다', () => {
    const state = upgraded({ requestMethods: ['get', 'head', 'connect', 'other', 'post'] });
    expect(state.profiles[0]?.modifications[0]?.conditions).toEqual({ requestMethods: ['get', 'post'] });
    expect(state.retirementNotice).toEqual({ rules: 1 });
  });

  it('마지막 남은 메서드가 사라져 규칙이 모든 메서드에 걸리게 되면 그것도 세어진다', () => {
    const state = upgraded({ requestMethods: ['head'] });
    expect(state.profiles[0]?.modifications[0]?.conditions).toBeUndefined();
    expect(state.retirementNotice).toEqual({ rules: 1 });
  });

  it('살아남는 조건만 가진 규칙은 세지 않는다 — 아무것도 넓어지지 않았다', () => {
    const state = upgraded({ resourceTypes: ['script'], requestMethods: ['get'] });
    expect(state.profiles[0]?.modifications[0]?.conditions)
      .toEqual({ resourceTypes: ['script'], requestMethods: ['get'] });
    expect(state.retirementNotice).toBeUndefined();
  });

  it('규칙 하나가 여러 개를 잃어도 한 번 센다 — 세는 단위는 규칙이다', () => {
    const state = upgraded({ excludedDomains: ['a'], tabDomains: ['b'], expiresAt: 1 });
    expect(state.retirementNotice).toEqual({ rules: 1 });
  });

  it('올린 상태를 다시 읽으면 공지가 새로 생기지 않는다 — 벗길 것이 이미 없다', () => {
    const once = upgraded({ tabDomains: ['tab.io'] });
    const twice = readStoredState(JSON.parse(JSON.stringify(once)));
    expect(twice.status).toBe('ok');
    if (twice.status !== 'ok') return;
    // 공지는 확인될 때까지 남는다 — 다시 읽었다고 사라지지도, 부풀지도 않는다.
    expect(twice.state.retirementNotice).toEqual({ rules: 1 });
  });
});

/**
 * 레거시 필터에서 **실체화된** 퇴역 조건도 벗겨진다 (티켓 02, 01이 세운 순서 덕분).
 *
 * 진짜 v1 상태에는 조건이 없다 — 실체화가 만들어 낸다. 벗기기가 실체화보다 앞에 있으면
 * 아무것도 못 찾고 통과하고, 그 뒤 검증이 퇴역 대상을 새로 만들어 커밋한다.
 */
describe('v1 레거시 필터 → 실체화 → 퇴역', () => {
  const realV1 = () => ({
    schemaVersion: 1,
    paused: false,
    profiles: [
      {
        id: 'p1', name: 'Legacy', active: true, shortLabel: 'LG', color: '#2563eb',
        modifications: [
          { kind: 'request-header', id: 'm1', name: 'X', value: '1', enabled: true,
            mode: 'override', emptyMeans: 'remove', comment: '' },
        ],
        filters: [
          { kind: 'request-method', id: 'f1', enabled: true, methods: ['head', 'get'] },
          { kind: 'initiator-domain', id: 'f2', enabled: true, domain: 'init.io' },
          { kind: 'tab-domain', id: 'f3', enabled: true, domain: 'tab.io' },
          { kind: 'time', id: 'f4', enabled: true, expiresAt: 500 },
        ],
      },
    ],
    materialized: {},
    customHeaderNames: [],
  });

  it('실체화된 퇴역 조건이 빠짐없이 벗겨지고 살아남는 것만 남는다', () => {
    const read = readStoredState(realV1());
    if (read.status !== 'migrated') throw new Error('migrated가 아니다');
    expect(read.state.profiles[0]?.modifications[0]?.conditions).toEqual({ requestMethods: ['get'] });
    expect(read.state.retirementNotice).toEqual({ rules: 1 });
  });

  it('커밋된 v3를 다시 읽어도 퇴역 필드가 없다 — 저장소에 남지 않는다', () => {
    const read = readStoredState(realV1());
    if (read.status !== 'migrated') throw new Error('migrated가 아니다');
    const again = readStoredState(JSON.parse(JSON.stringify(read.state)));
    if (again.status !== 'ok') throw new Error('ok가 아니다');
    const conditions = again.state.profiles[0]?.modifications[0]?.conditions as Record<string, unknown>;
    for (const key of ['excludedDomains', 'initiatorDomains', 'tabDomains', 'expiresAt']) {
      expect(conditions?.[key]).toBeUndefined();
    }
  });

  /*
   * **백업 파일**에도 남지 않는다 (수용 기준). 저장소만 보면 반쪽이다 — 내보낸 파일이 퇴역
   * 필드를 들고 나가면 그것을 다시 들여올 때까지 그 값이 살아 있고, 파일을 열어 본 사용자는
   * 이 버전이 더 이상 쓰지 않는 조건을 자기 규칙이 여전히 가진 것으로 읽는다.
   */
  it('내보낸 파일에도 퇴역 필드가 없다', () => {
    const read = readStoredState(realV1());
    if (read.status !== 'migrated') throw new Error('migrated가 아니다');
    const file = exportProfiles(read.state, [read.state.profiles[0]!.id]);
    const serialized = JSON.stringify(file);

    for (const key of ['excludedDomains', 'initiatorDomains', 'tabDomains', 'expiresAt']) {
      expect(serialized).not.toContain(key);
    }
    // 감도 대조 — 살아남는 조건은 파일에 실제로 들어 있다(부재 단언이 빈 파일로 퇴화하지 않게).
    expect(serialized).toContain('"requestMethods":["get"]');
  });
});

/**
 * 조건 정규화가 퇴역 넷을 **통과시키지 않는다** (수용 기준, ADR 0017).
 *
 * 벗기기와 같은 변경에서 사라지는 것이 중요하다: 분기를 남기면 낡은 값이 화면에 보이지 않은
 * 채 저장소에서 계속 살아남고, 벗기기 없이 분기만 지우면 무관한 저장 한 번에 그 값이 조용히
 * 사라진다 — 그때는 규칙이 넓어졌다고 알릴 자리도 없다.
 */
describe('normalizeConditions — 퇴역 분기', () => {
  it('퇴역 넷은 값이 있어도 통과하지 못한다', () => {
    expect(
      normalizeConditions({
        excludedDomains: ['skip.io'],
        initiatorDomains: ['init.io'],
        tabDomains: ['tab.io'],
        expiresAt: 1_700_000_000_000,
      }),
    ).toBeUndefined();
  });

  it('살아남는 둘만 통과한다 — 퇴역분이 섞여 있어도 걷힌다', () => {
    expect(
      normalizeConditions({
        resourceTypes: ['script'],
        requestMethods: ['get'],
        tabDomains: ['tab.io'],
        expiresAt: 1,
      }),
    ).toEqual({ resourceTypes: ['script'], requestMethods: ['get'] });
  });
});
