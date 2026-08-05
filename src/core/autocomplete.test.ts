import { describe, expect, it } from 'vitest';
import {
  COMMON_COOKIE_NAMES,
  suggestCookieNames,
  suggestHeaderNames,
  suggestUserAgents,
  USER_AGENT_PRESETS,
} from './autocomplete';

/** 세 제안이 같은 모양(`{ label, value }`)을 돌려주므로 값만 뽑아 보는 헬퍼. */
const values = (suggestions: readonly { value: string }[]) => suggestions.map((s) => s.value);
const labels = (suggestions: readonly { label: string }[]) => suggestions.map((s) => s.label);

describe('suggestHeaderNames', () => {
  it('빈 쿼리는 사전 앞쪽을 limit만큼 반환한다', () => {
    expect(suggestHeaderNames('', [], 3)).toHaveLength(3);
  });

  it('접두 일치를 부분 일치보다 앞에 둔다', () => {
    const result = values(suggestHeaderNames('content'));
    expect(result[0]).toBe('Content-Type');
    expect(result.every((h) => h.toLowerCase().includes('content'))).toBe(true);
  });

  it('대소문자를 무시한다', () => {
    expect(values(suggestHeaderNames('AUTHOR'))).toContain('Authorization');
  });

  /*
   * 사용자 항목이 표준보다 **앞선다**. 그 안에서의 차례는 최근에 등록한 것이 먼저다 —
   * 상한에 걸릴 때 잘려 나가야 하는 쪽이 오래된 쪽이기 때문이다(아래 '이력 순서' 참고).
   */
  it('사용자 항목이 표준보다 앞서고 중복은 제거된다', () => {
    const result = values(suggestHeaderNames('x-', ['X-My-Header', 'X-Requested-With']));
    // 사용자 항목 둘이 표준 전용 항목(X-Forwarded-For)보다 앞이다.
    expect(result.indexOf('X-My-Header')).toBeLessThan(result.indexOf('X-Forwarded-For'));
    expect(result.indexOf('X-Requested-With')).toBeLessThan(result.indexOf('X-Forwarded-For'));
    // 사용자·표준 양쪽에 있어도 한 번만.
    expect(result.filter((h) => h === 'X-Requested-With')).toHaveLength(1);
  });

  it('정확히 입력된 값은 제안하지 않는다', () => {
    expect(values(suggestHeaderNames('authorization'))).not.toContain('Authorization');
  });

  it('limit을 넘지 않는다', () => {
    expect(suggestHeaderNames('a', [], 2).length).toBeLessThanOrEqual(2);
  });

  it('헤더는 라벨과 값이 같다 — 보여 주는 것이 곧 넣는 것이다', () => {
    for (const s of suggestHeaderNames('accept')) expect(s.label).toBe(s.value);
  });
});

/**
 * 쿠키 이름 제안 (티켓 08) — 헤더와 **같은 구조**다: 프리셋 사전 + 사용 이력.
 *
 * 같은 규칙을 두 번 구현하지 않는다는 것이 이 묶음의 요점이다 — 한쪽만 고쳐지는 날이 오면
 * 사용자는 같은 자리에서 다르게 동작하는 두 입력을 갖게 된다.
 */
describe('suggestCookieNames', () => {
  it('흔한 쿠키 이름 사전에서 제안한다', () => {
    expect(values(suggestCookieNames('sess'))).toContain('session_id');
  });

  it('사용 이력이 사전보다 앞선다', () => {
    const result = values(suggestCookieNames('s', ['sid_custom']));
    expect(result[0]).toBe('sid_custom');
  });

  it('대소문자를 무시하고 중복을 지운다', () => {
    const first = COMMON_COOKIE_NAMES[0]!;
    const result = values(suggestCookieNames(first.slice(0, 2), [first.toUpperCase()]));
    expect(result.filter((n) => n.toLowerCase() === first.toLowerCase())).toHaveLength(1);
  });

  it('정확히 입력된 값은 제안하지 않는다', () => {
    expect(values(suggestCookieNames('session_id'))).not.toContain('session_id');
  });

  it('쿠키 이름도 라벨과 값이 같다', () => {
    for (const s of suggestCookieNames('s')) expect(s.label).toBe(s.value);
  });
});

/**
 * User-Agent 제안 (티켓 08) — **라벨로 찾고 값을 넣는다.**
 *
 * 나머지 둘과 갈리는 지점이 여기다. UA 문자열은 길어서 접두 필터가 맞지 않고(사용자는
 * `Mozilla/5.0`을 치지 않는다), 외워서 칠 수 있는 것도 아니다. 그래서 사람이 아는 이름
 * (`Chrome (Windows)`)으로 찾게 하고 넣는 것은 전체 문자열이다.
 */
describe('suggestUserAgents', () => {
  /*
   * **값에는 없는 말로 찾는다** — 이것이 "라벨로 찾는다"의 실질이다.
   *
   * `iPhone` 같은 쿼리로는 이 계약을 잴 수 없다: 그 말이 값 문자열에도 들어 있어, 필터를
   * 값 기준으로 바꿔도 통과한다(실측 확인). `macOS`는 값에 `Mac OS X`·`Macintosh`로만
   * 나타나므로 라벨을 보지 않으면 하나도 걸리지 않는다.
   */
  it('라벨로 찾는다 — 값에는 없는 말로도 찾힌다', () => {
    expect(labels(suggestUserAgents('macos'))).toEqual(['Chrome (macOS)', 'Safari (macOS)']);
    // 감도 대조 — 그 쿼리가 값에는 정말 없다.
    expect(USER_AGENT_PRESETS.every((p) => !p.value.toLowerCase().includes('macos'))).toBe(true);
  });

  it('값에만 있는 말로는 찾히지 않는다 — 거르는 대상이 라벨이기 때문이다', () => {
    // `AppleWebKit`은 여러 값에 있지만 어느 라벨에도 없다.
    expect(suggestUserAgents('applewebkit')).toEqual([]);
  });

  it('고르면 들어가는 것은 전체 UA 문자열이다', () => {
    const picked = suggestUserAgents('iphone')[0]!;
    expect(picked.value).toMatch(/^Mozilla\/5\.0/);
    expect(picked.value).not.toBe(picked.label);
  });

  it('빈 쿼리는 프리셋 앞쪽을 준다 — 아무것도 치지 않아도 고를 것이 보인다', () => {
    expect(suggestUserAgents('', [], 3)).toHaveLength(3);
  });

  /*
   * 직접 친 UA는 **자기 자신이 라벨**이다 — 사람이 붙인 이름이 없으므로 값을 그대로 보여
   * 주는 것 말고는 그것을 가리킬 방법이 없다.
   */
  it('사용 이력은 값이 곧 라벨이고 프리셋보다 앞선다', () => {
    const mine = 'MyBot/1.0 (custom)';
    const result = suggestUserAgents('mybot', [mine]);
    expect(result[0]).toEqual({ label: mine, value: mine });
  });

  it('이력에 이미 있는 프리셋 값은 두 번 나오지 않는다', () => {
    const presetValue = USER_AGENT_PRESETS[0]!.value;
    const result = suggestUserAgents('', [presetValue], 20);
    expect(values(result).filter((v) => v === presetValue)).toHaveLength(1);
  });

  it('limit을 넘지 않는다', () => {
    expect(suggestUserAgents('', [], 2).length).toBeLessThanOrEqual(2);
  });
});

/**
 * 프리셋 사전 자체의 계약 — 목록이 흔들려도 지켜야 하는 것.
 */
describe('프리셋 사전', () => {
  it('UA 프리셋은 라벨도 값도 비어 있지 않고 라벨이 겹치지 않는다', () => {
    const seen = new Set<string>();
    for (const preset of USER_AGENT_PRESETS) {
      expect(preset.label.trim()).not.toBe('');
      expect(preset.value.trim()).not.toBe('');
      expect(seen.has(preset.label)).toBe(false);
      seen.add(preset.label);
    }
  });

  it('쿠키 이름 사전에 중복이 없다', () => {
    const lowered = COMMON_COOKIE_NAMES.map((n) => n.toLowerCase());
    expect(new Set(lowered).size).toBe(lowered.length);
  });
});

/**
 * 값이 겹칠 때 **라벨을 잃지 않는다** (code-review).
 *
 * 이력에 프리셋과 같은 UA 문자열이 들어 있는 상태는 예전 저장·가져오기로 도달 가능하다.
 * 앞선 쪽을 그냥 남기면 목록에 `Mozilla/5.0 …` 한 줄이 서서, 라벨로 찾게 한 이유가 사라진다.
 */
describe('값이 겹치는 항목', () => {
  it('이력에 프리셋과 같은 UA가 있어도 사람이 붙인 라벨이 남는다', () => {
    const preset = USER_AGENT_PRESETS[0]!;
    const result = suggestUserAgents('', [preset.value], 20);
    const matching = result.filter((s) => s.value === preset.value);
    expect(matching).toHaveLength(1);
    expect(matching[0]!.label).toBe(preset.label);
  });

  it('그 항목은 이력 자리(맨 앞)를 지킨다', () => {
    const preset = USER_AGENT_PRESETS[2]!;
    expect(suggestUserAgents('', [preset.value], 20)[0]).toEqual(preset);
  });

  it('라벨로도 계속 찾힌다', () => {
    const preset = USER_AGENT_PRESETS[0]!;
    const found = suggestUserAgents(preset.label.slice(0, 6), [preset.value], 20);
    expect(found.some((s) => s.value === preset.value)).toBe(true);
  });
});

/**
 * 이력은 **최근에 쓴 것부터** 제안된다 (code-review).
 *
 * 저장은 뒤에 덧붙이므로 배열은 오래된 것이 앞이다. 그대로 쓰면 상한에 걸릴 때 방금 친 값이
 * 먼저 잘려 나가 "직접 친 값은 다음에도 제안된다"가 어긋난다.
 */
describe('이력 순서', () => {
  const many = Array.from({ length: 12 }, (_, i) => `hist_${i}`);

  it('가장 최근 값이 맨 앞에 온다', () => {
    expect(values(suggestCookieNames('hist_', many))[0]).toBe('hist_11');
  });

  it('상한에 걸려도 최근 값이 살아남는다 — 잘리는 것은 오래된 쪽이다', () => {
    const shown = values(suggestCookieNames('hist_', many, 3));
    expect(shown).toEqual(['hist_11', 'hist_10', 'hist_9']);
  });

  it('UA도 같다', () => {
    const agents = ['ua_old', 'ua_mid', 'ua_new'];
    expect(values(suggestUserAgents('ua_', agents))[0]).toBe('ua_new');
  });
});
