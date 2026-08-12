'use client';

import * as React from 'react';

type InputValue = string[] | string;

interface VisuallyHiddenInputProps<T = InputValue> extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'checked' | 'onReset'
> {
  value?: T;
  checked?: boolean;
  control: HTMLElement | null;
  bubbles?: boolean;
}

function VisuallyHiddenInput<T = InputValue>(props: VisuallyHiddenInputProps<T>) {
  const { control, value, checked, bubbles = true, type = 'hidden', style, ...inputProps } = props;

  const isCheckInput = React.useMemo(
    () => type === 'checkbox' || type === 'radio' || type === 'switch',
    [type],
  );
  const inputRef = React.useRef<HTMLInputElement>(null);

  const prevValueRef = React.useRef<{
    value: T | boolean | undefined;
    previous: T | boolean | undefined;
  }>({
    value: isCheckInput ? checked : value,
    previous: isCheckInput ? checked : value,
  });

  const prevValue = React.useMemo(() => {
    const currentValue = isCheckInput ? checked : value;
    if (prevValueRef.current.value !== currentValue) {
      prevValueRef.current.previous = prevValueRef.current.value;
      prevValueRef.current.value = currentValue;
    }
    return prevValueRef.current.previous;
  }, [isCheckInput, value, checked]);

  const [controlSize, setControlSize] = React.useState<{
    width?: number;
    height?: number;
  }>({});

  React.useLayoutEffect(() => {
    if (!control) {
      setControlSize({});
      return;
    }

    setControlSize({
      width: control.offsetWidth,
      height: control.offsetHeight,
    });

    if (typeof window === 'undefined') return;

    const resizeObserver = new ResizeObserver((entries) => {
      if (!Array.isArray(entries) || !entries.length) return;

      const entry = entries[0];
      if (!entry) return;

      let width: number;
      let height: number;

      if ('borderBoxSize' in entry) {
        const borderSizeEntry = entry.borderBoxSize;
        const borderSize = Array.isArray(borderSizeEntry) ? borderSizeEntry[0] : borderSizeEntry;
        width = borderSize.inlineSize;
        height = borderSize.blockSize;
      } else {
        width = control.offsetWidth;
        height = control.offsetHeight;
      }

      setControlSize({ width, height });
    });

    resizeObserver.observe(control, { box: 'border-box' });
    return () => {
      resizeObserver.disconnect();
    };
  }, [control]);

  React.useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const inputProto = window.HTMLInputElement.prototype;
    const propertyKey = isCheckInput ? 'checked' : 'value';
    const eventType = isCheckInput ? 'click' : 'input';
    const currentValue = isCheckInput ? checked : value;

    const serializedCurrentValue = isCheckInput
      ? checked
      : typeof value === 'object' && value !== null
        ? JSON.stringify(value)
        : value;

    const descriptor = Object.getOwnPropertyDescriptor(inputProto, propertyKey);

    // **로컬 패치 — 업스트림(diceui base-nova)이 `lint`를 통과하지 못한다.**
    // 이 세터는 바로 아래에서 `setter.call(input, …)`으로 **수신자를 명시해** 부르므로
    // `this` 스코프가 흐트러지지 않는다. React가 가로챈 세터를 우회해 프로토타입의 네이티브
    // 세터를 직접 호출하는 것이 이 훅의 요점이라, 참조를 뽑지 않고는 쓸 수 없다.
    // `shadcn add`로 재복사하면 이 주석이 사라지고 `lint`가 곧바로 빨강이 된다.
    // oxlint-disable-next-line typescript/unbound-method
    const setter = descriptor?.set;

    if (prevValue !== currentValue && setter) {
      const event = new Event(eventType, { bubbles });
      setter.call(input, serializedCurrentValue);
      input.dispatchEvent(event);
    }
  }, [prevValue, value, checked, bubbles, isCheckInput]);

  const composedStyle = React.useMemo<React.CSSProperties>(() => {
    return {
      ...style,
      ...(controlSize.width !== undefined && controlSize.height !== undefined ? controlSize : {}),
      border: 0,
      clip: 'rect(0 0 0 0)',
      clipPath: 'inset(50%)',
      height: '1px',
      margin: '-1px',
      overflow: 'hidden',
      padding: 0,
      position: 'absolute',
      whiteSpace: 'nowrap',
      width: '1px',
    };
  }, [style, controlSize]);

  return (
    <input
      type={type}
      {...inputProps}
      ref={inputRef}
      aria-hidden={isCheckInput}
      tabIndex={-1}
      defaultChecked={isCheckInput ? checked : undefined}
      style={composedStyle}
    />
  );
}

export { VisuallyHiddenInput };
