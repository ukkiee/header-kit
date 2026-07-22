import type { Modification } from './schema';

/**
 * 저장 차단 검증 (ui-refine 04) — 종류별로 비어 있으면 규칙이 무의미해지는
 * 필수 필드를 반환한다. 폼이 이 결과가 빌 때만 저장을 통과시킨다.
 * 응답 쿠키(set-cookie)는 빈 값이 유효한 사용례(서버 Set-Cookie 차단)라 필수가 없다.
 * Compile의 빈 이름 경고는 import·레거시 데이터 방어선으로 별도 유지된다.
 */
export type RequiredField = 'name' | 'directives' | 'pattern' | 'substitution';

export function missingRequiredFields(modification: Modification): RequiredField[] {
  switch (modification.kind) {
    case 'request-header':
    case 'response-header':
    case 'cookie':
      return modification.name.trim() === '' ? ['name'] : [];
    case 'set-cookie':
      return [];
    case 'csp':
      return modification.directives.some((d) => d.name.trim() !== '') ? [] : ['directives'];
    case 'redirect': {
      const missing: RequiredField[] = [];
      if (modification.pattern.trim() === '') missing.push('pattern');
      if (modification.substitution.trim() === '') missing.push('substitution');
      return missing;
    }
    default:
      return modification satisfies never;
  }
}
