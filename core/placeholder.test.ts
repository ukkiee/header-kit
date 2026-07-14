import { describe, expect, it } from 'vitest';
import { hasPlaceholders, materializeValue, type MaterializeDeps } from './placeholder';

function stubDeps(): MaterializeDeps & { uuidCalls: number } {
  const deps = {
    uuidCalls: 0,
    uuid: () => `uuid-${++deps.uuidCalls}`,
    now: () => 1_720_000_000_000,
  };
  return deps;
}

describe('hasPlaceholders', () => {
  it('지원 토큰만 감지한다', () => {
    expect(hasPlaceholders('Bearer {{uuid}}')).toBe(true);
    expect(hasPlaceholders('{{timestamp}}')).toBe(true);
    expect(hasPlaceholders('plain value')).toBe(false);
    expect(hasPlaceholders('{{unknown}}')).toBe(false);
  });
});

describe('materializeValue', () => {
  it('uuid는 등장마다 새 값으로, timestamp는 현재 시각으로 치환한다', () => {
    const deps = stubDeps();

    expect(materializeValue('a={{uuid}}; b={{uuid}}; t={{timestamp}}', deps)).toBe(
      'a=uuid-1; b=uuid-2; t=1720000000000',
    );
  });

  it('알 수 없는 토큰은 그대로 둔다', () => {
    expect(materializeValue('{{unknown}}-{{uuid}}', stubDeps())).toBe('{{unknown}}-uuid-1');
  });
});
