/**
 * 헤더 이름 autocomplete — 표준 헤더 사전과 사용자가 등록한 항목을 병합해
 * 접두 필터한다. 순수 함수라 사전·사용자 항목·쿼리만으로 결정된다.
 */

/** 흔한 요청/응답 헤더 표준 사전 (소문자 정규화 비교, 표시용 원형). */
export const STANDARD_HEADERS = [
  'Accept',
  'Accept-Encoding',
  'Accept-Language',
  'Authorization',
  'Cache-Control',
  'Content-Type',
  'Cookie',
  'Origin',
  'Referer',
  'User-Agent',
  'X-Forwarded-For',
  'X-Requested-With',
  'Access-Control-Allow-Origin',
  'Access-Control-Allow-Headers',
  'Content-Security-Policy',
  'Set-Cookie',
  'Strict-Transport-Security',
] as const;

/**
 * 쿼리에 맞는 헤더 이름 후보를 최대 limit개 반환한다.
 * 접두 일치를 먼저, 그다음 부분 일치. 사용자 항목이 표준보다 앞선다.
 */
export function suggestHeaderNames(
  query: string,
  userHeaders: readonly string[] = [],
  limit = 8,
): string[] {
  const q = query.trim().toLowerCase();
  const seen = new Set<string>();
  const pool: string[] = [];
  for (const name of [...userHeaders, ...STANDARD_HEADERS]) {
    const key = name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      pool.push(name);
    }
  }

  if (q === '') return pool.slice(0, limit);

  const prefix: string[] = [];
  const partial: string[] = [];
  for (const name of pool) {
    const lower = name.toLowerCase();
    if (lower === q) continue; // 이미 정확히 입력된 값은 제안하지 않는다
    if (lower.startsWith(q)) prefix.push(name);
    else if (lower.includes(q)) partial.push(name);
  }
  return [...prefix, ...partial].slice(0, limit);
}
