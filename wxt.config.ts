import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'HeaderKit',
    description: 'Profile-based HTTP request/response modification',
    // 사용 기능의 최소 요구 버전 (RL-4): declarativeNetRequest session rules
    // (updateSessionRules/getSessionRules)와 modifyHeaders 응답 헤더는 Chrome
    // 108부터 안정적으로 지원된다. 이보다 낮은 버전은 설치 시점에 차단한다.
    minimum_chrome_version: '108',
    permissions: ['declarativeNetRequest', 'storage', 'tabs', 'alarms'],
    host_permissions: ['<all_urls>'],
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+H' },
        description: 'Open HeaderKit',
      },
      'toggle-pause': {
        suggested_key: { default: 'Alt+Shift+P' },
        description: 'Pause or resume all modifications',
      },
    },
  },
});
