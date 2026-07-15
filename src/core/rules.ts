/**
 * Browser-independent mirror of the declarativeNetRequest rule shape.
 * The core stays free of browser API imports; the adapter casts these
 * into the platform type when registering session rules.
 */

export const ALL_RESOURCE_TYPES = [
  'main_frame',
  'sub_frame',
  'stylesheet',
  'script',
  'image',
  'font',
  'object',
  'xmlhttprequest',
  'ping',
  'csp_report',
  'media',
  'websocket',
  'webtransport',
  'webbundle',
  'other',
] as const;

export type ResourceType = (typeof ALL_RESOURCE_TYPES)[number];

export const REQUEST_METHODS = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
  'connect',
  'other',
] as const;

export type RequestMethod = (typeof REQUEST_METHODS)[number];

/**
 * MV3에서 요청 헤더 append가 허용되는 헤더 목록 (소문자, case-insensitive).
 * 이 목록 밖의 요청 헤더는 append 불가 — UI에서 append 옵션을 숨긴다.
 * 응답 헤더는 이 제약이 없다.
 */
export const REQUEST_APPEND_ALLOWLIST = new Set([
  'accept',
  'accept-encoding',
  'accept-language',
  'access-control-request-headers',
  'cache-control',
  'connection',
  'content-language',
  'cookie',
  'forwarded',
  'if-match',
  'if-none-match',
  'keep-alive',
  'range',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'user-agent',
  'via',
  'want-digest',
  'x-forwarded-for',
]);

export function isRequestAppendAllowed(headerName: string): boolean {
  return REQUEST_APPEND_ALLOWLIST.has(headerName.trim().toLowerCase());
}

export type HeaderOperation = 'set' | 'remove' | 'append';

export interface HeaderInfo {
  header: string;
  operation: HeaderOperation;
  value?: string;
}

export interface NetRule {
  id: number;
  priority: number;
  action: {
    type: 'modifyHeaders' | 'allow' | 'redirect';
    requestHeaders?: HeaderInfo[];
    responseHeaders?: HeaderInfo[];
    redirect?: { regexSubstitution: string };
  };
  condition: {
    urlFilter?: string;
    regexFilter?: string;
    resourceTypes: ResourceType[];
    requestMethods?: RequestMethod[];
    initiatorDomains?: string[];
    /** session rule 전용 조건 — 탭 계열 Filter의 전개 결과. */
    tabIds?: number[];
  };
}

export type CompileWarning =
  | {
      code: 'empty-header-name';
      profileId: string;
      modificationId: string;
      message: string;
    }
  | {
      /** 서로 다른 활성 Profile이 같은 헤더 이름을 수정하는 정적 겹침 (정보성). */
      code: 'header-overlap';
      header: string;
      profileIds: string[];
      message: string;
    }
  | {
      /** 단일 regex 패턴이 분할 불가능한 길이 한도를 초과해 건너뜀. */
      code: 'regex-too-long';
      profileId: string;
      filterId: string;
      message: string;
    }
  | {
      /** 규칙 수 한도(총량 또는 regex 규칙 수) 초과로 일부 규칙이 제외됨. */
      code: 'quota-exceeded';
      quota: 'total-rules' | 'regex-rules';
      profileId: string;
      modificationId?: string;
      message: string;
    }
  | {
      /**
       * 불변식 위반: 활성 Profile의 Placeholder Modification에 실체화 값이
       * 없음 — 그 Profile 전체를 규칙에서 제외했다 (PRD 방어선).
       */
      code: 'missing-materialization';
      profileId: string;
      modificationId: string;
      message: string;
    }
  | {
      /** 허용 목록 밖 요청 헤더에 append를 요청 — set으로 폴백했다. */
      code: 'append-not-allowed';
      profileId: string;
      modificationId: string;
      message: string;
    };
