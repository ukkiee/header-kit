/**
 * Compile 경고 어휘 — compile이 방출하고 summary가 소비하는 출력 계약.
 * 라벨·상세 문자열은 담지 않는다: 로케일을 아는 UI가 code + 보간 인자로 카탈로그에서
 * 만든다(background는 로케일 미인지). 플랫폼 NetRule 미러(rules.ts)와도 분리.
 */
export type CompileWarning =
  | {
      code: 'empty-header-name';
      profileId: string;
      modificationId: string;
    }
  | {
      /** 서로 다른 활성 Profile이 같은 헤더 이름을 수정하는 정적 겹침 (정보성). */
      code: 'header-overlap';
      header: string;
      profileIds: string[];
    }
  | {
      /** 단일 regex 패턴이 분할 불가능한 길이 한도를 초과해 건너뜀. */
      code: 'regex-too-long';
      profileId: string;
      /** 프로필 URL 필터가 원인일 때. */
      filterId?: string;
      /** 규칙 자체 urlFilter가 원인일 때 (ADR 0007). */
      modificationId?: string;
      limit: number;
    }
  | {
      /** 규칙 수 한도(총량 또는 regex 규칙 수) 초과로 일부 규칙이 제외됨. */
      code: 'quota-exceeded';
      quota: 'total-rules' | 'regex-rules';
      profileId: string;
      modificationId?: string;
      limit: number;
    }
  | {
      /**
       * 불변식 위반: 활성 Profile의 Placeholder Modification에 실체화 값이
       * 없음 — 그 Profile 전체를 규칙에서 제외했다 (PRD 방어선).
       */
      code: 'missing-materialization';
      profileId: string;
      modificationId: string;
    }
  | {
      /**
       * URL 스코프 없는 Block — 방출하지 않았다. 스코프 없는 Block은 "모든 요청 차단"이라
       * 사용자가 의도할 수 있는 값이 아니다. 폼 검증이 이미 막지만 import·레거시 데이터는
       * 그 문을 거치지 않으므로 compile에도 방어선을 둔다.
       */
      code: 'block-without-scope';
      profileId: string;
      modificationId: string;
    }
  | {
      /** 허용 목록 밖 요청 헤더에 append를 요청 — set으로 폴백했다. */
      code: 'append-not-allowed';
      profileId: string;
      modificationId: string;
      header: string;
    };
