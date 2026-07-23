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

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT_PATH = path.join(REPO_ROOT, '.output/chrome-mv3');
const OUT = process.env.DIAG_OUT || '/tmp';

/** 팝업 크기 — ADR 0005의 고정 셸(760×580). 계측은 실제 팝업과 같은 크기에서 재야 한다. */
const POPUP_SIZE = { width: 760, height: 580 };

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
/**
 * 스크립트 기준 절대 경로 — cwd 상대로 두면 저장소 루트 밖에서 실행할 때 파일이 없는
 * 것으로 보여 "기준선 없음" 분기를 타고, 이 게이트가 조용히 무장 해제된다.
 */
const BASELINE_FILE = path.join(REPO_ROOT, 'docs/reviews/ui-polish/perf-baseline.md');
const BASELINE_REL = path.relative(REPO_ROOT, BASELINE_FILE);

/** 지표 정의의 단일 출처 — 읽기·판정·출력이 같은 표를 본다. */
const METRICS = [
  { key: 'firstPaintMs', label: 'first paint' },
  { key: 'interactiveMs', label: 'dom ready' },
];

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

  // 상호작용 준비 = 아래 라벨의 버튼이 존재하고 **활성화**된 순간. 존재만으로는 부족하다.
  // 주의 — 이 시각은 DOM 삽입 시점이라 first paint보다 **빠를 수 있다**(실측 확인).
  // 두 지표는 시작 구간의 양 끝을 잡는 것이지 서로의 상한이 아니다.
  // READY_LABEL은 i18n 카탈로그의 en `addRule` 값을 그대로 적은 것이다(브라우저 컨텍스트로
  // 직렬화되는 함수라 import할 수 없다). 카탈로그가 바뀌면 아래 실행부가 읽을 수 있는
  // 오류로 알려준다 — 조용한 타임아웃으로 끝나지 않는다.
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
  if (!fence) throw new Error(`${BASELINE_REL}에 json 블록이 없습니다`);
  const parsed = JSON.parse(fence[1]);
  for (const { key } of METRICS) {
    if (typeof parsed[key]?.median !== 'number') {
      throw new Error(`${BASELINE_REL}의 ${key}.median이 숫자가 아닙니다`);
    }
  }
  return parsed;
}

/** 기준선 문서 — 사람이 읽을 맥락 + 스크립트가 읽을 json 블록을 한 파일에 둔다. */
const baselineDoc = (measured, device) => `# 팝업 시작 성능 기준선 — ui-polish

<!-- 생성물 — scripts/ui-diag.mjs가 DIAG_WRITE_BASELINE=1로 덮어쓴다. 손으로 고치면
     다음 재측정에서 사라지므로, 문구를 바꾸려면 스크립트의 baselineDoc()을 고칠 것. -->

이 피처의 UI 변경이 **들어가기 전** 빌드에서 측정한 값이다. 이후 진단 실행은 이 값을
기준으로 회귀를 판정한다(상한 = \`max(기준선 × ${PERF_TOLERANCE_RATIO}, 기준선 + ${PERF_TOLERANCE_ABS_MS}ms)\`).

- **first paint** (\`firstPaintMs\`) — 팝업 문서의 first-contentful-paint
- **dom ready** (\`interactiveMs\`) — 문서 시작부터 \`Add rule\` 라벨의 버튼이 존재하고
  활성화될 때까지. 페이지 내부 시계로 재 자동화 왕복 지연이 섞이지 않는다
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

  // 스크린샷 페이지는 세로 600 — ADR 0005의 580보다 조금 높게 잡아 하단이 잘리지 않은
  // 전체 샷을 얻는다(기존 동작 유지). 계측 페이지는 아래에서 실제 팝업 크기로 잰다.
  const popup = await context.newPage();
  await popup.setViewportSize({ width: POPUP_SIZE.width, height: 600 });
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

  /**
   * 팝업 시작 성능 (R-4). 배치가 곧 측정 조건이다 — 두 가지를 동시에 만족해야 한다.
   *
   * 1. **다른 페이지가 없어야 한다.** 동일 출처 확장 문서는 렌더러 프로세스를 공유하므로
   *    스크린샷용 팝업·탭이 떠 있으면 그 작업이 매 측정과 경합해, 시작 회귀가 아닌 잡음을
   *    지표에 싣는다(이후 티켓이 그 표면에 모션을 얹으면 악화된다). 그래서 먼저 닫는다.
   * 2. **프로세스는 데워져 있어야 한다.** 반대로 스크린샷보다 앞서 재면 확장이 콜드라
   *    초기 표본이 두 배까지 튀고(실측), 워밍업 1회로는 걷히지 않아 중앙값이 불안정해진다.
   *
   * 경계 프로필을 붙이기 전이기도 하다 — 지표는 위 richState라는 대표 데이터 기준이고,
   * 프로필 18개로 불린 뒤 재면 다른 것을 재게 된다.
   */
  await popup.close();
  await tab.close();

  const samples = Object.fromEntries(METRICS.map(({ key }) => [key, []]));
  for (let i = 0; i < PERF_WARMUP + PERF_SAMPLES; i++) {
    const perfPage = await context.newPage();
    await perfPage.addInitScript(startupProbe);
    await perfPage.setViewportSize(POPUP_SIZE);
    // ?locale=en — 준비 신호를 버튼 라벨로 잡으므로 로케일이 고정돼야 선택이 흔들리지 않는다.
    await perfPage.goto(`chrome-extension://${extensionId}/popup.html?locale=en`);
    try {
      await perfPage.waitForFunction(
        () => window.__diagFirstPaint !== undefined && window.__diagInteractive !== undefined,
        null,
        { timeout: 15_000 },
      );
    } catch {
      // 준비 라벨을 못 찾은 것이 압도적으로 흔한 원인이다 — 원인을 지목해서 알린다.
      throw new Error(
        '팝업 시작 지표를 관측하지 못했습니다. startupProbe의 READY_LABEL이 ' +
          'src/core/i18n.ts의 en `addRule` 값과 일치하는지 확인하세요.',
      );
    }
    const run = await perfPage.evaluate(() => ({
      firstPaintMs: window.__diagFirstPaint,
      interactiveMs: window.__diagInteractive,
    }));
    await perfPage.close();
    if (i < PERF_WARMUP) continue;
    for (const { key } of METRICS) samples[key].push(run[key]);
  }

  const measured = Object.fromEntries(
    METRICS.map(({ key }) => [key, { median: median(samples[key]), samples: samples[key] }]),
  );
  const device = `${os.platform()}/${os.arch()} · ${os.cpus()[0]?.model ?? 'unknown'} · ${(os.totalmem() / 1024 ** 3).toFixed(0)}GB`;
  const ms = (n) => `${n.toFixed(1)}ms`;
  const pad = (s) => s.padEnd(Math.max(...METRICS.map((m) => m.label.length)));
  console.log(
    `popup startup (표본 ${PERF_SAMPLES} · 워밍업 ${PERF_WARMUP} 폐기 · 중앙값)\n` +
      METRICS.map(
        ({ key, label }) =>
          `  ${pad(label)}  ${ms(measured[key].median)}  [${samples[key].map((v) => v.toFixed(0)).join(', ')}]`,
      ).join('\n') +
      '\n  dom ready는 DOM 삽입 시점이라 first paint보다 빠를 수 있습니다 (서로의 상한이 아님).' +
      `\n  device: ${device}`,
  );

  if (process.env.DIAG_WRITE_BASELINE) {
    writeFileSync(BASELINE_FILE, baselineDoc(measured, device));
    console.log(`  기준선을 ${BASELINE_REL}에 기록했습니다 — 변경 전 빌드인지 확인하세요.`);
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
    console.log(`  기준선 없음(${BASELINE_REL}) — 측정치만 출력하고 판정하지 않습니다.`);
  } else {
    for (const { key, label } of METRICS) {
      const base = baseline[key].median;
      const ceiling = perfCeiling(base);
      const now = measured[key].median;
      const pass = now <= ceiling;
      console.log(
        `  ${pad(label)} ${ms(now)} vs 기준선 ${ms(base)} → 상한 ${ms(ceiling)} ` +
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
  // 계측을 위해 위에서 스크린샷 페이지들을 닫았으므로 경계 검증용 팝업을 새로 연다.
  // 새 페이지는 기본이 light 스킴이라 다크 에뮬레이션을 되돌릴 필요가 없다.
  const boundaryPopup = await context.newPage();
  await boundaryPopup.setViewportSize({ width: POPUP_SIZE.width, height: 600 });
  await boundaryPopup.goto(`chrome-extension://${extensionId}/popup.html?locale=ko`);
  await boundaryPopup.waitForTimeout(500);
  await boundaryPopup.screenshot({ path: `${OUT}/diag-6-popup-boundary.png`, fullPage: true });
  // 문서 수준 오버플로 + 요소 수준 가로 스크롤러 스캔 — 스펙은 내부 가로 스크롤
  // 표면 자체를 금지하므로(칩 결정), 내부에서 스크롤로 흡수된 오버플로도 실패다.
  //
  // ui-polish 02 검토 결과 — ScrollArea viewport를 이 스캔에서 **제외하지 않는다.**
  // 스펙은 viewport가 `overflow: scroll`이라 걸릴 것을 우려해 예외를 두라고 했지만,
  // 이 스캔은 `scrollWidth > clientWidth`를 함께 요구한다. ScrollArea.Content
  // (min-width: fit-content)를 쓰지 않기로 해 실제 가로 오버플로가 없고, 실측에서도
  // inner-scrollers=0이라 예외가 필요 없었다. 오히려 예외를 두면 viewport가 가로
  // 오버플로를 **보이지 않는 스크롤로 조용히 흡수**하는 경우를 놓친다 — 세로 스크롤바만
  // 렌더하므로 사용자에겐 아무 단서가 없는 바로 그 상황이다. 예외 없이 두는 편이 세다.
  const { overflowPx, innerScrollers } = await boundaryPopup.evaluate(() => {
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
