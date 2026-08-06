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
    /*
     * 권한 둘이 빠졌다 (ADR 0002 개정, 티켓 10).
     *
     * `alarms` — 자동 해제 시각이 퇴역해(ADR 0017) 걸 알람이 없다. 호출부가 하나도 남지 않았다.
     *
     * `tabs` — 탭 도메인 조건이 퇴역해 탭 목록을 읽지 않는다. 남은 호출은 `tabs.create`
     * 하나(팝업의 '탭에서 열기')인데, 이 메서드는 권한을 요구하지 않는다 — `tabs`가 지키는
     * 것은 탭의 **특권 속성**(url·title·favIconUrl)이고 우리는 만들기만 하고 읽지 않는다.
     * 근거를 기억이 아니라 실측으로 둔다: 스모크 N52가 이 매니페스트로 실제 브라우저에서
     * 그 버튼을 눌러 탭이 열리는 것을 확인한다.
     */
    permissions: ['declarativeNetRequest', 'storage'],
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
