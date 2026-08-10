import { convergeResourceTypes } from '@/core/resource-groups';
import {
  createModification,
  normalizeConditions,
  type Modification,
  type ModificationKind,
  type UrlMatchType,
} from '@/core/schema';

/**
 * 규칙 초안의 규칙들 — 폼 컴포넌트에서 꺼낸 **순수 함수** (ADR 0017, 티켓 06).
 *
 * 컴포넌트 안에 있던 동안에는 숨은 필드 세 종류 × 규칙 종류 여덟 개의 조합을 덮을 방법이
 * 스모크뿐이었고, 그 조합은 스모크로 덮으면 반드시 구멍이 남는다 — 종류 하나가 한 필드를
 * 잃어도 화면에서는 아무것도 달라 보이지 않고 다음 요청에서야 헤더가 달라진 것으로 드러난다.
 *
 * **종류별 빈 초안은 여기서 다시 만들지 않는다** — `core`의 `createModification`이 이미 그
 * 단일 출처다. 감싸기만 하는 함수를 두면 기본값이 두 곳에서 자라난다.
 */

/** 폼이 보여 주는 매치 방식 — 스키마의 넷 중 **둘만** 화면에 선다 (story 21). */
export type VisibleMatchType = Extract<UrlMatchType, 'contains' | 'regex'>;

/**
 * 초안의 매치 방식을 폼이 보여 줄 둘 중 하나로 접는다.
 *
 * `domain`·`prefix`는 와일드카드 쪽으로 접힌다 — 셋 다 DNR의 **비정규식** urlFilter로
 * 내려가는 한 부류이고, 시안이 고를 것을 둘로 줄였기 때문이다. 저장된 값 자체는 그대로
 * 남아 손대지 않은 규칙이 계속 그대로 동작한다.
 *
 * 초안에 방식이 없을 때 무엇으로 볼지는 **호출부가 준다**(`fallback`). 살아 있는 초안만
 * 보고 정할 수 없기 때문이다: 새 규칙에서 패턴을 치기 시작하면 방식은 아직 없는데, 그것을
 * "저장된 값에 방식이 없다"와 같게 읽으면 사용자가 평문을 치는 동안 셀렉트가 정규식으로
 * 튄다. 그 구별은 **로드된 규칙**이 쥐고 있고 `initialMatchType`이 한 번 정한다.
 */
export function visibleMatchType(
  draft: Modification,
  fallback: VisibleMatchType = 'contains',
): VisibleMatchType {
  // Redirect는 자기 pattern이 스코프이고 그 문법이 정규식이다 (ADR 0007).
  if (draft.kind === 'redirect') return 'regex';
  const stored = 'urlMatchType' in draft ? draft.urlMatchType : undefined;
  if (stored !== undefined) return stored === 'regex' ? 'regex' : 'contains';
  return fallback;
}

/**
 * 폼을 열 때 한 번 정하는 기본 — 로드된 규칙이 무엇이었나로 갈린다.
 *
 * **패턴이 저장돼 있는데 방식이 없으면 정규식이다** (ADR 0008의 하위 호환). 와일드카드로
 * 보여 주면 폼이 거짓을 말하고, 저장 시 수렴이 그 거짓을 저장소에 굳혀 규칙이 다르게
 * 매칭된다. 새 규칙(로드된 것이 없음)은 와일드카드로 시작한다 — 처음 치는 평문 패턴이
 * 정규식으로 저장되지 않게.
 */
export function initialMatchType(initial: Modification | undefined): VisibleMatchType {
  if (!initial) return 'contains';
  const hasScope = 'urlFilter' in initial && Boolean(initial.urlFilter?.trim());
  return visibleMatchType(initial, hasScope ? 'regex' : 'contains');
}

/**
 * URL 스코프를 갖는 종류인가 — **Redirect만 아니다.**
 *
 * Redirect의 스코프는 자기 `pattern`이고 그 문법이 정규식이다(ADR 0007) — 그래서 폼도 그
 * 종류에서만 URL 필터 줄을 세우지 않는다. 나머지 일곱은 전부 `urlFilter`를 든다.
 *
 * 판정을 함수로 세워 두는 이유는 이 사실을 읽는 곳이 셋이기 때문이다: 폼의 렌더 분기,
 * `tidyDraft`의 벗기기, 그리고 아래 종류 전환. 각자 `kind !== 'redirect'`를 적으면 종류가
 * 하나 늘 때 세 곳이 따로 틀린다.
 */
export function carriesUrlScope(kind: ModificationKind): boolean {
  return kind !== 'redirect';
}

/**
 * 종류를 바꿀 때 무엇이 따라가는가 — **규칙을 가리키지 않는 것들만** 따라간다.
 *
 * id·켜짐·메모·조건은 어느 종류에서든 같은 뜻이라 이어진다. 종류 고유 필드는 이어지지
 * 않는다: 헤더의 값이 리다이렉트의 치환으로 옮겨 가면 사용자가 넣은 적 없는 목적지가 생기고,
 * 그 규칙은 저장되는 순간 엉뚱한 곳으로 보낸다.
 *
 * **URL 스코프는 따라간다 — 양쪽 종류가 그것을 가질 때만.** 스코프는 "무엇을 고치는가"가
 * 아니라 "어디에 거는가"라, 종류를 바꿔도 사용자가 방금 적은 대상은 그대로다. 예전에는
 * 이것도 함께 지워져서, 종류를 잘못 골랐다가 되돌리면 URL을 다시 쳐야 했다. 반대로 스코프
 * 줄이 없는 Redirect로 가면 버린다 — 화면에 없는 값이 저장에 실리면 폼이 보여 주지 않은
 * 것이 규칙을 좁히게 된다.
 */
export function switchDraftKind(draft: Modification, kind: ModificationKind): Modification {
  // 같은 종류면 초안을 그대로 돌려준다 — 입력 중이던 값을 잃지 않는다.
  if (kind === draft.kind) return draft;
  const next = createModification(kind, draft.id);
  return {
    ...next,
    enabled: draft.enabled,
    comment: draft.comment,
    ...(draft.conditions ? { conditions: draft.conditions } : {}),
    ...urlScopeToCarry(draft, kind),
  } as Modification;
}

/** 빈 스코프는 옮기지 않는다 — 새 초안에 `urlFilter: ''`를 심으면 tidy가 할 일이 늘 뿐이다. */
function urlScopeToCarry(
  draft: Modification,
  kind: ModificationKind,
): { urlFilter?: string; urlMatchType?: UrlMatchType } {
  if (!carriesUrlScope(draft.kind) || !carriesUrlScope(kind)) return {};
  if (!('urlFilter' in draft) || !draft.urlFilter?.trim()) return {};
  const matchType = 'urlMatchType' in draft ? draft.urlMatchType : undefined;
  return {
    urlFilter: draft.urlFilter,
    ...(matchType !== undefined ? { urlMatchType: matchType } : {}),
  };
}

/**
 * 저장 직전 정리 — 빈 값을 필드째 벗긴다.
 *
 * 스코프가 비면 매치 방식도 함께 벗기는 것이 요점이다. 남겨 두면 스코프 없는 규칙이 매치
 * 방식만 든 채 저장되고, 다음에 열 때 `visibleMatchType`이 그 잔재를 읽어 폼이 사용자가
 * 고른 적 없는 방식을 보여 준다.
 */
export function tidyDraft(draft: Modification): Modification {
  let next = draft;
  if (draft.kind !== 'redirect' && 'urlFilter' in draft && !draft.urlFilter?.trim()) {
    const { urlFilter: _filter, urlMatchType: _match, ...rest } = draft;
    next = rest as Modification;
  }
  const conditions = normalizeConditions(next.conditions ?? {});
  if (conditions) return { ...next, conditions } as Modification;
  if (next.conditions === undefined) return next;
  const { conditions: _empty, ...rest } = next;
  return rest as Modification;
}

/**
 * 수렴 저장 (ADR 0017) — 폼이 **보여 준 값**으로 다시 쓴다.
 *
 * 무엇이 수렴 대상인지는 "폼이 그 값을 보여 줬는가"가 가른다.
 *
 * - **매치 방식**과 **리소스 묶음**은 폼이 접어서 보여 준다. 화면과 저장이 어긋나 있으므로
 *   저장이 그 어긋남을 화면 쪽으로 맞춘다 — `domain`으로 저장된 규칙이 와일드카드로 보였다면
 *   저장은 와일드카드로 굳고, 프레임 안 문서만 저장돼 있던 규칙이 `문서` 칩으로 보였다면
 *   저장은 최상위 문서까지 붙인다. 둘 다 넓어지는 방향이고, 사용자가 **스스로 저장한**
 *   규칙에만 붙는다.
 * - **적용 방식**과 **빈 값의 뜻**은 폼이 아무것도 보여 주지 않으므로 맞출 대상이 없다.
 *   기본값으로 덮으면 append로 쌓이던 헤더가 저장 한 번에 override로 바뀌어 나가는 요청이
 *   달라진다 — 사용자가 본 적 없는 변경이다. 값은 그대로 실려 나간다.
 *
 * **원시로 보존된 응답 쿠키는 여기서 건드리지 않는다.** 한때 저장을 구조화의 계기로 삼았는데,
 * 손대지 않은 원시 항목에는 채울 재료가 없어 `{name:'', value:''}`가 되고 — 응답 쿠키에는
 * 필수 필드가 없어(`rule-validation`) 그대로 저장을 통과한다 — 컴파일이 빈 줄로 판정해
 * 규칙이 "이 쿠키를 내보낸다"에서 **"Set-Cookie를 제거한다"로 조용히 뒤집혔다.** 그건 업그레이드
 * 뒤에도 같은 쿠키가 나가야 한다는 이 기능의 약속을 정면으로 깬다.
 *
 * 구조화로 가는 문은 `patchDraft`(재료를 실제로 만졌을 때) 하나면 충분하다 — 사용자가
 * 스스로 옮기기 전에는 원시인 채로 이전과 똑같이 동작한다.
 */
export function convergeDraft(draft: Modification, visible: VisibleMatchType): Modification {
  let next = draft;

  if (next.kind !== 'redirect' && 'urlFilter' in next && next.urlFilter?.trim()) {
    next = { ...next, urlMatchType: visible } as Modification;
  }

  const resourceTypes = next.conditions?.resourceTypes;
  if (resourceTypes?.length) {
    next = {
      ...next,
      conditions: { ...next.conditions, resourceTypes: convergeResourceTypes(resourceTypes) },
    } as Modification;
  }

  return next;
}
