import { describe, expect, it } from 'vitest';
import {
  ALL_MODIFICATION_KINDS,
  createModification,
  toStructuredSetCookie,
  type Modification,
  type ModificationKind,
} from '@/core/schema';
import { convergeDraft, initialMatchType, switchDraftKind, tidyDraft, visibleMatchType } from './rule-draft';

const header = (over: Partial<Extract<Modification, { kind: 'request-header' }>> = {}): Modification => ({
  kind: 'request-header',
  id: 'm1',
  name: 'X-Test',
  value: 'aaa',
  enabled: true,
  mode: 'override',
  emptyMeans: 'remove',
  comment: '',
  ...over,
});

/**
 * 폼이 보여 주는 매치 방식은 **둘뿐**이다 (ADR 0017, story 21) — 와일드카드(리터럴 포함
 * 매치)와 정규식. 스키마의 넷은 그대로 남아 옛 규칙이 계속 동작한다.
 */
describe('visibleMatchType — 넷을 둘로 접는다', () => {
  it('정규식은 정규식으로 보인다', () => {
    expect(visibleMatchType(header({ urlFilter: 'a', urlMatchType: 'regex' }))).toBe('regex');
  });

  it('와일드카드 계열 셋은 모두 와일드카드로 보인다', () => {
    for (const stored of ['contains', 'domain', 'prefix'] as const) {
      expect(visibleMatchType(header({ urlFilter: 'a', urlMatchType: stored }))).toBe('contains');
    }
  });

  it('Redirect는 자기 패턴이 스코프라 매치 방식을 묻지 않는다 — 정규식이다', () => {
    expect(visibleMatchType(createModification('redirect'))).toBe('regex');
  });

  /*
   * 방식이 **없을 때** 무엇으로 볼지는 초안이 아니라 호출부가 정한다. 살아 있는 초안만 보고
   * 정하면 새 규칙에서 패턴을 치는 동안 방식이 아직 없는 것을 "저장된 값에 방식이 없다"와
   * 같게 읽어, 사용자가 평문을 치는 중에 셀렉트가 정규식으로 튄다.
   */
  it('방식이 없으면 호출부가 준 기본을 따른다', () => {
    expect(visibleMatchType(header({ urlFilter: '^https://a/' }), 'regex')).toBe('regex');
    expect(visibleMatchType(header({ urlFilter: '^https://a/' }), 'contains')).toBe('contains');
  });

  it('저장된 방식이 있으면 기본을 무시한다 — 접기만 한다', () => {
    expect(visibleMatchType(header({ urlFilter: 'a', urlMatchType: 'domain' }), 'regex')).toBe('contains');
    expect(visibleMatchType(header({ urlFilter: 'a', urlMatchType: 'regex' }), 'contains')).toBe('regex');
  });
});

/**
 * 폼을 열 때 한 번 정하는 기본 — **로드된 규칙**이 무엇이었나로 갈린다 (ADR 0008 하위 호환).
 */
describe('initialMatchType — 폼이 처음 보여 줄 방식', () => {
  it('새 규칙은 와일드카드다', () => {
    expect(initialMatchType(undefined)).toBe('contains');
  });

  it('저장된 패턴이 있는데 방식이 없으면 정규식이다 — 하위 호환', () => {
    expect(initialMatchType(header({ urlFilter: '^https://a/' }))).toBe('regex');
  });

  it('저장된 패턴이 없으면 와일드카드다 — 처음 치는 평문이 정규식으로 굳지 않게', () => {
    expect(initialMatchType(header())).toBe('contains');
    expect(initialMatchType(createModification('block'))).toBe('contains');
  });

  it('저장된 방식이 있으면 그것을 접어서 쓴다', () => {
    expect(initialMatchType(header({ urlFilter: 'a', urlMatchType: 'prefix' }))).toBe('contains');
    expect(initialMatchType(header({ urlFilter: 'a', urlMatchType: 'regex' }))).toBe('regex');
  });
});

describe('switchDraftKind — 종류를 바꿀 때 따라가는 값', () => {
  it('id·켜짐·메모·조건은 따라간다', () => {
    const from = header({
      id: 'keep-me',
      enabled: false,
      comment: '메모',
      conditions: { resourceTypes: ['script'] },
    });
    const next = switchDraftKind(from, 'redirect');

    expect(next.kind).toBe('redirect');
    expect(next.id).toBe('keep-me');
    expect(next.enabled).toBe(false);
    expect(next.comment).toBe('메모');
    expect(next.conditions).toEqual({ resourceTypes: ['script'] });
  });

  /*
   * 종류 고유 필드는 **따라가지 않는다.** 헤더의 값이 리다이렉트의 치환으로 옮겨 가면
   * 사용자가 넣은 적 없는 목적지가 생기고, 그 규칙은 저장되는 순간 엉뚱한 곳으로 보낸다.
   */
  it('종류 고유 필드는 따라가지 않는다', () => {
    const next = switchDraftKind(header({ name: 'X-A', value: 'v' }), 'redirect');
    expect(next).toMatchObject({ kind: 'redirect', pattern: '', substitution: '' });
    expect('name' in next).toBe(false);
    expect('value' in next).toBe(false);
  });

  it('같은 종류로 바꾸면 초안이 그대로다 — 입력 중이던 값을 잃지 않는다', () => {
    const draft = header({ value: '치는 중' });
    expect(switchDraftKind(draft, 'request-header')).toBe(draft);
  });

  it('조건이 없으면 새 초안에도 조건이 없다 — 빈 객체를 만들지 않는다', () => {
    expect('conditions' in switchDraftKind(header(), 'block')).toBe(false);
  });
});

describe('tidyDraft — 저장 직전 정리', () => {
  it('스코프가 비면 매치 방식도 함께 벗긴다', () => {
    const tidied = tidyDraft(header({ urlFilter: '', urlMatchType: 'regex' }));
    expect('urlFilter' in tidied).toBe(false);
    expect('urlMatchType' in tidied).toBe(false);
  });

  it('공백뿐인 스코프도 없는 것과 같다', () => {
    expect('urlFilter' in tidyDraft(header({ urlFilter: '   ' }))).toBe(false);
  });

  it('빈 조건 객체는 통째로 벗긴다', () => {
    expect('conditions' in tidyDraft(header({ conditions: {} }))).toBe(false);
  });

  it('값이 있는 조건은 남는다', () => {
    expect(tidyDraft(header({ conditions: { requestMethods: ['get'] } })).conditions).toEqual({
      requestMethods: ['get'],
    });
  });
});

/**
 * 수렴 저장 (ADR 0017) — 폼이 **보여 준 값**으로 다시 쓴다.
 *
 * 무엇이 수렴 대상인지는 "폼이 그 값을 보여 줬는가"가 가른다. 매치 방식과 리소스 묶음은
 * 폼이 접어서 보여 주므로 화면과 저장이 어긋나 있고, 저장이 그 어긋남을 화면 쪽으로 맞춘다.
 * 적용 방식·빈 값의 뜻은 폼이 **아무것도 보여 주지 않으므로** 맞출 대상이 없다 — 건드리면
 * 사용자가 본 적 없는 변경이 저장에 실려 나가는 헤더가 달라진다.
 */
describe('convergeDraft — 수렴 저장', () => {
  it('매치 방식이 폼이 보여 준 둘 중 하나로 굳는다', () => {
    expect(
      convergeDraft(header({ urlFilter: 'a.example', urlMatchType: 'domain' }), 'contains'),
    ).toMatchObject({ urlMatchType: 'contains' });
    expect(convergeDraft(header({ urlFilter: 'a.example', urlMatchType: 'prefix' }), 'regex')).toMatchObject({
      urlMatchType: 'regex',
    });
  });

  it('리소스 묶음이 그 묶음 전체로 넓어진다 — 폼이 묶음 칩으로 보여 줬기 때문이다', () => {
    expect(
      convergeDraft(header({ conditions: { resourceTypes: ['sub_frame'] } }), 'contains').conditions,
    ).toEqual({ resourceTypes: ['main_frame', 'sub_frame'] });
  });

  it('리소스 조건이 없으면 만들어 내지 않는다', () => {
    expect(convergeDraft(header(), 'contains').conditions).toBeUndefined();
  });

  /*
   * **적용 방식과 빈 값의 뜻은 그대로 둔다.** 폼에서 사라진 것은 컨트롤이지 값이 아니고,
   * 화면이 그 값을 부정하지 않았으므로 맞출 대상이 없다. 기본값으로 덮으면 append로
   * 쌓이던 헤더가 저장 한 번에 override로 바뀌어 나가는 요청이 달라진다.
   */
  it('적용 방식과 빈 값의 뜻은 손대지 않는다', () => {
    const converged = convergeDraft(header({ mode: 'append', emptyMeans: 'send-empty' }), 'contains');
    expect(converged).toMatchObject({ mode: 'append', emptyMeans: 'send-empty' });
  });

  /*
   * **손대지 않은 원시 응답 쿠키는 저장을 지나도 원시다.**
   *
   * 한때 저장이 구조화의 계기였는데, 채울 재료가 없는 항목은 `{name:'', value:''}`가 되고
   * 응답 쿠키에는 필수 필드가 없어 그대로 저장을 통과한다 — 컴파일이 빈 줄로 판정해 규칙이
   * "이 쿠키를 내보낸다"에서 **"Set-Cookie를 제거한다"로 뒤집혔다.** 업그레이드 뒤에도 같은
   * 쿠키가 나가야 한다는 약속이 거기서 깨진다. 구조화로 가는 문은 재료를 실제로 만졌을 때
   * 하나뿐이다.
   */
  it('손대지 않은 원시 응답 쿠키는 저장을 지나도 원시인 채다', () => {
    const raw: Modification = {
      kind: 'set-cookie',
      id: 's',
      raw: 'sid=abc; Expires=Thu, 01 Jan 2026 00:00:00 GMT',
      enabled: true,
      mode: 'override',
      emptyMeans: 'remove',
      comment: '',
    };
    const converged = convergeDraft(tidyDraft(raw), 'contains');
    expect(converged).toEqual(raw);
  });

  /*
   * 재료를 만지면 그때 구조화된다 — 그 전환의 문은 `toStructuredSetCookie` 하나이고, 수렴은
   * 이미 구조화된 항목을 그대로 통과시킨다(원시 줄을 되살리지 않는다).
   */
  it('재료를 채운 응답 쿠키는 구조화된 채로 저장을 지난다', () => {
    const structured = toStructuredSetCookie(
      {
        kind: 'set-cookie',
        id: 's',
        raw: 'sid=abc; Expires=Thu, 01 Jan 2026 00:00:00 GMT',
        enabled: true,
        mode: 'override',
        emptyMeans: 'remove',
        comment: '',
      },
      { name: 'sid', value: 'abc' },
    );
    const converged = convergeDraft(tidyDraft(structured), 'contains');
    expect(converged).toMatchObject({ name: 'sid', value: 'abc' });
    expect(converged.kind === 'set-cookie' && converged.raw).toBeUndefined();
  });
});

/**
 * 숨은 필드 **세 종류 × 규칙 종류 여덟 개**. 스모크로 덮으면 반드시 구멍이 남는 조합이라
 * 스펙이 단위로 지목한 자리다 — 종류 하나가 한 필드를 잃어도 화면에서는 아무것도 달라
 * 보이지 않고, 다음 요청에서야 헤더가 달라진 것으로 드러난다.
 */
describe('숨은 필드 3종 × 규칙 종류 8종', () => {
  /** 값을 가진 종류만 적용 방식·빈 값의 뜻을 갖는다 — 나머지에는 그 필드 자체가 없다. */
  const HAS_HEADER_MODE: ModificationKind[] = ['request-header', 'response-header', 'cookie', 'set-cookie'];
  /** Redirect는 자기 패턴이 스코프라 URL 스코프 필드를 갖지 않는다 (ADR 0007). */
  const HAS_SCOPE: ModificationKind[] = ALL_MODIFICATION_KINDS.filter((k) => k !== 'redirect');

  it('여덟 종류를 빠짐없이 돈다 — 종류가 늘면 여기서 먼저 깨진다', () => {
    expect(ALL_MODIFICATION_KINDS).toHaveLength(8);
  });

  it.each(ALL_MODIFICATION_KINDS)('%s — 적용 방식·빈 값의 뜻이 저장을 넘어 보존된다', (kind) => {
    const base = { ...createModification(kind, 'k1'), comment: '' } as Modification;
    if (!HAS_HEADER_MODE.includes(kind)) {
      // 이 종류들에는 두 필드가 애초에 없다 — 수렴이 없는 필드를 만들어 내지 않는지 본다.
      const saved = convergeDraft(tidyDraft(base), 'contains');
      expect('mode' in saved).toBe(false);
      expect('emptyMeans' in saved).toBe(false);
      return;
    }
    const opinionated = { ...base, mode: 'append', emptyMeans: 'send-empty' } as Modification;
    const saved = convergeDraft(tidyDraft(opinionated), 'contains');
    expect(saved).toMatchObject({ mode: 'append', emptyMeans: 'send-empty' });
  });

  it.each(HAS_SCOPE)('%s — 매치 방식이 폼이 보여 준 값으로 수렴한다', (kind) => {
    const scoped = {
      ...createModification(kind, 'k1'),
      urlFilter: 'a.example',
      urlMatchType: 'domain',
    } as Modification;
    expect(convergeDraft(tidyDraft(scoped), 'contains')).toMatchObject({
      urlMatchType: 'contains',
    });
    expect(convergeDraft(tidyDraft(scoped), 'regex')).toMatchObject({
      urlMatchType: 'regex',
    });
  });

  it.each(ALL_MODIFICATION_KINDS)('%s — 리소스 묶음이 수렴하고 다시 저장해도 넓어지지 않는다', (kind) => {
    const withGroup = {
      ...createModification(kind, 'k1'),
      conditions: { resourceTypes: ['sub_frame'] },
    } as Modification;
    const once = convergeDraft(tidyDraft(withGroup), 'contains');
    expect(once.conditions?.resourceTypes).toEqual(['main_frame', 'sub_frame']);
    // 멱등 — 저장할 때마다 조금씩 넓어지면 그것이 수렴이 막으려는 실패다.
    const twice = convergeDraft(tidyDraft(once), 'contains');
    expect(twice.conditions?.resourceTypes).toEqual(once.conditions?.resourceTypes);
  });
});
