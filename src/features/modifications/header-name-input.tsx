import { useId, useRef, useState, useSyncExternalStore, type ComponentType, type Ref } from 'react';
import { suggestHeaderNames } from '@/core/autocomplete';
import { Input, type InputProps } from '@/ui/input';
import { useT } from '@/ui/i18n-context';
import type { HeaderNameAutocompleteProps } from './header-name-autocomplete';

/**
 * Base UI Autocomplete는 이 동적 import 청크에만 있다 — 규칙 폼을 열어야 보이는 UI라
 * 팝업 초기 번들에서 제외된다(실측 26.5KB). 선행 예: sortable-profile-list의 dnd-kit.
 *
 * **`React.lazy`를 쓰지 않는다.** lazy는 첫 렌더에서 한 번 서스펜드했다가 재시도하는데,
 * 모듈이 이미 도착해 있어도 그 왕복이 실측 ~250ms였다. 헤더 이름 필드는 autoFocus라
 * 사용자가 폼을 열자마자 타이핑하고, 그 250ms 동안 브라우저 기본 datalist를 보게 된다 —
 * story 4가 없애려는 바로 그 경험이다. 그래서 받아 둔 컴포넌트를 모듈 스코프에 두고
 * 곧바로 동기 렌더한다. 이 방식에서는 교체까지 실측 0~7ms다.
 *
 * **미리 받아 두지도 않는다.** requestIdleCallback으로 앞당겨 봤지만, 팝업 시작이 워낙
 * 짧아 유휴 콜백이 첫 페인트 **전에** 끼어들어 first paint가 ~62 → ~85ms로 늘었다(실측).
 * 교체가 이미 눈에 띄지 않는 이상, story 31이 지키려는 시작 속도를 내주면서까지 앞당길
 * 이유가 없다.
 */
let loadedComponent: ComponentType<HeaderNameAutocompleteProps> | null = null;
let pending: Promise<void> | null = null;
const subscribers = new Set<() => void>();

function loadAutocomplete(): Promise<void> {
  pending ??= import('./header-name-autocomplete')
    .then((module) => {
      loadedComponent = module.default;
      for (const notify of subscribers) notify();
    })
    .catch(() => {
      // 삼키기만 한다 — 여기서 재시도할 방법이 없다.
      //
      // 실패는 **이 문서 수명 동안 회복되지 않는다.** 브라우저 모듈 맵이 실패한 fetch를
      // 캐시하기 때문에, 자체 캐시(`pending`)를 비워도 `import()`는 재요청 없이 같은
      // 거절을 그대로 돌려준다. 실측으로 확인했다 — 폼을 닫았다 다시 열어도 청크 요청
      // 누계가 1에 고정됐고, 문서를 새로 고쳐야 2가 됐다. 예전에 여기서 `pending = null`을
      // 했었는데, 회복을 주지 못하면서 준다고 주장하는 코드였다. 우회하려면 해시된 청크
      // URL에 캐시버스터를 붙여야 하는데 그 URL은 번들러가 소유해 코드에서 알 수 없다.
      //
      // 대신 폴백(datalist)이 계속 동작한다 — 제안·타이핑·저장 전부 유효하고, 팝업을
      // 다시 열면 새 문서라 회복된다. 실제 트리거는 확장 업데이트로 해시 파일명이 바뀌어
      // 열려 있던 팝업의 청크 요청이 404가 되는 경우이고, 그 시점엔 확장 컨텍스트도 함께
      // 무효화돼 있다. 이 계약은 smoke L2g가 고정한다.
    });
  return pending;
}

const subscribeToAutocomplete = (onChange: () => void) => {
  subscribers.add(onChange);
  void loadAutocomplete();
  return () => {
    subscribers.delete(onChange);
  };
};
const getLoadedComponent = () => loadedComponent;

/**
 * 도착해 있으면 그 컴포넌트를, 아니면 null을 준다.
 *
 * `useSyncExternalStore`인 이유 — 이펙트에서 구독하면 렌더와 이펙트 사이에 청크가
 * 도착하는 창이 생기고, 그 사이에 도착하면 구독 시점에 이미 값이 있어 알림이 오지 않아
 * 그 입력만 datalist에 갇힌다. 이 훅은 구독 직후 스냅샷을 다시 읽어 그 창을 닫는다.
 */
function useAutocompleteComponent(): ComponentType<HeaderNameAutocompleteProps> | null {
  return useSyncExternalStore(subscribeToAutocomplete, getLoadedComponent, getLoadedComponent);
}

export interface HeaderNameInputProps extends Pick<InputProps, 'variant' | 'size' | 'autoFocus'> {
  value: string;
  onChange: (next: string) => void;
  userHeaders: readonly string[];
  className?: string;
  /**
   * 실제 입력 요소로 가는 ref — 검증 실패 시 포커스를 옮기는 데 쓴다(티켓 08).
   * **두 표현 모두**에 넘긴다. 청크가 도착하며 교체되면 React가 이전 노드에서 떼고 새
   * 노드에 붙이므로, 어느 쪽이 렌더돼 있든 ref는 살아 있는 입력을 가리킨다.
   */
  ref?: Ref<HTMLInputElement>;
}

/**
 * 헤더 이름 입력 — 표준 사전 + 사용자 항목으로 제안한다.
 *
 * 후보 산출은 여기(정확히는 core의 `suggestHeaderNames`)서 끝난다. 아래 두 표현 모두
 * 같은 배열을 받아 그리기만 하므로 어느 쪽이 렌더되든 제안 내용은 동일하다.
 */
export function HeaderNameInput({
  value,
  onChange,
  userHeaders,
  className,
  variant,
  size,
  autoFocus,
  ref,
}: HeaderNameInputProps) {
  const t = useT();
  const label = t('headerName');
  const suggestions = suggestHeaderNames(value, userHeaders);
  const Autocomplete = useAutocompleteComponent();

  /**
   * 교체 시 포커스 — 릴리스 게이트 R-1.
   *
   * 두 표현은 컴포넌트 타입이 달라 교체가 **리마운트**다. 새 입력에 `autoFocus`를 그대로
   * 넘기면 마운트 시점에 포커스를 가져가는데, 청크 도착이 늦으면 그 사이 다른 필드로 옮긴
   * 사용자가 헤더 이름으로 끌려온다. 청크 응답을 900ms 늦춰 실측 재현했다.
   *
   * 그렇다고 교체 때 `autoFocus`를 무조건 끄면 안 된다 — 정상 경로(0~7ms)에서는 폴백이
   * 포커스를 쥔 채 사라지고 새 입력이 받지 않아 폼을 열어도 포커스가 아무 데도 없다.
   * "이미 소비했으면 안 넘긴다" 가드를 뒀다가 되돌린 이유가 그것이다.
   *
   * 그래서 기준을 "소비 여부"가 아니라 **"교체 직전에 폴백이 포커스를 쥐고 있었는가"**로
   * 바꾼다. 폴백이 자기 focus/blur로 알려 주므로 별도 DOM 조회가 없고, 관측한 적이 없으면
   * (`null`) 원래 `autoFocus`를 그대로 흘린다 — 이 가드는 **포커스를 보류할 수만 있고**
   * 없던 동작을 새로 만들지 않는다.
   */
  const fallbackFocus = useRef<boolean | null>(null);

  const shared = { value, onChange, suggestions, label, className, variant, size, ref };

  return Autocomplete ? (
    <Autocomplete {...shared} autoFocus={fallbackFocus.current ?? autoFocus} />
  ) : (
    <PlainHeaderNameInput
      {...shared}
      autoFocus={autoFocus}
      onFocusedChange={(focused) => {
        fallbackFocus.current = focused;
      }}
    />
  );
}

/**
 * 청크 도착 전 표현 — 네이티브 datalist. 같은 `Input` 프리미티브를 같은 변형으로 쓰므로
 * 교체 시 시각 점프가 없고, 제안 목록도 위와 같은 배열이다. 도착이 0~7ms라 이 표현이
 * 보이는 시간은 사실상 없지만, 보이더라도 기능이 끊기지는 않는다.
 */
function PlainHeaderNameInput({
  value,
  onChange,
  suggestions,
  label,
  className,
  variant,
  size,
  autoFocus,
  ref,
  onFocusedChange,
}: HeaderNameAutocompleteProps & {
  /** 교체 시 포커스 판단에 쓰인다 — 위 `fallbackFocus` 참고. */
  onFocusedChange: (focused: boolean) => void;
}) {
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const reportFocus = (next: boolean) => {
    setFocused(next);
    onFocusedChange(next);
  };

  return (
    <>
      <Input
        ref={ref}
        variant={variant}
        size={size}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => reportFocus(true)}
        onBlur={() => reportFocus(false)}
        placeholder={label}
        aria-label={label}
        list={listId}
        autoComplete="off"
        className={className}
      />
      <datalist id={listId}>
        {focused && suggestions.map((name) => <option key={name} value={name} />)}
      </datalist>
    </>
  );
}
