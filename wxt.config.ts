import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'HeaderKit',
    description: 'Profile-based HTTP request/response modification',
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
