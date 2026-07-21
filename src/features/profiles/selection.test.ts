import { describe, expect, it } from 'vitest';
import type { Profile } from '@/core/schema';
import { reconcileSelection } from './selection';

const profile = (id: string, active = false): Profile => ({
  id,
  name: id,
  active,
  shortLabel: id.slice(0, 2),
  color: '#2563eb',
  modifications: [],
  filters: [],
});

describe('reconcileSelection', () => {
  it('선택 id가 목록에 있으면 유지한다', () => {
    const profiles = [profile('a'), profile('b', true)];
    expect(reconcileSelection('a', profiles)).toBe('a');
  });

  it('선택 프로필이 비활성이어도 선택을 뺏지 않는다', () => {
    const profiles = [profile('a', false), profile('b', true)];
    expect(reconcileSelection('a', profiles)).toBe('a');
  });

  it('선택 id가 사라지면(삭제) 첫 활성 프로필로 폴백한다', () => {
    const profiles = [profile('a', false), profile('b', true), profile('c', true)];
    expect(reconcileSelection('gone', profiles)).toBe('b');
  });

  it('활성 프로필이 없으면 첫 프로필로 폴백한다', () => {
    const profiles = [profile('a'), profile('b')];
    expect(reconcileSelection('gone', profiles)).toBe('a');
  });

  it('빈 목록이면 null(빈 상태)이다', () => {
    expect(reconcileSelection('gone', [])).toBeNull();
    expect(reconcileSelection(null, [])).toBeNull();
  });

  it('선택이 없으면(초기) 첫 활성 → 첫 프로필 순으로 고른다', () => {
    expect(reconcileSelection(null, [profile('a'), profile('b', true)])).toBe('b');
    expect(reconcileSelection(null, [profile('a'), profile('b')])).toBe('a');
  });

  it('import로 id가 전면 교체돼도 같은 규칙으로 폴백한다', () => {
    const replaced = [profile('n1'), profile('n2', true)];
    expect(reconcileSelection('old-id', replaced)).toBe('n2');
  });
});
