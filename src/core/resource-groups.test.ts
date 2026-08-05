import { describe, expect, it } from 'vitest';
import { ALL_RESOURCE_TYPES, type ResourceType } from './rules';
import {
  convergeResourceTypes,
  expandResourceGroups,
  foldResourceTypes,
  RESOURCE_GROUPS,
  type ResourceGroup,
} from './resource-groups';

/**
 * 리소스 묶음 (ADR 0017, 티켓 05) — 여덟 개 사용자 묶음과 브라우저의 열다섯 가지 값.
 *
 * 이 모듈이 지켜야 하는 것은 하나다: **여덟 개로 열다섯 가지에 빠짐없이 도달한다.** 하나라도
 * 덮이지 않으면 사용자가 그 요청 종류를 영영 고를 수 없고, 둘 이상의 묶음이 같은 값을 들면
 * 어느 칩을 꺼야 그 값이 빠지는지 화면에서 알 수 없다. 그래서 덮음과 겹침을 함께 잰다.
 */
describe('여덟 묶음과 열다섯 값', () => {
  it('여덟 묶음이 열다섯 값을 빠짐없이 덮는다', () => {
    const covered = expandResourceGroups([...RESOURCE_GROUPS]);
    expect(new Set(covered)).toEqual(new Set(ALL_RESOURCE_TYPES));
    expect(covered).toHaveLength(ALL_RESOURCE_TYPES.length);
  });

  it('어떤 값도 두 묶음에 속하지 않는다 — 묶음은 분할이다', () => {
    const owners = new Map<ResourceType, ResourceGroup[]>();
    for (const group of RESOURCE_GROUPS) {
      for (const type of expandResourceGroups([group])) {
        owners.set(type, [...(owners.get(type) ?? []), group]);
      }
    }
    const shared = [...owners].filter(([, groups]) => groups.length > 1);
    expect(shared).toEqual([]);
  });

  it('문서는 최상위 문서와 프레임 안 문서를 함께 뜻한다', () => {
    expect(expandResourceGroups(['document'])).toEqual(['main_frame', 'sub_frame']);
  });

  it('기타는 나머지 일곱 가지다', () => {
    expect(expandResourceGroups(['other'])).toEqual([
      'object',
      'ping',
      'csp_report',
      'websocket',
      'webtransport',
      'webbundle',
      'other',
    ]);
  });
});

describe('펴기 — 묶음 목록 → 값 목록', () => {
  it('브라우저 값의 표준 순서로 낸다 — 고른 순서가 저장 모양을 흔들지 않는다', () => {
    expect(expandResourceGroups(['script', 'xhr'])).toEqual(['script', 'xmlhttprequest']);
    expect(expandResourceGroups(['xhr', 'script'])).toEqual(['script', 'xmlhttprequest']);
  });

  it('빈 목록은 빈 목록이다 — "아무 종류도 아님"이 아니라 조건 없음이다', () => {
    expect(expandResourceGroups([])).toEqual([]);
  });
});

describe('접기 — 값 목록 → 묶음 목록', () => {
  it('묶음의 값이 하나라도 있으면 그 묶음이 선다', () => {
    expect(foldResourceTypes(['sub_frame'])).toEqual(['document']);
    expect(foldResourceTypes(['main_frame', 'sub_frame'])).toEqual(['document']);
  });

  it('묶음의 표시 순서로 낸다', () => {
    expect(foldResourceTypes(['font', 'xmlhttprequest', 'image'])).toEqual([
      'xhr',
      'image',
      'font',
    ]);
  });

  it('기타에 드는 값 어느 것이든 기타 하나로 접힌다', () => {
    expect(foldResourceTypes(['websocket'])).toEqual(['other']);
    expect(foldResourceTypes(['ping', 'webbundle', 'other'])).toEqual(['other']);
  });

  it('빈 목록은 빈 목록이다', () => {
    expect(foldResourceTypes([])).toEqual([]);
  });
});

/**
 * 수렴 — 접었다 펴면 값이 **늘어날 수 있다** (스펙의 수렴 저장).
 *
 * 프레임 안 문서만 저장돼 있던 규칙은 화면에 `문서` 칩 하나로 보인다. 그 화면을 보고 저장하면
 * 최상위 문서까지 붙는다 — 보이는 것과 저장된 것이 어긋나 있던 것을 보이는 쪽으로 맞추는
 * 것이라, 넓어지는 방향이 의도다. 저절로 일어나지 않고 **사용자가 저장할 때만** 일어난다.
 */
describe('수렴 — 접었다 펴기', () => {
  it('묶음의 일부만 저장돼 있으면 그 묶음 전체로 넓어진다', () => {
    expect(convergeResourceTypes(['sub_frame'])).toEqual(['main_frame', 'sub_frame']);
    expect(convergeResourceTypes(['ping'])).toEqual([
      'object',
      'ping',
      'csp_report',
      'websocket',
      'webtransport',
      'webbundle',
      'other',
    ]);
  });

  it('이미 묶음 전체인 값은 그대로다', () => {
    expect(convergeResourceTypes(['script'])).toEqual(['script']);
    expect(convergeResourceTypes(['main_frame', 'sub_frame'])).toEqual(['main_frame', 'sub_frame']);
  });

  it('한 번 수렴한 값은 다시 수렴해도 같다 — 저장할 때마다 넓어지지 않는다', () => {
    const once = convergeResourceTypes(['sub_frame', 'ping']);
    expect(convergeResourceTypes(once)).toEqual(once);
  });

  it('접기가 잃은 것이 없다 — 원래 값은 수렴 결과에 전부 남는다', () => {
    for (const type of ALL_RESOURCE_TYPES) {
      expect(convergeResourceTypes([type])).toContain(type);
    }
  });
});
