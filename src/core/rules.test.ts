import { describe, expect, it } from 'vitest';
import { REQUEST_METHODS, RETIRED_REQUEST_METHODS, SELECTABLE_REQUEST_METHODS } from './rules';

/**
 * 폼이 고를 수 있는 요청 메서드 (ADR 0017, story 27) — **여섯이다.**
 *
 * 리소스 묶음은 `resource-groups`가 전수 덮음으로 개수를 이미 못박지만, 메서드에는 그런
 * 구조가 없다 — 목록을 잘라도 아무것도 깨지지 않는다(실측: `.slice(0, 4)`로 줄여도 단위
 * 전체가 통과했다). 그래서 여기서 수와 구성을 직접 잰다.
 *
 * 퇴역 셋과 함께 보는 것이 요점이다: 둘이 **같은 목록에서 갈라져 나오므로**, 한쪽만 바뀌면
 * 폼이 보여 주는 것과 업그레이드가 걷어 가는 것이 어긋난다.
 */
describe('선택 가능한 요청 메서드', () => {
  it('여섯이다 — GET·POST·PUT·PATCH·DELETE·OPTIONS', () => {
    expect(SELECTABLE_REQUEST_METHODS).toEqual([
      'get',
      'post',
      'put',
      'patch',
      'delete',
      'options',
    ]);
  });

  it('퇴역 셋은 고를 수 없다', () => {
    for (const retired of RETIRED_REQUEST_METHODS) {
      expect(SELECTABLE_REQUEST_METHODS).not.toContain(retired);
    }
  });

  /*
   * 선택 가능 + 퇴역 = 전체. 둘이 전체를 **분할**해야 어느 메서드도 조용히 사라지지 않는다 —
   * 한쪽에서만 빠지면 그 값은 폼에도 안 뜨고 업그레이드도 안 걷어 가 저장소에 영원히 남는다.
   */
  it('선택 가능과 퇴역이 전체를 나눠 갖는다 — 어느 쪽에도 없는 메서드가 없다', () => {
    expect([...SELECTABLE_REQUEST_METHODS, ...RETIRED_REQUEST_METHODS].sort()).toEqual(
      [...REQUEST_METHODS].sort(),
    );
  });
});
