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

// App은 재조정 결과를 매 렌더 상태로 커밋한다 — 커밋된 값을 carry하며 전이를 검증.
describe('reconcileSelection 전이 시퀀스', () => {
  it('자동 선택이 커밋되면 활성 토글로 뷰가 점프하지 않는다', () => {
    // 초기: 선택 없음 → 첫 활성 b가 커밋됨
    const committed = reconcileSelection(null, [profile('a'), profile('b', true)]);
    expect(committed).toBe('b');
    // b를 비활성화해도 b는 존재 → 선택 유지 (a로 점프하지 않음)
    expect(reconcileSelection(committed, [profile('a'), profile('b', false)])).toBe('b');
  });

  it('A 제거 → B 폴백 커밋 → A 재도입 시 B를 유지한다 (복원이 선택을 훔치지 않음)', () => {
    let committed = reconcileSelection('a', [profile('a', true), profile('b')]);
    expect(committed).toBe('a');
    committed = reconcileSelection(committed, [profile('b')]); // A 삭제 → B 폴백
    expect(committed).toBe('b');
    // 복원/외부 갱신으로 A 재도입 — 커밋된 B가 유지된다
    expect(reconcileSelection(committed, [profile('a', true), profile('b')])).toBe('b');
  });
});
