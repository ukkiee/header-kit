/**
 * UI 진단 — 실 확장을 로드해 팝업(760×580 단일 셸, ADR 0005) + 한국어 + 실데이터로
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
        { kind: 'request-header', id: 'm1', name: 'Authorization', value: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.veryLongTokenValueThatShouldNotBreakTheRowLayoutAtAll.{{uuid}}', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '스테이징 토큰' },
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
    // 사이드바 truncate 경계 — 긴 en/ko 이름 + 다수 프로필 (ADR 0005 단일 셸).
    { id: 'p3', name: '아주 길고 긴 한국어 프로필 이름은 목록에서 잘려야 한다', active: true, shortLabel: '긴', color: '#16a34a', modifications: [], filters: [] },
    { id: 'p4', name: 'A very long English profile name that must truncate', active: false, shortLabel: 'EN', color: '#dc2626', modifications: [], filters: [] },
    { id: 'p5', name: 'QA', active: true, shortLabel: 'QA', color: '#7c3aed', modifications: [], filters: [] },
    { id: 'p6', name: 'Perf', active: false, shortLabel: 'PF', color: '#0891b2', modifications: [], filters: [] },
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
  await popup.setViewportSize({ width: 760, height: 600 });
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

  // 다크 테마 — prefers-color-scheme 에뮬레이션으로 양 표면을 감사한다.
  await popup.emulateMedia({ colorScheme: 'dark' });
  await popup.waitForTimeout(200);
  await popup.screenshot({ path: `${OUT}/diag-4-popup-dark.png`, fullPage: true });
  console.log('shot 4: popup (dark)');

  await tab.emulateMedia({ colorScheme: 'dark' });
  await tab.waitForTimeout(200);
  await tab.screenshot({ path: `${OUT}/diag-5-tabapp-dark.png`, fullPage: true });
  console.log('shot 5: tab app (dark)');

  // 경계: 다수 프로필 + 최대 길이 en/ko 이름 — 사이드바 목록이 길어져도 팝업 가로
  // 오버플로가 없어야 한다. 오버플로는 진단 실패(exit 1)로 처리한다.
  const boundaryProfiles = Array.from({ length: 12 }, (_, i) => ({
    id: `bnd${i}`,
    name: i % 2
      ? `아주 길고 긴 한국어 프로필 이름 경계 검증 ${i} — 칩과 사이드바에서 반드시 잘려야 한다`
      : `An extremely long English profile name for boundary verification ${i} that must truncate`,
    active: i % 3 === 0,
    shortLabel: `B${i % 10}`,
    color: '#2563eb',
    modifications: [],
    filters: [],
  }));
  await sw.evaluate(async (profiles) => {
    const { state } = await chrome.storage.local.get('state');
    state.profiles = [...state.profiles, ...profiles];
    await chrome.storage.local.set({ state });
  }, boundaryProfiles);
  await popup.emulateMedia({ colorScheme: 'light' });
  await popup.reload();
  await popup.waitForTimeout(500);
  await popup.screenshot({ path: `${OUT}/diag-6-popup-boundary.png`, fullPage: true });
  // 문서 수준 오버플로 + 요소 수준 가로 스크롤러 스캔 — 스펙은 내부 가로 스크롤
  // 표면 자체를 금지하므로(칩 결정), 내부에서 스크롤로 흡수된 오버플로도 실패다.
  const { overflowPx, innerScrollers } = await popup.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('*')) {
      const st = getComputedStyle(el);
      if ((st.overflowX === 'auto' || st.overflowX === 'scroll') && el.scrollWidth > el.clientWidth) {
        bad.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`);
      }
    }
    return {
      overflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      innerScrollers: bad,
    };
  });
  console.log(
    `shot 6: popup boundary (18 profiles, max-length names) — overflow=${overflowPx}px, inner-scrollers=${innerScrollers.length}`,
  );
  if (overflowPx > 0 || innerScrollers.length > 0) {
    console.error(`FAIL: horizontal overflow (${overflowPx}px) or inner scrollers [${innerScrollers.join(', ')}]`);
    process.exitCode = 1;
  }
} finally {
  await context.close();
}
