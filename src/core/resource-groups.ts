import { ALL_RESOURCE_TYPES, type ResourceType } from './rules';
import type { MessageKey } from './i18n';

/**
 * 리소스 묶음 (ADR 0017) — 사용자가 고르는 **여덟 개**와 브라우저의 **열다섯 가지** 사이.
 *
 * 시안이 칩 여덟 개만 그리는데 브라우저 값은 열다섯이라, 그 사이를 옮기는 곳이 필요하다.
 * 이 모듈이 지키는 계약은 하나다 — **여덟 개로 열다섯 가지에 빠짐없이 도달한다.** 하나라도
 * 덮이지 않으면 사용자가 그 요청 종류를 영영 고를 수 없고, 두 묶음이 같은 값을 나눠 가지면
 * 어느 칩을 꺼야 그 값이 빠지는지 화면에서 알 수 없다. 그래서 아래 표는 **분할**이다.
 *
 * 폼과 행이 둘 다 쓰므로 core에 둔다 — features 두 곳이 각자 표를 들면 곧 갈라진다.
 */
export const RESOURCE_GROUPS = [
  'xhr',
  'document',
  'image',
  'script',
  'style',
  'media',
  'font',
  'other',
] as const;

export type ResourceGroup = (typeof RESOURCE_GROUPS)[number];

/**
 * 묶음 → 브라우저 값. `Record<ResourceGroup, ...>`로 못박아 묶음을 더하면 여기서 타입이
 * 먼저 깨지게 한다. `문서`가 최상위와 프레임 안을 함께 뜻하고 `기타`가 나머지 일곱을
 * 뜻하는 것이 이 표의 전부이며, 그 둘이 열다섯을 여덟으로 접는 일을 도맡는다.
 */
const GROUP_TYPES: Record<ResourceGroup, readonly ResourceType[]> = {
  xhr: ['xmlhttprequest'],
  document: ['main_frame', 'sub_frame'],
  image: ['image'],
  script: ['script'],
  style: ['stylesheet'],
  media: ['media'],
  font: ['font'],
  other: ['object', 'ping', 'csp_report', 'websocket', 'webtransport', 'webbundle', 'other'],
};

/** 묶음 → 카탈로그 키. 라벨이 화면마다 갈라지지 않도록 표와 같은 자리에 둔다. */
export const RESOURCE_GROUP_LABELS: Record<ResourceGroup, MessageKey> = {
  xhr: 'groupXhr',
  document: 'groupDocument',
  image: 'groupImage',
  script: 'groupScript',
  style: 'groupStyle',
  media: 'groupMedia',
  font: 'groupFont',
  other: 'groupOther',
};

/**
 * 묶음 목록을 브라우저 값 목록으로 편다 — 순서는 **브라우저 값의 표준 순서**다.
 *
 * 고른 순서를 그대로 두면 같은 선택이 클릭 순서에 따라 다른 배열로 저장되어, 저장 상태를
 * 비교하는 곳(수렴이 멱등인지, 무엇이 바뀌었는지)이 전부 순서에 흔들린다.
 */
export function expandResourceGroups(groups: readonly ResourceGroup[]): ResourceType[] {
  const wanted = new Set(groups.flatMap((group) => GROUP_TYPES[group]));
  return ALL_RESOURCE_TYPES.filter((type) => wanted.has(type));
}

/**
 * 브라우저 값 목록을 묶음 목록으로 접는다 — 묶음의 값이 **하나라도** 있으면 그 묶음이 선다.
 *
 * 전부 있어야 세우면 프레임 안 문서만 저장된 규칙이 화면에서 아무 칩도 못 얻어, 조건이 있는데
 * 없는 것처럼 보인다. 부분만 저장돼 있던 것을 화면에 드러내고, 그 차이는 수렴이 메운다.
 */
export function foldResourceTypes(types: readonly ResourceType[]): ResourceGroup[] {
  const present = new Set(types);
  return RESOURCE_GROUPS.filter((group) => GROUP_TYPES[group].some((type) => present.has(type)));
}

/**
 * 접었다 편 결과 — 화면이 보여 준 묶음이 실제로 뜻하는 값 전체다 (스펙의 **수렴**).
 *
 * 묶음의 일부만 저장돼 있던 규칙은 여기서 그 묶음 전체로 **넓어진다**. 넓어지는 방향인 것이
 * 의도다: 화면은 이미 `문서`라고 말하고 있었으므로, 저장된 값을 화면에 맞추는 쪽이 화면을
 * 저장된 값에 맞추느라 칩을 반쯤 칠하는 것보다 정직하다. 저절로 일어나지 않고 **사용자가
 * 폼에서 저장할 때만** 일어난다 — 손대지 않은 규칙은 그대로다.
 *
 * 한 번 수렴한 값을 다시 수렴해도 같다(멱등). 저장할 때마다 조금씩 넓어지면 그 자체가
 * 이 함수가 막으려는 실패다.
 */
export function convergeResourceTypes(types: readonly ResourceType[]): ResourceType[] {
  return expandResourceGroups(foldResourceTypes(types));
}
