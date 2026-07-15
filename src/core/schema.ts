/**
 * 도메인 스키마 배럴 — 타입·팩토리(model)와 저장소 검증/백필/파싱(persist)을
 * 한 지점(@/core/schema)으로 재노출한다. 두 관심사를 파일로 분리하되 호출부의
 * import 경로는 그대로 유지한다.
 */
export * from './model';
export * from './persist';
