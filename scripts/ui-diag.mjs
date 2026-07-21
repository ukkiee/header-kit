/**
 * UI 진단 (popup-ui-fixes 스파이크) — 실 확장을 로드해 420px + 한국어 + 실데이터로
 * 팝업을 렌더하고 스크린샷을 떠서 레이아웃 문제를 전수 확인한다.
 * 실행: bun run build && node scripts/ui-diag.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const EXT_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.output/chrome-mv3');
const OUT = process.env.DIAG_OUT || '/tmp';

const richState = {
  schemaVersion: 1,
  paused: false,
  customHeaderNames: ['X-Trace-Id', 'X-Debug'],
  materialized: {},
  profiles: [
    {
      id: 'p1',
      name: '스테이징 API 프로필',
      active: true,
      shortLabel: 'ST',
      color: '#d97706',
      modifications: [
        { kind: 'request-header', id: 'm1', name: 'Authorization', value: 'Bearer {{uuid}}', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '스테이징 토큰' },
        { kind: 'response-header', id: 'm2', name: 'X-Frame-Options', value: 'DENY', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
        { kind: 'cookie', id: 'm3', name: 'session', value: 'abc', enabled: true, mode: 'append', emptyMeans: 'remove', comment: '' },
        { kind: 'csp', id: 'm4', directives: [{ name: 'default-src', value: "'self'" }], comment: '', enabled: true },
        { kind: 'redirect', id: 'm5', pattern: '^https://prod\\.example\\.com/(.*)', substitution: 'http://localhost:3000/\\1', comment: '', enabled: true },
      ],
      filters: [
        { kind: 'url', id: 'f1', enabled: true, pattern: 'api\\.staging\\.example\\.com' },
        { kind: 'resource-type', id: 'f2', enabled: true, resourceTypes: ['xmlhttprequest', 'script'] },
        { kind: 'tab-domain', id: 'f3', enabled: true, domain: 'example.com' },
        { kind: 'time', id: 'f4', enabled: true, expiresAt: Date.now() + 3_600_000 },
      ],
    },
    { id: 'p2', name: '두 번째 프로필', active: false, shortLabel: '2', color: '#2563eb', modifications: [], filters: [] },
  ],
};

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`, '--lang=ko'],
});
try {
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extensionId = new URL(sw.url()).host;
  await sw.evaluate(async (state) => chrome.storage.local.set({ state }), richState);

  const popup = await context.newPage();
  await popup.setViewportSize({ width: 420, height: 1000 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html?locale=ko`);
  await popup.waitForTimeout(500);

  await popup.screenshot({ path: `${OUT}/diag-1-popup-collapsed.png`, fullPage: true });
  console.log('shot 1: popup collapsed (rich profile)');

  // 패널 펼치기 (백업 + 환경설정)
  for (const name of ['Toggle backups', 'Toggle preferences']) {
    const btn = popup.getByRole('button', { name });
    if (await btn.count()) await btn.first().click();
  }
  await popup.waitForTimeout(300);
  await popup.screenshot({ path: `${OUT}/diag-2-popup-panels-open.png`, fullPage: true });
  console.log('shot 2: panels expanded');

  // 넓은 탭 앱(surface=tab) 참고 샷
  const tab = await context.newPage();
  await tab.setViewportSize({ width: 900, height: 1000 });
  await tab.goto(`chrome-extension://${extensionId}/app.html?locale=ko`);
  await tab.waitForTimeout(400);
  await tab.screenshot({ path: `${OUT}/diag-3-tabapp.png`, fullPage: true });
  console.log('shot 3: tab app (wide)');
} finally {
  await context.close();
}
