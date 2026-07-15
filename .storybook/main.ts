import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.tsx'],
  framework: '@storybook/react-vite',
  viteFinal: async (config) => {
    const { default: tailwindcss } = await import('@tailwindcss/vite');
    const { fileURLToPath } = await import('node:url');
    config.plugins = [...(config.plugins ?? []), tailwindcss()];
    config.resolve = {
      ...config.resolve,
      alias: {
        ...config.resolve?.alias,
        '@': fileURLToPath(new URL('../src', import.meta.url)),
        '~': fileURLToPath(new URL('../src', import.meta.url)),
      },
    };
    return config;
  },
};

export default config;
