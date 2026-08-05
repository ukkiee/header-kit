import { describe, expect, it } from 'vitest';
import {
  addModification,
  addProfile,
  applyCommand,
  duplicateProfile,
  moveProfile,
  removeModification,
  removeProfile,
  setPaused,
  toggleProfile,
  updateModification,
  updateProfileMeta,
} from './commands';
import type { RequestHeaderModification, StoredState } from './schema';
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
      { id: 'p1', name: 'One', active: false, shortLabel: '1', color: '#2563eb', modifications: [modification('m1')] },
      { id: 'p2', name: 'Two', active: false, shortLabel: '2', color: '#16a34a', modifications: [] },
    ],
    materialized: {},
    customHeaderNames: [],
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

  it('duplicateProfile은 새 id의 비활성 사본을 원본 바로 뒤에 넣는다', () => {
    const next = duplicateProfile(state(), 'p1');

    expect(next.profiles).toHaveLength(3);
    const copy = next.profiles[1]!;
    expect(copy.name).toBe('One copy');
    expect(copy.active).toBe(false);
    expect(copy.id).not.toBe('p1');
    expect(copy.modifications[0]?.id).not.toBe('m1');
    const copiedMod = copy.modifications[0];
    expect(copiedMod?.kind === 'request-header' && copiedMod.name).toBe('X-A');
  });

  it('updateProfileMeta는 shortLabel을 2자로 강제한다 (권위 경로의 불변식)', () => {
    const next = updateProfileMeta(state(), 'p1', {
      name: 'One',
      shortLabel: 'LONG',
      color: '#dc2626',
    });

    expect(next.profiles[0]?.shortLabel).toBe('LO');
  });

  it('updateProfileMeta는 이름·색을 갱신하고 다른 프로필은 보존한다', () => {
    const next = updateProfileMeta(state(), 'p1', {
      name: 'Renamed',
      shortLabel: '1',
      color: '#dc2626',
    });

    expect(next.profiles[0]?.name).toBe('Renamed');
    expect(next.profiles[0]?.color).toBe('#dc2626');
    expect(next.profiles[0]?.shortLabel).toBe('1'); // 2자 이내는 그대로 통과
    expect(next.profiles[1]?.name).toBe('Two');
  });

  it('removeProfile은 해당 Profile만 제거한다', () => {
    const next = removeProfile(state(), 'p1');

    expect(next.profiles.map((p) => p.id)).toEqual(['p2']);
  });

  it('moveProfile은 순서를 바꾼다 (순서 = 충돌 우선순위)', () => {
    const next = moveProfile(state(), 'p2', 0);

    expect(next.profiles.map((p) => p.id)).toEqual(['p2', 'p1']);
  });

  it('updateProfileMeta는 이름·라벨·색만 바꾼다', () => {
    const next = updateProfileMeta(state(), 'p1', {
      name: 'Renamed',
      shortLabel: 'R',
      color: '#dc2626',
    });

    expect(next.profiles[0]).toMatchObject({
      name: 'Renamed',
      shortLabel: 'R',
      color: '#dc2626',
      active: false,
    });
    expect(next.profiles[0]?.modifications).toHaveLength(1);
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
});
