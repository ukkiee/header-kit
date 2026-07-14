/**
 * Placeholder — Modification 값 템플릿 안에서 Compile 시점이 아니라
 * "활성화 경계"에서 한 번 실체화되는 토큰 (PRD 결정).
 * 값 필드는 항상 템플릿만 보유하고, 실체화 값은 별도 구역에 영속한다.
 */

// 소스 문자열만 상수로 둔다 — g 플래그 정규식의 lastIndex 상태 공유를 피하려고
// 사용처마다 새 RegExp를 만든다.
const PLACEHOLDER_SOURCE = /\{\{(uuid|timestamp)\}\}/.source;

export interface MaterializeDeps {
  uuid: () => string;
  now: () => number;
}

export const defaultMaterializeDeps: MaterializeDeps = {
  uuid: () => crypto.randomUUID(),
  now: () => Date.now(),
};

export function hasPlaceholders(template: string): boolean {
  return new RegExp(PLACEHOLDER_SOURCE).test(template);
}

/** 템플릿의 모든 Placeholder를 실제 값으로 치환한다. {{uuid}}는 등장마다 새 값. */
export function materializeValue(
  template: string,
  deps: MaterializeDeps = defaultMaterializeDeps,
): string {
  return template.replace(new RegExp(PLACEHOLDER_SOURCE, 'g'), (_match, token) => {
    switch (token) {
      case 'uuid':
        return deps.uuid();
      case 'timestamp':
        return String(deps.now());
      default:
        return _match;
    }
  });
}
