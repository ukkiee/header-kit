import type { Decorator, Preview } from '@storybook/react-vite';
import { MotionProvider } from '../src/ui/motion-provider';
import { canvas } from '../src/ui/tokens';
import '../src/app/styles/global.css';

/** 툴바 테마 전환 — data-theme 오버라이드(개발용)로 dark: 변형을 강제한다. */
const withTheme: Decorator = (Story, context) => (
  <div data-theme={context.globals.theme ?? 'light'} className={`min-h-svh p-4 ${canvas}`}>
    <Story />
  </div>
);

/**
 * 앱과 같은 모션 컨텍스트 — 버튼 프리미티브가 `m` 컴포넌트가 되면서 필요해졌다
 * (ADR 0012). LazyMotion strict는 조상이 없으면 던지므로, 이 데코레이터가 없으면
 * 버튼을 쓰는 모든 스토리가 렌더 단계에서 실패한다.
 */
const withMotion: Decorator = (Story) => (
  <MotionProvider>
    <Story />
  </MotionProvider>
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
  decorators: [withTheme, withMotion],
};

export default preview;
