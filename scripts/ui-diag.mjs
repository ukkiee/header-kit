/**
 * UI 진단 — 실 확장을 로드해 팝업(760×580 단일 셸, ADR 0005) + 한국어 + 실데이터로
 * 팝업을 렌더하고 스크린샷을 떠서 레이아웃 문제를 전수 확인한다. 가로 오버플로와
 * 팝업 시작 성능은 진단 실패(exit 1)로 처리한다.
 * 실행: bun run build && node scripts/ui-diag.mjs
 * 기준선 재측정: bun run build && DIAG_WRITE_BASELINE=1 node scripts/ui-diag.mjs
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const EXT_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.output/chrome-mv3');
const OUT = process.env.DIAG_OUT || '/tmp';

/**
 * 팝업 시작 성능 (plan r1 R-4) — 번들 게이트는 바이트만 재므로 한도 안에 있으면서도
 * 첫 페인트가 느려질 수 있다. 여기서 실 확장·실데이터로 두 지표를 재고 기준선 대비
 * 회귀를 실패로 잡는다.
 *
 * 한계: 이 수치는 기기 의존적이다. CI의 절대 게이트가 아니며, 유효한 비교는 **같은
 * 기기에서 기준선 대비**뿐이다. 다른 기기의 기준선으로 판정하면 의미가 없다.
 */
const PERF_SAMPLES = 5; // 채택 표본 수 (중앙값)
const PERF_WARMUP = 1; // 버리는 워밍업 로드 수 — 첫 로드의 리소스 캐시 효과를 표본에서 제외한다
const PERF_TOLERANCE_RATIO = 1.3;
const PERF_TOLERANCE_ABS_MS = 150;
const BASELINE_FILE = 'docs/reviews/ui-polish/perf-baseline.md';

/** 배수만 쓰면 작은 절대값에서 과민해지고 절대값만 쓰면 느린 기기에서 무뎌지므로 병용한다. */
const perfCeiling = (baseline) =>
  Math.max(baseline * PERF_TOLERANCE_RATIO, baseline + PERF_TOLERANCE_ABS_MS);

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * 페이지 내부에 두 지표의 관측자를 문서 시작 시점에 심는다. 상호작용 준비를 Playwright
 * 쪽에서 폴링해 재면 측정 대상이 앱이 아니라 자동화 왕복이 되므로, 시각은 반드시
 * 페이지 안에서 `performance.now()`로 찍는다(첫 렌더와 같은 timeOrigin 기준).
 */
const startupProbe = () => {
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      // buffered — 관측자 설치 전에 이미 발생한 페인트도 받는다.
      if (entry.name === 'first-contentful-paint') window.__diagFirstPaint = entry.startTime;
    }
  }).observe({ type: 'paint', buffered: true });

  // 상호작용 준비 = 규칙 추가 버튼이 존재하고 **활성화**된 순간. 존재만으로는 부족하다.
  // 주의 — 이 시각은 DOM 삽입 시점이라 first paint보다 **빠를 수 있다**(실측 확인).
  // 두 지표는 시작 구간의 양 끝을 잡는 것이지 서로의 상한이 아니다.
  const READY_LABEL = 'Add rule';
  const isReady = () => {
    for (const el of document.querySelectorAll('button')) {
      if (el.disabled) continue;
      const name = el.getAttribute('aria-label') ?? el.textContent?.trim();
      if (name === READY_LABEL) {
        window.__diagInteractive = performance.now();
        observer.disconnect();
        return true;
      }
    }
    return false;
  };
  const observer = new MutationObserver(isReady);
  // attributes까지 보는 이유 — 버튼이 disabled로 먼저 붙었다가 풀리는 경우를 놓치지 않는다.
  if (!isReady()) observer.observe(document, { childList: true, subtree: true, attributes: true });
};

/** 기준선 파일의 json 블록을 읽는다. 파일이 없으면 null, 있는데 깨졌으면 던진다. */
function readBaseline() {
  if (!existsSync(BASELINE_FILE)) return null;
  const fence = readFileSync(BASELINE_FILE, 'utf8').match(/```json\n([\s\S]*?)```/);
  if (!fence) throw new Error(`${BASELINE_FILE}에 json 블록이 없습니다`);
  const parsed = JSON.parse(fence[1]);
  for (const key of ['firstPaintMs', 'interactiveMs']) {
    if (typeof parsed[key]?.median !== 'number') {
      throw new Error(`${BASELINE_FILE}의 ${key}.median이 숫자가 아닙니다`);
    }
  }
  return parsed;
}

/** 기준선 문서 — 사람이 읽을 맥락 + 스크립트가 읽을 json 블록을 한 파일에 둔다. */
const baselineDoc = (measured, device) => `# 팝업 시작 성능 기준선 — ui-polish

이 피처의 UI 변경이 **들어가기 전** 빌드에서 측정한 값이다. 이후 진단 실행은 이 값을
기준으로 회귀를 판정한다(상한 = \`max(기준선 × ${PERF_TOLERANCE_RATIO}, 기준선 + ${PERF_TOLERANCE_ABS_MS}ms)\`).

- **first paint** (\`firstPaintMs\`) — 팝업 문서의 first-contentful-paint
- **dom ready** (\`interactiveMs\`) — 문서 시작부터 규칙 추가 버튼이 존재하고 활성화될
  때까지. 페이지 내부 시계로 재 자동화 왕복 지연이 섞이지 않는다
- 표본 ${PERF_SAMPLES}회(매회 새 문서), 워밍업 ${PERF_WARMUP}회 폐기, 중앙값 채택

**두 지표의 관계** — dom ready는 DOM 삽입 시점을 찍으므로 first paint보다 **빠를 수
있다**(이 기준선이 실제로 그렇다). 사용자가 실제로 누를 수 있는 시점은 둘 중 나중이다.
두 값은 시작 구간의 양 끝을 잡는 것이지 서로의 상한이 아니며, 회귀는 각각 독립으로
판정한다 — 렌더 비용이 늘면 dom ready가, 페인트가 밀리면 first paint가 먼저 움직인다.

**한계 — 이 수치는 기기 의존적이다.** CI의 절대 게이트가 아니며, 유효한 비교는 **같은
기기에서 이 기준선 대비**뿐이다. 다른 기기에서 뜬 기준선으로 판정하면 통과도 실패도
의미가 없다. 기기가 바뀌면 변경 전 빌드로 되돌려 다시 떠야 한다.

측정 기기: \`${device}\`

\`\`\`json
${JSON.stringify(measured, null, 2)}
\`\`\`

재측정: \`bun run build && DIAG_WRITE_BASELINE=1 node scripts/ui-diag.mjs\`
`;

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
        // 조건이 붙은 규칙 (ADR 0010) — 요약의 'Conditions: n' 표기와 폼 disclosure를 감사한다.
        { kind: 'request-header', id: 'm1', name: 'Authorization', value: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.veryLongTokenValueThatShouldNotBreakTheRowLayoutAtAll.{{uuid}}', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '스테이징 토큰',
          urlFilter: 'api\\.staging\\.example\\.com',
          conditions: { resourceTypes: ['xmlhttprequest', 'script'], tabDomains: ['example.com'], expiresAt: Date.now() + 3_600_000 } },
        { kind: 'response-header', id: 'm2', name: 'X-Frame-Options', value: 'DENY', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '',
          conditions: { excludedDomains: ['cdn.example.com'] } },
        { kind: 'cookie', id: 'm3', name: 'session', value: 'abc', enabled: true, mode: 'append', emptyMeans: 'remove', comment: '' },
        { kind: 'csp', id: 'm4', directives: [{ name: 'default-src', value: "'self'" }], comment: '', enabled: true },
        { kind: 'redirect', id: 'm5', pattern: '^https://prod\\.example\\.com/(.*)', substitution: 'http://localhost:3000/\\1', comment: '', enabled: true },
      ],
    },
    { id: 'p2', name: '두 번째 프로필', active: false, shortLabel: '2', color: '#2563eb', modifications: [] },
    // 사이드바 truncate 경계 — 긴 en/ko 이름 + 다수 프로필 (ADR 0005 단일 셸).
    { id: 'p3', name: '아주 길고 긴 한국어 프로필 이름은 목록에서 잘려야 한다', active: true, shortLabel: '긴', color: '#16a34a', modifications: [] },
    { id: 'p4', name: 'A very long English profile name that must truncate', active: false, shortLabel: 'EN', color: '#dc2626', modifications: [] },
    { id: 'p5', name: 'QA', active: true, shortLabel: 'QA', color: '#7c3aed', modifications: [] },
    { id: 'p6', name: 'Perf', active: false, shortLabel: 'PF', color: '#0891b2', modifications: [] },
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

  // 팝업 시작 성능 (R-4) — 경계 프로필을 붙이기 **전에** 잰다. 지표는 위 richState라는
  // 대표 데이터 기준이어야 하고, 프로필 18개로 불린 뒤 재면 다른 것을 재게 된다.
  const samples = { firstPaintMs: [], interactiveMs: [] };
  for (let i = 0; i < PERF_WARMUP + PERF_SAMPLES; i++) {
    const perfPage = await context.newPage();
    await perfPage.addInitScript(startupProbe);
    await perfPage.setViewportSize({ width: 760, height: 600 });
    // ?locale=en — 준비 신호를 버튼 라벨로 잡으므로 로케일이 고정돼야 선택이 흔들리지 않는다.
    await perfPage.goto(`chrome-extension://${extensionId}/popup.html?locale=en`);
    await perfPage.waitForFunction(
      () => window.__diagFirstPaint !== undefined && window.__diagInteractive !== undefined,
      null,
      { timeout: 15_000 },
    );
    const run = await perfPage.evaluate(() => ({
      firstPaintMs: window.__diagFirstPaint,
      interactiveMs: window.__diagInteractive,
    }));
    await perfPage.close();
    if (i < PERF_WARMUP) continue;
    samples.firstPaintMs.push(run.firstPaintMs);
    samples.interactiveMs.push(run.interactiveMs);
  }

  const measured = {
    firstPaintMs: { median: median(samples.firstPaintMs), samples: samples.firstPaintMs },
    interactiveMs: { median: median(samples.interactiveMs), samples: samples.interactiveMs },
  };
  const device = `${os.platform()}/${os.arch()} · ${os.cpus()[0]?.model ?? 'unknown'} · ${(os.totalmem() / 1024 ** 3).toFixed(0)}GB`;
  const ms = (n) => `${n.toFixed(1)}ms`;
  const raw = (list) => list.map((v) => v.toFixed(0)).join(', ');
  console.log(
    `popup startup (표본 ${PERF_SAMPLES} · 워밍업 ${PERF_WARMUP} 폐기 · 중앙값)\n` +
      `  first paint  ${ms(measured.firstPaintMs.median)}  [${raw(samples.firstPaintMs)}]\n` +
      `  dom ready    ${ms(measured.interactiveMs.median)}  [${raw(samples.interactiveMs)}]  (버튼 존재·활성 — 삽입 시점이라 paint보다 빠를 수 있음)\n` +
      `  device: ${device}`,
  );

  if (process.env.DIAG_WRITE_BASELINE) {
    writeFileSync(BASELINE_FILE, baselineDoc(measured, device));
    console.log(`  기준선을 ${BASELINE_FILE}에 기록했습니다 — 변경 전 빌드인지 확인하세요.`);
  }

  let baseline = null;
  let baselineError = null;
  try {
    baseline = readBaseline();
  } catch (error) {
    baselineError = error;
  }
  if (baselineError) {
    // 깨진 기준선을 "기준선 없음"으로 넘기면 게이트가 조용히 무력화된다 — 실패로 처리한다.
    console.error(`FAIL: 기준선을 읽을 수 없습니다 — ${baselineError.message}`);
    process.exitCode = 1;
  } else if (!baseline) {
    console.log('  기준선 없음 — 측정치만 출력하고 판정하지 않습니다.');
  } else {
    for (const [key, label] of [
      ['firstPaintMs', 'first paint'],
      ['interactiveMs', 'dom ready  '],
    ]) {
      const base = baseline[key].median;
      const ceiling = perfCeiling(base);
      const now = measured[key].median;
      const pass = now <= ceiling;
      console.log(
        `  ${label} ${ms(now)} vs 기준선 ${ms(base)} → 상한 ${ms(ceiling)} ` +
          `= max(×${PERF_TOLERANCE_RATIO}, +${PERF_TOLERANCE_ABS_MS}ms) — ${pass ? 'PASS' : 'FAIL'}`,
      );
      if (!pass) process.exitCode = 1;
    }
  }

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
