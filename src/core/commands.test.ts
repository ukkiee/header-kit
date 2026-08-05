import { describe, expect, it } from 'vitest';
import {
  addModification,
  addProfile,
  applyCommand,
  moveProfile,
  removeModification,
  setPaused,
  toggleProfile,
  updateModification,
} from './commands';
import type { Modification, RequestHeaderModification, StoredState } from './schema';
import { readStoredState, SCHEMA_VERSION } from './schema';

function modification(id: string, name = 'X-A'): RequestHeaderModification {
  return { kind: 'request-header', id, name, value: '1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' };
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
   * **복제·삭제·메타 변경 테스트가 여기 없다** (ADR 0017, 티켓 04). 명령 셋이 함께 퇴역해서다 —
   * 프로필로 할 수 있는 일은 만들기·켜고 끄기·옮기기 넷이고, 그 넷은 이 파일의 나머지가 잰다.
   * 지운 것을 대신 지킬 것도 없다: 되돌리는 유일한 길은 전체 초기화이고 그것은 자기 테스트를 갖는다.
   */
  it('moveProfile은 순서를 바꾼다 (순서 = 충돌 우선순위)', () => {
    const next = moveProfile(state(), 'p2', 0);

    expect(next.profiles.map((p) => p.id)).toEqual(['p2', 'p1']);
  });

  it('add/removeCustomHeaderName은 중복 없이 사용자 항목을 관리한다', () => {
    const added = applyCommand(state(), { type: 'add-custom-header-name', name: 'X-My' });
    expect(added.customHeaderNames).toEqual(['X-My']);

    // 대소문자 무시 중복은 무시
    const dup = applyCommand(added, { type: 'add-custom-header-name', name: 'x-my' });
    expect(dup.customHeaderNames).toEqual(['X-My']);

    // 표준 사전 항목도 중복으로 거른다 — 환경설정의 쌍둥이 pill 방지 (ui-refine 03)
    const std = applyCommand(added, { type: 'add-custom-header-name', name: 'accept' });
    expect(std.customHeaderNames).toEqual(['X-My']);

    const removed = applyCommand(added, { type: 'remove-custom-header-name', name: 'X-My' });
    expect(removed.customHeaderNames).toEqual([]);
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
      ({ kind: 'cookie', id: 'c1', name, value: 'v', enabled: true,
         mode: 'append', emptyMeans: 'remove', comment: '' }) as Modification;
    const ua = (value: string): Modification =>
      ({ kind: 'user-agent', id: 'u1', value, enabled: true, comment: '' }) as Modification;

    it('쿠키 규칙을 저장하면 그 이름이 다음 제안에 남는다', () => {
      const next = applyCommand(state(), {
        type: 'add-modification', profileId: 'p1', modification: cookie('my_sid'),
      });
      expect(next.customCookieNames).toEqual(['my_sid']);
    });

    it('User-Agent 규칙을 저장하면 그 값이 남는다', () => {
      const next = applyCommand(state(), {
        type: 'add-modification', profileId: 'p1', modification: ua('MyBot/1.0'),
      });
      expect(next.customUserAgents).toEqual(['MyBot/1.0']);
    });

    it('편집 저장도 남긴다 — 이름을 고쳐 저장한 값이 다음에 제안된다', () => {
      const added = applyCommand(state(), {
        type: 'add-modification', profileId: 'p1', modification: cookie('first'),
      });
      const edited = applyCommand(added, {
        type: 'update-modification', profileId: 'p1', modification: cookie('second'),
      });
      expect(edited.customCookieNames).toEqual(['first', 'second']);
    });

    // 프리셋에 없는 이름으로 잰다 — 프리셋에 있는 것은 아래 규칙에 먼저 걸려 중복을 못 본다.
    it('같은 값은 두 번 남지 않는다 (대소문자 무시)', () => {
      const once = applyCommand(state(), {
        type: 'add-modification', profileId: 'p1', modification: cookie('My_Sid'),
      });
      const twice = applyCommand(once, {
        type: 'add-modification', profileId: 'p1', modification: cookie('my_sid'),
      });
      expect(twice.customCookieNames).toEqual(['My_Sid']);
    });

    /*
     * 프리셋에 이미 있는 값은 남기지 않는다 — 남기면 목록에 같은 이름이 두 번 서고, 그 중복은
     * 사용자가 지울 화면이 없어 영구히 남는다.
     */
    it('프리셋에 있는 이름은 이력에 남기지 않는다', () => {
      const next = applyCommand(state(), {
        type: 'add-modification', profileId: 'p1', modification: cookie('session_id'),
      });
      expect(next.customCookieNames).toEqual([]);
    });

    it('빈 값은 남기지 않는다', () => {
      const next = applyCommand(state(), {
        type: 'add-modification', profileId: 'p1', modification: cookie('   '),
      });
      expect(next.customCookieNames).toEqual([]);
    });

    it('다른 종류는 이력을 건드리지 않는다', () => {
      const next = applyCommand(state(), {
        type: 'add-modification', profileId: 'p1', modification: modification('m9', 'X-Zed'),
      });
      expect(next.customCookieNames).toEqual([]);
      expect(next.customUserAgents).toEqual([]);
      // 헤더 이름 이력은 환경설정이 관리한다 — 저장이 자동으로 남기지 않는다.
      expect(next.customHeaderNames).toEqual([]);
    });

    /*
     * **저장이 실제로 일어났을 때만 남긴다.** 없는 프로필에 더하거나 없는 규칙을 고치는 명령은
     * 상태를 바꾸지 않는데, 그때도 남기면 저장된 적 없는 값이 제안에 뜬다. 화면 둘이 열린 채
     * 한쪽이 지운 규칙을 다른 쪽이 저장하면 실제로 도달하는 경로다.
     */
    it('없는 프로필에 더하면 이력도 남지 않는다', () => {
      const next = applyCommand(state(), {
        type: 'add-modification', profileId: 'no-such-profile', modification: cookie('ghost'),
      });
      expect(next.profiles.flatMap((p) => p.modifications).some((m) => m.id === 'c1')).toBe(false);
      expect(next.customCookieNames).toEqual([]);
    });

    it('없는 규칙을 고치면 이력도 남지 않는다', () => {
      const next = applyCommand(state(), {
        type: 'update-modification', profileId: 'p1', modification: cookie('never_saved'),
      });
      expect(next.profiles[0]?.modifications.some((m) => m.id === 'c1')).toBe(false);
      expect(next.customCookieNames).toEqual([]);
    });

    /** 응답 쿠키의 이름도 쿠키 이름이다 — 두 종류가 같은 목록에 남는다. */
    it('응답 쿠키 규칙의 이름도 이력에 남는다', () => {
      const setCookie: Modification = {
        kind: 'set-cookie', id: 's1', name: 'sc_smoke', value: 'v',
        enabled: true, mode: 'override', emptyMeans: 'remove', comment: '',
      };
      const next = applyCommand(state(), {
        type: 'add-modification', profileId: 'p1', modification: setCookie,
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
          type: 'add-modification', profileId: 'p1', modification: cookie(`name_${i}`),
        });
      }
      expect(current.customCookieNames).toHaveLength(30);
      expect(current.customCookieNames[0]).toBe('name_0');
    });
  });
});
