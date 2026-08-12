import { describe, expect, it } from 'vitest';
import {
  addModification,
  addProfile,
  applyCommand,
  moveModification,
  moveProfile,
  removeModification,
  removeProfile,
  renameProfile,
  setPaused,
  toggleProfile,
  updateModification,
} from './commands';
import type { Modification, RequestHeaderModification, StoredState } from './schema';
import { readStoredState, SCHEMA_VERSION } from './schema';

function modification(id: string, name = 'X-A'): RequestHeaderModification {
  return {
    kind: 'request-header',
    id,
    name,
    value: '1',
    enabled: true,
    mode: 'override',
    emptyMeans: 'remove',
    comment: '',
  };
}

function state(): StoredState {
  return {
    schemaVersion: SCHEMA_VERSION,
    paused: false,
    theme: 'system',
    badgeVisible: true,
    syncBackup: true,
    profiles: [
      { id: 'p1', name: 'One', active: false, color: '#2563eb', modifications: [modification('m1')] },
      { id: 'p2', name: 'Two', active: false, color: '#16a34a', modifications: [] },
    ],
    materialized: {},
    customHeaderNames: [],
    customCookieNames: [],
    customUserAgents: [],
  };
}

describe('state transition commands', () => {
  it('toggleProfile은 대상 Profile만 바꾸고 나머지는 보존한다', () => {
    const next = toggleProfile(state(), 'p1', true);

    expect(next.profiles[0]?.active).toBe(true);
    expect(next.profiles[1]?.active).toBe(false);
    expect(next.profiles[0]?.modifications).toHaveLength(1);
  });

  it('addModification은 목록 끝에 추가한다 (순서 = 우선순위 세분)', () => {
    const next = addModification(state(), 'p1', modification('m2', 'X-B'));

    expect(next.profiles[0]?.modifications.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('updateModification은 id가 일치하는 항목만 교체한다', () => {
    const next = updateModification(state(), 'p1', {
      ...modification('m1'),
      value: 'changed',
    });

    const updatedMod = next.profiles[0]?.modifications[0];
    expect(updatedMod?.kind === 'request-header' && updatedMod.value).toBe('changed');
  });

  it('removeModification은 해당 항목만 제거한다', () => {
    const next = removeModification(state(), 'p1', 'm1');

    expect(next.profiles[0]?.modifications).toEqual([]);
  });

  it('addProfile은 지정 위치 뒤(또는 끝)에 Profile을 추가한다', () => {
    const created = { ...state().profiles[1]!, id: 'p3', name: 'Three' };

    const appended = addProfile(state(), created);
    expect(appended.profiles.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);

    const afterFirst = addProfile(state(), created, 'p1');
    expect(afterFirst.profiles.map((p) => p.id)).toEqual(['p1', 'p3', 'p2']);
  });

  /*
   * **복제·메타 변경 테스트가 여기 없다** (ADR 0017, 티켓 04). 그 명령들이 퇴역해서다 —
   * 이름·색은 만들 때 정해지고 그 뒤로 바뀌지 않는다.
   *
   * 삭제는 돌아왔다(ADR 0017 개정) — 아래가 그 테스트다.
   */
  it('moveProfile은 순서를 바꾼다 (순서 = 충돌 우선순위)', () => {
    const next = moveProfile(state(), 'p2', 0);

    expect(next.profiles.map((p) => p.id)).toEqual(['p2', 'p1']);
  });

  /**
   * 규칙 순서 = 적용 우선순위다(`compile.ts`의 충돌 의미론). 아래는 이 전이가 **순서만**
   * 바꾸는지를 잰다 — 실체화 값도, 다른 프로필도 건드리지 않아야 한다.
   */
  describe('moveModification', () => {
    /** 한 프로필에 규칙 셋. 순서는 id로만 단언한다. */
    function three(): StoredState {
      const base = state();
      return {
        ...base,
        profiles: [
          {
            ...base.profiles[0]!,
            modifications: [modification('m1'), modification('m2'), modification('m3')],
          },
          base.profiles[1]!,
        ],
      };
    }
    const ids = (s: StoredState) => s.profiles.find((p) => p.id === 'p1')!.modifications.map((m) => m.id);

    it('순서를 바꾼다 — 위로 옮긴 규칙이 앞선다', () => {
      expect(ids(moveModification(three(), 'p1', 'm3', 0))).toEqual(['m3', 'm1', 'm2']);
    });

    it('목록 끝으로 옮긴다 — dnd-kit의 arrayMove와 같은 결과다', () => {
      expect(ids(moveModification(three(), 'p1', 'm1', 2))).toEqual(['m2', 'm3', 'm1']);
    });

    it('toIndex가 -1이면 맨 앞이다 — 음수를 끝에서 세면 제자리가 되어 조용히 무동작이 된다', () => {
      // **이 케이스가 `Math.max(0, …)`을 재는 유일한 자리다.** 음수를 그대로 splice에 넘기면
      // 끝에서부터 세어 `-1`이 "마지막 앞"이 되고, m2를 뽑은 [m1, m3]의 인덱스 1에 다시 꽂아
      // 결과가 원래 순서와 같아진다 — 사용자가 맨 위로 끌었는데 아무 일도 안 난다.
      expect(ids(moveModification(three(), 'p1', 'm2', -1))).toEqual(['m2', 'm1', 'm3']);
    });

    it('toIndex가 길이를 넘으면 맨 끝이다', () => {
      expect(ids(moveModification(three(), 'p1', 'm2', 99))).toEqual(['m1', 'm3', 'm2']);
    });

    it('없는 규칙 id는 무동작이다 — 실패가 아니다', () => {
      const before = three();
      expect(moveModification(before, 'p1', 'nope', 0)).toEqual(before);
    });

    it('없는 프로필 id는 무동작이다', () => {
      const before = three();
      expect(moveModification(before, 'nope', 'm1', 0)).toEqual(before);
    });

    it('다른 프로필은 건드리지 않는다', () => {
      const next = moveModification(three(), 'p1', 'm3', 0);
      expect(next.profiles.find((p) => p.id === 'p2')).toEqual(three().profiles[1]);
    });

    it('실체화 값을 손대지 않는다 — remove+add로 조립했다면 갈렸을 자리다', () => {
      // **이 케이스가 이 전이를 따로 만든 이유다.** 순서를 remove+add로 바꾸면 remove가 그
      // 규칙의 실체화 값을 지우고 add가 다시 실체화한다 — 순서만 바꿨는데 켜져 있는 동안
      // 유지돼야 할 Placeholder 값이 새 값으로 갈린다.
      const seeded: StoredState = { ...three(), materialized: { m1: 'kept-1', m3: 'kept-3' } };
      expect(moveModification(seeded, 'p1', 'm1', 2).materialized).toEqual({
        m1: 'kept-1',
        m3: 'kept-3',
      });
    });
  });

  it('removeProfile은 그 프로필만 지우고 순서는 그대로 둔다', () => {
    const three = addProfile(state(), {
      id: 'p3',
      name: 'Three',
      active: false,
      color: '#d97706',
      modifications: [],
    });
    const next = removeProfile(three, 'p2');

    expect(next.profiles.map((p) => p.id)).toEqual(['p1', 'p3']);
  });

  /*
   * **실체화 값도 함께 지운다.** modification id로 매인 별도 맵이라, 프로필만 지우면 아무도
   * 가리키지 않는 값이 영구히 남는다 — 끄는 경로가 이미 하던 정리를 삭제도 한다.
   */
  it('removeProfile은 그 프로필이 남긴 실체화 값을 함께 걷는다', () => {
    const seeded = toggleProfile(
      {
        ...state(),
        profiles: [
          {
            id: 'p1',
            name: 'One',
            active: false,
            color: '#2563eb',
            modifications: [{ ...modification('m1'), value: 'id-{{uuid}}' }],
          },
          { id: 'p2', name: 'Two', active: false, color: '#16a34a', modifications: [] },
        ],
      },
      'p1',
      true,
    );
    expect(Object.keys(seeded.materialized)).toEqual(['m1']);

    expect(removeProfile(seeded, 'p1').materialized).toEqual({});
    // 남의 프로필을 지우는 것으로는 걷히지 않는다 — 정리 대상이 id로 정확히 좁혀진다.
    expect(Object.keys(removeProfile(seeded, 'p2').materialized)).toEqual(['m1']);
  });

  it('마지막 프로필도 지울 수 있다 — 빈 목록은 화면이 이미 말한다', () => {
    const one = removeProfile(state(), 'p2');
    expect(removeProfile(one, 'p1').profiles).toEqual([]);
  });

  it('없는 id는 상태를 그대로 둔다 — 두 화면이 같은 것을 지워도 뒤엣것이 실패로 보이지 않는다', () => {
    const before = state();
    expect(removeProfile(before, 'nope')).toEqual(before);
  });

  it('togglePause는 권위 상태 기준으로 Pause를 뒤집는다 (lost-update 방지)', () => {
    const off = applyCommand(state(), { type: 'toggle-pause' });
    expect(off.paused).toBe(true);
    const on = applyCommand(off, { type: 'toggle-pause' });
    expect(on.paused).toBe(false);
  });

  it('setPaused는 Profile 상태를 건드리지 않는다', () => {
    const activated = toggleProfile(state(), 'p1', true);
    const paused = setPaused(activated, true);

    expect(paused.paused).toBe(true);
    expect(paused.profiles[0]?.active).toBe(true);

    const resumed = setPaused(paused, false);
    expect(resumed.paused).toBe(false);
    expect(resumed.profiles[0]?.active).toBe(true);
  });

  it('applyCommand는 모든 명령 타입을 해당 전이로 위임한다', () => {
    const viaCommand = applyCommand(state(), {
      type: 'move-profile',
      profileId: 'p2',
      toIndex: 0,
    });

    expect(viaCommand.profiles.map((p) => p.id)).toEqual(['p2', 'p1']);

    const pausedState = applyCommand(state(), { type: 'set-paused', paused: true });
    expect(pausedState.paused).toBe(true);

    const removed = applyCommand(state(), { type: 'remove-profile', profileId: 'p1' });
    expect(removed.profiles.map((p) => p.id)).toEqual(['p2']);

    const renamed = applyCommand(state(), { type: 'rename-profile', profileId: 'p1', name: 'Renamed' });
    expect(renamed.profiles.map((p) => p.name)).toEqual(['Renamed', 'Two']);
  });

  /*
   * 이름 변경 (ADR 0017 재개정) — 규칙은 셋뿐이다: 트림하고, 빈 이름은 거절하고,
   * **중복은 허용한다.**
   *
   * 중복 허용을 재는 것이 이 묶음의 요점이다. 막는 편이 얼핏 안전해 보이지만, 이름을
   * 만드는 쪽(`newProfileName` + 개수)과 가져오기가 이미 중복을 만들 수 있어서 막으면
   * **화면에 이미 있는 충돌을 고칠 길이 사라진다.** 그 판단이 뒤집히면 여기가 먼저 빨강이 된다.
   */
  it('renameProfile은 트림한 이름을 저장한다', () => {
    const next = renameProfile(state(), 'p1', '  Trimmed  ');
    expect(next.profiles[0]?.name).toBe('Trimmed');
    // 다른 프로필과 규칙은 건드리지 않는다.
    expect(next.profiles[1]).toEqual(state().profiles[1]);
    expect(next.profiles[0]?.modifications).toEqual(state().profiles[0]?.modifications);
  });

  it('renameProfile은 빈 이름과 공백뿐인 이름을 거절한다 — 상태 그대로', () => {
    const before = state();
    expect(renameProfile(before, 'p1', '')).toBe(before);
    expect(renameProfile(before, 'p1', '   ')).toBe(before);
    expect(renameProfile(before, 'p1', '\t\n ')).toBe(before);
  });

  it('renameProfile은 중복 이름을 허용한다 — 막으면 이미 있는 충돌을 고칠 수 없다', () => {
    const next = renameProfile(state(), 'p1', 'Two');
    expect(next.profiles.map((p) => p.name)).toEqual(['Two', 'Two']);
    // 가리키는 것은 언제나 id다 — 이름이 같아도 둘은 서로 다른 프로필로 남는다.
    expect(next.profiles.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('renameProfile은 같은 이름과 없는 id에서 상태를 그대로 돌려준다', () => {
    const before = state();
    // 트림 뒤 같은 이름인 것도 무변화다 — 쓰기 한 번을 아끼는 것이 아니라, 무의미한
    // 전이가 백업 스냅샷과 dNR 재컴파일을 예약하지 않게 하려는 것이다.
    expect(renameProfile(before, 'p1', 'One')).toBe(before);
    expect(renameProfile(before, 'p1', '  One  ')).toBe(before);
    expect(renameProfile(before, 'nope', 'Whatever')).toBe(before);
  });

  /*
   * 퇴역 공지 확인 (티켓 02, ADR 0017).
   *
   * 확인이 **명령**인 것이 핵심이다 — 화면이 자기 상태에서 지우면 그 지움은 저장소에 닿지
   * 못하고, 팝업이 닫히는 순간 되돌아온다. 명령이면 단일 writer의 쓰기 문을 지나므로,
   * 쓰기가 실패했을 때 공지가 남는 것이 예외 처리가 아니라 기본 동작이다.
   */
  it('acknowledge-retirement는 공지를 지운다 — 필드째 사라진다', () => {
    const withNotice = { ...state(), retirementNotice: { rules: 3 } };
    const next = applyCommand(withNotice, { type: 'acknowledge-retirement' });

    expect(next.retirementNotice).toBeUndefined();
    // 0으로 두지 않는다 — 부재가 곧 "알릴 것이 없다"라는 필드의 계약이다.
    expect('retirementNotice' in next).toBe(false);
  });

  it('확인은 공지 말고는 아무것도 건드리지 않는다', () => {
    const withNotice = { ...state(), paused: true, retirementNotice: { rules: 1 } };
    const next = applyCommand(withNotice, { type: 'acknowledge-retirement' });

    expect(next.paused).toBe(true);
    expect(next.profiles).toEqual(withNotice.profiles);
    expect(next.materialized).toEqual(withNotice.materialized);
  });

  it('공지가 없으면 확인은 아무 일도 하지 않는다', () => {
    const bare = state();
    expect(applyCommand(bare, { type: 'acknowledge-retirement' })).toBe(bare);
  });

  /*
   * 확인 결과가 **쓰기 문을 통과할 수 있는 모양**이어야 한다. persistState는 자신이 다시
   * 읽어낼 수 없는 상태를 거부하므로(structure r2 S2-1), 여기서 모양이 깨지면 확인은 항상
   * 실패하고 공지는 영영 지워지지 않는다.
   */
  it('확인한 상태는 이 버전이 다시 읽어낼 수 있다 — 쓰기 문을 지난다', () => {
    const withNotice = { ...state(), retirementNotice: { rules: 2 } };
    const next = applyCommand(withNotice, { type: 'acknowledge-retirement' });

    const read = readStoredState(JSON.parse(JSON.stringify(next)));
    expect(read.status).toBe('ok');
    if (read.status !== 'ok') return;
    expect(read.state.retirementNotice).toBeUndefined();
  });

  it('명령은 입력 상태를 변형하지 않는다 (불변성)', () => {
    const original = state();
    const snapshot = structuredClone(original);

    toggleProfile(original, 'p1', true);
    addModification(original, 'p1', modification('m9'));
    removeModification(original, 'p1', 'm1');

    expect(original).toEqual(snapshot);
  });

  /*
   * 제안 이력 (티켓 08) — **저장이 자동으로 남긴다.**
   *
   * 헤더 이름은 환경설정에서 사람이 등록하지만 쿠키 이름·User-Agent에는 그런 화면이 없다.
   * 그래서 규칙을 저장하는 전이 **안에서** 남긴다 — 명령을 하나 더 보내면 두 번의 쓰기가
   * 되고, 그 사이에 워커가 죽으면 규칙은 저장됐는데 이력은 비는 상태가 생긴다.
   */
  describe('제안 이력 기록', () => {
    const cookie = (name: string): Modification =>
      ({
        kind: 'cookie',
        id: 'c1',
        name,
        value: 'v',
        enabled: true,
        mode: 'append',
        emptyMeans: 'remove',
        comment: '',
      }) as Modification;
    const ua = (value: string): Modification =>
      ({ kind: 'user-agent', id: 'u1', value, enabled: true, comment: '' }) as Modification;

    it('쿠키 규칙을 저장하면 그 이름이 다음 제안에 남는다', () => {
      const next = applyCommand(state(), {
        type: 'add-modification',
        profileId: 'p1',
        modification: cookie('my_sid'),
      });
      expect(next.customCookieNames).toEqual(['my_sid']);
    });

    it('User-Agent 규칙을 저장하면 그 값이 남는다', () => {
      const next = applyCommand(state(), {
        type: 'add-modification',
        profileId: 'p1',
        modification: ua('MyBot/1.0'),
      });
      expect(next.customUserAgents).toEqual(['MyBot/1.0']);
    });

    it('편집 저장도 남긴다 — 이름을 고쳐 저장한 값이 다음에 제안된다', () => {
      const added = applyCommand(state(), {
        type: 'add-modification',
        profileId: 'p1',
        modification: cookie('first'),
      });
      const edited = applyCommand(added, {
        type: 'update-modification',
        profileId: 'p1',
        modification: cookie('second'),
      });
      expect(edited.customCookieNames).toEqual(['first', 'second']);
    });

    // 프리셋에 없는 이름으로 잰다 — 프리셋에 있는 것은 아래 규칙에 먼저 걸려 중복을 못 본다.
    it('같은 값은 두 번 남지 않는다 (대소문자 무시)', () => {
      const once = applyCommand(state(), {
        type: 'add-modification',
        profileId: 'p1',
        modification: cookie('My_Sid'),
      });
      const twice = applyCommand(once, {
        type: 'add-modification',
        profileId: 'p1',
        modification: cookie('my_sid'),
      });
      expect(twice.customCookieNames).toEqual(['My_Sid']);
    });

    /*
     * 프리셋에 이미 있는 값은 남기지 않는다 — 남기면 목록에 같은 이름이 두 번 서고, 그 중복은
     * 사용자가 지울 화면이 없어 영구히 남는다.
     */
    it('프리셋에 있는 이름은 이력에 남기지 않는다', () => {
      const next = applyCommand(state(), {
        type: 'add-modification',
        profileId: 'p1',
        modification: cookie('session_id'),
      });
      expect(next.customCookieNames).toEqual([]);
    });

    it('빈 값은 남기지 않는다', () => {
      const next = applyCommand(state(), {
        type: 'add-modification',
        profileId: 'p1',
        modification: cookie('   '),
      });
      expect(next.customCookieNames).toEqual([]);
    });

    /*
     * **헤더 이름도 저장이 기억한다** (티켓 09). 티켓 08까지는 이 셋 중 헤더만 예외였고
     * 환경설정 화면에서 손으로 등록해야 했는데, 시안에 그 화면이 없어 카드가 사라졌다.
     * 여기서 남기지 않으면 그 목록은 영영 자라지 못한다.
     */
    it('헤더 규칙을 저장하면 그 이름이 다음 제안에 남는다', () => {
      const next = applyCommand(state(), {
        type: 'add-modification',
        profileId: 'p1',
        modification: modification('m9', 'X-Zed'),
      });
      expect(next.customHeaderNames).toEqual(['X-Zed']);
      // 헤더는 헤더 목록에만 — 세 이력이 서로를 오염시키지 않는다.
      expect(next.customCookieNames).toEqual([]);
      expect(next.customUserAgents).toEqual([]);
    });

    it('헤더 이름도 같은 네 단계를 지난다 — 빈 값·중복·표준 사전은 남지 않는다', () => {
      const once = applyCommand(state(), {
        type: 'add-modification',
        profileId: 'p1',
        modification: modification('m9', 'X-Zed'),
      });
      // 대소문자 무시 중복
      const twice = applyCommand(once, {
        type: 'add-modification',
        profileId: 'p1',
        modification: modification('m10', 'x-zed'),
      });
      expect(twice.customHeaderNames).toEqual(['X-Zed']);
      // 표준 사전에 있는 이름은 남기지 않는다 — 목록에 같은 이름이 두 번 서는 것을 막는다.
      const std = applyCommand(once, {
        type: 'add-modification',
        profileId: 'p1',
        modification: modification('m11', 'accept'),
      });
      expect(std.customHeaderNames).toEqual(['X-Zed']);
      // 빈 이름
      const blank = applyCommand(state(), {
        type: 'add-modification',
        profileId: 'p1',
        modification: modification('m12', '   '),
      });
      expect(blank.customHeaderNames).toEqual([]);
    });

    it('이름이 없는 종류는 어느 이력도 건드리지 않는다', () => {
      const block: Modification = { kind: 'block', id: 'b1', enabled: true, comment: '' };
      const next = applyCommand(state(), {
        type: 'add-modification',
        profileId: 'p1',
        modification: block,
      });
      expect(next.customHeaderNames).toEqual([]);
      expect(next.customCookieNames).toEqual([]);
      expect(next.customUserAgents).toEqual([]);
    });

    /*
     * **저장이 실제로 일어났을 때만 남긴다.** 없는 프로필에 더하거나 없는 규칙을 고치는 명령은
     * 상태를 바꾸지 않는데, 그때도 남기면 저장된 적 없는 값이 제안에 뜬다. 화면 둘이 열린 채
     * 한쪽이 지운 규칙을 다른 쪽이 저장하면 실제로 도달하는 경로다.
     */
    it('없는 프로필에 더하면 이력도 남지 않는다', () => {
      const next = applyCommand(state(), {
        type: 'add-modification',
        profileId: 'no-such-profile',
        modification: cookie('ghost'),
      });
      expect(next.profiles.flatMap((p) => p.modifications).some((m) => m.id === 'c1')).toBe(false);
      expect(next.customCookieNames).toEqual([]);
    });

    it('없는 규칙을 고치면 이력도 남지 않는다', () => {
      const next = applyCommand(state(), {
        type: 'update-modification',
        profileId: 'p1',
        modification: cookie('never_saved'),
      });
      expect(next.profiles[0]?.modifications.some((m) => m.id === 'c1')).toBe(false);
      expect(next.customCookieNames).toEqual([]);
    });

    /** 응답 쿠키의 이름도 쿠키 이름이다 — 두 종류가 같은 목록에 남는다. */
    it('응답 쿠키 규칙의 이름도 이력에 남는다', () => {
      const setCookie: Modification = {
        kind: 'set-cookie',
        id: 's1',
        name: 'sc_smoke',
        value: 'v',
        enabled: true,
        mode: 'override',
        emptyMeans: 'remove',
        comment: '',
      };
      const next = applyCommand(state(), {
        type: 'add-modification',
        profileId: 'p1',
        modification: setCookie,
      });
      expect(next.customCookieNames).toEqual(['sc_smoke']);
    });

    /*
     * **상한을 두지 않는다.** 자동으로 쌓이는 목록에 상한을 뒀다가 걷었다 — 티켓이 요구한 것은
     * "직접 친 값은 다음에도 제안된다"이고, 상한은 그것을 어느 지점부터 조용히 어긴다.
     */
    it('많이 쌓여도 버리지 않는다 — 직접 친 값은 다음에도 제안된다', () => {
      let current = state();
      for (let i = 0; i < 30; i += 1) {
        current = applyCommand(current, {
          type: 'add-modification',
          profileId: 'p1',
          modification: cookie(`name_${i}`),
        });
      }
      expect(current.customCookieNames).toHaveLength(30);
      expect(current.customCookieNames[0]).toBe('name_0');
    });
  });
});
