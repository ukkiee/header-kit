import { describe, expect, it } from 'vitest';
import { suggestHeaderNames } from './autocomplete';

describe('suggestHeaderNames', () => {
  it('빈 쿼리는 사전 앞쪽을 limit만큼 반환한다', () => {
    const result = suggestHeaderNames('', [], 3);
    expect(result).toHaveLength(3);
  });

  it('접두 일치를 부분 일치보다 앞에 둔다', () => {
    const result = suggestHeaderNames('content');
    expect(result[0]).toBe('Content-Type');
    // 'Access-Control-...'는 content를 포함하지 않으므로 없음; 부분 일치 예시로 확인
    expect(result.every((h) => h.toLowerCase().includes('content'))).toBe(true);
  });

  it('대소문자를 무시한다', () => {
    expect(suggestHeaderNames('AUTHOR')).toContain('Authorization');
  });

  it('사용자 항목이 표준보다 앞서고 중복은 제거된다', () => {
    const result = suggestHeaderNames('x-', ['X-My-Header', 'X-Requested-With']);
    expect(result[0]).toBe('X-My-Header');
    // X-Requested-With가 사용자·표준 양쪽에 있어도 한 번만
    expect(result.filter((h) => h === 'X-Requested-With')).toHaveLength(1);
  });

  it('정확히 입력된 값은 제안하지 않는다', () => {
    expect(suggestHeaderNames('authorization')).not.toContain('Authorization');
  });

  it('limit을 넘지 않는다', () => {
    expect(suggestHeaderNames('a', [], 2).length).toBeLessThanOrEqual(2);
  });
});
