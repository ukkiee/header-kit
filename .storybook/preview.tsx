import type { Decorator, Preview } from '@storybook/react-vite';
import { canvas } from '../src/ui/tokens';
import '../src/app/styles/global.css';

/** 툴바 테마 전환 — data-theme 오버라이드(개발용)로 dark: 변형을 강제한다. */
const withTheme: Decorator = (Story, context) => (
  <div data-theme={context.globals.theme ?? 'light'} className={`min-h-svh p-4 ${canvas}`}>
    <Story />
  </div>
);

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
  },
  globalTypes: {
    theme: {
      description: 'Color theme',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: ['light', 'dark'],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'light' },
  decorators: [withTheme],
};

export default preview;
