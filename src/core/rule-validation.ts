import type { Modification } from './schema';
import { urlScopeBreadth } from './url-scope';

/**
 * 저장 차단 검증 (ui-refine 04) — 종류별로 비어 있으면 규칙이 무의미해지는
 * 필수 필드를 반환한다. 폼이 이 결과가 빌 때만 저장을 통과시킨다.
 * 응답 쿠키(set-cookie)는 빈 값이 유효한 사용례(서버 Set-Cookie 차단)라 필수가 없다.
 * Compile의 빈 이름 경고는 import·레거시 데이터 방어선으로 별도 유지된다.
 */
export type RequiredField = 'name' | 'pattern' | 'substitution' | 'value' | 'urlFilter';

/**
 * 저장을 막는 필드 문제 — **어느 입력이** 막혔는지와 **왜** 막혔는지를 함께 든다.
 *
 * 이유를 함께 드는 것은 Block 때문이다. Block의 URL 스코프는 두 가지로 막힐 수 있고
 * (비었다 / 이 패턴으로는 규칙이 만들어지지 않는다) 사용자가 해야 할 일이 서로 다르다 —
 * 같은 "필수입니다"를 보여 주면 패턴을 고쳐야 하는 사람이 채워 넣기만 반복한다.
 */
export interface FieldIssue {
  field: RequiredField;
  /** required = 비었다. unsupported-pattern = 브라우저가 이 패턴으로 규칙을 만들지 못한다. */
  reason: 'required' | 'unsupported-pattern';
}

const required = (field: RequiredField): FieldIssue => ({ field, reason: 'required' });

export function fieldIssues(modification: Modification): FieldIssue[] {
  switch (modification.kind) {
    case 'request-header':
    case 'response-header':
    case 'cookie':
      return modification.name.trim() === '' ? [required('name')] : [];
    case 'set-cookie':
      return [];
    case 'user-agent':
      // 값이 이 규칙의 전부다 — 비면 UA를 빈 문자열로 보내는 사고가 된다.
      return modification.value.trim() === '' ? [required('value')] : [];
    case 'header-removal':
      // 이름이 없으면 무엇을 지울지 모른다.
      return modification.name.trim() === '' ? [required('name')] : [];
    case 'block':
      return blockScopeIssues(modification);
    case 'redirect': {
      const missing: FieldIssue[] = [];
      if (modification.pattern.trim() === '') missing.push(required('pattern'));
      if (modification.substitution.trim() === '') missing.push(required('substitution'));
      return missing;
    }
    default:
      return modification satisfies never;
  }
}

/**
 * Block의 스코프 검증 — 이 종류에만 스코프 검증이 붙는 이유가 있다.
 *
 * 다른 종류는 스코프가 비면 "모든 요청의 헤더를 고친다"로 넓어질 뿐 되돌릴 수 있지만,
 * Block은 요청이 사라진다. 그리고 못 쓰는 패턴은 다른 종류에서는 규칙 하나가 조용히
 * 빠지는 것으로 끝나지만, Block에서는 **차단이 걸렸다고 믿는 채로 아무것도 막히지 않는다**.
 * 그래서 넓히는 방향의 위험과 헛도는 방향의 위험을 여기서만 둘 다 막는다.
 */
function blockScopeIssues(modification: Extract<Modification, { kind: 'block' }>): FieldIssue[] {
  if ((modification.urlFilter?.trim() ?? '') === '') return [required('urlFilter')];
  const breadth = urlScopeBreadth(modification.urlFilter, modification.urlMatchType);
  /*
   * **`invalid`만 막는다** (ADR 0017, 티켓 07). `wide`는 여기서도 폼에서도 아무것도 막지
   * 않는다 — 넓은 것은 틀린 것이 아니라 사용자가 정말 원했을 수 있는 상태다(모든 광고
   * 도메인을 한 번에 막는 식). 예전에는 폼이 여기에 확인을 한 번 더 받았고 그 단계는 사라졌다.
   */
  return breadth === 'invalid' ? [{ field: 'urlFilter', reason: 'unsupported-pattern' }] : [];
}
