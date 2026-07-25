/**
 * 포맷 버전의 단일 출처 (ADR 0015).
 *
 * 이 파일은 **런타임 의존성 없이 상수만 둔다** — 스모크(`scripts/smoke.mjs`)가 그대로
 * import하기 때문이다(`motion-tokens.ts`와 같은 사정: Node의 타입 스트리핑은 타입만
 * 걷어낼 뿐 확장자 없는 import를 풀지 못하므로, 의존성이 있는 모듈은 스모크에서 로드되지
 * 않는다). 테스트가 자기만의 숫자를 들고 있으면 버전을 올리는 순간 조용히 어긋난다.
 */

/**
 * 저장 상태(storage.local)의 포맷 버전.
 *
 * v1 → v2: User-Agent·Block·Header Removal 종류가 추가되면서 올렸다. 형태 자체는 v1과
 * 호환되므로(새 종류는 union에 **더해질** 뿐 기존 항목을 바꾸지 않는다) 마이그레이션은
 * 데이터를 손대지 않고 버전만 올린다 — `migrateStoredStateV1ToV2` 참고.
 *
 * 버전을 올릴 때마다 `readStoredState`의 분류가 함께 자란다. 이 상수만 올리고 마이그레이션을
 * 두지 않으면, 기존 사용자의 상태가 '읽을 수 없음'으로 떨어져 데이터를 잃는다.
 */
export const SCHEMA_VERSION = 2 as const;

/**
 * 내보내기 파일의 포맷 버전.
 *
 * **읽기는 예전 버전도 계속 받는다** — 형태가 호환되므로 옛 파일을 거부할 이유가 없다.
 * 거부하는 것은 이 버전보다 **새로운** 파일뿐이고, 그때도 파일을 변형하지 않는다(이 버전이
 * 모르는 종류를 지우고 되쓰면 최신 버전에서 그것이 사라진다).
 */
export const EXPORT_FORMAT_VERSION = 2 as const;

/**
 * 이 버전이 읽을 수 있는 내보내기 포맷들.
 *
 * **현재 버전은 목록에 적지 않고 파생한다.** 손으로 적으면 `EXPORT_FORMAT_VERSION`만 올렸을 때
 * 우리 자신이 방금 쓴 파일을 "HeaderKit 파일이 아님"으로 거부한다 — `newer` 분기에도 걸리지
 * 않아 오해를 주는 메시지가 나간다. 여기에는 **지난** 버전만 이력으로 남긴다.
 */
const OLDER_READABLE_FORMAT_VERSIONS: readonly number[] = [1];

export const READABLE_FORMAT_VERSIONS: readonly number[] = [
  ...OLDER_READABLE_FORMAT_VERSIONS,
  EXPORT_FORMAT_VERSION,
];
