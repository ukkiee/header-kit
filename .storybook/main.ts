import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.tsx'],
  framework: '@storybook/react-vite',
  viteFinal: async (config) => {
    const { default: tailwindcss } = await import('@tailwindcss/vite');
    const { fileURLToPath } = await import('node:url');
    config.plugins = [...(config.plugins ?? []), tailwindcss()];
    // Vite의 alias는 객체이거나 배열이다. Storybook이 넘기는 것은 객체지만(실측), 배열을 그대로
    // 펴면 숫자 키가 되어 별칭이 **조용히 사라진다** — 빌드는 그대로 통과한다. 배열이면 버리고
    // 아래 둘만 세운다. 지역 변수로 묶는 이유는 그래야 타입이 좁혀지기 때문이다.
    const inherited = config.resolve?.alias;
    const src = fileURLToPath(new URL('../src', import.meta.url));
    config.resolve = {
      ...config.resolve,
      alias: Object.fromEntries([
        // 배열이면 항목을 버린다 — 그대로 펴면 숫자 키가 되어 별칭이 아니라 쓰레기가 되고,
        // 그런데도 빌드는 통과한다. 펴지 않고 entries로 만드는 이유는 타입 좁히기가
        // `readonly` 배열 합집합에 닿지 않아서다.
        ...(Array.isArray(inherited) ? [] : Object.entries(inherited ?? {})),
        ['@', src],
        ['~', src],
      ]),
    };
    return config;
  },
};

export default config;
