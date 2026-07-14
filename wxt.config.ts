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
  },
});
