/**
 * 실브라우저 스모크 (이슈 01 인수 조건):
 *  A. 팝업 상태 → storage → session rule → 실요청 헤더 적용/해제
 *  B. PRD 검증 항목 ①: allow 규칙 vs 낮은 priority modifyHeaders 우선순위 상호작용
 *  C. PRD 검증 항목 ②: 5,000 규칙 규모의 session rules 전량 교체
 *
 * 실행: bun run build && bun run smoke
 */
import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { artifactsDirFrom, missingArtifacts, tokenFail } from './artifacts-arg.mjs';
import { POPUP_FADE_S, ROW_TRANSITION } from '../src/ui/motion-tokens.ts';
import { EXPORT_FORMAT_VERSION } from '../src/core/format-version.ts';

// 러너가 `--artifacts`로 이 회차의 빌드 경로를 넘긴다 (D4a). 인자 없이 직접 부르면
// 기존 기본 경로다. 판정은 `PASS|FAIL smoke:` 한 줄로 말한다 — verdict: token 계약.
const failSmoke = tokenFail('smoke');
const parsedArtifacts = artifactsDirFrom(
  process.argv.slice(2),
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.output/chrome-mv3'),
);
if (parsedArtifacts.error) failSmoke(parsedArtifacts.error);
const EXT_PATH = path.resolve(parsedArtifacts.dir);
// 브라우저를 띄우기 **전에** 거른다 — 없는 확장을 로드하려다 나오는 크로미움 오류는
// "산출물이 없다"를 말해 주지 않는다.
if (!existsSync(EXT_PATH)) failSmoke(missingArtifacts(EXT_PATH));

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function startEchoServer() {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/headers')) {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(req.headers));
      return;
    }
    if (req.url.startsWith('/setcookie')) {
      // 요청의 Cookie 헤더를 되비춰 준다 (쿠키 수정 스모크).
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ cookie: req.headers.cookie ?? null }));
      return;
    }
    if (req.url.startsWith('/withcookie')) {
      // 서버가 기준 Set-Cookie를 내려준다 — override/block 대조용.
      res.setHeader('set-cookie', 'server_cookie=base; Path=/');
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    // path를 body로 반영해 redirect 착지 지점을 감지할 수 있게 한다.
    res.setHeader('content-type', 'text/html');
    res.end(`<!doctype html><title>echo</title>${req.url}`);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port };
}

async function fetchEchoHeaders(page, path = '/headers', method = 'GET') {
  return page.evaluate(
    async ({ path, method }) => {
      const res = await fetch(path, { cache: 'no-store', method });
      return res.json();
    },
    { path, method },
  );
}

/**
 * 목록 행 enter/exit가 끝나기까지의 대기(ms) — `ROW_TRANSITION`에서 **유도한다.**
 *
 * 예전에는 이 자리마다 200ms를 손으로 적었다. 전이가 180ms일 땐 넉넉했는데 260ms로
 * 늘리자 폼이 아직 빠지는 중에 다음 조작이 들어가 N26이 통째로 무너졌다(폼이 이미
 * 닫혀 Cancel을 못 찾았다). 테스트가 자기 숫자를 들고 있으면 값이 바뀌는 순간 어긋난다.
 */
const rowSettleMs = () => Math.round(ROW_TRANSITION.duration * 1000) + 120;

/**
 * 폼의 저장 버튼 — 새 규칙이면 `Save`, 편집이면 `Save changes`다 (ADR 0017, story 29).
 *
 * 대부분의 시나리오에는 **어느 쪽인지가 관심사가 아니다** — 저장을 누르는 것이 목적이다.
 * 자리마다 어느 글자인지 적어 두면 그 글자가 바뀔 때 관계없는 시나리오 서른 개가 함께
 * 무너지고, 정작 "글자가 두 경우에 다르다"는 계약은 아무 데서도 재지 않게 된다. 그 계약은
 * N47 한 자리가 전담한다.
 */
const SAVE_BUTTON = /^Save( changes)?$/;

/**
 * 레일 화면이 실제로 그려질 때까지 기다린다 (티켓 09).
 *
 * 예전에는 접이식 패널을 열린 상태로 만드는 `ensurePanelOpen`이었다. 백업·설정이 시안의
 * **카드**가 되면서 접기가 없어졌으므로 열 것이 없다 — 기다릴 것은 그 화면의 카드 제목이다.
 * 명시적으로 기다리는 목적 자체는 그대로다: 레일 전환이 cross-fade라, 누른 직후에 안쪽을
 * 만지면 아직 이전 화면이 서 있다.
 */
async function settleScreen(page, cardTitle) {
  await page.getByText(cardTitle, { exact: true }).first().waitFor({ timeout: 5000 });
  await page.waitForTimeout(150);
}

/** 범용 폴러 — probe를 test가 참일 때까지 재시도하고 마지막 값을 돌려준다. */
async function pollUntil(probe, test, timeoutMs = 8000, intervalMs = 200) {
  const start = Date.now();
  let value;
  while (Date.now() - start < timeoutMs) {
    value = await probe();
    if (test(value)) return value;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return value;
}

/**
 * 배지 문구가 기대값이 될 때까지 기다린다 — 배지는 재조정 **뒤에** 그려진다.
 *
 * D 구간의 지역 상수였는데 F3도 같은 것을 쓰게 되어 파일 스코프로 올렸다 (티켓 10):
 * 배지 수 회귀를 재는 표본이 만료 규칙 하나뿐이 아니게 됐다는 뜻이다.
 */
function pollBadgeText(sw, expected, timeoutMs = 3000) {
  return pollUntil(
    () => sw.evaluate(() => chrome.action.getBadgeText({})),
    (t) => t === expected,
    timeoutMs,
    100,
  );
}

async function pollSessionRuleCount(sw, expected, timeoutMs = 15000) {
  const count = await pollUntil(
    () => sw.evaluate(async () => {
      const rules = await chrome.declarativeNetRequest.getSessionRules();
      return rules.length;
    }),
    (c) => c === expected,
    timeoutMs,
    100,
  );
  if (count !== expected) throw new Error(`session rule count ${count} !== expected ${expected}`);
  return count;
}

/*
 * 규칙 **내용** 배리어 (티켓 14) — 개수 배리어가 무효인 자리에서 쓴다.
 *
 * `pollSessionRuleCount`는 `rules.length`만 본다. `replaceSessionRules`는 단일 원자
 * `updateSessionRules`라 1개 → 1개 교체에서 개수가 기대치를 한 번도 벗어나지 않는다.
 * 그래서 개수 배리어는 `pollUntil`의 **첫 프로브**(첫 sleep 전이다)에서 **이전 테스트의
 * 규칙 세트**로 즉시 만족되고, 단언이 정확히 한 테스트씩 밀린다(M2b가 이전 시드의
 * `existing=preset`을 관측한 그 결함). ADR 0002가 규칙 공백을 감수한다고 정한 이상
 * 준비 상태는 **가정이 아니라 관측**해야 한다.
 *
 * predicate는 Node 쪽에서 돈다 — evaluate로는 규칙 배열만 넘겨받아 직렬화 문제를 피한다.
 * 타임아웃이면 **마지막으로 본 규칙 세트를 담아** 실패한다. 진짜 회귀가 조용히 통과하면
 * 안 되므로 여기서 record를 완화하지 않는다.
 */
async function pollSessionRuleMatch(sw, predicate, label, timeoutMs = 15000) {
  const safe = (rules) => {
    try {
      return predicate(rules ?? []);
    } catch {
      return false;
    }
  };
  const rules = await pollUntil(
    () => sw.evaluate(async () => await chrome.declarativeNetRequest.getSessionRules()),
    safe,
    timeoutMs,
    100,
  );
  if (!safe(rules)) {
    throw new Error(`session rules never matched ${label}; last seen ${JSON.stringify(rules)}`);
  }
  return rules;
}

/** 규칙 세트가 낸 요청·응답 헤더 연산 전부 — 어느 쪽에 실렸는지는 배리어의 관심사가 아니다. */
const headerOps = (rules) =>
  rules.flatMap((r) => [...(r.action?.requestHeaders ?? []), ...(r.action?.responseHeaders ?? [])]);

/** "이 헤더에 이런 연산이 실린 규칙이 지금 설치돼 있다" — 이번 시드의 양성 증거. */
const headerOpLive = (name, match = () => true) => (rules) =>
  headerOps(rules).some((h) => h.header?.toLowerCase() === name.toLowerCase() && match(h));

/*
 * 안정화 폴링 (티켓 14) — 전이 **중간 프레임**을 표본으로 삼지 않는다.
 *
 * 고정 대기로 색을 읽으면 Tailwind `transition-colors` 기본 150ms와 정확히 겹쳐
 * 라이트·다크 사이의 보간값(예: rgb(30, 80, 218))을 읽는다. 채널당 1~2 차이라
 * 단언은 실패하는데 원인은 제품이 아니라 표본 추출 시점이다.
 *
 * **기댓값을 향해 폴링하지 않는다** — "연속 2회 같은 값"만 기다린다. 그래야 단언 강도가
 * 그대로 유지된다. 안정되지 않으면 마지막 값을 담아 실패한다.
 */
async function pollStable(probe, label, timeoutMs = 2000, intervalMs = 50) {
  const start = Date.now();
  let previous = await probe();
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const next = await probe();
    if (next === previous) return next;
    previous = next;
  }
  throw new Error(`${label} never stabilized within ${timeoutMs}ms; last seen ${previous}`);
}

const { server, port } = await startEchoServer();
const origin = `http://127.0.0.1:${port}`;

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  // UI 언어를 고정해 i18n 라벨(Pause/Open in tab…)이 결정적이게 한다.
  args: [
    `--disable-extensions-except=${EXT_PATH}`,
    `--load-extension=${EXT_PATH}`,
    '--lang=en-US',
  ],
});

try {
  const sw =
    context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extensionId = new URL(sw.url()).host;

  // ---------- A. 팝업 UI → 상태 → 규칙 → 실요청 ----------
  // 비활성 Profile + 헤더 행을 심고, 켜고 끄는 조작은 실제 팝업 UI로 수행한다.
  await sw.evaluate(async () => {
    await chrome.storage.local.set({
      state: {
        schemaVersion: 1,
        paused: false,
        profiles: [
          {
            id: 'p1',
            name: 'Smoke',
            active: false,
            shortLabel: 'S',
            color: '#2563eb',
            modifications: [
              { kind: 'request-header', id: 'm1', name: 'X-HeaderKit-Smoke', value: 'ok', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
            ],
          },
        ],
      },
    });
  });

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html?locale=en`);
  const toggle = popup.getByRole('switch', { name: 'Toggle Smoke' });

  await toggle.click();
  await pollSessionRuleCount(sw, 1);

  const page = await context.newPage();
  await page.goto(origin);
  let headers = await fetchEchoHeaders(page);
  record('A1: 팝업 토글 on → 헤더가 실요청에 적용', headers['x-headerkit-smoke'] === 'ok',
    `x-headerkit-smoke=${headers['x-headerkit-smoke']}`);

  await toggle.click();
  await pollSessionRuleCount(sw, 0);
  headers = await fetchEchoHeaders(page);
  record('A2: 팝업 토글 off → 헤더 즉시 제거', headers['x-headerkit-smoke'] === undefined,
    `x-headerkit-smoke=${headers['x-headerkit-smoke']}`);

  // ---------- B. 검증 항목 ①: allow vs modifyHeaders ----------
  const applyExp = (rules) =>
    sw.evaluate(async (addRules) => {
      const existing = await chrome.declarativeNetRequest.getSessionRules();
      await chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: existing.map((r) => r.id),
        addRules,
      });
    }, rules);

  const modifyRule = (id, priority) => ({
    id,
    priority,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [{ header: 'X-Exp-One', operation: 'set', value: 'mod' }],
    },
    condition: { urlFilter: '127.0.0.1', resourceTypes: ['xmlhttprequest'] },
  });
  const allowRule = (id, priority) => ({
    id,
    priority,
    action: { type: 'allow' },
    condition: { urlFilter: '127.0.0.1', resourceTypes: ['xmlhttprequest'] },
  });

  await applyExp([modifyRule(9001, 1), allowRule(9002, 2)]);
  headers = await fetchEchoHeaders(page);
  record('B1: 높은 priority allow가 낮은 priority modifyHeaders를 무효화',
    headers['x-exp-one'] === undefined, `x-exp-one=${headers['x-exp-one']}`);

  await applyExp([modifyRule(9001, 2), allowRule(9002, 1)]);
  headers = await fetchEchoHeaders(page);
  record('B2: modifyHeaders가 allow보다 높은 priority면 적용됨',
    headers['x-exp-one'] === 'mod', `x-exp-one=${headers['x-exp-one']}`);

  // ---------- C. 검증 항목 ②: 5,000 규칙 전량 교체 ----------
  const bulk = (count) =>
    Array.from({ length: count }, (_, i) => ({
      id: 10_000 + i,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [{ header: `X-Bulk-${i}`, operation: 'set', value: String(i) }],
      },
      condition: { urlFilter: `bulk-${i}.invalid`, resourceTypes: ['xmlhttprequest'] },
    }));

  const t0 = Date.now();
  await applyExp(bulk(5000));
  const addMs = Date.now() - t0;
  const bulkCount = await sw.evaluate(async () =>
    (await chrome.declarativeNetRequest.getSessionRules()).length,
  );
  record('C1: 5,000 규칙 일괄 등록', bulkCount === 5000, `count=${bulkCount}, ${addMs}ms`);

  let overflowError = '';
  try {
    await sw.evaluate(async () => {
      await chrome.declarativeNetRequest.updateSessionRules({
        addRules: [
          {
            id: 99_999,
            priority: 1,
            action: {
              type: 'modifyHeaders',
              requestHeaders: [{ header: 'X-Over', operation: 'set', value: '1' }],
            },
            condition: { urlFilter: 'over.invalid', resourceTypes: ['xmlhttprequest'] },
          },
        ],
      });
    });
  } catch (e) {
    overflowError = String(e.message ?? e);
  }
  record('C2: 5,001번째 규칙은 quota 초과로 거부', overflowError !== '',
    overflowError.slice(0, 120) || 'no error raised');

  const t1 = Date.now();
  await applyExp(bulk(5000));
  const replaceMs = Date.now() - t1;
  const afterReplace = await sw.evaluate(async () =>
    (await chrome.declarativeNetRequest.getSessionRules()).length,
  );
  record('C3: 5,000 규칙 전량 교체(제거+재등록)', afterReplace === 5000,
    `count=${afterReplace}, ${replaceMs}ms`);

  const t2 = Date.now();
  await applyExp([]);
  const afterClear = await sw.evaluate(async () =>
    (await chrome.declarativeNetRequest.getSessionRules()).length,
  );
  record('C4: 전량 제거로 원상복구', afterClear === 0,
    `count=${afterClear}, ${Date.now() - t2}ms`);

  // ---------- D. 이슈 04: 충돌 의미론 · Pause · 배지 ----------
  await sw.evaluate(async () => {
    await chrome.storage.local.set({
      state: {
        schemaVersion: 1,
        paused: false,
        profiles: [
          {
            id: 'top',
            name: 'Top',
            active: true,
            shortLabel: 'T',
            color: '#d97706',
            modifications: [
              { kind: 'request-header', id: 't1', name: 'X-Conf', value: 'top-wins', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
            ],
          },
          {
            id: 'bottom',
            name: 'Bottom',
            active: true,
            shortLabel: 'B',
            color: '#16a34a',
            modifications: [
              { kind: 'request-header', id: 'b1', name: 'X-Conf', value: 'bottom', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
            ],
          },
        ],
      },
    });
  });
  await pollSessionRuleCount(sw, 2);

  headers = await fetchEchoHeaders(page);
  record('D1: 두 활성 Profile이 같은 헤더 수정 시 목록 위쪽이 승리', headers['x-conf'] === 'top-wins',
    `x-conf=${headers['x-conf']}`);

  const multiBadge = await pollBadgeText(sw, '2');
  record('D2: 다중 활성 시 배지에 활성 개수 표시', multiBadge === '2', `badge="${multiBadge}"`);

  await popup.reload();
  // Pause/Resume은 aria-label(en 카탈로그)로 선택한다 — 팝업은 ?locale=en.
  await popup.getByRole('button', { name: 'Pause' }).click();
  await pollSessionRuleCount(sw, 0);
  headers = await fetchEchoHeaders(page);
  const pausedBadge = await pollBadgeText(sw, 'II');
  record('D3: 팝업 Pause → 즉시 전체 중단 + 배지 II',
    headers['x-conf'] === undefined && pausedBadge === 'II',
    `x-conf=${headers['x-conf']}, badge="${pausedBadge}"`);

  await popup.getByRole('button', { name: 'Resume' }).click();
  await pollSessionRuleCount(sw, 2);
  headers = await fetchEchoHeaders(page);
  record('D4: Resume → 이전 활성 상태 그대로 복원', headers['x-conf'] === 'top-wins',
    `x-conf=${headers['x-conf']}`);

  // ---------- E. 규칙 조건 (ADR 0010) — DNR 네이티브 매핑 ----------
  const seedProfiles = (profiles) =>
    sw.evaluate(async (p) => {
      await chrome.storage.local.set({ state: { schemaVersion: 1, paused: false, profiles: p } });
    }, profiles);

  const baseProfile = (id, name, mods) => ({
    id,
    name,
    active: true,
    shortLabel: name.charAt(0),
    color: '#2563eb',
    modifications: mods,
  });

  // E1: 레거시 프로필 필터 시드 → 로드 마이그레이션이 규칙 스코프로 반영 (ADR 0010)
  await seedProfiles([
    {
      ...baseProfile('p-url', 'UrlF',
        [{ kind: 'request-header', id: 'm1', name: 'X-F5', value: 'on', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' }]),
      filters: [{ kind: 'url', id: 'f1', enabled: true, pattern: 'tagged' }],
    },
  ]);
  await pollSessionRuleCount(sw, 1);
  const tagged = await fetchEchoHeaders(page, '/headers?tagged=1');
  const untagged = await fetchEchoHeaders(page, '/headers');
  record('E1: 레거시 URL 필터 → 로드 마이그레이션이 규칙 스코프로 적용', tagged['x-f5'] === 'on' && untagged['x-f5'] === undefined,
    `tagged=${tagged['x-f5']}, untagged=${untagged['x-f5']}`);

  /*
   * E2: 제외 도메인은 **퇴역했다** (ADR 0017, 티켓 02) — 좁히지 않고, 규칙이 그만큼 넓어진다.
   *
   * 예전에 이 자리는 "제외 도메인이 좁힌다"를 쟀다. 이제 저장소 문이 그 조건을 걷어 가므로
   * 사용자는 그것을 가질 수 없고, 좁힘을 재는 단언은 **도달할 수 없는 상태**를 재게 된다.
   * 그래서 같은 자리에서 반대쪽을 잰다 — 코어 테스트가 못 보는 것이 이것이다: 걷어낸 결과가
   * 실제 브라우저에서 그 도메인까지 규칙을 내보내는가. 티켓 02가 "조용히 넓어진다"고 말한
   * 그 넓어짐이 여기서 눈에 보인다.
   */
  await seedProfiles([
    baseProfile('p-ex', 'Ex',
      [{ kind: 'request-header', id: 'm1', name: 'X-Ex', value: 'on', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '',
        conditions: { excludedDomains: ['localhost'] } }]),
  ]);
  await pollSessionRuleCount(sw, 1);
  // 개수 1 → 1이라 위 배리어는 E1의 규칙 세트로도 만족된다 — 내용·효과를 양성 확인한다.
  await pollSessionRuleMatch(sw, headerOpLive('X-Ex', (h) => h.value === 'on'), 'E2 X-Ex=on');
  const onIncluded = await pollUntil(
    () => fetchEchoHeaders(page, '/headers'),
    (h) => h['x-ex'] === 'on',
  );
  /** 나가는 규칙 어디에도 그 조건 키가 없다 — 우연히 매칭된 것이 아니라 걷혔다는 감도 대조. */
  const noRuleCondition = (key) =>
    sw.evaluate(async (k) => {
      const rules = await chrome.declarativeNetRequest.getSessionRules();
      return rules.every((r) => r.condition?.[k] === undefined);
    }, key);
  const noExcludedCondition = await noRuleCondition('excludedRequestDomains');
  await page.goto(`http://localhost:${port}/`);
  const onceExcluded = await pollUntil(
    () => fetchEchoHeaders(page, '/headers'),
    (h) => h['x-ex'] === 'on',
  );
  await page.goto(origin);
  record('E2: 제외 도메인 퇴역 — 좁히지 않고 그 도메인에도 적용된다',
    onIncluded['x-ex'] === 'on' && onceExcluded['x-ex'] === 'on' && noExcludedCondition,
    `127.0.0.1=${onIncluded['x-ex']}, localhost=${onceExcluded['x-ex']}, 제외조건부재=${noExcludedCondition}`);

  // E3: 메서드 조건
  await seedProfiles([
    baseProfile('p-method', 'Meth',
      [{ kind: 'request-header', id: 'm1', name: 'X-Post-Only', value: 'on', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '',
        conditions: { requestMethods: ['post'] } }]),
  ]);
  await pollSessionRuleCount(sw, 1);
  await pollSessionRuleMatch(
    sw, headerOpLive('X-Post-Only', (h) => h.value === 'on'), 'E3 X-Post-Only=on');
  // 양성 절반(POST)을 먼저 폴링해 적용을 관측하고, 음성 절반(GET)은 그 뒤 한 번만 읽는다.
  const viaPost = await pollUntil(
    () => fetchEchoHeaders(page, '/headers', 'POST'),
    (h) => h['x-post-only'] === 'on',
  );
  const viaGet = await fetchEchoHeaders(page, '/headers');
  record('E3: 메서드 조건 — POST에만 적용', viaGet['x-post-only'] === undefined && viaPost['x-post-only'] === 'on',
    `GET=${viaGet['x-post-only']}, POST=${viaPost['x-post-only']}`);

  // E5: 리소스 종류 조건 — main_frame 내비게이션에만 적용, XHR 제외
  await seedProfiles([
    baseProfile('p-rt', 'Rt',
      [{ kind: 'request-header', id: 'm1', name: 'X-Doc-Only', value: 'on', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '',
        conditions: { resourceTypes: ['main_frame'] } }]),
  ]);
  await pollSessionRuleCount(sw, 1);
  // 음성 절반(XHR 제외)이 먼저라 부재를 폴링할 수 없다 — 새 시드의 내용을 양성 확인한 뒤
  // 한 번만 읽고, 양성 절반(내비게이션)은 goto가 실제 문서 요청을 낸다.
  await pollSessionRuleMatch(
    sw, headerOpLive('X-Doc-Only', (h) => h.value === 'on'), 'E5 X-Doc-Only=on');
  const viaXhr = await fetchEchoHeaders(page, '/headers');
  await page.goto(`${origin}/headers?nav=1`);
  const viaNav = JSON.parse(await page.evaluate(() => document.body.innerText));
  await page.goto(origin);
  record('E5: 리소스 종류 조건 — 문서 요청에만 적용',
    viaXhr['x-doc-only'] === undefined && viaNav['x-doc-only'] === 'on',
    `xhr=${viaXhr['x-doc-only']}, nav=${viaNav['x-doc-only']}`);

  /*
   * E6: 요청 출처 도메인도 **퇴역했다** (ADR 0017, 티켓 02) — E2와 같은 이유로 뒤집었다.
   *
   * 여기서는 **맞지 않는** 출처를 심는 것이 요점이다. 예전 계약에서는 그 규칙이 어디에도
   * 적용되지 않았다 — 지금 적용된다면 조건이 실제로 걷혔다는 뜻이고, 그것이 이 자리가
   * 재야 하는 유일한 것이다.
   */
  const idProfile = (domain) => [
    baseProfile('p-id', 'Id',
      [{ kind: 'request-header', id: 'm1', name: 'X-From-Local', value: 'on', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '',
        conditions: { initiatorDomains: [domain] } }]),
  ];
  await seedProfiles(idProfile('nomatch.example'));
  await pollSessionRuleCount(sw, 1);
  await pollSessionRuleMatch(
    sw, headerOpLive('X-From-Local', (h) => h.value === 'on'), 'E6 X-From-Local=on');
  const onceUnmatched = await pollUntil(
    () => fetchEchoHeaders(page, '/headers'),
    (h) => h['x-from-local'] === 'on',
  );
  const noInitiatorCondition = await noRuleCondition('initiatorDomains');
  record('E6: 요청 출처 도메인 퇴역 — 맞지 않는 출처를 심어도 적용된다',
    onceUnmatched['x-from-local'] === 'on' && noInitiatorCondition,
    `nomatch에서 적용=${onceUnmatched['x-from-local']}, 출처조건부재=${noInitiatorCondition}`);

  // E4: 유효하지 않은 규칙 regex 스코프는 저장 시점(권위 경로)에 거부된다
  const rejection = await popup.evaluate(async () => {
    return chrome.runtime.sendMessage({
      type: 'headerkit:command',
      command: {
        type: 'add-modification',
        profileId: 'p-id',
        modification: { kind: 'request-header', id: 'bad', name: 'X-Bad', value: '1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '',
          urlFilter: '(unclosed', urlMatchType: 'regex' },
      },
    });
  });
  const stateAfter = await sw.evaluate(async () => {
    const { state } = await chrome.storage.local.get('state');
    return state.profiles[0].modifications.length;
  });
  record('E4: invalid regex 스코프 명령이 오류로 거부되고 저장되지 않음',
    rejection?.ok === false && /regex/i.test(rejection?.error ?? '') && stateAfter === 1,
    `ok=${rejection?.ok}, error="${rejection?.error}", mods=${stateAfter}`);

  /*
   * ---------- F. 탭 도메인 · 자동 해제 시각의 퇴역 (ADR 0017, 티켓 02) ----------
   *
   * 이 두 조건은 **좁히는 것을 넘어 서브시스템을 데리고 있었다** — 탭 감시와 만료 알람이다.
   * 저장소 문이 조건을 걷어 가면 그 서브시스템들은 입력을 받지 못하므로, 여기서 재는 것은
   * "규칙이 이제 그것들과 무관하게 나간다"이다. 서브시스템 자체의 철거는 티켓 10의 몫이다.
   */
  await page.close(); // 이전 섹션의 127.0.0.1 탭이 탭 도메인 매칭을 오염시키지 않도록
  const pageB = await context.newPage();
  await pageB.goto(`${origin}/?who=B`);

  /*
   * F1: 탭 도메인 퇴역 — **맞는 탭이 하나도 없는** 도메인을 심는다. 예전 계약에서는 매칭 탭이
   * 없으면 그 규칙이 아예 방출되지 않아 개수가 0이었다. 개수 1이 곧 조건이 걷혔다는 증거다.
   */
  await seedProfiles([
    baseProfile('p-td', 'Td',
      [{ kind: 'request-header', id: 'm1', name: 'X-Tab-Domain', value: 'on', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '',
        conditions: { tabDomains: ['nomatch.example'] } }]),
  ]);
  await pollSessionRuleCount(sw, 1); // 예전이면 매칭 탭이 없어 0이었다
  // 세션 규칙이 등록됐다(count=1)고 곧바로 요청에 적용된 건 아니다 — updateSessionRules
  // 해소와 실제 네트워크 반영 사이에 지연이 있다. 효과 자체(헤더 유무)를 폴링해 관측한다.
  const noMatchingTab = await pollUntil(
    () => fetchEchoHeaders(pageB, '/headers'),
    (h) => h['x-tab-domain'] === 'on',
  );
  record('F1: 탭 도메인 퇴역 — 맞는 탭이 없어도 규칙이 나가고 적용된다',
    noMatchingTab['x-tab-domain'] === 'on',
    `매칭 탭 없음에서 적용=${noMatchingTab['x-tab-domain']}`);
  await pageB.goto(origin);

  /*
   * F3: 퇴역한 조건이 저장소에 남아 있어도 **방출을 막지 않는다** (ADR 0017, 티켓 10).
   *
   * 옛 파일 가져오기나 손편집으로 도달 가능한 상태다. 예전 계약에서는 방출 가드가 지난
   * 자동 해제 시각의 규칙을 걸러 개수가 1이었고, 알람이 저장소의 enabled를 뒤집었다.
   * 둘 다 일어나지 않아야 한다 — 걸러지면 사용자는 만든 규칙이 안 걸리는데 화면에는 멀쩡히
   * 서 있는 상태를 겪는다.
   *
   * **알람 부재를 재던 프로브가 사라졌다** (티켓 10). `chrome.alarms` 자체가 없어졌으므로
   * (권한이 빠졌다) 그 API로는 아무것도 물을 수 없다 — 권한 부재는 N52가 매니페스트에서
   * 직접 잰다. 배지 수 확인은 여기 남는다: 이 표본은 만료와 무관한 **켜진 규칙 둘**이다.
   */
  await seedProfiles([
    baseProfile('p-time', 'Ti',
      [
        { kind: 'request-header', id: 'm1', name: 'X-Timed', value: 'on', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '',
          conditions: { expiresAt: Date.now() - 1000, tabDomains: ['closed.example'] } },
        { kind: 'request-header', id: 'm2', name: 'X-Stays', value: 'on', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
      ]),
  ]);
  await pollSessionRuleCount(sw, 2); // 예전이면 지난 시각·닫힌 탭의 규칙이 걸러져 1이었다
  const pastExpiry = await pollUntil(
    () => fetchEchoHeaders(pageB, '/headers'),
    (h) => h['x-timed'] === 'on' && h['x-stays'] === 'on',
  );
  const stillEnabled = await sw.evaluate(async () => {
    const { state } = await chrome.storage.local.get('state');
    return state.profiles[0].modifications[0].enabled;
  });
  const badgeAfter = await pollBadgeText(sw, '2');
  record('F3: 퇴역 조건(지난 해제 시각·탭 도메인)이 남아 있어도 규칙이 그대로 걸린다',
    pastExpiry['x-timed'] === 'on' && pastExpiry['x-stays'] === 'on'
      && stillEnabled === true && badgeAfter === '2',
    `적용=[${pastExpiry['x-timed']},${pastExpiry['x-stays']}], enabled=${stillEnabled}, badge="${badgeAfter}"`);

  // ---------- G. 이슈 07: Placeholder 실체화 수명주기 ----------
  const UUID_RE = /^req-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  // 비활성으로 심고, 활성화는 실제 팝업 토글(활성화 경계 = 명령 경로)로 수행한다.
  await seedProfiles([
    {
      ...baseProfile('p-ph', 'Ph',
        [{ kind: 'request-header', id: 'm1', name: 'X-Trace-Id', value: 'req-{{uuid}}', enabled: true }]),
      active: false,
    },
  ]);
  await popup.reload();
  const phToggle = popup.getByRole('switch', { name: 'Toggle Ph' });

  await phToggle.click();
  await pollSessionRuleCount(sw, 1);
  const first = (await fetchEchoHeaders(pageB, '/headers'))['x-trace-id'];
  record('G1: 활성화 경계에서 실체화된 uuid가 실요청에 적용', UUID_RE.test(first ?? ''),
    `value=${first}`);

  // 탭 이벤트(재컴파일 트리거) 후에도 값 불변 — Compile은 소비만
  const tempTab = await context.newPage();
  await tempTab.goto(origin);
  await tempTab.close();
  await new Promise((r) => setTimeout(r, 400));
  const afterTabEvent = (await fetchEchoHeaders(pageB, '/headers'))['x-trace-id'];
  record('G2: 탭 이벤트 재컴파일에도 값 불변', afterTabEvent === first, `value=${afterTabEvent}`);

  // 재활성화 → 새 값
  await phToggle.click();
  await pollSessionRuleCount(sw, 0);
  await phToggle.click();
  await pollSessionRuleCount(sw, 1);
  const reactivated = (await fetchEchoHeaders(pageB, '/headers'))['x-trace-id'];
  record('G3: 재활성화가 새 값을 만든다', UUID_RE.test(reactivated ?? '') && reactivated !== first,
    `old=${first}, new=${reactivated}`);

  // 활성 중 템플릿 편집 → 그 항목만 즉시 재실체화
  const editResult = await popup.evaluate(async () => {
    return chrome.runtime.sendMessage({
      type: 'headerkit:command',
      command: {
        type: 'update-modification',
        profileId: 'p-ph',
        modification: { kind: 'request-header', id: 'm1', name: 'X-Trace-Id', value: 'edit-{{uuid}}', enabled: true },
      },
    });
  });
  await new Promise((r) => setTimeout(r, 400));
  const afterEdit = (await fetchEchoHeaders(pageB, '/headers'))['x-trace-id'];
  record('G4: 활성 중 템플릿 편집 → 즉시 재실체화', editResult?.ok === true && (afterEdit ?? '').startsWith('edit-'),
    `value=${afterEdit}`);

  // ---------- H. 이슈 08: Import/Export ----------
  // 깨끗한 상태에서 시작해 팝업 UI로 Import를 수행한다.
  await seedProfiles([]);
  await pollSessionRuleCount(sw, 0);
  await popup.reload();

  const exportJson = JSON.stringify({
    headerkit: 1,
    profiles: [
      {
        id: 'src-p1',
        name: 'Imported',
        active: true,
        shortLabel: 'IM',
        color: '#9333ea',
        modifications: [
          { kind: 'request-header', id: 'src-m1', name: 'X-Imported-Id', value: 'imp-{{uuid}}', enabled: true },
        ],
        filters: [
          { kind: 'tab', id: 'src-f1', enabled: true, tabId: 4242 },
        ],
      },
    ],
  });

  // 단일 셸(ADR 0005): JSON 내보내기·가져오기는 백업 화면이 소유한다 (티켓 09) —
  // 스냅샷 히스토리와 같은 자리다.
  await popup.getByRole('button', { name: 'Show backups' }).click();
  await popup.getByRole('button', { name: 'Import…' }).click();
  // 가져오기는 **파일 하나**만 받는다 — 붙여넣기 칸이 사라졌다(놓기와 파일 선택이 같은 문).
  await popup.getByLabel('Import file').setInputFiles({
    name: 'headerkit-profiles.json', mimeType: 'application/json', buffer: Buffer.from(exportJson),
  });
  await popup.getByRole('button', { name: 'Run import' }).click();
  await pollSessionRuleCount(sw, 1); // 레거시 tab 필터는 마이그레이션에서 소실 → 규칙이 전 탭에 적용된다
  const importedState = await sw.evaluate(async () => {
    const { state } = await chrome.storage.local.get('state');
    return state;
  });
  const importedProfile = importedState.profiles.find((p) => p.name === 'Imported');
  const importedHeader = (await fetchEchoHeaders(pageB, '/headers'))['x-imported-id'];
  record('H1: 활성 Import → id 재생성 + 레거시 필터 소실(ADR 0010) + 활성화 경계 실체화',
    importedProfile !== undefined &&
    importedProfile.id !== 'src-p1' &&
    importedProfile.filters === undefined &&
    /^imp-[0-9a-f-]{36}$/.test(importedHeader ?? ''),
    `id=${importedProfile?.id?.slice(0, 8)}, filters=${JSON.stringify(importedProfile?.filters)}, header=${importedHeader}`);

  await popup.getByRole('button', { name: 'Import…' }).click();
  await popup.getByLabel('Import file').setInputFiles({
    name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{broken json'),
  });
  await popup.getByRole('button', { name: 'Run import' }).click();
  // 백업 화면에는 스냅샷 패널도 자기 오류 배너를 가질 수 있다 — Import 패널이 위에 서므로
  // 첫 배너가 여기서 보는 것이다(단언 자체는 그대로: 이 문구가 JSON 거부여야 한다).
  const importError = await popup.getByRole('alert').first().textContent();
  const profileCountAfter = await sw.evaluate(async () => {
    const { state } = await chrome.storage.local.get('state');
    return state.profiles.length;
  });
  record('H2: 깨진 Import는 거부되고 상태가 불변', /JSON/i.test(importError ?? '') && profileCountAfter === 1,
    `error="${importError}", profiles=${profileCountAfter}`);

  /*
   * H2b: 그 거부 문구가 **전송 패널 자신의 것**인지 (티켓 09 리뷰 R-7).
   *
   * H2의 단언은 백업 화면에 패널이 둘 서면서 "첫 배너"로 넓어졌다 — 전송 경고가 통째로
   * 사라지고 백업 패널 배너가 우연히 JSON을 언급하기만 해도 통과한다. 여기서 잃은 특정성을
   * 되찾는다: Import 토글을 가진 카드(=전송 패널) 안으로 범위를 좁혀, 거부를 말하는 것이
   * 거부한 패널인지 본다. H2가 방금 남긴 화면을 읽기만 하고 상태는 더 건드리지 않는다.
   *
   * 셀렉터가 `section`에서 카드로 바뀐 것은 티켓 09이다 — 백업 화면이 시안의 카드 넷이 되면서
   * 전송 패널도 같은 `Card` 셸을 쓴다. 재는 것은 그대로다: **거부한 패널 안에** 배너가 있는가.
   */
  const transferSection = popup
    .locator('[data-slot="card"]')
    .filter({ has: popup.getByRole('button', { name: 'Import…' }) });
  const transferSectionCount = await transferSection.count();
  const transferAlerts = transferSection.getByRole('alert');
  const transferAlertCount = await transferAlerts.count();
  const transferImportError = transferAlertCount > 0 ? await transferAlerts.first().textContent() : null;
  record('H2b: 거부 문구는 전송 패널 자신의 경고다',
    transferSectionCount === 1 && transferAlertCount > 0 && /JSON/i.test(transferImportError ?? ''),
    `sections=${transferSectionCount}, alerts=${transferAlertCount}, error="${transferImportError}"`);

  // ---------- I. 이슈 09: 자동 Backup · 복원 ----------
  // 이전 섹션들의 누적 백업을 지우고 자족적으로 시작한다.
  await sw.evaluate(async () => chrome.storage.sync.clear());
  // placeholder 실체화는 커맨드 경로(활성화 경계)에서만 일어난다 — 직접 active로
  // 시드하면 프로필이 정당하게 제외되어(규칙 0) 이 폴은 이전 섹션의 낡은 규칙을
  // 우연히 샘플링할 때만 통과했다(역대 플레이크의 실체). 비활성 시드 후 실제
  // 팝업 토글로 활성화 경계를 태운다.
  await seedProfiles([
    { ...baseProfile('p-bk', 'Backupable',
      [{ kind: 'request-header', id: 'm1', name: 'X-Restored-Id', value: 'rst-{{uuid}}', enabled: true }]), active: false },
  ]);
  await popup.reload();
  await popup.getByRole('switch', { name: 'Toggle Backupable' }).click();
  await pollSessionRuleCount(sw, 1);

  // 자동 백업은 최소 간격(30s) 스로틀이 있다. 예전엔 35s만 기다려 여유가 5s뿐이라
  // 기기가 조금만 바빠도 스로틀 해제 직후를 놓쳐 snapshots=0으로 간헐 실패했다(I1 흔들림).
  // 스로틀(30s) 위로 넉넉히(25s) 여유를 준다 — 백업이 뜨면 pollUntil이 즉시 반환하므로
  // 정상 경로의 소요는 그대로다(상한만 올라간다).
  const backupCount = await pollUntil(
    () => sw.evaluate(async () => {
      const kv = await chrome.storage.sync.get('bk:manifest');
      return kv['bk:manifest']?.snapshots?.length ?? 0;
    }),
    (count) => count >= 1,
    55_000,
    500,
  );
  record('I1: Profile 변경 후 자동 Backup 생성 (manifest-last 커밋)', backupCount >= 1,
    `snapshots=${backupCount}`);

  // 상태를 비운 뒤, 방금 만든 스냅샷으로 복원한다 (전체 교체 + 활성화 경계).
  await seedProfiles([]);
  await pollSessionRuleCount(sw, 0);
  await popup.reload();
  // 단일 셸(ADR 0005): 백업은 팝업에서도 레일 화면 경유
  await popup.getByRole('button', { name: 'Show backups' }).click();
  await settleScreen(popup, 'Backup history');
  const restoreRow = popup.locator('li').filter({ hasText: 'profile' }).first();
  // 복원은 **바로 실행된다** — 되물음 대신 실행 취소 토스트가 되돌림을 든다.
  await restoreRow.getByRole('button', { name: 'Restore backup' }).click();

  const restoredState = await pollUntil(
    () => sw.evaluate(async () => {
      const { state } = await chrome.storage.local.get('state');
      return state;
    }),
    (s) => s.profiles.length === 1 && s.profiles[0].name === 'Backupable',
    8_000,
    300,
  );
  const restoredOk = restoredState.profiles.length === 1 && restoredState.profiles[0].name === 'Backupable';
  await pollSessionRuleCount(sw, 1);
  const restoredHeader = (await fetchEchoHeaders(pageB, '/headers'))['x-restored-id'];
  record('I2: 스냅샷 복원 → 전체 교체 + 활성화 경계 재실체화',
    restoredOk && /^rst-[0-9a-f-]{36}$/.test(restoredHeader ?? ''),
    `restored=${restoredOk}, header=${restoredHeader}`);

  // ---------- J. 이슈 10: 탭 앱 + 적용 상태 가시성 ----------
  const extId = new URL(sw.url()).host;

  // J1: 탭 앱이 열리고 팝업과 같은 상태를 본다
  await seedProfiles([
    baseProfile('p-app', 'AppView',
      [
        { kind: 'request-header', id: 'm1', name: 'X-A', value: '1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
        { kind: 'request-header', id: 'm2', name: 'X-B', value: '2', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
      ]),
  ]);
  await pollSessionRuleCount(sw, 2);

  const tabApp = await context.newPage();
  await tabApp.goto(`chrome-extension://${extId}/app.html?locale=en`);
  // 제목은 이제 **프로필 이름**이라 고정 문자열로 기다릴 수 없다 (ADR 0017) — 레일로 본다.
  await tabApp.getByRole('button', { name: 'Show profiles', exact: true }).waitFor();
  const shownRuleCount = await tabApp.getByText(/active rule/).textContent();
  const shownProfileCount = await tabApp.getByText(/active profile/).textContent();
  record('J1: 탭 앱이 활성 규칙·프로필 수를 표시한다 (요약이 Compile과 일치)',
    /2\s*active rule/.test(shownRuleCount ?? '') && /1\s*active profile/.test(shownProfileCount ?? ''),
    `rules="${(shownRuleCount ?? '').trim()}", profiles="${(shownProfileCount ?? '').trim()}"`);

  // J2: 겹침 경고가 요약에 노출된다 (두 활성 Profile이 같은 헤더 수정)
  await seedProfiles([
    baseProfile('p-x', 'X', [{ kind: 'request-header', id: 'm1', name: 'X-Dup', value: 'a', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' }]),
    baseProfile('p-y', 'Y', [{ kind: 'request-header', id: 'm2', name: 'X-Dup', value: 'b', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' }]),
  ]);
  await tabApp.reload();
  const overlapShown = await tabApp
    .getByText(/Overlapping header/i)
    .isVisible()
    .catch(() => false);
  record('J2: 겹침 경고가 상태 요약에 노출된다', overlapShown, `visible=${overlapShown}`);

  // J3: 대형 편집기로 긴 값을 저장하면 반영된다
  await seedProfiles([
    baseProfile('p-le', 'LE', [{ kind: 'request-header', id: 'm1', name: 'X-Long', value: 'short', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' }]),
  ]);
  await tabApp.reload();
  // 대형 편집기는 규칙 폼 안에 있다 — Edit로 폼을 연다 (ADR 0006)
  await tabApp.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await tabApp.getByRole('button', { name: /open large editor/i }).first().click();
  const longValue = 'x'.repeat(300);
  await tabApp.getByRole('textbox', { name: /Value —/ }).fill(longValue);
  await tabApp.getByRole('button', { name: 'Save large editor' }).click();
  // 닫힘을 **명시적으로** 기다린다. 다이얼로그가 퇴장 전이를 갖게 되면서(ADR 0012의 CSS
  // 전이) 닫는 중에도 `fixed inset-0` 백드롭이 잠시 살아 있고, 그 사이에 들어간 다음
  // 클릭은 백드롭이 삼킨다 — 셀렉트 팝업에서 이미 겪은 실패 모양이다(N25의 대기 규율).
  await tabApp.getByRole('dialog').waitFor({ state: 'detached', timeout: 5000 });
  // 에디터는 초안에만 반영 — 폼 Save가 원자 저장한다 (ADR 0006)
  await tabApp.getByRole('button', { name: SAVE_BUTTON }).click();
  const savedValue = await pollUntil(
    () => sw.evaluate(async () => {
      const { state } = await chrome.storage.local.get('state');
      return state.profiles[0].modifications[0].value;
    }),
    (v) => v === longValue,
  );
  record('J3: 대형 편집기 저장이 값에 반영된다', savedValue === longValue, `len=${savedValue?.length}`);

  // ---------- K. 이슈 02: 헤더 Modification 완성 ----------
  const hdr = (o) => ({
    kind: 'request-header',
    mode: 'override',
    emptyMeans: 'remove',
    comment: '',
    enabled: true,
    ...o,
  });

  // K1: Response Header 수정이 실응답에 반영된다
  await seedProfiles([
    baseProfile('p-res', 'Res',
      [hdr({ kind: 'response-header', id: 'm1', name: 'X-Injected-Resp', value: 'yes' })]),
  ]);
  await pollSessionRuleCount(sw, 1);
  // 개수가 1 → 1이라 위 배리어는 이전 시드의 규칙 세트로도 만족된다 — 내용을 양성 확인한다.
  await pollSessionRuleMatch(
    sw, headerOpLive('X-Injected-Resp', (h) => h.value === 'yes'), 'K1 X-Injected-Resp=yes');
  // 설치와 네트워크 반영 사이에도 지연이 있다 — 효과 자체를 폴링한다 (F1과 같은 패턴).
  const respHeader = await pollUntil(
    () => pageB.evaluate(async () => {
      const res = await fetch('/headers', { cache: 'no-store' });
      return res.headers.get('x-injected-resp');
    }),
    (v) => v === 'yes',
  );
  record('K1: Response Header 수정이 실응답에 반영', respHeader === 'yes', `x-injected-resp=${respHeader}`);

  // K2: send-empty는 빈 문자열을, remove는 헤더 자체를 없앤다 (직접 대조)
  await seedProfiles([
    baseProfile('p-se', 'Se', [hdr({ id: 'm1', name: 'X-Empty-Test', value: '', emptyMeans: 'send-empty' })]),
  ]);
  await pollSessionRuleCount(sw, 1);
  // 두 시드가 같은 헤더를 쓰므로 이름만으로는 구분되지 않는다 — 연산까지 본다.
  await pollSessionRuleMatch(
    sw, headerOpLive('X-Empty-Test', (h) => h.operation === 'set'), 'K2 X-Empty-Test set');
  // 양성 절반(빈 문자열 전송)은 효과를 폴링한다.
  const sentEmpty = await pollUntil(
    () => fetchEchoHeaders(pageB, '/headers'),
    (h) => h['x-empty-test'] === '',
  );
  await seedProfiles([
    baseProfile('p-rm3', 'Rm', [hdr({ id: 'm1', name: 'X-Empty-Test', value: '', emptyMeans: 'remove' })]),
  ]);
  // 음성 절반(헤더 부재)이라 **부재를 폴링하면 안 된다** — 이전 규칙 세트가 즉시 만족시킨다.
  // 매직 넘버 300ms 대기를 걷어내고, 새 시드의 remove 연산이 살아 있음을 양성 확인한 뒤
  // 한 번만 관측한다.
  await pollSessionRuleMatch(
    sw, headerOpLive('X-Empty-Test', (h) => h.operation === 'remove'), 'K2 X-Empty-Test remove');
  const afterRemove = await fetchEchoHeaders(pageB, '/headers');
  record('K2: send-empty는 빈 값 전송, remove는 헤더 없음',
    sentEmpty['x-empty-test'] === '' && afterRemove['x-empty-test'] === undefined,
    `send-empty="${sentEmpty['x-empty-test']}", remove=${afterRemove['x-empty-test']}`);

  // K3: 허용 목록 요청 헤더의 append가 누적된다
  await seedProfiles([
    baseProfile('p-ap', 'Ap',
      [hdr({ id: 'm1', name: 'Accept-Language', value: 'ko', mode: 'append' })]),
  ]);
  await pollSessionRuleCount(sw, 1);
  await pollSessionRuleMatch(
    sw, headerOpLive('Accept-Language', (h) => h.operation === 'append' && h.value === 'ko'),
    'K3 Accept-Language append=ko');
  const appended = (await pollUntil(
    () => fetchEchoHeaders(pageB, '/headers'),
    (h) => /ko/.test(h['accept-language'] ?? ''),
  ))['accept-language'];
  record('K3: 허용 목록 요청 헤더 append가 기존 값에 누적', /ko/.test(appended ?? '') && (appended ?? '').includes(','),
    `accept-language=${appended}`);

  // ---------- L. 이슈 11: 보조 UX 마감 ----------
  // L1: Pause 단축키(toggle-pause)가 manifest에 등록돼 있고, 그 핸들러가 쓰는
  //     set-paused 경로가 실제로 전체를 중단한다 (실제 키 입력은 headless 불가).
  const shortcutRegistered = await sw.evaluate(
    async () => (await chrome.commands.getAll()).some((c) => c.name === 'toggle-pause'),
  );
  await seedProfiles([
    baseProfile('p-ux', 'Ux', [hdr({ id: 'm1', name: 'X-Ux', value: '1' })]),
  ]);
  await pollSessionRuleCount(sw, 1);
  await popup.reload();
  await popup.getByRole('button', { name: 'Pause' }).click();
  await pollSessionRuleCount(sw, 0);
  record('L1: Pause 단축키 등록 + set-paused가 전체 중단', shortcutRegistered,
    `toggle-pause 등록=${shortcutRegistered}, 규칙=0`);

  /*
   * L2: 사용자 헤더 이름이 제안에 오른다.
   *
   * **등록하는 길이 바뀌었다** (티켓 09). 예전에는 환경설정의 자동완성 카드에서 손으로
   * 더했는데, 시안에 그 카드가 없어 사라졌다 — 이제 그 일은 **규칙 저장**이 한다
   * (`withRememberedValues`), 쿠키 이름·User-Agent가 이미 그랬던 것과 같은 경로다.
   * 그래서 여기서도 규칙 하나를 그 이름으로 저장하는 것이 등록이다.
   */
  await seedProfiles([
    baseProfile('p-ac', 'Ac', [hdr({ id: 'm1', name: '', value: 'v' })]),
  ]);
  await popup.reload();
  await popup.getByRole('button', { name: 'Edit', exact: true }).first().click();
  const seedName = popup.getByLabel('Header name', { exact: true }).first();
  await seedName.waitFor({ timeout: 5000 });
  await seedName.fill('X-Team-Custom');
  // 제안 팝업이 열려 있으면 floating-ui가 바깥을 aria-hidden 처리해 Save를 못 조준한다.
  // (`closeSuggestions`는 아래 N 구간에서 정의되므로 같은 일을 여기서 직접 한다.)
  if ((await popup.getByRole('option').count()) > 0) await popup.keyboard.press('Escape');
  await popup.getByRole('button', { name: SAVE_BUTTON }).click();
  const savedCustom = await pollUntil(
    () => sw.evaluate(async () => (await chrome.storage.local.get('state')).state.customHeaderNames),
    (names) => Array.isArray(names) && names.includes('X-Team-Custom'),
  );
  // 이름 입력은 규칙 폼 안에만 있다 — Edit로 폼을 다시 연다 (ADR 0006)
  await popup.getByRole('button', { name: 'Edit', exact: true }).first().click();
  const acNameInput = popup.getByLabel('Header name', { exact: true }).first();
  await acNameInput.waitFor({ timeout: 5000 });
  // 브라우저 기본 datalist가 아니라 앱 팝업(combobox)인지부터 확인한다 — 지연 청크라
  // 도착이 늦으면 잠시 datalist 표현이 뜰 수 있고, 그 상태로 제안을 검사하면 이 테스트가
  // 정작 story 4("앱의 다른 팝업과 같은 모양")를 안 보게 된다 (ui-polish 03).
  const isCombobox = await popup
    .waitForFunction(
      () => document.querySelector('input[aria-label="Header name"]')?.getAttribute('role') === 'combobox',
      null,
      { timeout: 5000 },
    )
    .then(() => true, () => false);

  await acNameInput.click();
  // 필드를 먼저 비운다 — 이제 이 규칙은 방금 저장한 이름을 **이미 들고 있어서**, 지우지 않고
  // 치면 쿼리가 `X-Team-CustomX`가 되어 아무것도 안 걸린다.
  await acNameInput.fill('');
  await acNameInput.pressSequentially('X', { delay: 20 });
  await popup.getByRole('option').first().waitFor({ timeout: 5000 });
  const options = await popup.getByRole('option').allTextContents();
  record('L2a: autocomplete — 규칙 저장이 기억한 이름이 앱 팝업 제안에 앞서 뜬다',
    isCombobox &&
      Array.isArray(savedCustom) && savedCustom.includes('X-Team-Custom') &&
      options[0] === 'X-Team-Custom' &&
      options.length > 1 && options.every((name) => name.toLowerCase().startsWith('x')),
    `combobox=${isCombobox}, custom=${JSON.stringify(savedCustom)}, options=${JSON.stringify(options)}`);

  // L2b: 마우스 없이 화살표+Enter로 고른다
  await acNameInput.fill('');
  await acNameInput.pressSequentially('X-Te', { delay: 20 });
  await popup.getByRole('option').first().waitFor({ timeout: 5000 });
  await popup.keyboard.press('ArrowDown');
  await popup.keyboard.press('Enter');
  const pickedValue = await acNameInput.inputValue();
  record('L2b: 화살표+Enter로 제안을 고른다', pickedValue === 'X-Team-Custom', `value="${pickedValue}"`);

  // L2c: Esc는 제안 팝업만 닫고 폼은 살려 둔다 — 실수로 편집이 취소되면 안 된다
  await acNameInput.fill('');
  await acNameInput.pressSequentially('X-Te', { delay: 20 });
  await popup.getByRole('option').first().waitFor({ timeout: 5000 });
  await popup.keyboard.press('Escape');
  await popup.waitForTimeout(200);
  const optionsAfterEsc = await popup.getByRole('option').count();
  const formAfterEsc = await popup.getByRole('button', { name: 'Cancel' }).count();
  record('L2c: Esc는 제안 팝업만 닫고 폼은 유지',
    optionsAfterEsc === 0 && formAfterEsc > 0,
    `options=${optionsAfterEsc}, form=${formAfterEsc}`);

  // L2d: 후보가 **없는** 이름 — 커스텀 헤더를 치는 가장 흔한 경우다. 이때 팝업이 열리면
  // 빈 상자가 뜨고, 팝업이 열린 동안 바깥이 aria-hidden 처리돼 폼 전체가 보조기술에서
  // 사라지며, Esc가 팝업이 아니라 폼을 닫아 편집이 날아간다(실제로 그랬다).
  // L2c는 후보가 있는 쿼리만 봐서 이걸 놓쳤다 — 그 공백을 메운다.
  await acNameInput.fill('');
  await acNameInput.pressSequentially('ZZZ-No-Match', { delay: 15 });
  await popup.waitForTimeout(300);
  const noMatch = {
    options: await popup.getByRole('option').count(),
    expanded: await acNameInput.getAttribute('aria-expanded'),
    formReachable: await popup.getByRole('button', { name: 'Cancel' }).count(),
  };
  record('L2d: 후보가 없으면 팝업이 열리지 않고 폼이 가려지지 않는다',
    noMatch.options === 0 && noMatch.expanded === 'false' && noMatch.formReachable > 0,
    `options=${noMatch.options}, aria-expanded=${noMatch.expanded}, form=${noMatch.formReachable}`);

  await popup.getByRole('button', { name: 'Cancel' }).click();

  // L2e/L2f: 지연 청크 교체와 포커스 (릴리스 게이트 R-1).
  //
  // 두 표현은 컴포넌트 타입이 달라 교체가 리마운트다 — 새 입력이 autoFocus로 뜨면 포커스를
  // 가져간다. 로컬에서는 도착이 0~7ms라 이 창이 안 보이므로 **청크 응답 자체를 늦춘다.**
  // `page.route`가 chrome-extension:// 하위 리소스에도 걸린다(실증). 프로덕션 코드에 훅은 없다.
  //
  // 두 방향을 함께 건다 — 한쪽만 있으면 반대쪽으로 퇴화한다. 교체 때 autoFocus를 무조건
  // 끄면 L2e는 통과하고 L2f가 깨지고(폼을 열어도 포커스가 아무 데도 없음), 무조건 넘기면
  // L2f는 통과하고 L2e가 깨진다(사용자가 옮긴 포커스를 도로 뺏음).
  //
  // **두 시나리오 모두 편집 경로다** — `openRuleFormAt`이 Edit를 누른다. 헤더 이름의
  // autoFocus는 이제 편집에만 남고, 추가 경로의 첫 포커스는 맨 위 이름 칸이다(N18a).
  // 그래서 여기서 지키는 것은 "편집으로 연 폼에서 종류별 첫 칸이 포커스를 갖고, 지연
  // 교체가 그것을 흔들지 않는다"이다.
  const AUTOCOMPLETE_CHUNK = '**/suggest-autocomplete-*.js';
  const CHUNK_DELAY_MS = 900;
  const waitForCombobox = (page, timeout = 8000) =>
    page
      .waitForFunction(
        () => document.querySelector('input[aria-label="Header name"]')?.getAttribute('role') === 'combobox',
        null,
        { timeout },
      )
      .then(() => true, () => false);
  const openRuleFormAt = async (page) => {
    await page.setViewportSize({ width: 760, height: 580 });
    await page.goto(`chrome-extension://${extensionId}/popup.html?locale=en`);
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    await page.getByLabel('Header name', { exact: true }).first().waitFor({ timeout: 5000 });
  };

  {
    const delayed = await context.newPage();
    await delayed.route(AUTOCOMPLETE_CHUNK, async (route) => {
      await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
      await route.continue();
    });
    await openRuleFormAt(delayed);
    const delayedName = delayed.getByLabel('Header name', { exact: true }).first();
    // 폴백 창이 실제로 열렸는지부터 본다 — 교체가 이미 끝난 뒤라면 이 테스트는 공허하다.
    const fallbackWindow =
      (await delayedName.getAttribute('role')) === null &&
      (await delayedName.getAttribute('list')) !== null;
    const delayedValue = delayed.getByLabel('Value', { exact: true }).first();
    await delayedValue.click();
    const swapped = await waitForCombobox(delayed);
    await delayed.waitForTimeout(150);
    // Value 입력은 aria-label이 아니라 Field 라벨로 이름을 얻으므로 요소 동일성으로 본다.
    const keptFocus = await delayedValue.evaluate((el) => el === document.activeElement);
    record('L2e: 지연 교체가 사용자가 옮긴 포커스를 뺏지 않는다',
      fallbackWindow && swapped && keptFocus,
      `폴백 창=${fallbackWindow}, 교체됨=${swapped}, Value 포커스 유지=${keptFocus}`);
    await delayed.close();
  }

  {
    const prompt = await context.newPage();
    await openRuleFormAt(prompt);
    const swapped = await waitForCombobox(prompt);
    await prompt.waitForTimeout(150);
    const nameFocused = await prompt
      .getByLabel('Header name', { exact: true })
      .first()
      .evaluate((el) => el === document.activeElement);
    record('L2f: 정상 교체 후에도 헤더 이름이 포커스를 갖는다',
      swapped && nameFocused,
      `교체됨=${swapped}, 헤더 이름 포커스=${nameFocused}`);
    await prompt.close();
  }

  // L2g: 청크가 실패한 뒤의 계약 (릴리스 게이트 R-1).
  //
  // 실패한 fetch는 브라우저 모듈 맵에 캐시돼 `import()`가 재요청 없이 같은 거절을 돌려준다.
  // 그래서 회복은 마운트 단위가 아니라 **문서 단위**다. 요청 누계로 못박는 이유 — 요청을
  // 세지 않으면 "재시도하는데 마침 또 실패했다"와 "아예 재시도하지 않는다"를 못 가른다.
  // 저장까지 밀어 보는 것도 같은 이유다: 저하 경로가 "보이기만 하고 안 되는" 상태면
  // 폴백이 있다는 사실 자체가 위안이 안 된다.
  {
    const broken = await context.newPage();
    const chunkRequests = [];
    broken.on('request', (r) => {
      if (r.url().includes('suggest-autocomplete')) chunkRequests.push(r.url());
    });
    let blockChunk = true;
    await broken.route(AUTOCOMPLETE_CHUNK, async (route) => {
      if (blockChunk) await route.abort('failed');
      else await route.continue();
    });
    await openRuleFormAt(broken);
    await broken.waitForTimeout(400);
    const brokenName = broken.getByLabel('Header name', { exact: true }).first();
    const degraded = {
      role: await brokenName.getAttribute('role'),
      hasDatalist: (await brokenName.getAttribute('list')) !== null,
    };
    await brokenName.fill('X-Fallback-Works');
    await broken.getByRole('button', { name: SAVE_BUTTON }).first().click();
    await broken.waitForTimeout(400);
    const storedName = await sw.evaluate(
      async () => (await chrome.storage.local.get('state')).state.profiles[0].modifications[0].name,
    );

    // 네트워크를 정상으로 돌려도 같은 문서 안에서는 재요청이 나가지 않는다.
    blockChunk = false;
    await broken.getByRole('button', { name: 'Edit', exact: true }).first().click();
    await broken.getByLabel('Header name', { exact: true }).first().waitFor({ timeout: 5000 });
    await broken.waitForTimeout(600);
    const reopened = {
      role: await broken.getByLabel('Header name', { exact: true }).first().getAttribute('role'),
      requests: chunkRequests.length,
    };

    // 새 문서(팝업을 다시 여는 것과 동등)에서는 회복된다.
    await broken.reload();
    await broken.getByRole('button', { name: 'Edit', exact: true }).first().click();
    const recovered = await waitForCombobox(broken);

    record('L2g: 청크 실패 — 폴백으로 저장까지 동작, 같은 문서엔 재요청 없음, 새 문서에서 회복',
      degraded.role === null && degraded.hasDatalist &&
        storedName === 'X-Fallback-Works' &&
        reopened.role === null && reopened.requests === 1 && recovered,
      `폴백 datalist=${degraded.hasDatalist}, 저장="${storedName}", 재개봉 role=${reopened.role} 요청누계=${reopened.requests}, 새 문서 회복=${recovered}`);
    await broken.close();
  }

  // L3: 시크릿 안내가 노출된다 (기본 로드 확장은 시크릿 미허용)
  const incognitoNote = await popup
    .getByText(/incognito|시크릿/i)
    .first()
    .isVisible()
    .catch(() => false);
  record('L3: 시크릿 미허용 안내가 노출된다', incognitoNote, `visible=${incognitoNote}`);

  // ---------- M. 이슈 03: Cookie/Set-Cookie/Redirect ----------
  const modBase = (kind, extra) => ({ kind, id: `m-${kind}`, comment: '', enabled: true, ...extra });

  // M1: Request Cookie append → Cookie 헤더에 name=value 누적
  await seedProfiles([
    baseProfile('p-ck', 'Ck',
      [modBase('cookie', { name: 'smoke_sid', value: 'xyz', mode: 'append', emptyMeans: 'remove' })]),
  ]);
  await pollSessionRuleCount(sw, 1);
  await pollSessionRuleMatch(
    sw, headerOpLive('Cookie', (h) => (h.value ?? '').includes('smoke_sid=xyz')), 'M1 Cookie smoke_sid=xyz');
  const cookieEcho = await pollUntil(
    () => pageB.evaluate(async () => {
      const res = await fetch('/setcookie', { cache: 'no-store' });
      return res.json();
    }),
    (v) => /smoke_sid=xyz/.test(v?.cookie ?? ''),
  );
  record('M1: Request Cookie append가 Cookie 헤더에 반영', /smoke_sid=xyz/.test(cookieEcho.cookie ?? ''),
    `cookie=${cookieEcho.cookie}`);

  // M2: Set-Cookie 응답 헤더 주입
  await seedProfiles([
    baseProfile('p-sc', 'Sc',
      [modBase('set-cookie', { value: 'injected=1; Path=/', mode: 'append', emptyMeans: 'remove' })]),
  ]);
  await pollSessionRuleCount(sw, 1);
  await pollSessionRuleMatch(
    sw, headerOpLive('Set-Cookie', (h) => (h.value ?? '').includes('injected=1')), 'M2 Set-Cookie injected=1');
  // 브라우저는 fetch 응답의 Set-Cookie를 JS에 숨기므로, 실제 쿠키가 설정됐는지
  // document.cookie로 확인한다 (DNR이 append한 Set-Cookie를 브라우저가 처리).
  const docCookie = await pollUntil(
    () => pageB.evaluate(async () => {
      await fetch('/headers', { cache: 'no-store' });
      await new Promise((r) => setTimeout(r, 100));
      return document.cookie;
    }),
    (v) => /injected=1/.test(v ?? ''),
  );
  record('M2: Set-Cookie 응답 헤더 주입 → 브라우저 쿠키 설정', /injected=1/.test(docCookie),
    `document.cookie=${docCookie}`);

  // 쿠키 오염 방지: 이후 테스트 전에 document.cookie를 비운다.
  const clearCookies = () =>
    pageB.evaluate(() => {
      for (const c of document.cookie.split(';')) {
        const name = c.split('=')[0]?.trim();
        if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      }
    });

  // M2b: Request Cookie override는 기존 Cookie 헤더를 통째 교체한다
  await clearCookies();
  await pageB.evaluate(() => {
    document.cookie = 'existing=preset; path=/';
  });
  await seedProfiles([
    baseProfile('p-cko', 'Co',
      [modBase('cookie', { name: 'session', value: 'new', mode: 'override', emptyMeans: 'remove' })]),
  ]);
  await pollSessionRuleCount(sw, 1);
  // 이 자리가 흔들림의 진원이었다 — 개수 1 → 1이라 배리어가 M2의 규칙 세트로 즉시 만족돼
  // 아직 규칙이 안 걸린 `existing=preset`(브라우저 원본값)을 관측했다.
  await pollSessionRuleMatch(
    sw, headerOpLive('Cookie', (h) => h.value === 'session=new'), 'M2b Cookie=session=new');
  const overridden = (await pollUntil(
    () => pageB.evaluate(async () => {
      const res = await fetch('/setcookie', { cache: 'no-store' });
      return res.json();
    }),
    (v) => v?.cookie === 'session=new',
  )).cookie;
  record('M2b: Cookie override가 기존 Cookie 헤더를 통째 교체', overridden === 'session=new',
    `cookie=${overridden}`);

  // M2c: Request Cookie remove는 기존 Cookie가 있어도 헤더를 제거한다
  await seedProfiles([
    baseProfile('p-ckr', 'Cr',
      [modBase('cookie', { name: 'anything', value: '', mode: 'override', emptyMeans: 'remove' })]),
  ]);
  await pollSessionRuleCount(sw, 1);
  // 음성 단언(헤더 부재)이라 **부재를 폴링하면 안 된다** — 새 시드의 remove 연산이 살아
  // 있음을 양성 확인한 뒤 한 번만 관측한다.
  await pollSessionRuleMatch(
    sw, headerOpLive('Cookie', (h) => h.operation === 'remove'), 'M2c Cookie remove');
  const removedCookie = (await pageB.evaluate(async () => {
    const res = await fetch('/setcookie', { cache: 'no-store' });
    return res.json();
  })).cookie;
  record('M2c: Cookie remove가 기존 Cookie 헤더를 제거', removedCookie === null || removedCookie === undefined,
    `cookie=${removedCookie}`);

  // M2d: Set-Cookie override는 서버가 보낸 Set-Cookie를 대체한다
  await clearCookies();
  await seedProfiles([
    baseProfile('p-sco', 'So',
      [modBase('set-cookie', { value: 'replaced=1; Path=/', mode: 'override', emptyMeans: 'remove' })]),
  ]);
  await pollSessionRuleCount(sw, 1);
  await pollSessionRuleMatch(
    sw, headerOpLive('Set-Cookie', (h) => (h.value ?? '').includes('replaced=1')), 'M2d Set-Cookie replaced=1');
  // 양성(replaced=1)을 폴링하고 음성(!server_cookie=base)은 **같은 응답에서** 단언한다 —
  // 음성만 따로 폴링하면 이전 규칙 세트가 그 조건을 즉시 만족시킨다.
  const afterScOverride = await pollUntil(
    () => pageB.evaluate(async () => {
      await fetch('/withcookie', { cache: 'no-store' });
      await new Promise((r) => setTimeout(r, 100));
      return document.cookie;
    }),
    (v) => /replaced=1/.test(v ?? ''),
  );
  record('M2d: Set-Cookie override가 서버 Set-Cookie를 대체',
    /replaced=1/.test(afterScOverride) && !/server_cookie=base/.test(afterScOverride),
    `document.cookie=${afterScOverride}`);

  // M2e: Set-Cookie block(빈 값+remove)은 서버 Set-Cookie를 차단한다
  await clearCookies();
  await seedProfiles([
    baseProfile('p-scb', 'Sb',
      [modBase('set-cookie', { value: '', mode: 'override', emptyMeans: 'remove' })]),
  ]);
  await pollSessionRuleCount(sw, 1);
  // 순수 음성 단언 — 새 시드의 Set-Cookie remove가 살아 있음을 양성 확인한 뒤 한 번만 관측.
  await pollSessionRuleMatch(
    sw, headerOpLive('Set-Cookie', (h) => h.operation === 'remove'), 'M2e Set-Cookie remove');
  const afterScBlock = await pageB.evaluate(async () => {
    await fetch('/withcookie', { cache: 'no-store' });
    await new Promise((r) => setTimeout(r, 100));
    return document.cookie;
  });
  record('M2e: Set-Cookie block이 서버 Set-Cookie를 차단', !/server_cookie=base/.test(afterScBlock),
    `document.cookie=${afterScBlock}`);
  await clearCookies();

  // M4: Redirect regex + 캡처 그룹 치환
  await seedProfiles([
    baseProfile('p-rd', 'Rd',
      [modBase('redirect', {
        pattern: `^http://127\\.0\\.0\\.1:${port}/redir-src(.*)`,
        substitution: `http://127.0.0.1:${port}/redir-dst\\1`,
      })]),
  ]);
  await pollSessionRuleCount(sw, 1);
  // 리다이렉트는 헤더 연산이 아니다 — 이번 시드의 치환 대상으로 내용을 확인한다.
  await pollSessionRuleMatch(
    sw,
    (rules) => rules.some((r) =>
      r.action?.type === 'redirect' && /redir-dst/.test(r.action?.redirect?.regexSubstitution ?? '')),
    'M4 redirect → /redir-dst');
  const landed = await pollUntil(
    () => pageB.evaluate(async () => {
      const res = await fetch('/redir-src?q=1', { cache: 'no-store', redirect: 'follow' });
      return res.text();
    }),
    (v) => /\/redir-dst\?q=1/.test(v ?? ''),
  );
  record('M4: Redirect regex 캡처 그룹 치환', /\/redir-dst\?q=1/.test(landed), `landed=${landed}`);

  // M4b: 새 UI 경로(확장 편집)로 치환·패턴 편집 → 실제 리다이렉트 반영 (슬라이스 05)
  await popup.reload();
  await popup.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await popup.getByLabel('Redirect to').fill(`http://127.0.0.1:${port}/redir-alt\\1`);
  await popup.getByRole('button', { name: SAVE_BUTTON }).click();
  const fetchLanding = (path) => (
    pageB.evaluate(async (p) => {
      const res = await fetch(p, { cache: 'no-store', redirect: 'follow' });
      return res.text();
    }, path)
  );
  const landedEdited = await pollUntil(
    () => fetchLanding('/redir-src?q=1'),
    (v) => /\/redir-alt\?q=1/.test(v),
  );
  // 패턴도 UI로 편집 — 매칭 소스가 /redir-two 로 바뀌어 실제 매칭에 반영된다 (폼 닫힘 대기 후)
  await popup.getByRole('button', { name: SAVE_BUTTON }).waitFor({ state: 'detached', timeout: 5000 });
  await popup.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await popup.getByLabel('Redirect pattern').fill(`^http://127\\.0\\.0\\.1:${port}/redir-two(.*)`);
  await popup.getByRole('button', { name: SAVE_BUTTON }).click();
  const landedPattern = await pollUntil(
    () => fetchLanding('/redir-two?q=2'),
    (v) => /\/redir-alt\?q=2/.test(v),
  );
  record('M4b: UI 확장 편집으로 치환·패턴 변경 → 실리다이렉트 반영',
    /\/redir-alt\?q=1/.test(landedEdited) && /\/redir-alt\?q=2/.test(landedPattern),
    `sub=${/\/redir-alt\?q=1/.test(landedEdited)}, pattern-landed=${landedPattern?.slice(-30)}`);

  // M5: 유효하지 않은 redirect 패턴은 저장 시점에 거부된다
  const redirectReject = await popup.evaluate(async () => {
    return chrome.runtime.sendMessage({
      type: 'headerkit:command',
      command: {
        type: 'add-modification',
        profileId: 'p-rd',
        modification: { kind: 'redirect', id: 'bad', pattern: '(unclosed', substitution: 'x', comment: '', enabled: true },
      },
    });
  });
  record('M5: invalid redirect 패턴이 저장 시점에 거부', redirectReject?.ok === false && /regex/i.test(redirectReject?.error ?? ''),
    `ok=${redirectReject?.ok}, error="${redirectReject?.error}"`);

  // ---------- N. 단일 프로필 뷰 + 사이드바 (ADR 0005 단일 셸) ----------
  // N1: 칩 클릭 → 본문이 해당 프로필로 전환된다
  await seedProfiles([
    baseProfile('n-a', 'Alpha',
      [{ kind: 'request-header', id: 'm1', name: 'X-A', value: '1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' }]),
    { ...baseProfile('n-b', 'Beta', []), active: false },
  ]);
  await popup.reload();
  /*
   * 지금 보는 프로필의 이름은 **본문 헤더 제목**에서 읽는다 (티켓 03·04). 예전에는 카드
   * 헤더의 이름 입력값을 폴링했는데, 그 입력이 시안에 없어 사라졌다 — 이름을 바꿀 방법이
   * 없어졌으므로 이제 이 값은 "어느 프로필을 보고 있는가"만 말한다.
   */
  const pollProfileName = (test, timeoutMs = 5000) =>
    pollUntil(() => popup.locator('main h1').first().textContent().catch(() => ''), test, timeoutMs, 100);

  // 첫 활성(Alpha)이 자동 선택 → 사이드바에서 Beta 선택으로 전환
  await popup.getByRole('button', { name: /^Select profile Beta/ }).click();
  const shownName = await pollProfileName((v) => v === 'Beta');
  record('N1: 사이드바 선택 → 본문 프로필 전환', shownName === 'Beta', `name=${shownName}`);

  /*
   * N1b: 사이드바 항목이 on/off 상태를 반영한다 (aria-label = 도트와 같은 소스).
   *
   * 낱말이 `on`/`off`에서 `applied`/`not applied`로 바뀐 것은 티켓 04다 — 같은 낱말이
   * 이제 행 메타에 **보이기도** 하므로, 이름과 보이는 라벨이 갈라지지 않게 한 벌만 쓴다.
   */
  const betaOff = await popup.getByRole('button', { name: 'Select profile Beta (not applied)' }).isVisible();
  await popup.getByRole('switch', { name: 'Toggle Beta' }).click();
  const betaOn = await popup
    .getByRole('button', { name: 'Select profile Beta (applied)' })
    .waitFor({ timeout: 5000 })
    .then(() => true, () => false);
  record('N1b: 사이드바 도트/라벨이 프로필 on/off 반영', betaOff && betaOn, `off=${betaOff}, on=${betaOn}`);
  await popup.getByRole('switch', { name: 'Toggle Beta' }).click();

  /*
   * N2: `＋ 새 프로필` — 이름과 색이 **자동으로** 정해지고 바로 선택된다 (티켓 04 AC7).
   *
   * 자동으로 정해지는 것이 요점이다: 이름을 바꿀 컨트롤이 없어졌으므로 여기서 붙는 이름이
   * 끝까지 남는다. 이름은 카탈로그를 거치고(ko는 `새 프로필 N`), 색은 팔레트를 순서대로 돈다.
   */
  await popup.getByRole('button', { name: '+ New profile' }).click();
  const createdName = await pollProfileName((v) => /^New profile \d+$/.test(v));
  const createdProfile = await sw.evaluate(async (name) => {
    const { state } = await chrome.storage.local.get('state');
    const p = state.profiles.find((x) => x.name === name);
    return { color: p?.color, hasLabel: p ? 'shortLabel' in p : null };
  }, createdName);
  const createdSelected = await popup
    .getByRole('button', { name: new RegExp(`^Select profile ${createdName} `) })
    .getAttribute('aria-current');
  record('N2: 새 프로필 — 이름·색 자동, 즉시 선택, 두 글자 라벨 없음',
    /^New profile \d+$/.test(createdName) && /^#[0-9a-f]{6}$/i.test(createdProfile?.color ?? '') &&
      createdSelected === 'true' && createdProfile?.hasLabel === false,
    `name=${createdName}, color=${createdProfile?.color}, selected=${createdSelected}, shortLabel=${createdProfile?.hasLabel}`);

  /*
   * N3: **프로필 편집 컨트롤이 없다** (티켓 04 AC1·AC2, ADR 0017).
   *
   * 시안에 없으므로 이름·색·두 글자 라벨 입력과 ⋯ 메뉴(복제·삭제)를 넷 다 없앴다. 부재를
   * 재는 이유는 이것이 **되돌릴 수 없는 결정**이기 때문이다 — 하나라도 다시 서면 사용자가
   * 프로필을 지울 수 있게 되고, 그 프로필을 되살릴 길은 전체 초기화뿐이다.
   *
   * 없는 것만 세면 "화면이 통째로 안 그려졌다"도 통과하므로, 남은 넷(그립·토글·검색·만들기)이
   * 실제로 서 있는 것을 같은 호흡에서 함께 잰다.
   */
  const gone = async (locator) => (await locator.count()) === 0;
  const editorControlsGone =
    (await gone(popup.getByLabel('Profile name'))) &&
    (await gone(popup.getByLabel('Badge color'))) &&
    (await gone(popup.getByLabel('Badge label'))) &&
    (await gone(popup.getByRole('button', { name: 'Profile menu', exact: true })));
  const survivors = {
    grip: await popup.getByRole('button', { name: /^Reorder / }).count(),
    toggle: await popup.getByRole('switch', { name: /^Toggle / }).count(),
    search: await popup.getByLabel('Search profiles…').count(),
    create: await popup.getByRole('button', { name: '+ New profile' }).count(),
  };
  record('N3: 프로필 편집 컨트롤 부재 — 이름·색·두 글자 라벨·⋯ 메뉴가 없고 남은 넷은 선다',
    editorControlsGone && survivors.grip > 0 && survivors.toggle > 0 &&
      survivors.search === 1 && survivors.create === 1,
    `편집컨트롤제거=${editorControlsGone}, ${JSON.stringify(survivors)}`);

  /*
   * N4: 프로필이 하나도 없으면 빈 상태 안내가 보인다.
   *
   * 이르는 길이 바뀌었다 (티켓 04): 예전에는 목록에서 하나씩 지워 도달했는데 삭제가
   * 사라졌으므로, 지금 이 상태에 이르는 길은 저장소가 빈 목록을 들고 있는 경우뿐이다.
   */
  await seedProfiles([]);
  await popup.reload();
  const emptyShown = await popup
    .getByText('No profiles yet')
    .waitFor({ timeout: 5000 })
    .then(() => true, () => false);
  record('N4: 빈 목록 → 빈 상태 안내 표시', emptyShown, `visible=${emptyShown}`);

  // 폼 Save 후 닫힘(재렌더)까지 대기 — 다음 Edit 클릭의 인덱스 밀림 방지
  // 폼이 실제로 닫힐 때까지. Save 버튼은 저장 중 이름이 'Saving…'으로 바뀌므로(ui-polish 06)
  // 'Save' detach를 기다리면 저장이 **시작되자마자** 통과해 버린다 — 이름이 변하지 않는
  // Cancel을 본다.
  const waitFormClosed = () =>
    popup.getByRole('button', { name: 'Cancel', exact: true }).waitFor({ state: 'detached', timeout: 5000 });

  // 헤더 이름 입력은 이제 combobox다(ui-polish 03). 제안 팝업이 열려 있는 동안
  // floating-ui가 바깥 요소를 aria-hidden 처리하므로(typeable combobox 규약,
  // FloatingFocusManager의 markOthers) 폼의 다른 컨트롤을 role로 조준할 수 없다.
  // 실제 사용자도 제안을 닫고 다음 필드로 가므로, 조작 전에 닫아 준다.
  // 팝업이 닫혀 있을 때 Escape를 누르면 폼이 닫히므로(N18d) 열린 경우에만 누른다.
  const closeSuggestions = async (page) => {
    if ((await page.getByRole('option').count()) === 0) return;
    await page.keyboard.press('Escape');
    await page
      .getByRole('option')
      .first()
      .waitFor({ state: 'detached', timeout: 2000 })
      .catch(() => {});
  };

  // Base UI Select 조작 (ADR 0011) — 트리거(combobox) 클릭 → 팝업의 option 클릭
  // (getByLabel은 트리거와 숨은 input 둘 다 잡으므로 role로 조준한다)
  /**
   * 셀렉트에서 값을 고른다 — 팝업이 **완전히 열린 뒤에** 누르고, **완전히 닫힌 뒤에** 돌아온다.
   *
   * 셀렉트 팝업이 열림/닫힘 전이를 갖게 되면서(N30) 두 가지가 새로 생겼다. (1) 열리는
   * 중에 누르면 항목이 아직 제자리가 아니라 옆 항목을 집을 수 있다 — Playwright의 stable
   * 판정만으로는 부족하다(오버슈트 곡선이라 되돌아오는 순간 두 프레임 동안 같은 자리에
   * 머문다). (2) 닫히는 팝업이 잠시 DOM에 남아, 곧바로 다음 조작을 하면 그 잔상과 겹친다.
   *
   * 그래서 앞뒤로 상태를 확정한다. 기다림을 호출부마다 흩어 두면 새 시나리오를 쓸 때마다
   * 같은 함정을 다시 밟는다.
   */
  const settledListboxes = (page, expected) =>
    page
      .waitForFunction(
        (want) => {
          const boxes = [...document.querySelectorAll('[role="listbox"]')];
          if (boxes.length !== want) return false;
          return boxes.every((b) => Number(getComputedStyle(b).opacity) === 1);
        },
        expected,
        { timeout: 5000 },
      )
      .catch(() => {});

  const pickOption = async (page, triggerLabel, optionName) => {
    await page.getByRole('combobox', { name: triggerLabel, exact: true }).click();
    const option = page.getByRole('option', { name: optionName, exact: true });
    await option.waitFor({ timeout: 5000 });
    await settledListboxes(page, 1);
    await option.click();
    await settledListboxes(page, 0);
  };

  /**
   * 매치 방식 셀렉트가 **무엇을 고르게 하는지** — 열어서 옵션 이름을 읽고 다시 닫는다.
   *
   * 개수만 세면 넷 중 둘을 감춘 것과 둘만 남긴 것을 구별하지 못하고, 하나만 확인하면 나머지
   * 셋이 아직 서 있어도 통과한다. 목록 자체를 읽는 것이 "고를 것이 둘뿐"의 실질이다.
   */
  const matchTypeOptionLabels = async (page) => {
    const trigger = page.getByRole('combobox', { name: 'URL match type', exact: true });
    await trigger.click();
    await settledListboxes(page, 1);
    // `allTextContents`는 기다리지 않는다 — 항목이 하나라도 붙은 뒤에 읽어야 빈 배열을
    // "선택지가 없다"로 잘못 읽지 않는다.
    await page.getByRole('option').first().waitFor({ timeout: 5000 });
    const labels = await page.getByRole('option').allTextContents();
    /*
     * 팝업은 **고르는 것으로** 닫는다. Escape로 닫으면 그 키가 폼까지 닿는 경로가 있어
     * (폼의 Esc는 닫기다) 다음 조작이 사라진 폼을 찾게 된다 — 실제로 그렇게 걸렸다.
     */
    await page.getByRole('option', { name: 'Wildcard', exact: true }).click();
    await settledListboxes(page, 0);
    return labels.map((label) => label.trim());
  };

  // N5: 통합 목록(ADR 0009) — 규칙 행 + '적용 조건' 캡션 + FILTER 행이 한 화면에
  await seedProfiles([
    baseProfile('n-tab', 'Tabbed',
      [
        { kind: 'request-header', id: 'm1', name: 'X-A', value: '1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
        // append 허용목록 헤더 — N7이 폼에서 Append 모드 전환을 검증한다
        { kind: 'request-header', id: 'm2', name: 'Accept', value: 'application/json', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
      ]),
  ]);
  await popup.reload();
  // 목록엔 규칙 행만 있다 — 프로필 수준 '적용 조건' 섹션은 퇴역했다 (ADR 0010)
  await popup.getByRole('button', { name: 'Edit', exact: true }).first().waitFor({ timeout: 5000 });
  const editCount = await popup.getByRole('button', { name: 'Edit', exact: true }).count();
  const profileCaptionGone = !(await popup.getByText('Conditions (whole profile)').isVisible().catch(() => false));
  record('N5: 목록은 규칙 행만 — 프로필 조건 섹션 퇴역',
    editCount === 2 && profileCaptionGone,
    `edit-buttons=${editCount}, profile-caption-gone=${profileCaptionGone}`);

  /*
   * N6: 폼 조건 disclosure — 조건 추가 → 배지 표기 → 비우면 conditions 제거 (ADR 0010).
   *
   * 예전에는 제외 도메인으로 쟀는데, 그 조건은 퇴역해 저장이 걷어 간다 (ADR 0017, 티켓 02) —
   * 그대로 두면 이 시나리오가 "폼 편집이 저장된다"가 아니라 "걷혀 나간다"를 재게 된다.
   * 재는 대상(disclosure 열림 → 저장 → 배지 → 비우면 제거)은 그대로 두고, **살아남는**
   * 조건인 요청 메서드로 옮긴다.
   */
  const pollFirstMod = (test, timeoutMs = 5000) =>
    pollUntil(
      () => sw.evaluate(async () => {
        const { state } = await chrome.storage.local.get('state');
        return state.profiles[0]?.modifications[0] ?? null;
      }),
      test,
      timeoutMs,
      100,
    );
  const methodChip = (name) =>
    popup.getByRole('group', { name: 'Methods' }).getByRole('button', { name, exact: true });
  await popup.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await methodChip('POST').click();
  await popup.getByRole('button', { name: SAVE_BUTTON }).click();
  const condAdded = await pollFirstMod((m) => m?.conditions?.requestMethods?.[0] === 'post');
  await waitFormClosed();
  // 조건은 행의 칩 줄로 표시된다 (티켓 05) — 메서드는 대문자 칩
  const condSummaryShown = await popup.getByText('POST', { exact: true }).first().isVisible().catch(() => false);
  /*
   * 조건 칩은 **접히지 않고 폼 본문에 바로 선다** (티켓 06). 예전에는 disclosure를 한 번 더
   * 눌러야 보였는데, 남은 것이 칩 두 줄뿐이라 접을 값이 없다 — 접어 두면 조건이 걸린 규칙을
   * 열어도 무엇으로 좁혀져 있는지 한 번 더 눌러야 보인다.
   */
  await popup.getByRole('button', { name: 'Edit', exact: true }).first().click();
  const chipsVisibleAtOnce = await methodChip('POST').isVisible().catch(() => false);
  await methodChip('POST').click(); // 선택 해제 → 남는 조건이 없다
  await popup.getByRole('button', { name: SAVE_BUTTON }).click();
  const condCleared = await pollFirstMod((m) => m !== null && m.conditions === undefined);
  await waitFormClosed();
  record('N6: 폼 조건 편집 — 추가·요약 표기·비우면 제거, 칩은 접지 않고 바로 보인다',
    condAdded?.conditions?.requestMethods?.[0] === 'post' && condSummaryShown
      && chipsVisibleAtOnce && condCleared?.conditions === undefined,
    `added=${JSON.stringify(condAdded?.conditions)}, summary=${condSummaryShown}, 바로보임=${chipsVisibleAtOnce}, cleared=${condCleared?.conditions === undefined}`);

  // N7: 규칙 폼 편집(ADR 0006) — Edit → 모드·메모 변경 → Save가 원자 반영
  const pollMod = (test, timeoutMs = 5000) =>
    pollUntil(
      () => sw.evaluate(async () => {
        const { state } = await chrome.storage.local.get('state');
        return state.profiles[0]?.modifications[1] ?? null;
      }),
      test,
      timeoutMs,
      100,
    );
  /*
   * 적용 방식(Mode) 컨트롤은 **화면에서 사라졌다** (ADR 0017, 티켓 06) — 이 자리가 재던
   * "모드를 바꿔 저장한다"는 이제 할 수 없는 조작이다. 남는 것은 폼이 하나만 열린다는 것과
   * 이름(메모) 편집이 원자적으로 저장된다는 것이고, 숨은 필드가 어떻게 되는지는 바로 아래
   * N7b가 잰다.
   */
  await popup.getByRole('button', { name: 'Edit', exact: true }).nth(1).click();
  const formCount = await popup.getByRole('combobox', { name: 'Type', exact: true }).count();
  const modeGone = (await popup.getByRole('combobox', { name: 'Mode' }).count()) === 0;
  await popup.getByLabel('Name', { exact: true }).fill('smoke comment');
  await popup.getByRole('button', { name: SAVE_BUTTON }).click();
  const editedMod = await pollMod((m) => m?.comment === 'smoke comment');
  record('N7: 규칙 폼 편집 — 폼은 하나만, 이름 원자 저장, 적용 방식 컨트롤 부재',
    formCount === 1 && modeGone && editedMod?.comment === 'smoke comment',
    `forms=${formCount}, mode-gone=${modeGone}, comment="${editedMod?.comment}"`);
  await waitFormClosed();

  /*
   * N7b: **숨은 필드를 정해 둔 옛 규칙이 폼 저장을 지나도 그대로 동작한다** (수용 기준).
   *
   * 예전에는 이 자리가 폼에서 `When empty`를 골랐다. 그 컨트롤이 사라졌으므로 이제 재야 하는
   * 것은 정반대다: 사용자가 볼 수도 만질 수도 없는 값이 **저장 한 번에 뒤집히지 않는가.**
   * 수렴이 이 필드까지 기본값으로 덮으면 빈 값을 보내던 헤더가 조용히 제거로 바뀐다.
   */
  await pollFirstMod((m) => m !== null);
  await sw.evaluate(async () => {
    const { state } = await chrome.storage.local.get('state');
    const mod = state.profiles[0].modifications[1];
    mod.emptyMeans = 'send-empty';
    mod.mode = 'append';
    mod.value = '';
    await chrome.storage.local.set({ state });
  });
  await popup.reload();
  await popup.getByRole('button', { name: 'Edit', exact: true }).nth(1).click();
  await popup.getByRole('combobox', { name: 'Type', exact: true }).waitFor({ timeout: 5000 });
  // 폼에는 그 값을 말하는 것이 아무것도 없다 — 그래도 저장이 지켜야 한다.
  const hiddenControlsGone =
    (await popup.getByRole('combobox', { name: 'When empty' }).count()) === 0 &&
    (await popup.getByRole('combobox', { name: 'Mode' }).count()) === 0;
  /*
   * 저장이 **착지한 뒤**를 봐야 한다. 이 폴러의 술어가 저장 전에도 참인 값이면(예: 직전
   * 시나리오가 이미 써 둔 메모) 저장이 숨은 필드를 덮어써도 통과한다 — 저장으로만 참이
   * 되는 표식을 새로 심고 그것을 기다린다.
   */
  await popup.getByLabel('Name', { exact: true }).fill('hidden-fields-probe');
  await popup.getByRole('button', { name: SAVE_BUTTON }).click();
  const preserved = await pollMod((m) => m?.comment === 'hidden-fields-probe');
  record('N7b: 숨은 필드(적용 방식·빈 값의 뜻)가 폼 저장을 지나도 그대로다',
    hiddenControlsGone && preserved?.emptyMeans === 'send-empty' && preserved?.mode === 'append',
    `컨트롤 부재=${hiddenControlsGone}, emptyMeans=${preserved?.emptyMeans}, mode=${preserved?.mode}`);
  await waitFormClosed();

  // N8: 사이드바 드래그·키보드 재정렬 → 목록 순서 + 겹침 승자 실반영, 메뉴엔 이동 없음 (ui-refine 06)
  const seedConf = () => seedProfiles([
    baseProfile('n-top', 'Top',
      [{ kind: 'request-header', id: 't1', name: 'X-Conf', value: 'top-wins', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' }]),
    baseProfile('n-bottom', 'Bottom',
      [{ kind: 'request-header', id: 'b1', name: 'X-Conf', value: 'bottom-wins', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' }]),
  ]);
  // dnd-kit은 지연 청크(ui-refine 08)라 그립이 드래그 가능해질 때까지 기다린다 —
  // useSortable이 그립에 aria-roledescription="sortable"을 붙이는 것이 로드 신호다.
  const waitSortableReady = () =>
    popup.locator('button[aria-label^="Reorder"][aria-roledescription="sortable"]')
      .first().waitFor({ timeout: 5000 });

  await seedConf();
  await popup.reload();
  await pollSessionRuleCount(sw, 2);
  await waitSortableReady();
  const winnerBefore = (await fetchEchoHeaders(pageB, '/headers'))['x-conf'];
  const orderNames = () => popup.locator('[aria-label^="Select profile"]').allTextContents();

  // (a) 마우스 드래그: Bottom 그립을 Top 위로 → 순서 뒤집힘 + 겹침 승자 반영
  const bottomGrip = popup.getByRole('button', { name: 'Reorder Bottom' });
  const topGrip = popup.getByRole('button', { name: 'Reorder Top' });
  const topBox = await topGrip.boundingBox();
  await bottomGrip.hover();
  await popup.mouse.down();
  await popup.mouse.move(topBox.x + topBox.width / 2, topBox.y - 4, { steps: 8 });
  await popup.mouse.move(topBox.x + topBox.width / 2, topBox.y - 6, { steps: 4 });
  /*
   * **놓는 프레임에 이미 새 순서여야 한다.**
   *
   * dnd-kit은 드롭과 순서 확정이 같은 React 커밋에서 일어난다고 전제한다. 이 앱의 순서는
   * 서비스워커를 한 바퀴 돌아야 갱신되므로(메시지 두 홉 + 쓰기 줄 + 저장소 IPC 셋) 그 커밋에
   * 옛 순서가 남고, 그러면 놓은 행에 원래 자리로 돌아가는 200ms 전이가 붙는다 — 아래로 끌면
   * "위로 갔다가 내려오는" 움직임이 된다. 목록이 낙관적으로 먼저 바뀌면 그 전이가 아예 안 붙는다.
   *
   * 재는 자리가 까다롭다. 폴링으로는 왕복이 끝난 뒤를 보게 되어 고치기 전에도 통과한다.
   * 그래서 **mouseup 다음 프레임**을 페이지 안에서 잡는다 — 리스너를 미리 걸어 두고 그
   * 안에서 rAF 한 번을 기다린다(React 커밋이 이벤트 끝에 flush된 뒤). 어떤 왕복도 한
   * 프레임 안에 끝나지 않으므로, 여기 찍힌 순서는 낙관 갱신의 것이지 권위의 것이 아니다.
   */
  await popup.evaluate(() => {
    window.__orderAtDrop = null;
    window.addEventListener(
      'mouseup',
      () => {
        requestAnimationFrame(() => {
          window.__orderAtDrop = [...document.querySelectorAll('[aria-label^="Select profile"]')]
            .map((el) => el.getAttribute('aria-label'));
        });
      },
      { once: true },
    );
  });
  await popup.mouse.up();
  const orderAtDrop = await popup
    .waitForFunction(() => window.__orderAtDrop != null, null, { timeout: 3000 })
    .then(() => popup.evaluate(() => window.__orderAtDrop), () => null);
  const droppedInPlace = orderAtDrop?.[0]?.startsWith('Select profile Bottom') === true;
  const dragOrder = await pollUntil(orderNames, (names) => names[0]?.startsWith('Bottom'), 5000, 100);
  const dragWinner = await pollUntil(
    () => fetchEchoHeaders(pageB, '/headers').then((h) => h['x-conf']),
    (v) => v === 'bottom-wins',
  );

  // (b) 키보드 재정렬: 그립 포커스 → Space 집기 → ArrowDown → Space 드롭 → 다시 Top이 위로
  await seedConf();
  await popup.reload();
  await pollSessionRuleCount(sw, 2);
  await waitSortableReady();
  // dnd-kit KeyboardSensor는 키 사이에 좌표 재계산·재렌더가 필요하다 — 짧게 대기한다.
  await popup.getByRole('button', { name: 'Reorder Top' }).focus();
  await popup.keyboard.press('Space'); // 집기
  await popup.waitForTimeout(150);
  await popup.keyboard.press('ArrowDown'); // 아래로
  await popup.waitForTimeout(150);
  await popup.keyboard.press('Space'); // 드롭 → move-profile
  const kbdOrder = await pollUntil(orderNames, (names) => names[0]?.startsWith('Bottom'), 5000, 100);
  const kbdWinner = await pollUntil(
    () => fetchEchoHeaders(pageB, '/headers').then((h) => h['x-conf']),
    (v) => v === 'bottom-wins',
  );

  // (c) Esc 취소: 집기→화살표→Esc면 순서가 원상 복귀하고 포커스는 그립에 남는다 (plan r1 R-2)
  // 현재 순서 [Bottom, Top]. Bottom 그립 집고 아래로 옮기다 Esc → 순서 유지.
  const beforeCancel = await orderNames();
  await popup.getByRole('button', { name: 'Reorder Bottom' }).focus();
  await popup.keyboard.press('Space');
  await popup.waitForTimeout(150);
  await popup.keyboard.press('ArrowDown');
  await popup.waitForTimeout(150);
  await popup.keyboard.press('Escape');
  await popup.waitForTimeout(300);
  const afterCancel = await orderNames();
  const cancelKeptOrder = beforeCancel.join('|') === afterCancel.join('|');
  const focusOnGrip = await popup.evaluate(
    () => document.activeElement?.getAttribute('aria-label') ?? '',
  );
  const focusKept = /Reorder Bottom/.test(focusOnGrip);

  /*
   * (d) 순서를 바꾸는 길은 **드래그와 키보드뿐**이다 (티켓 04).
   *
   * 예전에는 여기서 "⋯ 메뉴에 이동 항목이 없다"를 쟀다. 그 메뉴가 통째로 사라졌으므로 재는
   * 것을 옮긴다: 순서를 바꾸는 컨트롤이 그립 말고는 없다 — 위/아래 버튼이 어디에도 서지 않는다.
   */
  const moveButtonsGone =
    (await popup.getByRole('button', { name: /Move (up|down)/ }).count()) === 0;

  record('N8: 드래그(놓는 프레임에 확정)·키보드 재정렬+Esc 취소(원순서·포커스 유지), 이동 컨트롤은 그립뿐',
    winnerBefore === 'top-wins'
      && droppedInPlace
      && dragOrder[0]?.startsWith('Bottom') && dragWinner === 'bottom-wins'
      && kbdOrder[0]?.startsWith('Bottom') && kbdWinner === 'bottom-wins'
      && cancelKeptOrder && focusKept && moveButtonsGone,
    `drop-frame=${droppedInPlace}(${orderAtDrop?.join('|') ?? 'null'}), ` +
    `drag=[${dragOrder.join('|')}]/${dragWinner}, kbd=[${kbdOrder.join('|')}]/${kbdWinner}, cancel-kept=${cancelKeptOrder}, focus-kept=${focusKept}, move-buttons-gone=${moveButtonsGone}`);

  // N9: 탭 앱 셸 — 사이드바 검색·선택, 레일 화면 전환 (슬라이스 08)
  await seedProfiles([
    baseProfile('s-a', 'Alpha', []),
    { ...baseProfile('s-b', 'Beta', []), active: false },
    { ...baseProfile('s-g', 'Gamma', []), active: false },
  ]);
  await tabApp.reload();
  await tabApp.getByLabel('Search profiles').fill('Bet');
  const searchResult = await pollUntil(
    () => tabApp.locator('[aria-label^="Select profile"]').allTextContents(),
    (names) => names.length === 1,
  );
  await tabApp.getByLabel('Search profiles').fill('');
  await tabApp.getByRole('button', { name: 'Select profile Gamma' }).click();
  const sidebarSelected = await pollUntil(
    () => tabApp.locator('main h1').first().textContent().catch(() => ''),
    (v) => v === 'Gamma',
  );
  // 레일 전환은 fade-in(ui-refine 08)이라 대상 화면 렌더를 기다린다(즉시 isVisible 아님).
  await tabApp.getByRole('button', { name: 'Show backups' }).click();
  // 랜드마크가 패널 토글에서 **카드 제목**으로 바뀌었다 (티켓 09) — 접히는 패널이 없어졌다.
  const backupsShown = await tabApp.getByText('Backup history', { exact: true })
    .waitFor({ timeout: 5000 }).then(() => true, () => false);
  // 넓은 본문에서 **넘치지 않는지**까지 본다 (티켓 09 AC8) — 팝업은 N41g가 재고, 탭은 여기다.
  const backupsOverflow = await tabApp.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  await tabApp.getByRole('button', { name: 'Show settings' }).click();
  const prefsShown = await tabApp.getByText('Theme', { exact: true })
    .waitFor({ timeout: 5000 }).then(() => true, () => false);
  const prefsOverflow = await tabApp.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  await tabApp.getByRole('button', { name: 'Show profiles' }).click();
  record('N9: 탭 앱 셸 — 검색 필터·사이드바 선택·레일 전환, 넓은 본문에서 넘치지 않는다',
    searchResult.length === 1 && searchResult[0]?.startsWith('Beta') && sidebarSelected === 'Gamma'
      && backupsShown && prefsShown && backupsOverflow === 0 && prefsOverflow === 0,
    `search=[${searchResult.join('|')}], selected=${sidebarSelected}, backups=${backupsShown}, ` +
      `prefs=${prefsShown}, overflow 백업=${backupsOverflow}·설정=${prefsOverflow}`);

  // N10: 표면 동일성 — 탭 앱에서 규칙 폼으로 추가 → 실제 요청 반영 (ADR 0006 원자 저장)
  /*
   * `.first()`인 이유 (ADR 0017): 규칙 추가 버튼이 **둘**이다 — 본문 헤더의 것과 빈 상태
   * 상자의 CTA. 시안에 둘 다 있고 하는 일도 같다. DOM 순서상 헤더가 먼저이므로 first가 곧
   * 헤더 버튼이고, 이 스모크들이 재려는 것은 "규칙 추가 흐름"이지 어느 버튼인지가 아니다.
   */
  await tabApp.getByRole('button', { name: 'Add rule' }).first().click();
  await tabApp.getByLabel('Header name', { exact: true }).waitFor({ timeout: 5000 });
  await tabApp.getByLabel('Header name', { exact: true }).fill('X-From-Tab');
  await closeSuggestions(tabApp);
  await tabApp.getByLabel('Value', { exact: true }).fill('yes');
  await tabApp.getByRole('button', { name: SAVE_BUTTON }).click();
  await tabApp.getByRole('switch', { name: 'Toggle Gamma' }).click();
  await pollSessionRuleCount(sw, 1);
  const tabHeader = await pollUntil(
    () => fetchEchoHeaders(pageB, '/headers').then((h) => h['x-from-tab']),
    (v) => v === 'yes',
  );
  record('N10: 표면 동일성 — 탭 앱 편집이 실요청 반영', tabHeader === 'yes', `x-from-tab=${tabHeader}`);

  // N11: 키보드 경로 마감 — 사이드바·행 확장 토글 (탭=N5, 메뉴=N8과 함께 4종 완성)
  await seedProfiles([
    baseProfile('k-a', 'KeyA',
      [{ kind: 'request-header', id: 'm1', name: 'X-K', value: '1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' }]),
    { ...baseProfile('k-b', 'KeyB', []), active: false },
  ]);
  await popup.reload();
  // 사이드바 항목: 포커스 + Enter → 프로필 전환
  await popup.getByRole('button', { name: 'Select profile KeyB' }).focus();
  await popup.keyboard.press('Enter');
  const kbSwitched = await pollProfileName((v) => v === 'KeyB');
  // Edit 버튼: 포커스 + Enter → 규칙 폼 열림
  await popup.getByRole('button', { name: 'Select profile KeyA' }).click();
  await pollProfileName((v) => v === 'KeyA');
  await popup.getByRole('button', { name: 'Edit', exact: true }).first().focus();
  await popup.keyboard.press('Enter');
  // 폼 열림 마커: 종류 셀렉트는 어느 종류에서든 늘 있다 (숨은 필드 컨트롤은 티켓 06에서 사라졌다)
  const kbFormOpened = await popup
    .getByRole('combobox', { name: 'Type', exact: true })
    .waitFor({ timeout: 5000 })
    .then(() => true, () => false);
  await popup.getByRole('button', { name: 'Cancel' }).click();
  record('N11: 키보드 — 사이드바 전환·규칙 폼 열기',
    kbSwitched === 'KeyB' && kbFormOpened,
    `sidebar=${kbSwitched}, form=${kbFormOpened}`);

  /*
   * **N12(프로필 헤더 편집)가 없다** (ADR 0017, 티켓 04). 이름·두 글자 라벨·색을 채우고
   * 상태 반영을 보던 시나리오였는데, 그 컨트롤 셋이 사라졌다. 부재 자체는 N3이 잰다.
   */

  // N12b: 팝업 사이드바 검색 필터 (ADR 0005 — 검색이 양 표면에서 동작)
  await popup.getByLabel('Search profiles').fill('KeyA');
  const popupSearch = await pollUntil(
    () => popup.locator('[aria-label^="Select profile"]').allTextContents(),
    (names) => names.length === 1,
  );
  await popup.getByLabel('Search profiles').fill('');
  record('N12b: 팝업 사이드바 검색 필터',
    popupSearch.length === 1 && popupSearch[0]?.startsWith('KeyA'),
    `search=[${popupSearch.join('|')}]`);

  // N13: Export 경로 — 실제 다운로드 캡처 → 페이로드 검증 (release r1 R-2)
  // 현재 상태: KeyA(k-a) + KeyB(k-b). 전체 선택 기본 → 2개 내보내기.
  await popup.getByRole('button', { name: 'Show backups' }).click();
  await popup.getByRole('button', { name: 'Export…' }).click();
  const [exportDownload] = await Promise.all([
    popup.waitForEvent('download'),
    popup.getByRole('button', { name: /^Export \(2\)$/ }).click(),
  ]);
  const exportPayload = JSON.parse(readFileSync(await exportDownload.path(), 'utf8'));
  record('N13: Export 다운로드 → 페이로드 검증',
    exportDownload.suggestedFilename() === 'headerkit-profiles.json'
      // 포맷 버전은 상수를 따라간다 — 리터럴을 박으면 버전을 올릴 때마다 여기서 깨진다.
      // 내보내기는 항상 **현재** 버전으로 쓴다(읽기는 예전 v1도 받는다, ADR 0015).
      && exportPayload.headerkit === EXPORT_FORMAT_VERSION
      && exportPayload.profiles?.length === 2
      && exportPayload.profiles.some((p) => p.name === 'KeyA'),
    `file=${exportDownload.suggestedFilename()}, profiles=${exportPayload.profiles?.length}, names=[${exportPayload.profiles?.map((p) => p.name).join('|')}]`);
  // 뒤 시나리오는 규칙 본문을 만진다 — 프로필 화면으로 돌아간다.
  await popup.getByRole('button', { name: 'Show profiles' }).click();

  // N14: ko 로케일 접근성 이름 — aria-label이 en/ko 카탈로그를 경유한다 (aria-label-i18n)
  // 상태: KeyA(k-a, 켬) + KeyB(k-b, 꺼짐)
  const popupKo = await context.newPage();
  await popupKo.goto(`chrome-extension://${extensionId}/popup.html?locale=ko`);
  const koToggle = await popupKo
    .getByRole('switch', { name: 'KeyA 켜고 끄기' })
    .waitFor({ timeout: 5000 })
    .then(() => true, () => false);
  // ⋯ 메뉴가 사라졌으므로(티켓 04) 그 자리를 **행 메타**가 대신 잰다 — ko 카탈로그를 거친
  // `N개 규칙 · 미적용`이 화면에 서고, 같은 낱말이 행 이름 끝에도 들어간다(WCAG 2.5.3).
  const koRowMeta = await popupKo.getByText('규칙 0개 · 미적용', { exact: true }).isVisible().catch(() => false);
  const koSidebarItem = await popupKo.getByRole('button', { name: 'KeyB 프로필 선택 (미적용)' }).isVisible().catch(() => false);
  const koRowToggle = await popupKo
    .getByRole('button', { name: '편집' })
    .first()
    .isVisible()
    .catch(() => false);
  // 아이콘 버튼(ui-refine 03)의 ko aria — 삭제 아이콘이 카탈로그 경유 이름을 갖는다
  const koDeleteIcon = (await popupKo.getByRole('button', { name: '삭제', exact: true }).count()) > 0;
  await popupKo.close();
  record('N14: ko 접근성 이름 — aria 카탈로그 경유, 행 메타도 같은 낱말',
    koToggle && koRowMeta && koSidebarItem && koRowToggle && koDeleteIcon,
    `toggle=${koToggle}, meta=${koRowMeta}, sidebar=${koSidebarItem}, row=${koRowToggle}, delete-icon=${koDeleteIcon}`);

  /*
   * N14b: **폼 ko 라벨이 새 구성으로 뜨고, 퇴역한 조건 라벨은 어디에도 없다** (티켓 06).
   *
   * 예전 계약은 "Initiator 조건이 '요청 출처 도메인'으로 뜬다"였다. 그 조건 자체가 ADR
   * 0017에서 퇴역해 입력이 사라졌으므로 그 라벨을 재는 것은 이제 도달할 수 없는 것을 재는
   * 일이다. 이 자리가 지키던 목적(**폼 라벨이 카탈로그를 거친다**)은 그대로 두고, 대상을
   * 새 구성으로 옮긴다 — 그리고 퇴역한 라벨 넷이 되살아나지 않는지를 함께 건다.
   */
  const condKo = await context.newPage();
  await condKo.goto(`chrome-extension://${extensionId}/popup.html?locale=ko`);
  const condKoEdit = condKo.getByRole('button', { name: '편집' }).first();
  await condKoEdit.waitFor({ timeout: 5000 });
  await condKoEdit.click();
  await condKo.getByRole('combobox', { name: '종류', exact: true }).waitFor({ timeout: 5000 });
  // 시안 구성의 ko 라벨 — 이름·규칙 종류·리소스 묶음(여덟 칩의 한국어 이름).
  const koFormLabels =
    (await condKo.getByLabel('이름', { exact: true }).count()) === 1 &&
    (await condKo.getByRole('button', { name: '문서', exact: true }).count()) === 1 &&
    (await condKo.getByRole('button', { name: '기타', exact: true }).count()) === 1;
  // 퇴역한 조건 라벨 넷은 필드 라벨 자리로만 되살아날 수 있다 — 라벨 스코프로 좁혀 건다.
  const retiredLabels = ['제외 도메인', '요청 출처 도메인', '탭 도메인', '자동 해제 시각'];
  const retiredGone = (
    await Promise.all(retiredLabels.map((label) => condKo.getByLabel(label, { exact: true }).count()))
  ).every((count) => count === 0);
  await condKo.close();
  record('N14b: ko 폼 라벨 — 시안 구성이 카탈로그를 거치고, 퇴역 조건 라벨 넷은 없다',
    koFormLabels && retiredGone,
    `새 라벨=${koFormLabels}, 퇴역 라벨 부재=${retiredGone}`);

  // N15: 규칙 단위 URL 필터 (ADR 0007/0008) — contains(비정규식)와 regex 두 방식 모두
  // 매칭 URL에만 적용되고, 무스코프 규칙은 전역이며, 프로필 필터는 건드리지 않는다.
  // 상태: KeyA(k-a, 켬, X-K:1) + KeyB. 팝업은 KeyA 선택.
  // 1) 기존 규칙(X-K)에 contains 스코프(기본 방식) 부여 — 평문 부분 문자열
  await popup.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await popup.getByLabel('URL filter').fill('scope=1');
  await popup.getByRole('button', { name: SAVE_BUTTON }).click();
  /*
   * 폼이 **접히기를 기다린다** (ADR 0017). 예전에는 하단 추가 버튼이 폼이 있는 동안 감춰져
   * 클릭이 저절로 기다렸는데, 헤더의 추가 버튼은 자리가 고정이라 늘 있다. 기다리지 않으면
   * 나가는 폼과 들어오는 폼이 한동안 둘 다 DOM에 있어 같은 이름의 입력이 둘이 된다.
   */
  await waitFormClosed();
  // 2) 무스코프 규칙(X-U) 추가
  await popup.getByRole('button', { name: 'Add rule' }).first().click();
  await popup.getByLabel('Header name', { exact: true }).fill('X-U');
  await closeSuggestions(popup);
  await popup.getByLabel('Value', { exact: true }).fill('u');
  await popup.getByRole('button', { name: SAVE_BUTTON }).click();
  await waitFormClosed();
  const kaState = await pollUntil(
    () => sw.evaluate(async () => {
      const { state } = await chrome.storage.local.get('state');
      const prof = state.profiles.find((x) => x.id === 'k-a');
      return { mods: prof?.modifications ?? [] };
    }),
    (s) => s.mods.length === 2 && s.mods[0]?.urlFilter === 'scope=1' && s.mods[0]?.urlMatchType === 'contains',
  );
  const inScope = await pollUntil(
    () => fetchEchoHeaders(pageB, '/headers?scope=1'),
    (h) => h['x-k'] === '1' && h['x-u'] === 'u',
  );
  const outScope = await fetchEchoHeaders(pageB, '/headers');
  /*
   * 행이 스코프와 효과를 **각각의 칩으로** 그린다 (ADR 0017, 티켓 05). 예전에는 `스코프 →
   * 효과` 한 문자열이라 정규식 하나로 잴 수 있었는데, 이제 둘이 따로라 둘 다 있는지를 본다 —
   * 스코프 칩만 보면 효과가 사라져도 통과하고, 그 반대도 마찬가지다.
   */
  const ruleRow = popup
    .locator('.group')
    .filter({ has: popup.getByRole('button', { name: 'Edit', exact: true }) })
    .first();
  const scopedSummary =
    (await ruleRow.getByText('scope=1', { exact: false }).first().isVisible().catch(() => false)) &&
    (await ruleRow.getByText(/^X-K: 1$/).first().isVisible().catch(() => false));
  // 3) regex(고급) 방식으로 전환 — 실요청 검증
  await waitFormClosed();
  await popup.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await pickOption(popup, 'URL match type', 'Regex');
  await popup.getByLabel('URL filter').fill(`127\\.0\\.0\\.1:${port}/headers\\?scope=2`);
  await popup.getByRole('button', { name: SAVE_BUTTON }).click();
  const regexIn = await pollUntil(
    () => fetchEchoHeaders(pageB, '/headers?scope=2'),
    (h) => h['x-k'] === '1',
  );
  const regexOut = await fetchEchoHeaders(pageB, '/headers');
  // 4) 스코프 비우면 두 필드 모두 제거 → 어디서나 적용
  await waitFormClosed();
  await popup.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await popup.getByLabel('URL filter').fill('');
  await popup.getByRole('button', { name: SAVE_BUTTON }).click();
  const cleared = await pollUntil(
    () => sw.evaluate(async () => {
      const { state } = await chrome.storage.local.get('state');
      const mod = state.profiles.find((x) => x.id === 'k-a')?.modifications[0] ?? {};
      return { hasFilter: 'urlFilter' in mod, hasType: 'urlMatchType' in mod };
    }),
    (s) => !s.hasFilter && !s.hasType,
  );
  const clearedHeaders = await pollUntil(
    () => fetchEchoHeaders(pageB, '/headers'),
    (h) => h['x-k'] === '1',
  );
  record('N15: 규칙 URL 필터 — contains·regex 스코핑, 무스코프 전역, 비우면 해제',
    kaState.mods.length === 2 && inScope['x-k'] === '1' && inScope['x-u'] === 'u'
      && outScope['x-k'] === undefined && outScope['x-u'] === 'u'
      && scopedSummary && regexIn['x-k'] === '1' && regexOut['x-k'] === undefined
      && !cleared.hasFilter && !cleared.hasType && clearedHeaders['x-k'] === '1',
    `mods=${kaState.mods.length}, contains=[${inScope['x-k']},${outScope['x-k']}], regex=[${regexIn['x-k']},${regexOut['x-k']}], summary=${scopedSummary}, storage-cleared=[${cleared.hasFilter},${cleared.hasType}], cleared=${clearedHeaders['x-k']}`);

  // N16: 칩 그룹 (ADR 0011) — 캡션 호버가 첫 칩에 전파되지 않고, 칩 토글이 저장된다
  await seedProfiles([
    baseProfile('p-chip', 'Chips',
      [{ kind: 'request-header', id: 'm1', name: 'X-Chip', value: '1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' }]),
  ]);
  await popup.reload();
  await popup.getByRole('button', { name: 'Edit', exact: true }).first().click();
  // 칩은 접이식 안이 아니라 폼 본문에 바로 선다 (티켓 06). 첫 칩은 브라우저 토큰이 아니라
  // **묶음 이름**이다 — 폼과 행이 같은 어휘를 쓴다.
  const firstChip = popup.getByRole('button', { name: 'XHR', exact: true });
  await firstChip.waitFor({ timeout: 5000 });
  const chipBg = () => firstChip.evaluate((el) => getComputedStyle(el).backgroundColor);
  const bgIdle = await chipBg();
  // transition-colors가 있으므로 호버 후 정착값을 폴링으로 읽는다
  await popup.getByText('Resource types', { exact: true }).hover();
  await popup.waitForTimeout(300);
  const bgCaptionHover = await chipBg();
  await firstChip.hover();
  const bgChipHover = await pollUntil(chipBg, (v) => v !== bgIdle, 3000, 100);
  await firstChip.click();
  const pressedAfterClick = await firstChip.getAttribute('aria-pressed');
  /*
   * 다중 선택 — 두 번째 묶음도 켜서 함께 저장된다. **묶음 칩 하나가 브라우저 값 여럿으로
   * 펴진다**(티켓 05의 리소스 묶음 모듈): `문서`는 최상위 문서와 프레임 안 문서를 함께 뜻하고
   * `XHR`은 값 하나다. 저장된 배열이 그 펴진 결과인지가 이 자리의 새 계약이다.
   */
  await popup.getByRole('button', { name: 'Document', exact: true }).click();
  await popup.getByRole('button', { name: SAVE_BUTTON }).click();
  const pollChipConditions = (test) =>
    pollUntil(
      () => sw.evaluate(async () => {
        const { state } = await chrome.storage.local.get('state');
        return state.profiles[0]?.modifications[0]?.conditions ?? null;
      }),
      test,
    );
  const chipSaved = await pollChipConditions((c) => c?.resourceTypes?.length === 3);
  await waitFormClosed();
  // 해제: XHR 칩을 끄고 저장하면 그 값만 배열에서 빠지고 문서 묶음은 남는다.
  await popup.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await popup.getByRole('button', { name: 'XHR', exact: true }).click();
  await popup.getByRole('button', { name: SAVE_BUTTON }).click();
  const chipDeselected = await pollChipConditions((c) => c?.resourceTypes?.length === 2);
  record('N16: 칩 그룹 — 캡션 호버 비전파, 묶음 토글이 값 여럿으로 펴져 저장, 해제 반영',
    bgIdle === bgCaptionHover && bgChipHover !== bgIdle && pressedAfterClick === 'true'
      && chipSaved?.resourceTypes?.join() === 'main_frame,sub_frame,xmlhttprequest'
      && chipDeselected?.resourceTypes?.join() === 'main_frame,sub_frame',
    `idle=${bgIdle}, caption-hover=${bgCaptionHover}, chip-hover=${bgChipHover}, pressed=${pressedAfterClick}, saved=${JSON.stringify(chipSaved?.resourceTypes)}, deselected=${JSON.stringify(chipDeselected?.resourceTypes)}`);

  // N17: 아이콘 버튼 — 툴팁(호버·포커스), 행 액션 호버 표시, 환경설정 정리 (ui-refine 03)
  await waitFormClosed();
  const editIcon = popup.getByRole('button', { name: 'Edit', exact: true }).first();
  const iconOpacity = () => editIcon.evaluate((el) => getComputedStyle(el.parentElement).opacity);
  const row = popup.locator('.group').filter({ has: editIcon }).first();
  const opacityIdle = await iconOpacity();
  await row.hover();
  const opacityRowHover = await pollUntil(iconOpacity, (v) => v === '1', 3000, 100);
  await editIcon.hover();
  const tooltipOnHover = await popup
    .getByRole('tooltip')
    .filter({ hasText: 'Edit' })
    .waitFor({ timeout: 5000 })
    .then(() => true, () => false);
  await popup.mouse.move(0, 0);
  /*
   * 툴팁은 키보드 포커스(focus-visible)에 열린다 — 프로그램적 focus()가 아니라 실제 Tab.
   * 시작점을 **그 행 안의** 스위치로 잡는다 (티켓 05에서 체크박스가 토글 스위치가 됐다):
   * 페이지 전역에서 첫 스위치를 잡으면 프로필 열의 토글이라, 거기서 Tab 해도 이 행의 편집
   * 아이콘에 닿지 않는다.
   */
  await row.getByRole('switch').first().focus();
  await popup.keyboard.press('Tab');
  const tooltipOnFocus = await popup
    .getByRole('tooltip')
    .filter({ hasText: 'Edit' })
    .waitFor({ timeout: 5000 })
    .then(() => true, () => false);
  // 계약이 바뀌었다 — 예전에는 idle이 **0**(호버 전에는 아예 안 보임)이었다. 그때는
  // 편집·삭제가 존재한다는 사실 자체를 호버로만 알 수 있었고, 호버가 없는 입력(터치·펜)과
  // 처음 쓰는 사용자에게는 규칙 편집 경로가 발견 불가였다 (ui-review UI-03).
  //
  // 이제 기본 0.6으로 존재만 알리고 호버·포커스에서 1이 된다. **0이 아니라는 것**이 계약의
  // 핵심이라 값을 그대로 못박는다 — 다시 0으로 돌아가면 여기서 실패한다.
  record('N17a: 행 액션 — 평소 은은히 보이고 호버·포커스에 또렷 + 아이콘 툴팁',
    opacityIdle === '0.6' && opacityRowHover === '1' && tooltipOnHover && tooltipOnFocus,
    `idle=${opacityIdle}, row-hover=${opacityRowHover}, tooltip-hover=${tooltipOnHover}, tooltip-focus=${tooltipOnFocus}`);

  /*
   * N17b: **설정은 셋뿐이다** — 테마 · 배지 표시 · 언어 (티켓 09 AC6·AC7, 스펙 story 78–80).
   *
   * 예전에는 여기서 단축키 문구 부재와 자동완성 사전 pill의 제거 가능 여부를 쟀다. 시안에
   * 그 카드들이 없어 셋 다 걷혔으므로, 재는 것을 뒤집는다: 남아야 하는 셋이 서 있고 걷힌
   * 것들이 하나도 되살아나지 않았는지 본다. 부재만 세면 "화면이 통째로 안 그려졌다"도
   * 통과하므로 존재와 부재를 같은 호흡에서 함께 건다.
   */
  await popup.getByRole('button', { name: 'Show settings' }).click();
  await settleScreen(popup, 'Theme');
  const prefsPresent = {
    theme: await popup.getByRole('button', { name: 'System', exact: true }).count(),
    dark: await popup.getByRole('button', { name: 'Dark', exact: true }).count(),
    light: await popup.getByRole('button', { name: 'Light', exact: true }).count(),
    badge: await popup.getByRole('switch', { name: 'Applied rule count' }).count(),
    langEn: await popup.getByRole('button', { name: 'English', exact: true }).count(),
    langKo: await popup.getByRole('button', { name: '한국어', exact: true }).count(),
  };
  const prefsGone = {
    // 단축키 목록 (스펙 Out of Scope) — 등록된 커맨드는 살아 있고, 없어진 것은 이 화면뿐이다.
    shortcuts: await popup.getByText('Keyboard shortcuts', { exact: true }).count(),
    // 자동완성 사전 관리 — 그 일은 이제 규칙 저장이 한다(L2a).
    autocomplete: await popup.getByText('Autocomplete header names', { exact: true }).count(),
    addField: await popup.getByLabel('New autocomplete header').count(),
    // 일본어 (스펙 Out of Scope) — 번역과 검토자가 없다.
    japanese: await popup.getByRole('button', { name: /日本語|Japanese/ }).count(),
    // 디버그 토글 (스펙 Out of Scope)
    debug: await popup.getByText(/Debug/i).count(),
  };
  await popup.getByRole('button', { name: 'Show profiles' }).click();
  record('N17b: 설정 — 테마·배지·언어 셋만 서고 단축키·자동완성 사전·일본어·디버그는 없다',
    Object.values(prefsPresent).every((n) => n === 1) &&
      Object.values(prefsGone).every((n) => n === 0),
    `있음=${JSON.stringify(prefsPresent)}, 없음=${JSON.stringify(prefsGone)}`);

  // N18: 저장 검증 + 폼 정리 + 폼 키보드 (ui-refine 04)
  await seedProfiles([
    baseProfile('p-form', 'Form',
      [{ kind: 'request-header', id: 'm1', name: 'X-Base', value: '1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' }]),
  ]);
  await popup.reload();

  // a: 빈 헤더 이름 Save → 인라인 오류 + aria-invalid + 저장 안 됨(폼 유지)
  await popup.getByRole('button', { name: 'Add rule' }).first().click();
  const nameInput = popup.getByLabel('Header name', { exact: true }).first();
  /*
   * **새 규칙은 맨 위 '이름'(메모) 칸에서 시작한다.** 예전에는 종류별 첫 칸(여기서는 헤더
   * 이름)이 포커스를 가져갔는데, 그러면 폼의 첫 칸을 건너뛰고 중간에 커서가 놓여 이름을
   * 적으려면 위로 되돌아가야 했다. **편집** 경로는 그대로 종류별 첫 칸이고 그쪽 계약은
   * L2f가 지킨다 — 두 경로가 갈린다는 것이 이 단언과 L2f를 함께 읽어야 하는 이유다.
   *
   * 이름 입력은 `aria-label`이 아니라 Field 라벨로 이름을 얻으므로(FieldLabeled의 자동
   * 연결) `input[aria-label=…]`으로는 못 잡는다. 포커스된 요소에서 **거꾸로** 그 라벨을
   * 읽는다 — 정착을 기다리는 이유는 헤더 이름 입력이 지연 청크 도착 시 한 번 교체되기
   * 때문이다(ui-polish 03): 그 리마운트가 포커스를 훔치지 않는지까지 이 대기가 본다.
   */
  const autofocused = await popup
    .waitForFunction(
      () => {
        const el = document.activeElement;
        return el instanceof HTMLInputElement && el.labels?.[0]?.textContent?.trim() === 'Name';
      },
      null,
      { timeout: 500 },
    )
    .then(() => true, () => false);
  await popup.getByRole('button', { name: SAVE_BUTTON }).click();
  const inlineError = await popup.getByText('Required.', { exact: true }).first()
    .waitFor({ timeout: 5000 }).then(() => true, () => false);
  const ariaInvalid = await nameInput.getAttribute('aria-invalid');
  const modsAfterBlockedSave = await sw.evaluate(async () => {
    const { state } = await chrome.storage.local.get('state');
    return state.profiles[0].modifications.length;
  });
  record('N18a: 빈 필수 필드 Save 차단 — 인라인 오류·aria-invalid·스토리지 불변·이름 칸 autofocus',
    autofocused && inlineError && ariaInvalid === 'true' && modsAfterBlockedSave === 1,
    `autofocus(이름)=${autofocused}, error=${inlineError}, aria-invalid=${ariaInvalid}, mods=${modsAfterBlockedSave}`);

  // N18f: Type 셀렉트가 더는 CSP를 제공하지 않는다 (ADR 0013). "CSP 없음"만 단언하면
  // 셀렉트가 통째로 깨져도 통과하므로, 남아야 할 종류가 빠짐없이 그대로인지 함께 본다.
  // (퇴역한 N18e[빈 CSP 디렉티브 Save 차단]와 혼동하지 않도록 새 번호를 쓴다.)
  // 여기 끼는 이유: 뒤의 b~d는 종류를 갈아 끼우며 폼 상태를 굴리므로, 옵션 목록은
  // 아직 아무 종류도 바꾸지 않은 갓 열린 폼에서 읽어야 한다. N18a의 autofocus 단언
  // 뒤여야 셀렉트로 옮겨 간 포커스가 그 단언을 오염시키지 않는다.
  // 팝업은 pickOption과 같은 대기 규율로 열고, 닫을 때는 Esc 대신 현재 종류를 다시
  // 고른다 — 팝업이 안 열린 채 누른 Esc는 폼까지 닫아 뒤 케이스를 무너뜨린다.
  await popup.getByRole('combobox', { name: 'Type', exact: true }).click();
  const typeOpened = await popup
    .getByRole('option', { name: 'Redirect', exact: true })
    .waitFor({ timeout: 5000 })
    .then(() => true, () => false);
  await settledListboxes(popup, 1);
  const kindOptions = (await popup.getByRole('option').allTextContents()).map((n) => n.trim());
  if (typeOpened) {
    await popup.getByRole('option', { name: 'Request header', exact: true }).click();
    await settledListboxes(popup, 0);
  }
  // 퇴역 CSP(ADR 0013)는 없고, 살아 있는 종류는 **정확히** 이 목록이다. 길이까지 보는 이유는
  // 종류가 조용히 늘거나 줄면 폼·컴파일·요약이 함께 갱신됐는지 확인할 지점이 필요해서다.
  // User-Agent·Remove header·Block request는 ADR 0015에서 더해졌다.
  const keptKinds = [
    'Request header',
    'Response header',
    'Request cookie',
    'Response cookie',
    'Redirect',
    'User-Agent',
    'Remove header',
    'Block request',
  ];
  record('N18f: Type 셀렉트 옵션 — CSP 없음, 살아 있는 8종 정확히 유지',
    typeOpened && !kindOptions.some((o) => /csp/i.test(o)) &&
      keptKinds.every((k) => kindOptions.includes(k)) && kindOptions.length === keptKinds.length,
    `열림=${typeOpened}, options=[${kindOptions.join(' | ')}]`);

  // b: 종류 전환은 이전 종류의 검증 오류를 지운다 — 차단 Save 직후(N18a에서 name 오류
  //    상태) Request cookie로 바꾸면 아직 Save한 적 없으므로 오류가 없어야 한다.
  await pickOption(popup, 'Type', 'Request cookie');
  const cookieLabelShown = await popup.getByText('Cookie name', { exact: true }).isVisible().catch(() => false);
  const noStaleError = (await popup.getByText('Required.', { exact: true }).count()) === 0;
  // Redirect로 바꿔 Save하면 패턴·치환 두 오류가 새로 뜬다
  await pickOption(popup, 'Type', 'Redirect');
  await popup.getByRole('button', { name: SAVE_BUTTON }).click();
  const redirectErrors = await popup.getByText('Required.', { exact: true }).count();
  await pickOption(popup, 'Type', 'Response cookie');
  const setCookieSelected = await popup.getByRole('combobox', { name: 'Type', exact: true }).textContent();
  record('N18b: 종류 전환 시 스테일 오류 없음 + 응답 쿠키·쿠키 이름 라벨 + Redirect 2필드 오류',
    cookieLabelShown && noStaleError && redirectErrors === 2 && /Response cookie/.test(setCookieSelected ?? ''),
    `cookie-label=${cookieLabelShown}, no-stale=${noStaleError}, redirect-errors=${redirectErrors}, kind="${(setCookieSelected ?? '').trim()}"`);

  /*
   * N18g: 새 종류(ADR 0015)의 폼은 자기에게 맞는 필드만 보인다.
   *
   * 각 종류가 무엇을 묻지 **않는지**가 설계의 핵심이라 그것을 단언한다 — User-Agent는
   * 헤더 이름을 묻지 않고(고정이라 오타 위험을 없앤다), Remove header는 값을 묻지 않는다
   * (양쪽에서 지우는 것이 전부라 값이 뜻을 갖지 않는다). 필드가 새어 나오면 사용자는
   * 아무 효과 없는 입력을 채우게 된다.
   */
  await pickOption(popup, 'Type', 'User-Agent');
  const uaValueShown = await popup
    .getByLabel('User-Agent', { exact: true })
    .isVisible()
    .catch(() => false);
  const uaHidesHeaderName = (await popup.getByLabel('Header name', { exact: true }).count()) === 0;

  await pickOption(popup, 'Type', 'Remove header');
  const delNameShown = await popup
    .getByLabel('Header name', { exact: true })
    .isVisible()
    .catch(() => false);
  const delHidesValue = (await popup.getByLabel('Value', { exact: true }).count()) === 0;
  await pickOption(popup, 'Type', 'Block request');
  const blockHidesName = (await popup.getByLabel('Header name', { exact: true }).count()) === 0;
  const blockHidesValue = (await popup.getByLabel('Value', { exact: true }).count()) === 0;
  const blockScopeShown = await popup
    .getByLabel('URL filter (this rule only)', { exact: true })
    .isVisible()
    .catch(() => false);
  record('N18g: 새 종류 폼 — UA는 값만, Remove header는 이름만, Block은 스코프만',
    uaValueShown && uaHidesHeaderName && delNameShown && delHidesValue &&
      blockHidesName && blockHidesValue && blockScopeShown,
    `ua: value=${uaValueShown} no-name=${uaHidesHeaderName}, del: name=${delNameShown} no-value=${delHidesValue}, ` +
      `block: no-name=${blockHidesName} no-value=${blockHidesValue} scope=${blockScopeShown}`);

  /*
   * N18h: **넓은 스코프 Block은 되묻지 않고 그냥 저장된다** (수용 기준, 티켓 07).
   *
   * 예전에는 도메인에 묶이지 않은 스코프에 확인을 한 번 더 받았고, 이 자리와 N18j·N18k·N18l이
   * 그 단계를 여러 패턴으로 쟀다. 넓은 것은 **틀린 것이 아니라** 사용자가 정말 원했을 수 있는
   * 상태라 그 단계를 걷었다 — 모든 광고 도메인을 한 번에 막는 식.
   *
   * 그 패턴들의 **판정**(어느 것이 넓은가)은 사라지지 않았다. 화면이 더 이상 반응하지 않아
   * 실브라우저에서 관측할 것이 없으므로 `url-scope.test.ts`로 옮겨 붙들었다. 여기서 재는 것은
   * 하나다: 넓다는 이유로 저장이 멈추지 않는가, 그리고 되묻는 UI가 정말 없는가.
   */
  const blockRuleCount = () =>
    sw.evaluate(async () => {
      const { state } = await chrome.storage.local.get('state');
      return state.profiles.flatMap((p) => p.modifications).filter((m) => m.kind === 'block').length;
    });
  await popup.getByLabel('URL filter').fill('*://*/*');
  /*
   * 하중을 지는 것은 **첫 클릭에 저장됐는가** 하나다. 버튼이 죽어 있었다면 클릭이 아무 일도
   * 하지 않아 이 폴러가 0에서 끝난다 — 그것이 "되묻는 단계가 없다"의 실질이다.
   *
   * 여기에 "버튼이 살아 있다"를 따로 재던 줄은 걷었다: 채우기 **전에도** 살아 있으므로
   * (빈 스코프는 `required`이지 못 쓰는 값이 아니다) 어느 상태에서든 참이라 반증력이 없었다.
   * 죽었다 살아나는 전이는 N48이 잰다.
   */
  await popup.getByRole('button', { name: SAVE_BUTTON }).click();
  const wideSaved = await pollUntil(blockRuleCount, (n) => n === 1);
  await waitFormClosed();
  record('N18h: 넓은 스코프 Block — 되묻지 않고 첫 클릭에 저장된다',
    wideSaved === 1,
    `saved=${wideSaved}`);

  /*
   * N18i: 좁은 스코프 Block도 같은 길로 저장되고, 목록이 실효 스코프를 보여 준다.
   */
  await popup.getByRole('button', { name: 'Add rule' }).first().click();
  await popup.getByRole('combobox', { name: 'Type', exact: true }).waitFor({ timeout: 5000 });
  await pickOption(popup, 'Type', 'Block request');
  await popup.getByLabel('URL filter').fill('ads.example.com');
  await popup.getByRole('button', { name: SAVE_BUTTON }).click();
  const narrowSaved = await pollUntil(blockRuleCount, (n) => n === 2);
  await waitFormClosed();
  // 목록은 실효 스코프를 항상 보여 준다 — 넓은 Block이 여기서 드러난다.
  const wideScopeVisibleInList = await popup
    .getByText('*://*/*', { exact: true })
    .isVisible()
    .catch(() => false);
  record('N18i: 좁은 스코프 Block도 바로 저장 + 목록이 실효 스코프를 보여 준다',
    narrowSaved === 2 && wideScopeVisibleInList,
    `narrow-saved=${narrowSaved}, wide-scope-in-list=${wideScopeVisibleInList}`);

  // 아래 c~e는 열린 폼을 이어서 굴린다 — Block 저장으로 닫혔으니 다시 연다.
  await popup.getByRole('button', { name: 'Add rule' }).first().click();
  await popup.getByRole('combobox', { name: 'Type', exact: true }).waitFor({ timeout: 5000 });

  /*
   * c: **숨은 필드 컨트롤 셋이 화면에 없다** (수용 기준, ADR 0017).
   *
   * 예전 계약은 "append 불가 헤더면 Mode를 숨긴다"였다 — 그 컨트롤 자체가 사라졌으므로
   * 조건부 노출을 재는 것은 이제 뜻이 없다. 대신 셋이 **어느 종류에서도** 서지 않는지를
   * 잰다: 적용 방식·빈 값의 뜻은 값을 가진 종류에서만 있었으므로 그 종류를 골라 확인해야
   * 부재 단언이 공허해지지 않는다.
   */
  await pickOption(popup, 'Type', 'Request header');
  await popup.getByLabel('Header name', { exact: true }).fill('Accept'); // append 허용 헤더 = 옛 노출 조건
  await closeSuggestions(popup);
  /*
   * 감도 대조가 **먼저**다. 헤더 이름 제안 팝업이 열려 있으면 floating-ui가 폼의 나머지를
   * aria-hidden 처리해 role 조회가 전부 0을 돌려준다 — 그때 아래 부재 단언은 컨트롤이
   * 살아 있어도 통과한다. 같은 조회 방식으로 **있어야 하는** 것이 잡히는지 먼저 본다.
   */
  const probeWorks = (await popup.getByRole('combobox', { name: 'Type', exact: true }).count()) === 1;
  const hiddenFieldControls = await Promise.all([
    popup.getByRole('combobox', { name: 'Mode' }).count(),
    popup.getByRole('combobox', { name: 'When empty' }).count(),
  ]);
  // 매치 방식은 남지만 **선택지가 둘뿐**이다 — 넷을 늘어놓던 컨트롤이 아니다 (story 21).
  const matchOptions = await matchTypeOptionLabels(popup);
  // d: 정규식을 고르면 예시가 그 문법으로 바뀐다 (story 22)
  await pickOption(popup, 'URL match type', 'Regex');
  const regexPlaceholder = await popup.getByLabel('URL filter').getAttribute('placeholder');
  record('N18c: 숨은 필드 컨트롤 부재 + 매치 방식 2지 + regex placeholder 분기',
    probeWorks &&
      hiddenFieldControls.every((count) => count === 0) &&
      matchOptions.join('|') === 'Wildcard|Regex' &&
      /\^https/.test(regexPlaceholder ?? ''),
    `감도대조=${probeWorks}, 숨은 컨트롤=${JSON.stringify(hiddenFieldControls)}, 매치 선택지=${JSON.stringify(matchOptions)}, placeholder="${regexPlaceholder}"`);

  // e: 키보드 — Cmd/Ctrl+Enter 저장, Esc 닫기
  await popup.getByLabel('Header name', { exact: true }).fill('X-Kbd');
  await closeSuggestions(popup);
  await popup.getByLabel('Value', { exact: true }).fill('kbd');
  await popup.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
  const kbdSaved = await pollUntil(
    () => sw.evaluate(async () => {
      const { state } = await chrome.storage.local.get('state');
      return state.profiles[0].modifications.some((m) => m.name === 'X-Kbd');
    }),
    (v) => v === true,
  );
  await waitFormClosed();
  await popup.getByRole('button', { name: 'Add rule' }).first().click();
  await popup.getByLabel('Header name', { exact: true }).waitFor({ timeout: 5000 });
  // 열린 Select 팝업 안의 Esc는 팝업만 닫고 폼은 유지해야 한다(이중 닫힘 방지)
  await popup.getByRole('combobox', { name: 'Type', exact: true }).click();
  await popup.getByRole('option', { name: 'Request header', exact: true }).waitFor({ timeout: 5000 });
  await popup.keyboard.press('Escape');
  const popupClosedFormKept = await pollUntil(
    () => popup.getByRole('option').count(),
    (n) => n === 0,
    3000,
    100,
  );
  const formStillOpen = await popup.getByRole('button', { name: SAVE_BUTTON }).isVisible().catch(() => false);
  // 폼 본문의 Esc는 폼을 닫는다
  await popup.keyboard.press('Escape');
  const escClosed = await popup.getByRole('button', { name: SAVE_BUTTON })
    .waitFor({ state: 'detached', timeout: 5000 }).then(() => true, () => false);
  record('N18d: Cmd/Ctrl+Enter 저장 + Select 팝업 Esc는 폼 유지 + 폼 Esc는 닫힘',
    kbdSaved === true && popupClosedFormKept === 0 && formStillOpen && escClosed,
    `saved=${kbdSaved}, popup-only-close=${popupClosedFormKept === 0 && formStillOpen}, form-esc-closed=${escClosed}`);

  /*
   * N19a: 행 둘째 줄의 칩 구성 + 빈 상태 CTA (ADR 0017, 티켓 05).
   *
   * **재는 계약이 바뀌었다.** 예전에는 "조건 없는 행은 배지 줄이 높이에 0을 기여한다"였다 —
   * 조건이 있을 때만 줄이 생겼기 때문이다. 시안의 둘째 줄은 **스코프 칩으로 시작**하므로
   * 조건이 없어도 줄이 선다(story 13: 어디에 걸리는지가 가장 중요하다). 높이 불변을 계속
   * 재면 그 결정을 되돌리라고 요구하는 테스트가 된다.
   *
   * 대신 **무엇이 어느 칩으로 나오는가**를 잰다: 스코프가 맨 앞이고, 조건 칩은 조건 있는
   * 행에만 붙으며, 리소스는 브라우저 토큰(`script`)이 아니라 묶음 이름(`Script`)이다.
   */
  await seedProfiles([
    baseProfile('p-badge', 'Badges', [
      { kind: 'request-header', id: 'm1', name: 'X-Plain', value: '1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
      // 메모가 실린 규칙 하나 — 제목이 메모로 렌더되는지는 메모가 있어야만 잴 수 있다.
      { kind: 'request-header', id: 'm2', name: 'X-Cond', value: '2', enabled: true, mode: 'override', emptyMeans: 'remove', comment: 'My note',
        urlFilter: 'cond\\.example', urlMatchType: 'regex',
        conditions: { requestMethods: ['post'], resourceTypes: ['script'] } },
    ]),
  ]);
  await popup.reload();
  const rows = popup.locator('.group').filter({ has: popup.getByRole('button', { name: 'Edit', exact: true }) });
  /**
   * 한 행의 칩 텍스트를 **화면 순서대로** — 스코프가 맨 앞인지는 순서로만 잴 수 있다.
   *
   * 칩 줄은 행의 유일한 wrap 컨테이너다. `div:last-child`로 짚던 것을 바꾼 것은 자리로
   * 짚으면 행에 줄이 하나 늘 때 엉뚱한 것을 겨눈 채 통과하거나 실패하기 때문이다.
   */
  const chipTexts = (row) =>
    row.evaluate((el) =>
      [...el.querySelectorAll('.min-w-0 .flex-wrap > *')].map((c) => c.textContent.trim()),
    );
  /**
   * 행 첫 줄의 제목과 뱃지 — **DOM에서 읽는다.**
   *
   * 순수 테스트는 `ruleView().title`까지만 말하고 그것이 실제로 그려지는지는 말하지 못한다.
   * 이 단언이 없는 동안에는 제목·뱃지 렌더를 통째로 지워도 전 게이트가 통과했다.
   */
  const rowHeading = (row) =>
    row.evaluate((el) => {
      const line = el.querySelector('.min-w-0 > div:first-child');
      return {
        title: line.querySelector('span:first-child').textContent.trim(),
        badge: line.querySelector('span:nth-child(2)').textContent.trim(),
      };
    });
  const plainHeading = await rowHeading(rows.nth(0));
  const condHeading = await rowHeading(rows.nth(1));
  // 메모가 없으면 **종류 이름**이고(헤더 이름이 아니다), 있으면 그 메모다 (story 10).
  const headingOk =
    plainHeading.title === 'Request header' &&
    condHeading.title === 'My note' &&
    plainHeading.badge === 'REQ' &&
    condHeading.badge === 'REQ';

  const plainChips = await chipTexts(rows.nth(0));
  const condChips = await chipTexts(rows.nth(1));
  // 조건이 없어도 스코프 칩은 선다 — 스코프는 조건이 아니라 규칙의 대상이다.
  const plainOk = plainChips.join('|') === 'All URLs|X-Plain: 1';
  // 순서: 스코프 → 효과 → 리소스 묶음 → 요청 메서드. 리소스는 묶음 이름이다.
  const condOk = condChips.join('|') === 'cond\\.example|X-Cond: 2|Script|POST';
  // 브라우저 토큰이 화면 어디로도 새지 않는다 — 폼과 행이 같은 어휘를 쓴다.
  const rawTokenGone = (await popup.getByText('script', { exact: true }).count()) === 0;
  // 정규식 스코프에는 표시가 붙는다 (story 16) — 와일드카드와 헷갈리면 안 걸리는 이유를 모른다.
  const regexMark = await rows.nth(1).getByLabel('Regex').count();
  const plainHasNoRegexMark = (await rows.nth(0).getByLabel('Regex').count()) === 0;
  record('N19a: 행 — 제목(메모/종류 이름)·뱃지, 칩 줄은 스코프가 맨 앞, 효과·리소스 묶음(토큰 아님)·메서드 순, 정규식 표시',
    headingOk && plainOk && condOk && rawTokenGone && regexMark === 1 && plainHasNoRegexMark,
    `제목·뱃지=${JSON.stringify([plainHeading, condHeading])}=${headingOk}, ` +
      `plain=${JSON.stringify(plainChips)}, cond=${JSON.stringify(condChips)}, raw-token-gone=${rawTokenGone}, regex-mark=${regexMark}, plain-mark-none=${plainHasNoRegexMark}`);

  // 빈 상태: 규칙 0개 프로필 → 안내 + CTA로 폼 열림
  await popup.getByRole('button', { name: '+ New profile' }).click();
  await pollProfileName((v) => /^New profile \d+$/.test(v));
  const emptyHintShown = await popup.getByText('No rules yet. Add one below.').isVisible().catch(() => false);
  /*
   * 이 자리가 재는 것은 **빈 상태 상자 안의 CTA**다. 헤더에도 같은 이름의 버튼이 생겼으므로
   * (ADR 0017) `.first()`를 쓰면 헤더를 누르게 되어, 이 테스트가 이름은 CTA인데 실제로는
   * 헤더를 재는 상태가 된다. DOM 순서상 CTA가 뒤이므로 `.last()`로 짚는다.
   */
  await popup.getByRole('button', { name: 'Add rule' }).last().click();
  const formOpened = await popup.getByRole('combobox', { name: 'Type', exact: true })
    .waitFor({ timeout: 5000 }).then(() => true, () => false);
  record('N19b: 빈 상태 안내 + CTA로 규칙 폼 열림',
    emptyHintShown && formOpened,
    `hint=${emptyHintShown}, form-opened=${formOpened}`);

  // N20: 규칙 삭제 Undo 토스트 (ui-refine 07) — Placeholder 값 보존 원자 복원
  await seedProfiles([
    {
      ...baseProfile('p-undo', 'Undo', [
        { kind: 'request-header', id: 'm1', name: 'X-Trace', value: 'req-{{uuid}}', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
      ]),
      active: false,
    },
  ]);
  await popup.reload();
  // 활성화 경계로 실체화(팝업 토글) 후, 삭제 전 실요청 값을 기록한다
  await popup.getByRole('switch', { name: 'Toggle Undo' }).click();
  await pollSessionRuleCount(sw, 1);
  const beforeDelete = (await fetchEchoHeaders(pageB, '/headers'))['x-trace'];
  // 삭제 → 규칙 0 + 토스트 노출(텍스트로 즉시 감지 — 토스트 기본 수명 내 Undo)
  await popup.getByRole('button', { name: 'Delete', exact: true }).first().click();
  await pollSessionRuleCount(sw, 0);
  const toastShown = await popup.getByText('Rule deleted', { exact: true }).first()
    .waitFor({ timeout: 5000 }).then(() => true, () => false);
  // Undo → 규칙 복원 + 실요청 값이 삭제 전과 동일(재실체화 없음)
  await popup.getByRole('button', { name: 'Undo', exact: true }).first().click();
  await pollSessionRuleCount(sw, 1);
  const afterUndo = await pollUntil(
    () => fetchEchoHeaders(pageB, '/headers').then((h) => h['x-trace']),
    (v) => typeof v === 'string' && v.startsWith('req-'),
  );
  record('N20a: 삭제 Undo — 토스트 노출 + Placeholder 값 보존 원자 복원',
    /^req-[0-9a-f-]{36}$/.test(beforeDelete ?? '') && toastShown && afterUndo === beforeDelete,
    `before=${beforeDelete}, toast=${toastShown}, after=${afterUndo}, preserved=${afterUndo === beforeDelete}`);

  // N20b: Undo를 누르지 않으면 삭제가 유지된다(자동 복원 없음)
  await popup.getByRole('button', { name: 'Delete', exact: true }).first().click();
  await pollSessionRuleCount(sw, 0);
  await popup.getByText('Rule deleted', { exact: true }).first().waitFor({ timeout: 5000 });
  // Undo 없이 잠시 기다린 뒤에도 규칙은 복원되지 않는다
  await new Promise((r) => setTimeout(r, 1000));
  const stillDeleted = await sw.evaluate(async () => {
    const { state } = await chrome.storage.local.get('state');
    return state.profiles[0].modifications.length;
  });
  record('N20b: Undo 미클릭 시 삭제 유지(자동 복원 없음)',
    stillDeleted === 0,
    `mods=${stillDeleted}`);

  // N21: motion 무결성 (ui-refine 08) — 애니메이션이 기능을 깨지 않고, reduced-motion을 존중
  await seedProfiles([
    baseProfile('p-motion', 'Motion', [
      { kind: 'request-header', id: 'm1', name: 'X-M1', value: '1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
      { kind: 'request-header', id: 'm2', name: 'X-M2', value: '2', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
    ]),
  ]);
  // reduced-motion 강제 — 이 조건에서도 추가/삭제·화면 전환이 정상 동작해야 한다
  await popup.emulateMedia({ reducedMotion: 'reduce' });
  await popup.reload();
  await pollSessionRuleCount(sw, 2);
  // 규칙 추가(행 enter): 폼으로 추가 → 목록에 반영
  await popup.getByRole('button', { name: 'Add rule' }).first().click();
  await popup.getByLabel('Header name', { exact: true }).fill('X-M3');
  await closeSuggestions(popup);
  await popup.getByLabel('Value', { exact: true }).fill('3');
  await popup.getByRole('button', { name: SAVE_BUTTON }).click();
  const afterAdd = await pollSessionRuleCount(sw, 3).then(() => true, () => false);
  // 규칙 삭제(행 exit): 삭제 → 실요청 반영 + AnimatePresence exit가 상태를 막지 않음
  await popup.getByRole('button', { name: 'Delete', exact: true }).first().click();
  const afterDelete = await pollSessionRuleCount(sw, 2).then(() => true, () => false);
  // 레일 화면 전환(cross-fade) 후 대상 화면이 뜬다
  await popup.getByRole('button', { name: 'Show settings' }).click();
  const prefsAfterFade = await popup.getByText('Theme', { exact: true })
    .waitFor({ timeout: 5000 }).then(() => true, () => false);
  await popup.getByRole('button', { name: 'Show profiles' }).click();
  await popup.emulateMedia({ reducedMotion: null });
  record('N21: motion 무결성 — reduced-motion에서도 행 추가/삭제·화면 전환 정상',
    afterAdd && afterDelete && prefsAfterFade,
    `add=${afterAdd}, delete=${afterDelete}, rail-fade=${prefsAfterFade}`);

  // N21b/N21c: 누름·호버 모션 계약 (ui-polish 04, ADR 0012).
  // reduced-motion에서는 애니메이션 prop 자체가 붙지 않으므로 계산 transform이 none으로
  // 남아야 한다 — "약한 전이"가 아니라 "전이 없음"이 계약이다. 기능이 도는지만 보던
  // N21로는 애니메이션이 살아 있어도 통과하므로 여기서 부재를 직접 관측한다.
  //
  // **대조를 먼저 돌린다.** LazyMotion features는 지연 로드라, 로드 전에 부재를 재면
  // 아무것도 구현하지 않아도 통과한다. 같은 대기 시간에 기본 모션이 실제로 움직이는 것을
  // 먼저 확인하면, 뒤이은 부재 단언의 대기가 충분했다는 근거가 된다.
  const transformStates = async (page, locator) => {
    const el = locator.first();
    await el.waitFor({ timeout: 5000 });
    const read = () => el.evaluate((node) => getComputedStyle(node).transform);
    const rest = await read();
    await el.hover();
    await page.waitForTimeout(200);
    const hover = await read();
    const box = await el.boundingBox();
    // 박스가 없으면 값으로 돌려준다 — 예외로 스위트를 죽이면 FAIL로 기록되지 않는다.
    if (!box) return { rest, hover, down: 'no-bounding-box' };
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(150);
    const down = await read();
    // 눌린 자리에서 놓으면 클릭이 발생해 화면이 바뀐다 — 밖으로 옮겨 놓는다.
    await page.mouse.move(1, 1);
    await page.mouse.up();
    return { rest, hover, down };
  };

  // ADR 0012가 열거한 버튼 프리미티브를 같은 프로브로 훑는다.
  //
  // **아코디언 헤더는 이 목록에 없다** — ADR 0012의 명시적 예외다. 폭이 화면 전체인 행에서
  // 같은 1.02배는 이동 거리가 훨씬 커져 과하게 보였고, 그 표면의 피드백은 색 전이와
  // 열림/닫힘 높이 전환이 맡는다. 그 전환의 존재·부재는 N29가 따로 본다.
  const probePressPrimitives = async (page) => {
    // 행 액션은 opacity-0 → group-hover다. 행을 먼저 호버해야 아이콘 버튼의 rest를
    // "보이지만 호버되지 않은" 상태로 읽을 수 있다.
    await page.getByText('X-P').first().hover();
    const icon = await transformStates(page, page.getByRole('button', { name: 'Edit', exact: true }));
    const button = await transformStates(page, page.getByRole('button', { name: 'Add rule' }).first());
    const chip = await transformStates(page, page.getByRole('button', { name: 'New profile' }));
    /*
     * **메뉴 항목이 이 목록에 없다** (티켓 04, ADR 0012 개정). 앱에 남은 메뉴가 하나도 없어
     * 그 표면이 사라졌다 — 남은 셋(Button·SwitcherChip·IconButton)은 그대로다.
     */
    return { button, chip, icon };
  };

  await seedProfiles([
    baseProfile('p-press', 'Press', [
      { kind: 'request-header', id: 'm1', name: 'X-P', value: '1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
    ]),
  ]);

  // N21b: 감도 대조 — 프로브가 실제로 모션을 감지할 수 있음을 먼저 보인다.
  await popup.emulateMedia({ reducedMotion: null });
  await popup.reload();
  await popup.getByRole('button', { name: 'Add rule' }).first().waitFor({ timeout: 5000 });
  await popup.waitForTimeout(700);
  const lively = await probePressPrimitives(popup);
  const allMoving = Object.values(lively).every(
    (s) => s.rest === 'none' && s.hover !== 'none' && s.down !== 'none',
  );
  record('N21b: 감도 대조 — 버튼·칩·아이콘버튼이 호버·누름에 변형한다',
    allMoving,
    Object.entries(lively).map(([k, v]) => `${k}=${v.hover}/${v.down}`).join(' '));

  // N21c: 부재 단언 — 같은 프로브가 reduced-motion에서는 아무 변형도 보지 못한다.
  await popup.emulateMedia({ reducedMotion: 'reduce' });
  await popup.reload();
  await popup.getByRole('button', { name: 'Add rule' }).first().waitFor({ timeout: 5000 });
  await popup.waitForTimeout(700);
  const still = await probePressPrimitives(popup);
  const allNone = Object.values(still).every(
    (s) => s.rest === 'none' && s.hover === 'none' && s.down === 'none',
  );
  record('N21c: reduced-motion — 세 표면 모두 호버·누름에 transform이 없다',
    allNone,
    Object.entries(still).map(([k, v]) => `${k}=${v.hover}/${v.down}`).join(' '));
  await popup.emulateMedia({ reducedMotion: null });
  await popup.reload();

  // N22: 스크롤바 테마 (ui-polish 02) — 앱 스타일 스크롤바가 다크 모드를 따르는지.
  // 토큰에서 dark: 변형을 지워도 tsc·vitest·smoke·번들·스토리북은 전부 통과하므로,
  // story 9("다크 모드 포함")를 지키는 것은 이 단언뿐이다. 선택자는 Base UI가 붙이는
  // 속성만 쓴다 — 프로덕션 코드에 테스트 전용 훅을 심지 않는다.
  // 트랙(= data-orientation + data-has-overflow-y를 모두 가진 요소)의 자식이 thumb다.
  // Root에도 data-has-overflow-y가 붙으므로 두 속성을 함께 요구해야 트랙만 잡힌다.
  const THUMB = '[data-has-overflow-y][data-orientation="vertical"] > [data-orientation="vertical"]';
  const manyRules = Array.from({ length: 25 }, (_, i) => ({
    kind: 'request-header', id: `s${i}`, name: `X-S${i}`, value: 'v',
    enabled: true, mode: 'override', emptyMeans: 'remove', comment: '',
  }));
  await seedProfiles([baseProfile('p-scroll', 'Scroll', manyRules)]);
  await popup.emulateMedia({ colorScheme: 'light' });
  await popup.reload();
  await popup.locator(THUMB).first().waitFor({ timeout: 5000 });
  const thumbLight = await popup.locator(THUMB).first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  await popup.emulateMedia({ colorScheme: 'dark' });
  await popup.waitForTimeout(200);
  const thumbDark = await popup.locator(THUMB).first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  await popup.emulateMedia({ colorScheme: 'light' });
  const thumbCount = await popup.locator(THUMB).count();
  const opaque = (color) => color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent';
  // count도 함께 본다 — 선택자가 트랙까지 잡으면 투명색을 읽어 조용히 오판한다(실제로 겪음).
  record('N22a: 스크롤바 테마 — 라이트/다크 색이 다르고 둘 다 불투명',
    thumbCount === 1 && opaque(thumbLight) && opaque(thumbDark) && thumbLight !== thumbDark,
    `thumbs=${thumbCount}, light=${thumbLight}, dark=${thumbDark}`);

  /*
   * N34: 팔레트 격리 — 두 테마가 **각자의 팔레트**를 쓰고 서로를 끌고 가지 않는다.
   *
   * 이 단언이 있는 이유(구조 게이트 S-1): 다크 리디자인을 테마 중립 램프(zinc/blue)에 설치하면
   * 라이트가 함께 끌려가는데, 그때 아무 게이트도 그것을 잡지 못했다 — 기존 색 단언(N22a)은
   * "라이트≠다크"라는 **상대** 비교뿐이라 두 테마가 나란히 바뀌어도 통과한다. 그래서 여기서는
   * 양쪽의 **절대값**을 못박는다.
   *
   * 티켓 05가 라이트에 자기 팔레트(--color-light-*)를 주면서 이 기대값이 한 번 갱신됐다 —
   * 의도한 변경이라 단언도 함께 옮긴 것이고, 그 갱신 없이 값이 흔들리면 '실수로 끌려감'이다.
   */
  const paletteProbe = async (scheme) => {
    await popup.emulateMedia({ colorScheme: scheme });
    await popup.waitForTimeout(150);
    return popup.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      const v = (n) => s.getPropertyValue(n).trim();
      return { bg: v('--background'), fg: v('--foreground'), primary: v('--primary'), border: v('--border') };
    });
  };
  const palLight = await paletteProbe('light');
  const palDark = await paletteProbe('dark');
  await popup.emulateMedia({ colorScheme: 'light' });
  // 브라우저는 커스텀 속성의 hex를 축약해 돌려준다(#ffffff→#fff, #0066cc→#06c) — 축약형을
  // 6자리로 펴서 비교한다. 이걸 안 하면 값이 맞는데도 표기 차이로 실패한다(실제로 겪음).
  // 문자열을 글자 배열로 펴는 것이라 사본이 아니다 — 타입이 없어 규칙이 배열 spread로 읽는다.
  // oxlint-disable-next-line unicorn/no-useless-spread
  const hex6 = (v) => (/^#[0-9a-f]{3}$/i.test(v) ? '#' + [...v.slice(1)].map((c) => c + c).join('') : v.toLowerCase());
  const sameHex = (probe, expected) =>
    Object.keys(expected).every((k) => hex6(probe[k]) === expected[k]);
  // 라이트 = **자기 팔레트**(--color-light-*). 티켓 05가 디자인 다크의 짝으로 파생했다.
  const lightIntact = sameHex(palLight, {
    // 캔버스는 순백이 아니다 — 떠 있는 면(카드·팝업)이 #ffffff로 그 위에 선다.
    bg: '#f7f7f8', fg: '#18181b', primary: '#1d4ed8', border: '#e2e2e6',
  });
  // 다크 = 디자인 near-black 팔레트(ADR 0015). primary는 티켓 05가 대비 3:1을 위해
  // 디자인의 짝 중 밝은 쪽(#2563eb)으로 올렸다 — #1d4ed8은 near-black에서 2.95:1이었다.
  const darkRedesigned = sameHex(palDark, {
    bg: '#0a0a0a', fg: '#ededed', primary: '#2563eb', border: '#262626',
  });
  record('N34: 팔레트 격리 — 두 테마가 각자의 팔레트를 쓴다',
    lightIntact && darkRedesigned,
    `light=${JSON.stringify(palLight)}, dark=${JSON.stringify(palDark)}`);

  /*
   * N34b: **렌더된** 활성 컨트롤이 시맨틱 accent를 탄다 — 루트 변수만 보는 N34의 사각지대다.
   *
   * 왜 따로 필요한가(구조 게이트 S2-1): 활성 표면이 raw `bg-blue-600`을 쓰면 베이스 램프를
   * 직접 참조하게 되어 다크 리디자인 팔레트를 따라가지 못한다. 그때 같은 화면에서 버튼은
   * #1d4ed8, 스위치·선택된 칩은 #0066cc로 **파랑이 갈린다**. N34는 루트의 --primary만 읽어
   * 통과하므로 이 분기를 놓쳤다. 여기서는 실제로 칠해진 픽셀 색을 비교한다.
   */
  const activeAccent = async (scheme) => {
    await popup.emulateMedia({ colorScheme: scheme });
    // 준비 배리어 — `emulateMedia`는 즉시 반영되지 않는다. 앱이 matchMedia를 받아 루트
    // `data-theme`을 실제로 뒤집은 뒤에야 `--primary`도 칠해진 색도 그 테마의 값이 된다.
    // `data-theme`은 아래 단언 어디에도 쓰이지 않으므로 이 대기가 단언을 약화시키지 않는다
    // (고정 대기를 지우면서 이 구간이 무대기가 됐던 것이 실제 실패 원인이었다).
    // `pollUntil`은 타임아웃이면 **마지막 값을 그냥 돌려준다** — 결과를 버리면 뒤집히지 않은
    // 테마도 배리어를 조용히 통과하고 아래에서 반대 테마의 색을 표본으로 삼는다. 형제 배리어
    // (`pollSessionRuleMatch`·`pollStable`)와 같이 마지막 값을 담아 시끄럽게 실패시킨다.
    const theme = await pollUntil(
      () => popup.evaluate(() => document.documentElement.dataset.theme ?? ''),
      (t) => t === scheme,
      5000,
      50,
    );
    if (theme !== scheme) {
      throw new Error(
        `N34b: data-theme never flipped to ${scheme} within 5000ms; last seen "${theme}"`);
    }
    // 켜져 있는 프로필의 토글 스위치 — data-[checked]로 accent가 칠해지는 대표 컨트롤.
    const swEl = popup.locator('[data-checked]').first();
    const shown = await swEl.waitFor({ timeout: 5000 }).then(() => true, () => false);
    // 고정 150ms 대기는 toggle-switch의 `transition-colors`(Tailwind 기본 150ms)와 정확히
    // 겹쳐 **전이 중간 프레임**을 표본으로 삼았다. 안정될 때까지만 기다린다 — 기댓값을
    // 향해 폴링하지 않으므로 아래 단언 3개의 강도는 그대로다. 제품(transition-colors)은
    // 고치지 않는다.
    const swBg = shown
      ? await pollStable(
          () => swEl.evaluate((el) => getComputedStyle(el).backgroundColor),
          `N34b ${scheme} switch background`)
      : '';
    // 색이 안정된 **뒤에** 읽는다 — 같은 테마의 값이어야 둘을 비교하는 의미가 있다.
    const rootPrimary = await popup.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--primary').trim());
    return { rootPrimary, swBg, shown };
  };
  const accLight = await activeAccent('light');
  const accDark = await activeAccent('dark');
  await popup.emulateMedia({ colorScheme: 'light' });
  const rgbOf = (hex) => {
    const h = hex6(hex).slice(1);
    return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
  };
  // 렌더된 스위치 배경 === 그 테마의 --primary. 두 테마 모두에서 성립해야 한다.
  const accentUnified =
    accLight.shown && accDark.shown &&
    accLight.swBg === rgbOf(accLight.rootPrimary) &&
    accDark.swBg === rgbOf(accDark.rootPrimary) &&
    // 두 테마가 실제로 다른 accent 값을 쓴다 — 같은 디자인 파랑의 두 단계로, 다크는
    // near-black 위에서 3:1을 넘기려고 밝은 쪽(#2563eb)을 쓴다(티켓 05).
    accLight.swBg !== accDark.swBg;
  record('N34b: 렌더된 활성 컨트롤이 시맨틱 accent를 탄다 (raw blue 우회 없음)',
    accentUnified,
    `light: switch=${accLight.swBg} primary=${accLight.rootPrimary}, dark: switch=${accDark.swBg} primary=${accDark.rootPrimary}`);

  /*
   * N35: 테마 스위치 (티켓 05, ADR 0015가 ADR 0004의 '스위치 없음'을 개정).
   *
   * 세 가지를 본다 — (a) 명시 선택이 **시스템을 이긴다**, (b) 그 선택이 실제로 **칠해진
   * 색을 바꾼다**, (c) 팝업을 다시 열어도 **유지된다**. 셋 중 하나라도 빠지면 스위치가
   * 있는 것처럼 보이면서 아무 일도 안 하거나, 껐다 켜면 잊어버린다.
   *
   * 시스템을 다크로 에뮬레이션해 둔 채 '라이트'를 고르는 것이 핵심이다 — 시스템과 같은
   * 값을 고르면 스위치가 죽어 있어도 통과한다.
   */
  await popup.emulateMedia({ colorScheme: 'dark' });
  await popup.getByRole('button', { name: 'Show settings' }).click();
  await settleScreen(popup, 'Theme');
  const canvasBg = () =>
    popup.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--background').trim());
  const rootTheme = () => popup.evaluate(() => document.documentElement.dataset.theme ?? '');
  // 시스템=다크 + 선호=system → 다크로 해석된다.
  const systemResolvedDark = (await rootTheme()) === 'dark';
  const bgWhenSystemDark = await canvasBg();
  await popup.getByRole('button', { name: 'Light', exact: true }).click();
  const switchedToLight = await pollUntil(rootTheme, (v) => v === 'light', 3000, 100);
  const bgWhenLight = await canvasBg();
  // 저장까지 갔는지는 storage가 권위다 — DOM만 보면 새로고침에서 되돌아가는 것을 못 잡는다.
  const storedTheme = await pollUntil(
    () => sw.evaluate(async () => (await chrome.storage.local.get('state')).state?.theme),
    (v) => v === 'light',
  );
  // 다시 열어도 유지 — 시스템은 여전히 다크인데 라이트로 떠야 한다.
  await popup.reload();
  await popup.getByRole('button', { name: 'Show settings' }).waitFor({ timeout: 5000 });
  const keptAfterReopen = await pollUntil(rootTheme, (v) => v === 'light', 5000, 100);
  await popup.emulateMedia({ colorScheme: 'light' });
  record('N35: 테마 스위치 — 시스템을 이기고, 색을 바꾸고, 다시 열어도 유지된다',
    systemResolvedDark && switchedToLight === 'light' && storedTheme === 'light' &&
      keptAfterReopen === 'light' && bgWhenSystemDark !== bgWhenLight,
    `system-dark→${systemResolvedDark}, switched=${switchedToLight}, stored=${storedTheme}, ` +
      `reopen=${keptAfterReopen}, bg ${bgWhenSystemDark}→${bgWhenLight}`);

  /*
   * N35b: '시스템'으로 되돌리면 다시 OS를 따른다 — 되돌릴 수 없는 스위치는 함정이다.
   */
  // 위에서 새로고침했으므로 화면은 프로필로 돌아가 있다 — 칩을 다시 꺼내 온다.
  await popup.getByRole('button', { name: 'Show settings' }).click();
  await settleScreen(popup, 'Theme');
  await popup.getByRole('button', { name: 'System', exact: true }).click();
  await popup.emulateMedia({ colorScheme: 'dark' });
  const followsSystemDark = await pollUntil(rootTheme, (v) => v === 'dark', 3000, 100);
  await popup.emulateMedia({ colorScheme: 'light' });
  const followsSystemLight = await pollUntil(rootTheme, (v) => v === 'light', 3000, 100);
  record('N35b: 시스템으로 되돌리면 OS 변화를 다시 따른다',
    followsSystemDark === 'dark' && followsSystemLight === 'light',
    `os-dark→${followsSystemDark}, os-light→${followsSystemLight}`);

  /*
   * N37: 배지 표시 토글 (티켓 06).
   *
   * 배지는 **적용 중인 규칙 수**이고 토글은 그 표시 여부만 정한다. 그래서 셋을 함께 본다 —
   * (a) 끄면 사라지고, (b) 다시 열어도 꺼진 채이며, (c) 켜면 **같은 수**가 돌아온다.
   * 그리고 끄는 동안에도 세션 규칙은 그대로다: 배지를 끄는 것과 규칙을 멈추는 것(Pause)은
   * 다른 조작이라, 여기서 규칙까지 사라지면 "아이콘만 깔끔하게" 하려던 사용자가 규칙을 잃는다.
   */
  await seedProfiles([
    baseProfile('p-badge-toggle', 'BadgeToggle', [
      { kind: 'request-header', id: 'bt1', name: 'X-Badge-Count', value: 'on', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
    ]),
  ]);
  await pollSessionRuleCount(sw, 1);
  const badgeText = () => sw.evaluate(() => chrome.action.getBadgeText({}));
  const badgeSwitch = () => popup.getByRole('switch', { name: 'Applied rule count' });
  const badgeOn = await pollUntil(badgeText, (t) => t === '1', 5000, 100);

  await badgeSwitch().click();
  const badgeOff = await pollUntil(badgeText, (t) => t === '', 5000, 100);
  // 저장까지 갔는지는 storage가 권위다 — DOM만 보면 다시 열 때 되돌아가는 것을 못 잡는다.
  const storedBadgeOff = await pollUntil(
    () => sw.evaluate(async () => (await chrome.storage.local.get('state')).state?.badgeVisible),
    (v) => v === false,
  );
  const rulesWhileOff = await sw.evaluate(async () =>
    (await chrome.declarativeNetRequest.getSessionRules()).length);

  await popup.reload();
  await popup.getByRole('button', { name: 'Show settings' }).click();
  await settleScreen(popup, 'Theme');
  const keptOff = await badgeText();
  const switchOff = await badgeSwitch().getAttribute('aria-checked');
  await badgeSwitch().click();
  const badgeBack = await pollUntil(badgeText, (t) => t === badgeOn, 5000, 100);
  record('N37: 배지 토글 — 끄면 사라지고 다시 열어도 꺼진 채, 켜면 같은 수 복귀 (규칙은 그대로)',
    badgeOn === '1' && badgeOff === '' && storedBadgeOff === false && keptOff === '' &&
      switchOff === 'false' && badgeBack === '1' && rulesWhileOff === 1,
    `on="${badgeOn}", off="${badgeOff}", stored=${storedBadgeOff}, reopen="${keptOff}", ` +
      `switch-checked=${switchOff}, back="${badgeBack}", rules-while-off=${rulesWhileOff}`);

  /*
   * N36: 두 테마가 대비 기준을 지킨다 — 본문 4.5:1, 비텍스트(필드 경계·accent 표면) 3:1.
   *
   * 팔레트 값을 눈으로 고르면 한 토큰만 손대도 조용히 기준을 깬다. 여기서는 **실제로
   * 브라우저가 계산한 변수 값**을 읽어 대비비를 계산하므로, CSS 어디를 어떻게 고쳐도
   * 결과가 기준을 넘는지로만 판정한다 — 값 목록을 따로 관리할 필요가 없다.
   * border(장식 구분선)는 대상이 아니다: WCAG 1.4.11은 컴포넌트를 **식별하는 데 필요한**
   * 시각 정보를 요구하고, 카드 외곽선은 거기 해당하지 않는다.
   */
  const contrastProbe = async (scheme) => {
    await popup.emulateMedia({ colorScheme: scheme });
    await popup.waitForTimeout(150);
    return popup.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      const v = (n) => s.getPropertyValue(n).trim();
      const lum = (hex) => {
        const h = hex.replace('#', '');
        const n6 = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
        const ch = [0, 2, 4].map((i) => parseInt(n6.slice(i, i + 2), 16) / 255);
        const lin = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
        return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
      };
      const ratio = (a, b) => {
        const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
        return (hi + 0.05) / (lo + 0.05);
      };
      const bg = v('--background'), surface = v('--card'), fill = v('--muted');
      return {
        // 본문 — 주 글자와 보조 글자가 놓이는 모든 면 위에서.
        text: [
          ratio(v('--foreground'), bg), ratio(v('--foreground'), surface), ratio(v('--foreground'), fill),
          ratio(v('--muted-foreground'), bg), ratio(v('--muted-foreground'), surface),
          ratio(v('--muted-foreground'), fill),
          ratio(v('--primary-foreground'), v('--primary')),
        ],
        // 비텍스트 — 필드 경계와 accent 표면, 포커스 링.
        nonText: [
          ratio(v('--input'), bg), ratio(v('--input'), surface), ratio(v('--input'), fill),
          ratio(v('--primary'), bg), ratio(v('--ring'), bg),
        ],
      };
    });
  };
  const cLight = await contrastProbe('light');
  const cDark = await contrastProbe('dark');
  await popup.emulateMedia({ colorScheme: 'light' });
  const worst = (xs) => Math.min(...xs);
  const meets = (c) => worst(c.text) >= 4.5 && worst(c.nonText) >= 3;
  record('N36: 두 테마 대비 기준 — 본문 4.5:1 · 비텍스트 3:1',
    meets(cLight) && meets(cDark),
    `light: 본문 최저 ${worst(cLight.text).toFixed(2)} 비텍스트 최저 ${worst(cLight.nonText).toFixed(2)}, ` +
      `dark: 본문 최저 ${worst(cDark.text).toFixed(2)} 비텍스트 최저 ${worst(cDark.nonText).toFixed(2)}`);

  /*
   * N36b: **렌더된** 필드의 placeholder가 실제로 칠해진 면 위에서 4.5:1을 넘는다 —
   * 토큰만 보는 N36의 사각지대다.
   *
   * 왜 따로 필요한가: shadcn은 `--input`을 경계선과 채움 양쪽에 쓴다(`dark:bg-input/30`).
   * 경계를 3:1로 올리면 **채움도 함께 밝아져** 그 위의 placeholder가 4.5:1 아래로 내려간다
   * (측정: 5.27 → 4.20). 한 토큰으로 둘을 동시에 만족시키는 값은 존재하지 않아 채움을 뺐고,
   * 여기서는 그 결과를 화면에서 확인한다 — 토큰 값만 보면 이 분기를 영영 놓친다.
   */
  const fieldContrast = async (scheme) => {
    // 검색 입력은 **프로필 열**에 있고 그 열은 프로필 화면에서만 선다 (ADR 0017) —
    // 앞 시나리오가 다른 레일 화면에 남겨 두면 여기서 기다릴 것이 아예 없다.
    await popup.getByRole('button', { name: 'Show profiles', exact: true }).click();
    await popup.emulateMedia({ colorScheme: scheme });
    await popup.waitForTimeout(150);
    return popup.getByPlaceholder('Search profiles…').evaluate((el) => {
      const parseRgb = (s) => (s.match(/\d+(\.\d+)?/g) ?? []).map(Number);
      // 투명한 면은 조상에서 실제 칠해진 색을 찾아 올라간다 — 합성 결과가 곧 배경이다.
      let node = el, bg = [255, 255, 255];
      while (node) {
        const c = parseRgb(getComputedStyle(node).backgroundColor);
        if (c.length >= 3 && (c[3] === undefined || c[3] > 0)) { bg = c.slice(0, 3); break; }
        node = node.parentElement;
      }
      const ph = parseRgb(getComputedStyle(el, '::placeholder').color).slice(0, 3);
      const lum = (rgb) => {
        const lin = rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
        return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
      };
      const [hi, lo] = [lum(ph), lum(bg)].sort((a, b) => b - a);
      return { ratio: (hi + 0.05) / (lo + 0.05), bg, ph };
    });
  };
  const fLight = await fieldContrast('light');
  const fDark = await fieldContrast('dark');
  await popup.emulateMedia({ colorScheme: 'light' });
  record('N36b: 렌더된 필드의 placeholder가 실제 칠해진 면 위에서 4.5:1을 넘는다',
    fLight.ratio >= 4.5 && fDark.ratio >= 4.5,
    `light ${fLight.ratio.toFixed(2)}:1 (면 ${fLight.bg}), dark ${fDark.ratio.toFixed(2)}:1 (면 ${fDark.bg})`);

  // 넘치지 않으면 스크롤바가 DOM에 아예 없어야 한다 — 트랙을 기본 노출(opacity-60)로 둔
  // 근거가 이것이다. 보이면 곧 "넘치는 내용이 있다"는 신호여야 어포던스가 성립한다.
  await seedProfiles([baseProfile('p-short', 'Short', manyRules.slice(0, 1))]);
  await popup.reload();
  await popup.getByRole('button', { name: 'Add rule' }).first().waitFor({ timeout: 5000 });
  const thumbsWhenShort = await popup.locator(THUMB).count();
  record('N22b: 넘치지 않으면 스크롤바가 렌더되지 않는다',
    thumbsWhenShort === 0,
    `thumbs=${thumbsWhenShort}`);

  // N22c: 탭 표면도 ScrollArea가 세로 스크롤을 소유한다 (ui-polish structure r1 S-2).
  // 셸 높이가 min-h-screen이면 행이 내용만큼 늘어나 뷰포트가 넘칠 일이 없고, 스크롤이
  // 문서로 떨어져 탭에서만 OS 기본 스크롤바가 뜬다 — 두 표면이 같은 셸이라는 ADR 0005의
  // 약속이 조용히 깨지는 자리라 문서 스크롤 여부까지 단언한다.
  await seedProfiles([baseProfile('p-tabscroll', 'TabScroll', manyRules)]);
  const tabScroll = await context.newPage();
  await tabScroll.setViewportSize({ width: 900, height: 700 });
  await tabScroll.goto(`chrome-extension://${extId}/app.html?locale=en`);
  // 스크롤바가 안 뜨는 것이 바로 이 테스트가 잡으려는 회귀다 — waitFor가 던져 스위트를
  // 중단시키면 FAIL로 기록되지 않으므로, 실패를 값으로 받는다.
  const tabThumbAppeared = await tabScroll.locator(THUMB).first()
    .waitFor({ timeout: 5000 })
    .then(() => true, () => false);
  const tabOverflow = await tabScroll.evaluate(() => {
    const root = document.documentElement;
    return { docScrolls: root.scrollHeight > root.clientHeight, scrollH: root.scrollHeight, clientH: root.clientHeight };
  });
  const tabThumbs = await tabScroll.locator(THUMB).count();
  await tabScroll.close();
  record('N22c: 탭 표면도 ScrollArea가 스크롤을 소유한다(문서가 스크롤되지 않는다)',
    tabThumbAppeared && !tabOverflow.docScrolls && tabThumbs >= 1,
    `thumbAppeared=${tabThumbAppeared}, docScrolls=${tabOverflow.docScrolls} (${tabOverflow.scrollH}>${tabOverflow.clientH}), thumbs=${tabThumbs}`);

  /*
   * **N23a/b/c(메뉴 순차 등장 · 삭제 2단 확인 라벨 · 메뉴 조작)가 없다** (티켓 04).
   *
   * 셋 다 프로필 ⋯ 메뉴 위에서 돌던 시나리오다. 그 메뉴가 앱의 **유일한** 메뉴였고 시안에
   * 없어 사라졌으므로, 이제 화면에 뜨는 메뉴가 하나도 없다 — 재려 해도 열 것이 없다.
   * ui-polish 05의 스태거와 ADR 0012의 '메뉴 항목' 표면이 함께 걷힌 이유이고, 그 개정은
   * ADR 0017에 적혀 있다. 2단 확인 자체는 살아 있다: 백업 삭제·전체 초기화가 같은 형태를
   * 쓰고 N39·N43이 그것을 잰다.
   */

  // N24: 저장 중 상태 (ui-polish 06). 저장은 background 왕복이라 지연이 실재하지만
  // 로컬에서는 너무 빨라 관측 창이 없다 — 왕복을 인위적으로 늦춘다.
  //
  // 프로덕션 코드에는 테스트 훅을 심지 않는다. 대신 페이지에서 `chrome.runtime.sendMessage`를
  // 감싼다(저장 경로가 background 왕복이라 이 지점이 유일한 시임). addInitScript는 이후
  // 모든 네비게이션에 붙으므로 **전용 페이지**에서만 쓴다 — 공용 popup에 걸면 남은 테스트
  // 전체가 느려지고 명령 계수가 오염된다.
  const SAVE_DELAY_MS = 600;
  const openDelayedCommandPopup = async ({ reject, throwInstead } = {}) => {
    const page = await context.newPage();
    await page.addInitScript(
      ({ delayMs, rejectSave, throwSave }) => {
        window.__commandCalls = 0;
        const original = chrome.runtime.sendMessage.bind(chrome.runtime);
        chrome.runtime.sendMessage = (message, ...rest) => {
          if (message?.type !== 'headerkit:command') return original(message, ...rest);
          window.__commandCalls += 1;
          return new Promise((resolve, rejectPromise) => {
            setTimeout(() => {
              // 던지는 경로 — MV3에서 워커가 내려가면 sendMessage는 값이 아니라 예외로
              // 끝난다. 앱이 이 경우에도 폼을 풀어 주는지가 이 시임의 핵심이다.
              if (throwSave) rejectPromise(new Error('Could not establish connection.'));
              else if (rejectSave) resolve({ ok: false, error: 'Injected refusal' });
              else original(message, ...rest).then(resolve);
            }, delayMs);
          });
        };
      },
      { delayMs: SAVE_DELAY_MS, rejectSave: reject, throwSave: throwInstead },
    );
    await page.setViewportSize({ width: 760, height: 580 });
    await page.goto(`chrome-extension://${extId}/popup.html?locale=en`);
    await page.getByRole('button', { name: 'Add rule' }).first().waitFor({ timeout: 5000 });
    return page;
  };
  const fillNewRule = async (page, name) => {
    await page.getByRole('button', { name: 'Add rule' }).first().click();
    await page.getByLabel('Header name', { exact: true }).first().waitFor({ timeout: 5000 });
    await page.getByLabel('Header name', { exact: true }).first().fill(name);
    await page.getByLabel('Value', { exact: true }).first().fill('v');
  };

  // N24a: 진행 중 — 라벨 교체, 두 버튼 비활성, 재시도(키보드 경로 포함)가 명령을 늘리지 않음.
  await seedProfiles([baseProfile('p-save', 'Save', [])]);
  {
    const page = await openDelayedCommandPopup({ reject: false });
    await fillNewRule(page, 'X-Saving');
    const savingButton = page.getByRole('button', { name: 'Saving…', exact: true });
    const cancelButton = page.getByRole('button', { name: 'Cancel', exact: true });
    // 저장을 **키보드로** 시작한다. 버튼을 클릭하면 비활성화되는 순간 포커스가 body로
    // 빠져 이후 Cmd/Ctrl+Enter가 폼의 onKeyDown에 닿지 않는다 — 그러면 재진입 가드를
    // 지나가 보지도 못한 채 통과한다(가드를 지워도 통과하는 것을 확인했다).
    // 값 입력에 포커스가 남은 채로 시작해야 진행 중 재시도가 실제로 save()까지 간다.
    await page.getByLabel('Value', { exact: true }).first().focus();
    await page.keyboard.press('Control+Enter');
    const labelSwapped = await savingButton
      .waitFor({ timeout: 3000 })
      .then(() => true, () => false);
    const inFlight = {
      label: labelSwapped ? 'Saving…' : await page.getByRole('button', { name: /Sav/ }).first().textContent(),
      saveDisabled: labelSwapped ? await savingButton.isDisabled() : false,
      cancelDisabled: await cancelButton.isDisabled(),
    };
    // disabled는 포인터만 막는다 — 키보드 저장 단축키로 재시도해 본다(같은 함수를 직접 부른다).
    await page.keyboard.press('Control+Enter');
    await page.keyboard.press('Escape');
    const callsDuringFlight = await page.evaluate(() => window.__commandCalls);
    // Escape도 onCancel을 직접 부른다 — 진행 중에는 폼이 닫히면 안 된다(응답을 받을
    // 폼이 사라진 뒤 명령이 착지하는 창을 없앤다).
    const survivedEscape = await cancelButton.isVisible().catch(() => false);
    // 진행 중 비활성 버튼은 눌린 척하지 않는다 (티켓 04에서 넘어온 계약).
    await savingButton.hover({ force: true }).catch(() => {});
    await page.waitForTimeout(150);
    const disabledTransform = await savingButton
      .evaluate((el) => getComputedStyle(el).transform)
      .catch(() => 'missing');
    await cancelButton.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({
      calls: window.__commandCalls,
      formOpen: [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Cancel'),
    }));
    const storedRules = await sw.evaluate(async () =>
      (await chrome.storage.local.get('state')).state.profiles[0].modifications.length);
    await page.close();
    record('N24a: 저장 중 — 라벨 교체·두 버튼 비활성·재시도 무시(명령 1회)·폼 닫힘',
      inFlight.label === 'Saving…' && inFlight.saveDisabled && inFlight.cancelDisabled &&
        callsDuringFlight === 1 && after.calls === 1 && after.formOpen === false && storedRules === 1 &&
        disabledTransform === 'none' && survivedEscape,
      `label="${inFlight.label}", save-disabled=${inFlight.saveDisabled}, cancel-disabled=${inFlight.cancelDisabled}, ` +
      `calls=${callsDuringFlight}/${after.calls}, esc-survived=${survivedEscape}, form-open=${after.formOpen}, ` +
      `rules=${storedRules}, disabled-transform=${disabledTransform}`);
  }

  // N24b: 거부 — 라벨 복귀, 폼 유지, 초안 보존, 거부 메시지 노출.
  await seedProfiles([baseProfile('p-reject', 'Reject', [])]);
  {
    const page = await openDelayedCommandPopup({ reject: true });
    await fillNewRule(page, 'X-Rejected');
    await page.getByRole('button', { name: SAVE_BUTTON }).click();
    const alertShown = await page.getByRole('alert').filter({ hasText: 'Injected refusal' }).first()
      .waitFor({ timeout: 5000 }).then(() => true, () => false);
    const afterReject = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('button')];
      const save = buttons.find((b) => /^(Save|Saving…)$/.test(b.textContent?.trim() ?? ''));
      const cancel = buttons.find((b) => b.textContent?.trim() === 'Cancel');
      return {
        label: save?.textContent?.trim() ?? '',
        saveEnabled: save ? !save.disabled : false,
        cancelEnabled: cancel ? !cancel.disabled : false,
      };
    });
    // 초안은 로케이터로 읽는다 — Value 필드는 aria-label이 아니라 <label> 연결이라
    // DOM 질의로는 잡히지 않는다(getByLabel은 둘 다 본다).
    const draftName = await page.getByLabel('Header name', { exact: true }).first().inputValue();
    const draftValue = await page.getByLabel('Value', { exact: true }).first().inputValue();
    const storedAfterReject = await sw.evaluate(async () =>
      (await chrome.storage.local.get('state')).state.profiles[0].modifications.length);
    await page.close();
    record('N24b: 저장 거부 — 라벨 복귀·버튼 재활성·폼과 초안 유지·거부 메시지',
      alertShown && afterReject.label === 'Save' && afterReject.saveEnabled && afterReject.cancelEnabled &&
        draftName === 'X-Rejected' && draftValue === 'v' && storedAfterReject === 0,
      `alert(role)=${alertShown}, label="${afterReject.label}", save-enabled=${afterReject.saveEnabled}, ` +
      `cancel-enabled=${afterReject.cancelEnabled}, draft="${draftName}"/"${draftValue}", stored=${storedAfterReject}`);
  }

  // N24bb: 왕복이 **던지는** 경로 — MV3에서 워커가 내려가면 sendMessage는 값이 아니라
  // 예외로 끝난다. 이때 진행 중 플래그가 풀리지 않으면 저장·취소·Escape가 모두 막힌 채
  // 폼이 갇히고 초안을 잃는다(리뷰가 잡은 결함). 사용자에게 남는 탈출구가 있어야 한다.
  await seedProfiles([baseProfile('p-throw', 'Throw', [])]);
  {
    const page = await openDelayedCommandPopup({ throwInstead: true });
    await fillNewRule(page, 'X-Thrown');
    await page.getByRole('button', { name: SAVE_BUTTON }).click();
    const recovered = await page
      .getByRole('button', { name: SAVE_BUTTON })
      .waitFor({ timeout: 5000 })
      .then(() => true, () => false);
    const state = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('button')];
      const save = buttons.find((b) => /^(Save|Saving…)$/.test(b.textContent?.trim() ?? ''));
      const cancel = buttons.find((b) => b.textContent?.trim() === 'Cancel');
      return {
        label: save?.textContent?.trim() ?? '',
        saveEnabled: save ? !save.disabled : false,
        cancelEnabled: cancel ? !cancel.disabled : false,
        errorShown: [...document.querySelectorAll('[role="alert"]')].length > 0,
      };
    });
    // 취소가 실제로 먹혀 폼을 빠져나올 수 있어야 한다.
    let escaped = false;
    if (state.cancelEnabled) {
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      escaped = await page.getByRole('button', { name: 'Cancel', exact: true })
        .waitFor({ state: 'detached', timeout: 3000 }).then(() => true, () => false);
    }
    await page.close();
    record('N24bb: 왕복이 예외로 끝나도 폼이 갇히지 않는다 — 버튼 복귀·오류 노출·취소 가능',
      recovered && state.label === 'Save' && state.saveEnabled && state.cancelEnabled &&
        state.errorShown && escaped,
      `label="${state.label}", save-enabled=${state.saveEnabled}, cancel-enabled=${state.cancelEnabled}, ` +
      `alert=${state.errorShown}, escaped=${escaped}`);
  }

  // N24c: 폼 닫힘 — reduced-motion에서는 exit 창 없이 즉시 제거된다(스펙의 관측 계약).
  // 기본 모션에서는 MotionRow의 height 전이만큼 남아 있어야 대조가 성립한다.
  const measureFormRemoval = async (page, { via }) => {
    await page.getByRole('button', { name: 'Add rule' }).first().click();
    await page.getByRole('button', { name: 'Cancel' }).waitFor({ timeout: 5000 });
    if (via === 'save') {
      await page.getByLabel('Header name', { exact: true }).first().fill(`X-Close-${Date.now() % 100000}`);
      await page.getByLabel('Value', { exact: true }).first().fill('v');
    }
    await page.evaluate(() => {
      window.__formGoneMs = null;
      const start = performance.now();
      const tick = () => {
        const open = [...document.querySelectorAll('button')].some(
          (b) => b.textContent?.trim() === 'Cancel');
        if (!open) window.__formGoneMs = performance.now() - start;
        else requestAnimationFrame(tick);
      };
      window.__armFormProbe = () => requestAnimationFrame(tick);
    });
    await page.evaluate(() => window.__armFormProbe());
    await page
      .getByRole('button', { name: via === 'save' ? 'Save' : 'Cancel', exact: true })
      .click();
    const observed = await page
      .waitForFunction(() => window.__formGoneMs != null, null, { timeout: 5000 })
      .then(() => true, () => false);
    return observed ? page.evaluate(() => window.__formGoneMs) : null;
  };
  const exitWindowMs = ROW_TRANSITION.duration * 1000;
  await seedProfiles([baseProfile('p-close', 'Close', [])]);
  await popup.emulateMedia({ reducedMotion: null });
  await popup.reload();
  await popup.getByRole('button', { name: 'Add rule' }).first().waitFor({ timeout: 5000 });
  await popup.waitForTimeout(700);
  const livelyClose = await measureFormRemoval(popup, { via: 'cancel' });
  const livelySave = await measureFormRemoval(popup, { via: 'save' });
  await popup.emulateMedia({ reducedMotion: 'reduce' });
  await popup.reload();
  await popup.getByRole('button', { name: 'Add rule' }).first().waitFor({ timeout: 5000 });
  const reducedClose = await measureFormRemoval(popup, { via: 'cancel' });
  const reducedSave = await measureFormRemoval(popup, { via: 'save' });
  await popup.emulateMedia({ reducedMotion: null });
  record('N24c: 폼 닫힘 — reduced-motion은 exit 창 없이 즉시, 기본 모션은 전이만큼 남는다',
    typeof reducedClose === 'number' && reducedClose < exitWindowMs &&
      typeof livelyClose === 'number' && livelyClose >= exitWindowMs &&
      typeof reducedSave === 'number' && reducedSave < exitWindowMs &&
      typeof livelySave === 'number' && livelySave >= exitWindowMs,
    `취소 reduced=${reducedClose?.toFixed?.(0)}ms/lively=${livelyClose?.toFixed?.(0)}ms, ` +
    `저장 reduced=${reducedSave?.toFixed?.(0)}ms/lively=${livelySave?.toFixed?.(0)}ms (exit 창 ${exitWindowMs}ms)`);

  /*
   * N25: 셀렉트 폭 계약 (ui-polish 07, stories 1·2·3) — **앱의 모든 셀렉트가 같은 고정 폭이고,
   * 트리거에서도 팝업에서도 라벨이 잘리지 않는다.**
   *
   * 폭 안정성만 보면 폭을 좁게 잡아 라벨이 잘려도 통과한다 — 절단 단언을 함께 건다.
   * 로케일마다 라벨 길이가 달라 en에서만 재면 ko 회귀를 놓치므로 양쪽을 순회한다.
   *
   * **트리거만 재던 시절의 구멍을 메운다.** 예전에는 트리거의 `.truncate` 노드만 봤고
   * 팝업 폭 단언(`popupAtLeastAnchor`)은 팝업이 구조적으로 앵커 폭이라 늘 참인 공허한
   * 단언이었다 — 그 사이로 종류 셀렉트의 ko `User-Agent 변경`이 팝업에서 20px 잘린 채
   * 살아 있었다. 이제 **팝업 항목 자체의 절단**을 재고, 대상도 매치 방식 하나가 아니라
   * **두 셀렉트 모두**다(종류가 가장 긴 라벨을 든다).
   *
   * 같은 자리에서 **선택 표시**도 본다. 고른 항목은 체크 글리프가 아니라 면으로 말하므로
   * (tokens.ts의 `popupItemSelected`), 그것이 되돌아가면 옵션 안에 svg가 생기거나 선택
   * 항목의 배경이 나머지와 같아진다 — 둘 다 여기서 걸린다.
   */
  const measureSelectWidths = async (page, selectLabel, probeAfterPick) => {
    const trigger = page.getByRole('combobox', { name: selectLabel, exact: true });
    await trigger.waitFor({ timeout: 5000 });
    const listbox = page.getByRole('listbox');
    // 팝업이 닫히는 중에 다음 클릭이 들어가면 Base UI의 inert 백드롭이 가로챈다 —
    // 열림·닫힘을 매번 명시적으로 기다린다.
    const openPopup = async () => {
      await trigger.click();
      await listbox.first().waitFor({ timeout: 5000 });
    };
    const closePopup = () => listbox.first().waitFor({ state: 'detached', timeout: 5000 });

    await openPopup();
    const options = (await page.getByRole('option').allTextContents()).map((n) => n.trim());
    /*
     * 팝업 안의 것들은 **열려 있는 지금 한 번에** 잰다 — 항목 폭도 선택 표시 문법도 어느
     * 값을 골랐는지에 따라 변하지 않는다. 옵션마다 다시 열어 재면 시간만 늘고 같은 수를 본다.
     */
    const popupProbe = await page.evaluate(() => {
      /*
       * **보이는 팝업 하나로 좁힌다.** 닫힌 셀렉트의 목록은 DOM에서 사라지지 않고 `hidden`
       * 으로 남는다 — 접근성 트리에서는 빠지므로 Playwright의 role 조회(`getByRole`)에는
       * 안 잡히지만 `querySelectorAll('[role="option"]')`에는 그대로 잡힌다. 문서 전체를
       * 훑으면 앞서 열었던 셀렉트의 항목이 섞여 들어와 "고른 항목이 둘"이 된다.
       */
      const list = [...document.querySelectorAll('[role="listbox"]')].find((el) =>
        el.checkVisibility(),
      );
      const items = list ? [...list.querySelectorAll('[role="option"]')] : [];
      const bg = (el) => getComputedStyle(el).backgroundColor;
      const selected = items.filter((el) => el.getAttribute('aria-selected') === 'true');
      return {
        count: items.length,
        // 항목은 `whitespace-nowrap`이라 넘치면 접히지 않고 넘친다 — 그래야 여기서 보인다.
        clipped: items
          .filter((el) => el.scrollWidth > el.clientWidth + 1)
          .map((el) => el.textContent.trim()),
        selectedCount: selected.length,
        selectedBg: selected.map(bg),
        otherBgs: items.filter((el) => !selected.includes(el)).map(bg),
        // 체크 글리프는 없다 — 선택은 면이 말한다.
        glyphs: items.filter((el) => el.querySelector('svg')).length,
      };
    });
    await page.keyboard.press('Escape');
    await closePopup();

    const rows = [];
    const probes = [];
    let popupAtLeastAnchor = true;
    for (const name of options) {
      await openPopup();
      // 팝업은 앵커 폭 이상으로 열린다 — 트리거보다 좁아 보이면 안 된다.
      const popupWidth = await listbox.first().evaluate((el) => el.getBoundingClientRect().width);
      const triggerWidth = await trigger.evaluate((el) => el.getBoundingClientRect().width);
      if (popupWidth + 0.5 < triggerWidth) popupAtLeastAnchor = false;
      await page.getByRole('option', { name, exact: true }).click();
      await closePopup();
      rows.push(
        // 라벨 노드는 `truncate`가 붙은 것이다 — 위치로 고르면(첫 span) 아이콘 래퍼를
        // 집을 수 있고, 아이콘은 절대 넘치지 않아 절단 단언이 조용히 무력해진다.
        await trigger.evaluate((el) => {
          const value = el.querySelector('.truncate');
          return {
            width: Number(el.getBoundingClientRect().width.toFixed(2)),
            scroll: value ? value.scrollWidth : -1,
            client: value ? value.clientWidth : -1,
          };
        }),
      );
      // 선택할 때마다 호출자가 원하는 것을 함께 잰다 — 여닫는 동작을 밖에서 한 번 더
      // 흉내 내면 대기 규율이 두 곳으로 갈라진다.
      if (probeAfterPick) probes.push(await probeAfterPick());
    }
    return { options, rows, popupAtLeastAnchor, probes, popupProbe };
  };

  await seedProfiles([
    baseProfile('p-width', 'Width', [
      { kind: 'request-header', id: 'm1', name: 'Accept', value: 'v', enabled: true, mode: 'override',
        emptyMeans: 'remove', comment: '', urlFilter: 'example.com' },
    ]),
  ]);
  await popup.reload();
  await popup.getByRole('button', { name: 'Edit', exact: true }).first().click();
  // 폭이 고정이면 옆의 패턴 입력도 자리를 지킨다 — 사용자가 말한 증상이 이것이다.
  const widthEn = await measureSelectWidths(popup, 'URL match type', () =>
    popup
      .getByLabel('URL filter')
      .first()
      .evaluate((el) => Number(el.getBoundingClientRect().left.toFixed(2))),
  );
  const patternLeftEdges = widthEn.probes;
  // 종류는 **매치 방식 다음**에 순회한다 — 리다이렉트로 바꾸는 순간 URL 스코프 행이
  // 사라져 위의 패턴 입력 프로브가 잡을 것을 잃는다.
  const kindEn = await measureSelectWidths(popup, 'Type');
  await popup.getByRole('button', { name: 'Cancel', exact: true }).click();

  const widthPopupKo = await context.newPage();
  await widthPopupKo.setViewportSize({ width: 760, height: 580 });
  await widthPopupKo.goto(`chrome-extension://${extensionId}/popup.html?locale=ko`);
  await widthPopupKo.getByRole('button', { name: '규칙 추가' }).waitFor({ timeout: 5000 });
  await widthPopupKo.getByRole('button', { name: '편집', exact: true }).first().click();
  const widthKo = await measureSelectWidths(widthPopupKo, 'URL 매치 방식');
  const kindKo = await measureSelectWidths(widthPopupKo, '종류');
  await widthPopupKo.close();

  const measured = [widthEn, kindEn, widthKo, kindKo];
  const stableWidth = (rows) =>
    rows.length > 1 &&
    Math.max(...rows.map((r) => r.width)) - Math.min(...rows.map((r) => r.width)) <= 0.5;
  // 노드를 못 찾으면(-1) 통과시키지 않는다 — R-2가 지키려는 단 하나의 단언이라
  // 공허하게 참이 되면 안 된다.
  const noClipping = (rows) =>
    rows.length > 0 && rows.every((r) => r.scroll >= 0 && r.scroll <= r.client + 1);
  /*
   * **네 셀렉트가 전부 같은 폭이다.** 각자 안에서만 안정적인 것으로는 부족하다 — 폭 변형이
   * 되살아나면 자리마다 다른 폭이 되는데, 셀렉트별 단언은 그것을 하나도 보지 못한다.
   */
  const allWidths = measured.flatMap((m) => m.rows.map((r) => r.width));
  const oneWidth = allWidths.length > 0 && Math.max(...allWidths) - Math.min(...allWidths) <= 0.5;
  // 선택 표시 — 고른 항목이 정확히 하나이고, 그 면이 나머지 어느 항목과도 다르며, 체크 없음.
  const selectionShown = (p) =>
    p.count > 1 &&
    p.selectedCount === 1 &&
    p.glyphs === 0 &&
    p.selectedBg[0] !== 'rgba(0, 0, 0, 0)' &&
    p.otherBgs.every((bg) => bg !== p.selectedBg[0]);
  const patternStable =
    patternLeftEdges.length > 1 &&
    Math.max(...patternLeftEdges) - Math.min(...patternLeftEdges) <= 0.5;
  record('N25: 셀렉트 — en/ko 두 셀렉트 모두 같은 고정 폭·트리거/팝업 미절단, 선택은 면으로, 패턴 입력 고정',
    measured.every((m) => stableWidth(m.rows) && noClipping(m.rows) && m.popupAtLeastAnchor) &&
      measured.every((m) => m.popupProbe.clipped.length === 0) &&
      measured.every((m) => selectionShown(m.popupProbe)) &&
      oneWidth && patternStable,
    `폭=${[...new Set(allWidths)].join('/')} 한폭=${oneWidth}, ` +
    `트리거 미절단=${measured.map((m) => noClipping(m.rows)).join('/')}, ` +
    `팝업 절단=${JSON.stringify(measured.flatMap((m) => m.popupProbe.clipped))}, ` +
    `선택 표시=${measured.map((m) => selectionShown(m.popupProbe)).join('/')} ` +
    `(체크 svg=${measured.map((m) => m.popupProbe.glyphs).join('/')}, ` +
    `선택 면=${measured.map((m) => m.popupProbe.selectedBg[0]).join(' | ')}), ` +
    `패턴 좌변=${[...new Set(patternLeftEdges)].join('/')}`);

  // N26: 검증 실패 시 첫 누락 입력으로 포커스 (ui-polish 08, stories 12~16).
  // 저장 전에 포커스를 일부러 딴 곳(종류 셀렉트)에 둔다 — 폼 열림 autoFocus가 남아
  // 있는 상태로 재면 "이동했다"가 아니라 "원래 거기 있었다"를 보게 된다.
  const focusAfterBlockedSave = async (page, { kind, expected, setup }) => {
    await page.getByRole('button', { name: 'Add rule' }).first().click();
    await page.getByRole('button', { name: 'Cancel', exact: true }).waitFor({ timeout: 5000 });
    if (kind) {
      const typeSelect = page.getByRole('combobox', { name: 'Type', exact: true });
      const listbox = page.getByRole('listbox');
      await typeSelect.click();
      await listbox.first().waitFor({ timeout: 5000 });
      await page.getByRole('option', { name: kind, exact: true }).click();
      await listbox.first().waitFor({ state: 'detached', timeout: 5000 });
    }
    if (setup) await setup();
    await page.getByRole('combobox', { name: 'Type', exact: true }).focus();
    await page.getByRole('button', { name: SAVE_BUTTON }).click();
    await page.waitForTimeout(rowSettleMs());
    // 기대 요소와 **동일한 노드**인지 본다 — 접근성 이름은 aria-label일 수도 <label>
    // 연결일 수도 있어(이 폼은 둘 다 쓴다) 문자열 비교로는 어느 쪽인지 알 수 없다.
    // 기대 요소와 **동일한 노드**인지 본다. 시간 상한을 둬 회귀가 기본 30초 타임아웃으로
    // 번지지 않게 한다 — 없는 요소를 기다리는 것도 실패이지 지연이 아니다.
    const target = expected(page).first();
    const present = await target.waitFor({ timeout: 2000 }).then(() => true, () => false);
    const onTarget = present
      ? await target.evaluate((el) => document.activeElement === el).catch(() => false)
      : false;
    /*
     * 오류는 **막힌 그 순간**에 보여야 한다 — 포커스가 옮겨 가는 것만으로 문구가 사라지면
     * 사용자는 무엇이 막았는지 읽을 새가 없다. 그래서 타이핑 **전에** 잰다.
     */
    const errorsBefore = await page.getByText('Required.', { exact: true }).count();
    const errorShown = errorsBefore > 0;
    // story 13: 포커스만이 아니라 **바로 타이핑**돼야 한다. 버튼에 포커스가 가면
    // 포커스 단언은 통과하지만 여기서 걸린다.
    let typeable = false;
    if (onTarget) {
      await page.keyboard.type('zz');
      typeable = (await target.inputValue().catch(() => '')) === 'zz';
    }
    /*
     * 그리고 **채운 칸의 것만** 사라진다 (티켓 07). 예전에는 다음 저장까지 남아, 칸을 채워
     * 버튼이 살아난 뒤에도 "필수입니다"가 그대로 서 있었다 — 화면이 스스로를 반박하는 상태다.
     * 이 자리가 예전에 재던 "타이핑 뒤에도 남는다"가 바로 그 낡은 동작이었다.
     *
     * 0이 되는지가 아니라 **줄었는지**를 본다: Redirect는 패턴·치환 둘 다 필수라, 하나를
     * 채워도 다른 하나의 오류는 남아 있는 것이 맞다. 0을 요구하면 그 정상 동작을 실패로 읽는다.
     */
    const errorsAfter = await page.getByText('Required.', { exact: true }).count();
    const errorClears = onTarget && errorsAfter === errorsBefore - 1;
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.waitForTimeout(rowSettleMs());
    return { onTarget, typeable, errorShown, errorClears };
  };

  await seedProfiles([baseProfile('p-focus', 'Focus', [])]);
  await popup.reload();
  await popup.getByRole('button', { name: 'Add rule' }).first().waitFor({ timeout: 5000 });

  const focusCases = {
    '헤더 이름': await focusAfterBlockedSave(popup, {
      kind: null,
      expected: (page) => page.getByLabel('Header name', { exact: true }),
    }),
    '쿠키 이름': await focusAfterBlockedSave(popup, {
      kind: 'Request cookie',
      expected: (page) => page.getByLabel('Cookie name', { exact: true }),
    }),
    'Redirect 패턴': await focusAfterBlockedSave(popup, {
      kind: 'Redirect',
      expected: (page) => page.getByLabel('Redirect pattern', { exact: true }),
    }),
    'Redirect 치환(패턴만 채움)': await focusAfterBlockedSave(popup, {
      kind: 'Redirect',
      setup: () => popup.getByLabel('Redirect pattern', { exact: true }).first().fill('^https://a/(.*)'),
      expected: (page) => page.getByLabel('Redirect to', { exact: true }),
    }),
  };
  const allOnTarget = Object.values(focusCases).every((r) => r.onTarget);
  const allTypeable = Object.values(focusCases).every((r) => r.typeable);
  const allErrorsShown = Object.values(focusCases).every((r) => r.errorShown);
  const allErrorsCleared = Object.values(focusCases).every((r) => r.errorClears);
  record('N26: 검증 차단 시 첫 누락 입력으로 포커스 — 종류별 매핑·즉시 타이핑·오류는 막힐 때 뜨고 채우면 사라진다',
    allOnTarget && allTypeable && allErrorsShown && allErrorsCleared,
    Object.entries(focusCases)
      .map(([k, r]) => `${k}=${r.onTarget ? (r.typeable ? 'ok' : '포커스만') : 'MISS'}`)
      .join(' ') + `, 막힐 때 표시=${allErrorsShown}, 채우면 사라짐=${allErrorsCleared}`);

  /*
   * **N27(아코디언 헤더 전체가 클릭 대상)이 없다** (티켓 09).
   *
   * 그 시나리오는 `CollapsiblePanel`의 헤더 트리거를 쟀다 — 백업·설정이 시안의 카드가 되면서
   * 접기가 사라졌고, 그 셸을 쓰는 화면이 하나도 남지 않아 컴포넌트와 함께 걷혔다. 규칙 폼의
   * 아코디언은 다른 물건이다(행이 그대로 있고 그 아래로 폼이 펼쳐진다) — N41b가 잰다.
   */

  // ---------- N29~N32: ui-polish 후속 다듬기 ----------
  //
  // 이 넷은 전부 "Base UI가 마운트를 소유하는 표면의 CSS 전이"이거나 순수 배치라, 값이
  // 조용히 사라져도 기능 테스트는 통과한다. 티켓 09에서 아코디언 헤더의 누름 계약이
  // 목록에 없어 게이트를 그냥 지나간 적이 있어, 새로 만든 계약은 곧바로 목록에 올린다.

  /*
   * **N29(접이식 패널)가 없다** (티켓 09). 기본 열림과 닫힘 전이를 재던 시나리오인데, 백업·설정이
   * 시안의 카드가 되면서 접기 자체가 사라졌고 `CollapsiblePanel`도 함께 걷혔다. 같은 묶음이
   * 지키던 나머지 셋(N30·N31·N33)은 그대로다.
   *
   * 시드는 남는다 — 뒤따르는 셋이 이 프로필(`X-P` 규칙 하나) 위에서 돈다.
   */
  await seedProfiles([baseProfile('p-tune', 'Tune', [hdr({ id: 'm1', name: 'X-P', value: '1' })])]);
  await popup.emulateMedia({ reducedMotion: null });
  await popup.reload();

  // N30: Select 팝업 — 트리거 **아래**로 떨어지고 좌변이 맞는다 + 위에서 아래로 내려온다.
  // 기본값(alignItemWithTrigger)은 선택된 항목을 트리거 위에 겹쳐 띄우므로, 이 단언이
  // 없으면 되돌아가도 아무도 모른다. 세로 이동 방향까지 봐야 "내려온다"가 지켜진다.
  await popup.getByRole('button', { name: 'Show profiles' }).click();
  await popup.getByText('X-P').first().hover();
  await popup.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await popup.getByLabel('Header name', { exact: true }).first().waitFor({ timeout: 5000 });
  await popup.waitForTimeout(400);

  const selectTrace = async (page) => {
    const trg = page.getByRole('combobox').first();
    const t = await trg.boundingBox();
    await trg.click();
    await page.getByRole('option').first().waitFor({ timeout: 5000 });
    const motion = await page.evaluate(async () => {
      // 전이가 걸리는 것은 **Popup**이지 그 안의 목록이 아니다. shadcn 구조에서
      // `role="listbox"`를 갖는 것은 Popup이 아니라 자식 List라, 예전처럼 listbox를 재면
      // 항상 opacity 1만 읽혀 전이가 없는 것처럼 보인다(실제로 겪었다 — 팝업은 정상적으로
      // 페이드하는데 단언만 실패했다). Popup을 우선 잡고, 없으면 예전 구조로 물러난다.
      const pop =
        document.querySelector('[data-slot="select-content"]') ??
        document.querySelector('[role="listbox"]');
      const opacity = [];
      const ys = [];
      const t0 = performance.now();
      while (performance.now() - t0 < 400) {
        opacity.push(Number(getComputedStyle(pop).opacity).toFixed(2));
        ys.push(Math.round(pop.getBoundingClientRect().y));
        await new Promise((r) => requestAnimationFrame(r));
      }
      return { steps: new Set(opacity).size, yFrom: ys[0], yTo: ys.at(-1) };
    });
    await page.waitForTimeout(150);
    const p = await page.getByRole('listbox').first().boundingBox();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    return {
      below: p.y >= t.y + t.height - 1,
      gap: Math.round(p.y - t.y - t.height),
      leftDelta: Math.round(p.x - t.x),
      atLeastAnchorWidth: p.width >= t.width - 1,
      ...motion,
    };
  };

  const livelySelect = await selectTrace(popup);
  await popup.emulateMedia({ reducedMotion: 'reduce' });
  await popup.reload();
  await popup.getByText('X-P').first().hover();
  await popup.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await popup.getByLabel('Header name', { exact: true }).first().waitFor({ timeout: 5000 });
  await popup.waitForTimeout(400);
  const reducedSelect = await selectTrace(popup);
  await popup.emulateMedia({ reducedMotion: null });

  record('N30: Select 팝업 — 트리거 아래·좌변 정렬, 위에서 아래로 내려옴(reduced는 즉시)',
    livelySelect.below && livelySelect.leftDelta === 0 && livelySelect.atLeastAnchorWidth &&
      livelySelect.steps > 3 && livelySelect.yTo > livelySelect.yFrom &&
      reducedSelect.below && reducedSelect.steps <= 2,
    `아래=${livelySelect.below} 좌변차=${livelySelect.leftDelta}px 간격=${livelySelect.gap}px 앵커폭이상=${livelySelect.atLeastAnchorWidth}, ` +
    `opacity 단계 기본=${livelySelect.steps}/reduced=${reducedSelect.steps}, y ${livelySelect.yFrom}→${livelySelect.yTo}`);

  // N31: 폼 액션 쌍 — 취소·저장이 같은 8px 모서리와 넓은 좌우 여백을 쓴다.
  // 기본값은 primary가 pill, ghost가 6px이라 나란히 두면 서로 다른 모양이었다.
  await popup.reload();
  await popup.getByText('X-P').first().hover();
  await popup.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await popup.getByLabel('Header name', { exact: true }).first().waitFor({ timeout: 5000 });
  const actionPair = await popup.evaluate(() => {
    const all = [...document.querySelectorAll('button')];
    const pick = (text) => all.find((b) => b.textContent.trim() === text);
    const read = (el) => {
      const cs = getComputedStyle(el);
      return { radius: cs.borderRadius, padL: cs.paddingLeft, padR: cs.paddingRight };
    };
    const cancel = pick('Cancel');
    // 편집 폼의 저장 글자는 'Save changes'다 (티켓 06) — 둘 다 받는다.
    const save = pick('Save changes') ?? pick('Save');
    return cancel && save ? { cancel: read(cancel), save: read(save) } : null;
  });
  record('N31: 폼 액션 쌍 — 취소·저장이 같은 8px 모서리와 넓은 좌우 여백',
    actionPair !== null &&
      actionPair.cancel.radius === '8px' && actionPair.save.radius === '8px' &&
      actionPair.cancel.padL === '16px' && actionPair.save.padL === '16px' &&
      actionPair.cancel.padR === '16px' && actionPair.save.padR === '16px',
    actionPair
      ? `취소 r=${actionPair.cancel.radius} px=${actionPair.cancel.padL}/${actionPair.cancel.padR}, 저장 r=${actionPair.save.radius} px=${actionPair.save.padL}/${actionPair.save.padR}`
      : '버튼을 찾지 못함');
  await popup.getByRole('button', { name: 'Cancel', exact: true }).click();

  /*
   * N32: 레일 화면(백업·설정)에는 **고를 프로필이 아예 없다** (ADR 0017이 ADR 0005를 개정).
   *
   * 이 자리는 원래 "거기서 고르면 프로필 화면으로 돌아온다"를 재던 곳이었다. 그 보정은
   * 사이드바가 늘 보이던 시절 "눌러도 아무 일이 안 일어난 것처럼 보인다"를 막으려던 것인데,
   * 시안은 같은 문제에 다른 답을 내놨다 — **누를 것 자체를 없앤다.** 그래서 재는 대상이
   * 바뀌었지 사라진 것이 아니다: 그때 막으려던 실패가 지금도 불가능한지를 본다.
   *
   * 부재만 단언하면 "열이 통째로 안 그려져도 통과"로 퇴화하므로, 프로필 화면에서 같은
   * 컨트롤이 **있음**을 먼저 보여 감도 대조를 건다.
   */
  await seedProfiles([
    baseProfile('p-a', 'Alpha', [hdr({ id: 'm1', name: 'X-A', value: '1' })]),
    { ...baseProfile('p-b', 'Beta', []), active: false },
  ]);
  await popup.reload();
  const selectableOn = async (railButton) => {
    await popup.getByRole('button', { name: railButton }).click();
    await popup.waitForTimeout(300);
    return {
      pressed: await popup.evaluate(() =>
        [...document.querySelectorAll('nav button')].map((b) => b.getAttribute('aria-pressed'))),
      selects: await popup.getByRole('button', { name: /^Select profile/ }).count(),
      search: await popup.getByPlaceholder('Search profiles…').count(),
    };
  };
  const onProfilesView = await selectableOn('Show profiles');
  const onSettingsView = await selectableOn('Show settings');
  const onBackupsView = await selectableOn('Show backups');
  await popup.getByRole('button', { name: 'Show profiles' }).click();
  await popup.waitForTimeout(200);

  record('N32: 백업·설정에는 고를 프로필이 없다 — 프로필 열이 서지 않는다',
    onProfilesView.pressed[0] === 'true' && onProfilesView.selects === 2 && onProfilesView.search === 1 &&
      onSettingsView.pressed[2] === 'true' && onSettingsView.selects === 0 && onSettingsView.search === 0 &&
      onBackupsView.pressed[1] === 'true' && onBackupsView.selects === 0 && onBackupsView.search === 0,
    `프로필 pressed=${JSON.stringify(onProfilesView.pressed)} selects=${onProfilesView.selects} search=${onProfilesView.search}, ` +
    `설정 selects=${onSettingsView.selects} search=${onSettingsView.search}, ` +
    `백업 selects=${onBackupsView.selects} search=${onBackupsView.search}`);

  /*
   * N45: 퇴역 공지 (티켓 02, ADR 0017) — **보는 것으로는 지워지지 않는다.**
   *
   * 여기서만 볼 수 있는 것이 있다. 코어 테스트는 "확인 명령이 공지를 지운다"는 전이를 재지만,
   * 팝업이 렌더 직후 닫히는 **정상 동작**만으로 공지가 소비되는지는 실제 창을 열고 닫아야
   * 드러난다 — 그 실패 모양에서는 규칙이 이미 넓어진 뒤에 그 이유를 설명하던 유일한 것이
   * 사라진다. 확인이 화면 안에서만 끝나지 않고 저장소까지 닿았는지도 새 창이 증인이다.
   */
  await sw.evaluate(async () => {
    await chrome.storage.local.set({
      state: {
        schemaVersion: 2,
        paused: false,
        profiles: [
          { id: 'p-ret', name: 'Retired', active: true, shortLabel: 'R', color: '#2563eb',
            modifications: [
              { kind: 'request-header', id: 'm1', name: 'X-Ret', value: 'on', enabled: true,
                mode: 'override', emptyMeans: 'remove', comment: '',
                conditions: { tabDomains: ['tab.io'] } },
            ] },
        ],
        materialized: {},
        customHeaderNames: [],
      },
    });
  });

  const RETIREMENT_TEXT = /no longer supported/;
  const openRetirementPopup = async () => {
    const p = await context.newPage();
    await p.goto(`chrome-extension://${extensionId}/popup.html?locale=en`);
    await p.getByRole('button', { name: 'Add rule' }).first().waitFor({ timeout: 5000 });
    await p.waitForTimeout(200);
    return p;
  };

  /*
   * 두 표면을 **동시에** 연다. 순차로 열고 닫으면 "한쪽이 다른 쪽 몫까지 소비하지 않는다"를
   * 재지 못한다 — 그 실패 모양은 먼저 그린 창이 공지를 소비해 **아직 열려 있는** 다른 창이
   * 빈손이 되는 것이라, 둘이 겹쳐 있는 동안을 봐야 드러난다.
   */
  const noticeFirst = await openRetirementPopup();
  const noticeSecond = await openRetirementPopup();
  const seenFirst = await noticeFirst.getByText(RETIREMENT_TEXT).count();
  const seenSecond = await noticeSecond.getByText(RETIREMENT_TEXT).count();
  // 수까지 본다 — 문구만 맞고 수가 비면 "몇 개가 넓어졌는지"를 말하지 못한다.
  const noticeBody = seenFirst > 0 ? await noticeFirst.getByText(RETIREMENT_TEXT).first().innerText() : '';
  await noticeFirst.close();

  // 한쪽을 보고 닫았을 뿐이다 — 남은 창에도, 새로 여는 창에도 그대로 있어야 한다.
  const stillSecond = await noticeSecond.getByText(RETIREMENT_TEXT).count();
  await noticeSecond.getByRole('button', { name: 'Got it' }).click();
  await noticeSecond.getByText(RETIREMENT_TEXT).first()
    .waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  const afterAck = await noticeSecond.getByText(RETIREMENT_TEXT).count();
  await noticeSecond.close();

  // 확인이 쓰기 문을 지나 저장소까지 닿았는가 — 새 창이 증인이다.
  const noticeThird = await openRetirementPopup();
  const afterReopen = await noticeThird.getByText(RETIREMENT_TEXT).count();
  await noticeThird.close();

  record('N45: 퇴역 공지 — 두 표면이 함께 보고, 보는 것으로는 안 지워지며, 확인해야 저장소에서 사라진다',
    seenFirst > 0 && seenSecond > 0 && /\b1 rule\b/.test(noticeBody) && stillSecond > 0 &&
      afterAck === 0 && afterReopen === 0,
    `동시=[${seenFirst},${seenSecond}] "${noticeBody}", 한쪽 닫은 뒤=${stillSecond}, ack후=${afterAck}, 재열기=${afterReopen}`);

  // N33: 스크롤바 트랙의 opacity 전이가 reduced-motion에서 **꺼진다** (릴리스 게이트 R-2).
  //
  // 스펙 story 23의 계약 경계는 ADR 0012에 명문화했다 — 색 전이는 밖, **움직임·opacity는 안.**
  // 스크롤바 페이드는 opacity 전이라 안쪽이고, reduced-motion에서 `transition-property`가
  // `none`이어야 한다. **감도 대조를 함께 건다**: 기본 모션에서 같은 요소가 `opacity` 전이를
  // 실제로 가짐을 먼저 보여, 부재 단언이 "토큰을 지워도 통과"로 퇴화하지 않게 한다.
  //
  // opacity 값(0.6)은 양쪽 다 남는다 — 전이(페이드)만 끄고 어포던스는 유지한다. 그래서
  // `transition-property`를 보지 `opacity`를 보지 않는다.
  await seedProfiles(
    Array.from({ length: 18 }, (_, i) =>
      ({ ...baseProfile(`sb-${i}`, `Scroll ${i}`, []), active: i === 0 })),
  );
  const scrollbarTransition = async (reduced) => {
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : null });
    await page.setViewportSize({ width: 760, height: 580 });
    await page.goto(`chrome-extension://${extensionId}/popup.html?locale=en`);
    await page.getByRole('button', { name: 'Add rule' }).first().waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);
    // 트랙은 넘치는 사이드바에만 뜬다(Base UI keepMounted 기본 false). 18 프로필로 넘치게 했다.
    const state = await page.evaluate(() => {
      const track = document.querySelector('[data-orientation="vertical"]');
      if (!track) return { present: false };
      const cs = getComputedStyle(track);
      return { present: true, prop: cs.transitionProperty, opacity: cs.opacity };
    });
    await page.close();
    return state;
  };
  const sbLively = await scrollbarTransition(false);
  const sbReduced = await scrollbarTransition(true);
  record('N33: 스크롤바 페이드 — 기본은 opacity 전이, reduced-motion에서는 부재(값은 유지)',
    sbLively.present && sbReduced.present &&
      sbLively.prop.includes('opacity') && sbReduced.prop === 'none' &&
      sbLively.opacity === sbReduced.opacity,
    `기본 prop=${sbLively.prop} opacity=${sbLively.opacity}, reduced prop=${sbReduced.prop} opacity=${sbReduced.opacity}`);

  // N28: 레일 아이콘 툴팁 (ui-polish 10, stories 28~30).
  // 레일만 툴팁 없는 맨 버튼이었다 — 다른 아이콘 버튼과 같은 셸로 옮긴다. 셸을 바꾸면
  // 크기가 24×24로 줄어들 수 있어(기존 IconButton 기본값) 클릭 대상 크기도 함께 본다.
  const railProbe = async (page, name) => {
    const button = page.getByRole('button', { name, exact: true });
    const found = await button.waitFor({ timeout: 5000 }).then(() => true, () => false);
    if (!found) return { found: false, hoverTip: false, focusTip: false, width: 0, height: 0, icon: 0 };
    const geom = await button.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const icon = el.querySelector('svg')?.getBoundingClientRect();
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        icon: icon ? Math.round(icon.width) : -1,
      };
    });
    const tip = page.getByRole('tooltip').filter({ hasText: name }).first();
    /*
     * 호버 **전에** 포인터를 치운다. 레일 버튼이 세로 배치로 커지면서(ADR 0017) 직전
     * 시나리오가 남긴 포인터가 이미 버튼 안에 들어오는 경우가 생겼고, 그러면 `hover()`가
     * 새 mouseenter를 내지 않아 툴팁이 영영 열리지 않는다 — 아래 이탈 확인과 대칭이다.
     */
    await page.mouse.move(1, 1);
    await button.hover();
    const hoverTip = await tip.waitFor({ timeout: 3000 }).then(() => true, () => false);
    await page.mouse.move(1, 1);
    // 호버 툴팁이 **사라진 것을 확인하고** 포커스로 넘어간다 — 고정 대기만 두면 뒤이은
    // 포커스 단언이 남아 있는 호버 툴팁을 타고 통과할 수 있다.
    const hoverTipClosed = await tip
      .waitFor({ state: 'detached', timeout: 3000 })
      .then(() => true, () => false);
    // 마우스 없이 포커스만으로도 같은 정보를 얻어야 한다(story 29).
    await button.focus();
    const focusTip = await tip.waitFor({ timeout: 3000 }).then(() => true, () => false);
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
    await tip.waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
    return { found: true, ...geom, hoverTip, hoverTipClosed, focusTip };
  };

  await popup.reload();
  await popup.getByRole('button', { name: 'Show profiles', exact: true }).waitFor({ timeout: 5000 });
  // 세 아이콘 전부 — 하나만 보면 나머지 둘이 라벨을 잃어도 통과한다.
  const railEn = {
    profiles: await railProbe(popup, 'Show profiles'),
    backups: await railProbe(popup, 'Show backups'),
    preferences: await railProbe(popup, 'Show settings'),
  };
  // 실제 Tab으로 도달했을 때도 열리는지 — 프로그램적 focus()와 focus-visible 판정이
  // 다를 수 있어 키보드 경로를 한 번은 진짜로 밟는다.
  await popup.getByRole('button', { name: 'Show profiles', exact: true }).focus();
  await popup.keyboard.press('Tab');
  const tabTip = await popup
    .getByRole('tooltip')
    .filter({ hasText: 'Show backups' })
    .first()
    .waitFor({ timeout: 3000 })
    .then(() => true, () => false);

  // 선택 표시는 유지된다 — 툴팁을 얻으려고 "지금 보고 있는 화면"을 잃으면 안 된다.
  const railBackups = popup.getByRole('button', { name: 'Show backups', exact: true });
  const unselectedBg = await railBackups.evaluate((el) => getComputedStyle(el).backgroundColor);
  await railBackups.click();
  await popup.waitForTimeout(250);
  const railSelected = await railBackups.evaluate((el) => ({
    pressed: el.getAttribute('aria-pressed'),
    background: getComputedStyle(el).backgroundColor,
  }));
  await popup.getByRole('button', { name: 'Show profiles', exact: true }).click();

  const railPopupKo = await context.newPage();
  await railPopupKo.setViewportSize({ width: 760, height: 580 });
  await railPopupKo.goto(`chrome-extension://${extensionId}/popup.html?locale=ko`);
  await railPopupKo.getByRole('button', { name: '프로필 화면', exact: true }).waitFor({ timeout: 5000 });
  const railKo = {
    profiles: await railProbe(railPopupKo, '프로필 화면'),
    backups: await railProbe(railPopupKo, '백업 화면'),
    preferences: await railProbe(railPopupKo, '환경설정 화면'),
  };
  await railPopupKo.close();

  const allRail = [
    ...Object.entries(railEn).map(([k, r]) => [`en:${k}`, r]),
    ...Object.entries(railKo).map(([k, r]) => [`ko:${k}`, r]),
  ];
  const railOkOf = (r) =>
    r.found && r.hoverTip && r.hoverTipClosed && r.focusTip &&
    // 셸을 바꾸며 32×28 / 아이콘 16px보다 작아지지 않았는지
    r.width >= 32 && r.height >= 28 && r.icon >= 16;
  const everyIconOk = allRail.every(([, r]) => railOkOf(r));
  /*
   * 실패한 항목을 **이름과 함께** 남긴다. 예시 하나만 찍던 메시지는 여섯 중 다른 하나가
   * 걸렸을 때 무엇을 봐야 하는지 말해 주지 않아, 실패가 곧 재현 실험이 됐다.
   */
  const railFailures = allRail
    .filter(([, r]) => !railOkOf(r))
    .map(([name, r]) =>
      `${name}{found=${r.found},hover=${r.hoverTip},close=${r.hoverTipClosed},focus=${r.focusTip},` +
      `${r.width}x${r.height},icon=${r.icon}}`)
    .join(' ');
  record('N28: 레일 아이콘 셋 — en/ko 호버·포커스·Tab 툴팁, 클릭 대상·선택 표시 유지',
    everyIconOk && tabTip &&
      railSelected.pressed === 'true' && railSelected.background !== unselectedBg,
    `아이콘 ${allRail.length}개 전부 ok=${everyIconOk}` + (railFailures ? ` 실패=[${railFailures}]` : '') + `, ` +
    `Tab 툴팁=${tabTip}, 선택 배경 ${unselectedBg} → ${railSelected.background} (pressed=${railSelected.pressed})`);


  /*
   * N41: 셸 구조 재작업 (티켓 10) — 레일 라벨·적용 수, 프로필 열, 두 표면 치수.
   *
   * N28은 레일이 **툴팁**을 갖는지를 본다(그건 그대로 유효하다). 여기서 보는 것은 그 위에
   * 얹힌 구조다 — 아이콘 옆에 **보이는 라벨**이 서고, 레일 하단이 지금 걸려 있는 규칙 수를
   * 말하며, 프로필 열이 색 스와치와 인라인 토글을 갖는지. 라벨은 접근성 이름(Show …)과
   * 다른 짧은 문자열이라, 접근성 이름만 보는 단언으로는 라벨이 없어도 통과한다.
   */
  await seedProfiles([
    baseProfile('r-a', 'RailA', [hdr({ id: 'm1', name: 'X-Rail', value: '1' })]),
    { ...baseProfile('r-b', 'RailB', []), active: false },
  ]);
  await popup.reload();
  await popup.getByRole('button', { name: 'Show profiles', exact: true }).waitFor({ timeout: 5000 });
  const railStructure = await popup.evaluate(() =>
    [...document.querySelectorAll('nav button')].map((b) => ({
      aria: b.getAttribute('aria-label'),
      text: b.textContent.trim(),
      icon: !!b.querySelector('svg'),
    })));
  // 레일 하단의 적용 수 — background가 발행한 요약이 도착할 때까지 기다린다(규칙 1개).
  const appliedText = await pollUntil(
    () => popup.evaluate(() => document.querySelector('nav p')?.textContent?.trim() ?? ''),
    (v) => v === '1applied',
    8000,
    200,
  );
  const railOk =
    railStructure.length === 3 &&
    railStructure.every((r) => r.icon) &&
    railStructure.map((r) => r.text).join('|') === 'Profiles|Backups|Settings' &&
    railStructure.map((r) => r.aria).join('|') === 'Show profiles|Show backups|Show settings';

  // 프로필 열 — 검색·색 스와치·인라인 토글·새 프로필. 스와치는 **둘 다 채운 사각**이고
  // 채움 색만 다르다: 활성은 프로필 색, 비활성은 중립 회색(`--input`). 예전에는 비활성이
  // '테두리만 남은 사각'이라 안이 뚫려 보였고, 그 테두리가 사용자 색이라 흰색을 고르면
  // 도형이 사라져 윤곽선을 한 겹 더 얹어야 했다(N41c가 그 겹을 지키던 단언이다).
  const column = await popup.evaluate(() => {
    const rows = [...document.querySelectorAll('[aria-label^="Select profile"]')];
    return {
      rows: rows.length,
      swatches: rows.map((r) => {
        const s = r.querySelector('span[aria-hidden]');
        const cs = s ? getComputedStyle(s) : null;
        return cs ? { bg: cs.backgroundColor, border: cs.borderTopColor } : null;
      }),
      /*
       * **프로필 토글만** 센다 — 페이지 전역에서, 이름으로 거른다 (티켓 05).
       *
       * 이 자리가 지키는 것은 "프로필 하나에 토글 하나 — 편집기 헤더에 같은 이름의 스위치가
       * 또 서면 안 된다"이고, 그 가드는 **전역**이라야 뜻이 있다. 티켓 05가 규칙 행에 켜고
       * 끄기 스위치를 세우면서 전역 집계가 그것까지 세게 됐는데, 그렇다고 프로필 열 안으로
       * 좁히면 열 밖에 생긴 중복을 못 잡는다 — 원래 막으려던 것이 정확히 그 경우다.
       */
      switches: [...document.querySelectorAll('[role="switch"]')]
        .map((s) => s.getAttribute('aria-label'))
        .filter((label) => label?.startsWith('Toggle ')),
      search: !!document.querySelector('input[aria-label^="Search profiles"]'),
      newProfile: [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === '+ New profile'),
    };
  });
  // 인라인 토글이 실제로 상태를 바꾼다 — 프로필을 고르지 않고 목록에서 바로.
  await popup.getByRole('switch', { name: 'Toggle RailB' }).click();
  const inlineToggled = await pollUntil(
    () => sw.evaluate(async () => {
      const { state } = await chrome.storage.local.get('state');
      return state.profiles.find((p) => p.id === 'r-b')?.active;
    }),
    (v) => v === true,
  );
  const columnOk =
    column.rows === 2 &&
    column.search &&
    column.newProfile &&
    // 스위치는 프로필 하나에 하나뿐이다 — 편집기 헤더에 같은 이름의 스위치가 남아 있으면 4개가 된다.
    column.switches.join('|') === 'Toggle RailA|Toggle RailB' &&
    // 활성은 **프로필 색**으로 채운다 — 시드 색이 그대로 나와야 한다.
    column.swatches[0]?.bg === 'rgb(37, 99, 235)' &&
    // 비활성도 채운다(투명이 아니다) — 그러나 프로필 색이 아니라 중립 회색이다.
    // 두 조건을 함께 걸어야 "그냥 안 칠했다"와 "색을 그대로 뒀다" 둘 다 걸린다.
    column.swatches[1]?.bg !== 'rgba(0, 0, 0, 0)' &&
    column.swatches[1]?.bg !== column.swatches[0]?.bg;

  // 치수 — 팝업은 760×580 고정, 레일 < 프로필 열 (ADR 0005). 가로 오버플로 0.
  const shellProbe = () => ({
    ...(() => {
      const el = document.querySelector('nav').parentElement;
      const r = el.getBoundingClientRect();
      return {
        w: Math.round(r.width),
        h: Math.round(r.height),
        cols: getComputedStyle(el).gridTemplateColumns.split(' ').map((v) => Math.round(parseFloat(v))),
      };
    })(),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  });
  const popupShell = await popup.evaluate(shellProbe);
  // 탭은 전폭·전고 — 같은 셸이 뷰포트를 가득 채우고 열이 팝업보다 넓다.
  const tabShellPage = await context.newPage();
  await tabShellPage.setViewportSize({ width: 1100, height: 700 });
  await tabShellPage.goto(`chrome-extension://${extensionId}/app.html?locale=en`);
  await tabShellPage.getByRole('button', { name: 'Show profiles', exact: true }).waitFor({ timeout: 5000 });
  const tabShell = await tabShellPage.evaluate(shellProbe);
  await tabShellPage.close();
  /*
   * 레일과 프로필 열은 **두 표면이 같은 시안 폭**을 쓴다 (ADR 0017) — 예전에는 탭이 둘 다
   * 더 넓었다. 탭의 여분은 전부 본문이 가져가므로, 열 폭이 같다는 것과 본문만 넓다는 것을
   * 함께 못박는다(둘 중 하나만 보면 셋 다 같아져도 통과한다).
   */
  const sizeOk =
    popupShell.w === 760 && popupShell.h === 580 && popupShell.overflow === 0 &&
    popupShell.cols[0] < popupShell.cols[1] &&
    tabShell.w === 1100 && tabShell.h === 700 && tabShell.overflow === 0 &&
    tabShell.cols[0] === popupShell.cols[0] && tabShell.cols[1] === popupShell.cols[1] &&
    tabShell.cols[2] > popupShell.cols[2];

  record('N41: 셸 구조 — 레일 라벨·적용 수, 프로필 열(스와치·인라인 토글), 팝업 760×580 · 탭 전폭',
    railOk && appliedText === '1applied' && columnOk && inlineToggled && sizeOk,
    `rail=${JSON.stringify(railStructure.map((r) => r.text))} applied="${appliedText}", ` +
      `열 rows=${column.rows} switches=${JSON.stringify(column.switches)} swatch=${JSON.stringify(column.swatches)} ` +
      `search=${column.search} new=${column.newProfile} inline-toggle=${inlineToggled}, ` +
      `popup=${popupShell.w}x${popupShell.h} cols=${JSON.stringify(popupShell.cols)} overflow=${popupShell.overflow}, ` +
      `tab=${tabShell.w}x${tabShell.h} cols=${JSON.stringify(tabShell.cols)} overflow=${tabShell.overflow}`);

  /*
   * N41c: 비활성 스와치의 대비 (fix R-1) — **사용자 색과 무관하게** 보여야 한다.
   *
   * 색은 `<input type="color">`에서 오므로 아무 값이나 될 수 있다. 예전에는 비활성 스와치의
   * 테두리가 그 색이라 흰색에 가까운 값을 고르면 라이트 캔버스에서 도형이 사라졌고, 그래서
   * `--input` 윤곽선을 한 겹 겹쳐 3:1을 지켰다. 지금은 비활성 채움 자체가 중립 회색이라
   * 겹칠 것이 없다 — 그러니 재는 것도 "윤곽선이 있는가"가 아니라 **"채움이 사용자 색이
   * 아니고, 실제로 뒤에 깔린 면에 대해 3:1을 지는가"**로 바뀐다.
   *
   * 뒤 면을 조상에서 찾아 올라가는 이유: 스와치가 앉는 곳은 캔버스일 수도 있고 선택된 행의
   * `bg-secondary`일 수도 있어, 토큰 하나를 배경으로 가정하면 실제와 다른 수를 잰다.
   * N41은 디자인 팔레트의 파랑 하나만 보므로 이 구멍을 볼 수 없다.
   */
  await seedProfiles([
    { ...baseProfile('sw-w', 'Whiteish', []), active: false, color: '#ffffff' },
  ]);
  await popup.reload();
  await popup.getByRole('button', { name: 'Show profiles', exact: true }).waitFor({ timeout: 5000 });
  const whiteSwatch = await popup.evaluate(() => {
    const s = document.querySelector('[aria-label^="Select profile"] span[aria-hidden]');
    if (!s) return null;
    const parse = (c) => (c.match(/[\d.]+/g) ?? []).map(Number);
    // 투명 배경은 뒤를 그대로 비추므로 계속 올라간다 — 처음 만나는 불투명 면이 실제 뒤 면이다.
    const opaqueBehind = (el) => {
      for (let n = el.parentElement; n; n = n.parentElement) {
        const [r, g, b, a = 1] = parse(getComputedStyle(n).backgroundColor);
        if (a > 0) return [r, g, b];
      }
      return parse(getComputedStyle(document.body).backgroundColor).slice(0, 3);
    };
    const lum = ([r, g, b]) => {
      const f = (v) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const cs = getComputedStyle(s);
    const behind = opaqueBehind(s);
    const [hi, lo] = [lum(parse(cs.backgroundColor).slice(0, 3)), lum(behind)].sort((a, b) => b - a);
    return {
      fill: cs.backgroundColor,
      behind: `rgb(${behind.join(', ')})`,
      ratio: Number(((hi + 0.05) / (lo + 0.05)).toFixed(2)),
    };
  });
  record('N41c: 비활성 스와치 — 사용자 색(흰색)과 무관한 중립 채움이 뒤 면에 3:1 (비텍스트)',
    !!whiteSwatch && whiteSwatch.fill !== 'rgb(255, 255, 255)' &&
      whiteSwatch.fill !== 'rgba(0, 0, 0, 0)' && whiteSwatch.ratio >= 3,
    `swatch=${JSON.stringify(whiteSwatch)}`);

  /*
   * N41d: 팝업 프로필 열의 하한 (fix R-5) — 총폭 760은 고정이라(ADR 0005) 레일이 넓어진
   * 만큼을 프로필 열에서 빼기 쉽다. 열은 레일 라벨화 이전 폭(14rem = 224px) 아래로
   * 내려가지 않는다. N41의 `cols[0] < cols[1]`·`탭 > 팝업`은 열이 줄어든 것을 보지 못한다.
   */
  record('N41d: 팝업 프로필 열 ≥ 224px (레일 라벨화 이전 폭 유지)',
    popupShell.cols[1] >= 224,
    `popup cols=${JSON.stringify(popupShell.cols)}`);

  /*
   * N41g: 프로필 열은 **프로필 화면에서만** 선다 (ADR 0017이 ADR 0005를 개정).
   *
   * DOM에서만 참인 것이라 여기서 본다: 백업·설정으로 옮기면 그리드 칸이 셋에서 둘로 줄고
   * 본문이 그 폭을 가져간다. 열 폭만 보면 "숨겼는데 자리는 남은" 상태를 못 잡으므로 칸 수와
   * 본문 폭을 함께 단언한다. 헤더 제목도 화면을 따라 바뀌는지 같이 확인한다 — 제목이 지금
   * 무엇을 보는지 말하지 않으면 열이 사라진 화면에서 방향을 잃는다.
   */
  const shellAt = async (railButton) => {
    await popup.getByRole('button', { name: railButton, exact: true }).click();
    await popup.waitForTimeout(150);
    return popup.evaluate(shellProbe);
  };
  const profilesShell = await shellAt('Show profiles');
  const backupsShell = await shellAt('Show backups');
  const settingsShell = await shellAt('Show settings');
  await popup.getByRole('button', { name: 'Show profiles', exact: true }).click();
  await popup.waitForTimeout(150);

  const columnHidden =
    profilesShell.cols.length === 3 &&
    backupsShell.cols.length === 2 &&
    settingsShell.cols.length === 2 &&
    // 열이 접힌 상태에서도 셸이 넘치지 않는다 — 팝업은 760×580 고정이라 넘치면 잘린다.
    profilesShell.overflow === 0 && backupsShell.overflow === 0 && settingsShell.overflow === 0 &&
    // 본문이 그 폭을 실제로 가져갔다 — 숨기기만 하고 자리를 남기면 여기서 걸린다.
    backupsShell.cols[1] > profilesShell.cols[2] &&
    settingsShell.cols[1] > profilesShell.cols[2] &&
    // 레일은 어느 화면에서도 같은 폭이다.
    backupsShell.cols[0] === profilesShell.cols[0];

  record('N41g: 프로필 열은 프로필 화면에서만 — 백업·설정에서는 본문이 그 폭을 가져간다',
    columnHidden,
    `profiles cols=${JSON.stringify(profilesShell.cols)}, ` +
      `backups cols=${JSON.stringify(backupsShell.cols)}, ` +
      `settings cols=${JSON.stringify(settingsShell.cols)}, ` +
    `overflow=${profilesShell.overflow}/${backupsShell.overflow}/${settingsShell.overflow}`);

  /*
   * N41e: 프로필 행의 규칙 수·전역 정지 (티켓 13, 스펙 story 22·25·38).
   *
   * N41은 행이 스와치와 인라인 토글을 갖는지까지만 본다 — 행이 **무엇을 말하는지**는 보지
   * 않는다. 여기서 셋을 함께 본다: (a) 행이 그 프로필의 **켜진** 규칙 수를 보이고(꺼진
   * 규칙은 세지 않는다), (b) 헤더 일시정지를 누르면 같은 행이 색이 아니라 **아이콘(형태) +
   * 접근성 이름**으로 정지를 말하며, (c) 그 정지가 **표시만** 바꾼다 — 정지 중에도 인라인
   * 토글이 먹고, 재개하면 방금 고른 상태가 그대로 다시 보인다.
   *
   * (c)가 빠지면 "정지 = 전부 끔"으로 구현해도 통과한다 — 재개했을 때 사용자가 켜 둔
   * 프로필이 꺼져 돌아오는 손실이 스위트 밖으로 빠져나간다.
   */
  await seedProfiles([
    baseProfile('pc-a', 'CountA', [
      hdr({ id: 'c1', name: 'X-C1', value: '1' }),
      hdr({ id: 'c2', name: 'X-C2', value: '2' }),
      { ...hdr({ id: 'c3', name: 'X-C3', value: '3' }), enabled: false },
    ]),
    { ...baseProfile('pc-b', 'CountB', []), active: false },
  ]);
  await popup.reload();
  await popup.getByRole('button', { name: 'Show profiles', exact: true }).waitFor({ timeout: 5000 });
  /*
   * 행 메타는 이름 칩 **안**의 마지막 `aria-hidden` 요소다 (티켓 04) — 첫 번째는 색 스와치다.
   * 밖에 붙이면 열이 넓어진다(티켓 10 R-5).
   */
  const profileRows = () => popup.evaluate(() =>
    [...document.querySelectorAll('[aria-label^="Select profile"]')].map((r) => {
      const spans = [...r.querySelectorAll('span[aria-hidden]')];
      const swatch = spans[0];
      const meta = spans.at(-1);
      /*
       * **메타가 이름 아래 줄에 선다** — 이름의 아래변보다 메타의 윗변이 아래다. 한 줄로
       * 되돌리면 가장 긴 문구(`12 rules · not applied`)가 264px 열에서 이름을 예닐곱 자로
       * 눌러 버리고, 목록에서 프로필을 짚는 단서가 바로 그 이름이다 (티켓 04).
       */
      const name = swatch?.nextElementSibling;
      const belowName =
        name && meta ? meta.getBoundingClientRect().top >= name.getBoundingClientRect().bottom : null;
      return {
        aria: r.getAttribute('aria-label'),
        mark: meta?.textContent?.trim() ?? '',
        glyph: !!meta?.querySelector('svg'),
        nameShown: name ? Math.round(name.getBoundingClientRect().width) : 0,
        belowName,
      };
    }));
  const rowsRunning = await pollUntil(profileRows, (rows) => rows.length === 2, 5000, 100);

  await popup.getByRole('button', { name: 'Pause' }).click();
  const rowsPaused = await pollUntil(
    profileRows,
    (rows) => rows.length === 2 && rows.every((r) => r.aria?.endsWith('(paused)')),
    5000,
    100,
  );
  // 정지 중에도 목록에서 바로 켠다 — 정지는 저장된 active를 건드리지 않으므로 지금도 고른다.
  await popup.getByRole('switch', { name: 'Toggle CountB' }).click();
  const activeWhilePaused = await pollUntil(
    () => sw.evaluate(async () => {
      const { state } = await chrome.storage.local.get('state');
      return state.profiles.find((p) => p.id === 'pc-b')?.active;
    }),
    (v) => v === true,
  );
  const rowsStillPaused = await pollUntil(
    profileRows,
    (rows) => rows.length === 2 && rows.every((r) => r.aria?.endsWith('(paused)')),
    3000,
    100,
  );

  await popup.getByRole('button', { name: 'Resume' }).click();
  const rowsResumed = await pollUntil(
    profileRows,
    (rows) => rows.length === 2 && rows.every((r) => !r.aria?.endsWith('(paused)')),
    5000,
    100,
  );
  record('N41e: 프로필 행 — `N개 규칙 · 적용` + 정지 표시(형태·낱말·접근성 이름), 정지는 표시만',
    rowsRunning[0]?.aria === 'Select profile CountA (applied)' && rowsRunning[0]?.mark === '2 rules · applied' &&
      rowsRunning[1]?.aria === 'Select profile CountB (not applied)' && rowsRunning[1]?.mark === '0 rules · not applied' &&
      rowsPaused.every((r) => r.glyph) &&
      rowsPaused[0]?.mark === '2 rules · paused' && rowsPaused[1]?.mark === '0 rules · paused' &&
      activeWhilePaused === true && rowsStillPaused.every((r) => r.aria?.endsWith('(paused)')) &&
      rowsResumed[0]?.aria === 'Select profile CountA (applied)' && rowsResumed[0]?.mark === '2 rules · applied' &&
      rowsResumed[1]?.aria === 'Select profile CountB (applied)' && rowsResumed[1]?.mark === '0 rules · applied' &&
      rowsRunning.every((r) => r.belowName === true && r.nameShown > 0),
    `실행=${JSON.stringify(rowsRunning)}, 정지=${JSON.stringify(rowsPaused)}, ` +
      `정지 중 토글 active=${activeWhilePaused} (여전히 정지=${rowsStillPaused.every((r) => r.aria?.endsWith('(paused)'))}), ` +
      `재개=${JSON.stringify(rowsResumed)}`);

  /*
   * N41f: 정지의 **보이는 텍스트** 채널 (fix R-4, 티켓 13 AC2).
   *
   * N41e는 정지를 **형태**(svg 글리프)와 **접근성 이름**으로만 본다 — 둘 다 통과하면서도
   * 화면에 정지라고 적힌 낱말은 하나도 없는 구현이 그 단언을 빠져나간다. 9px 글리프의 뜻은
   * 그 관용을 아는 사람에게만 읽히고, 접근성 이름은 스크린리더 밖에서 **결코 보이지 않는다**.
   * 여기서 보이는 낱말을 따로 본다.
   *
   * 렌더된 크기까지 재는 이유: 낱말을 sr-only로 숨겨도 `textContent`만 보는 단언은 통과한다.
   *
   * **0보다 크다로는 부족하다** (code-review). Tailwind `sr-only`는 1×1로 렌더되므로 그
   * 문턱을 그냥 넘는다. 10px 줄 상자는 실측 13px이라, 사람이 읽을 수 있는 크기를 요구한다.
   * 오버플로 0을 같이 보는 것은 이 낱말이 행을 넓히지 않는다는 AC6 쪽 경계다.
   */
  /*
   * 낱말은 이제 행 메타 **문장 안**에 있다 (티켓 04) — `2 rules · paused`. 따로 서 있던
   * 낱말 하나를 찾던 예전 프로브는 그것을 못 보므로, 메타로 끝나는 span을 찾아 잰다.
   * 채널의 성질은 그대로다: 화면에 정지라고 **적혀** 있어야 하고, 크기가 0이면 안 된다.
   */
  const pausedWord = () => popup.evaluate(() => ({
    /*
     * 낱말을 든 **메타 자신**을 잰다 — 마지막 `aria-hidden` span이다 (code-review).
     * `textContent`로 넓게 찾으면 이름까지 감싼 바깥 상자가 먼저 걸려, 낱말을 sr-only로
     * 숨겨도 이름 줄의 높이 때문에 w·h가 0이 아니게 나온다 — 가드가 헛돈다.
     */
    rows: [...document.querySelectorAll('[aria-label^="Select profile"]')].map((r) => {
      const el = [...r.querySelectorAll('span[aria-hidden]')].at(-1);
      if (!el || !(el.textContent?.trim() ?? '').endsWith('· paused')) return null;
      const box = el.getBoundingClientRect();
      return { w: Math.round(box.width), h: Math.round(box.height) };
    }),
    // 색 채널 — 메타의 글자 세기가 정지에서 바뀐다. 형태·문자와 함께 셋째 채널이다.
    metaColors: [...document.querySelectorAll('[aria-label^="Select profile"]')].map((r) => {
      const meta = [...r.querySelectorAll('span[aria-hidden]')].at(-1);
      return meta ? getComputedStyle(meta).color : null;
    }),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  const wordRunning = await pausedWord();
  await popup.getByRole('button', { name: 'Pause' }).click();
  // 읽을 수 있는 크기 — sr-only(1×1)도 display:none(0×0)도 이 문턱을 넘지 못한다.
  const readable = (p) => !!p && p.w >= 20 && p.h >= 8;
  const wordPaused = await pollUntil(
    pausedWord,
    (v) => v.rows.length === 2 && v.rows.every(readable),
    5000,
    100,
  );
  await popup.getByRole('button', { name: 'Resume' }).click();
  const wordResumed = await pollUntil(
    pausedWord,
    (v) => v.rows.length === 2 && v.rows.every((p) => p === null),
    5000,
    100,
  );
  /*
   * 색 채널은 **정지 쪽이 더 진하다** (code-review). 메타는 평상시 보조 텍스트라 이미 muted라,
   * 정지를 더 흐리게 하려면 muted 아래로 내려가 10px 글자가 본문 4.5:1을 깬다 — 위로 올리면
   * 채널이 살면서 대비도 함께 오른다. 여기서는 "두 상태의 색이 실제로 다르다"만 잰다.
   */
  const colorChanged =
    wordRunning.metaColors.length === 2 &&
    wordRunning.metaColors.every((c, i) => c !== null && c !== wordPaused.metaColors[i]);
  record('N41f: 정지 — 보이는 낱말이 행에 서고 글자 세기도 바뀐다(형태·문자·색), 재개하면 사라진다',
    wordRunning.rows.length === 2 && wordRunning.rows.every((p) => p === null) &&
      wordPaused.rows.length === 2 && wordPaused.rows.every(readable) &&
      wordPaused.overflow === 0 && colorChanged &&
      wordResumed.rows.length === 2 && wordResumed.rows.every((p) => p === null),
    `실행=${JSON.stringify(wordRunning)}, 정지=${JSON.stringify(wordPaused)}, ` +
      `색 바뀜=${colorChanged}, 재개=${JSON.stringify(wordResumed)}`);

  /*
   * N41b: 아코디언 편집 (ADR 0017, 스펙 story 1–6) — **행이 사라지지 않는다.**
   *
   * 예전 계약에서는 편집 중인 규칙의 행이 폼으로 **교체**됐고, 이 자리는 "폼이 남은 행보다
   * 위에 있다"로 맨 위 정렬만 쟀다. 그 계약이 티켓 05가 고치려던 결함이다 — 무엇을 고치는
   * 중인지가 화면에서 없어졌다. 이제 행은 그대로 있고 그 **아래로** 폼이 펼쳐지므로,
   * 편집 중 화면은 `편집 중인 행 → 폼 → 나머지 행` 세 층이어야 한다. 그 세로 순서가 이
   * 시나리오의 본체이고, 행이 남아 있다는 것과 맨 위로 올라왔다는 것을 한 번에 잰다.
   */
  await seedProfiles([
    baseProfile('acc-1', 'Accordion', [
      hdr({ id: 'a1', name: 'X-First', value: '1' }),
      hdr({ id: 'a2', name: 'X-Second', value: '2' }),
    ]),
  ]);
  await popup.reload();
  const ruleRows = popup.locator('.group').filter({ has: popup.getByRole('button', { name: 'Edit', exact: true }) });
  const rowLayout = () =>
    ruleRows.evaluateAll((els) =>
      els.map((el) => ({ y: Math.round(el.getBoundingClientRect().y), text: el.textContent.trim() })),
    );
  const orderBefore = await rowLayout();

  await popup.getByRole('button', { name: 'Edit', exact: true }).nth(1).click();
  const typeField = popup.getByRole('combobox', { name: 'Type', exact: true });
  await typeField.waitFor({ timeout: 5000 });
  // 펼침이 끝나 좌표가 굳을 때까지 — 대기 시간은 ROW_TRANSITION에서 **유도한다**(위 주석).
  await popup.waitForTimeout(rowSettleMs());
  const openLayout = await rowLayout();
  const formY = await typeField.evaluate((el) => el.getBoundingClientRect().y);
  // 편집 중인 행(X-Second)이 맨 위 → 그 아래 폼 → 그 아래 나머지 행(X-First).
  const stackOk =
    openLayout.length === 2 &&
    openLayout[0].text.includes('X-Second') &&
    openLayout[1].text.includes('X-First') &&
    openLayout[0].y < formY &&
    formY < openLayout[1].y;

  // 열린 행의 수정 아이콘이 눌린 상태로 보인다 (story 4) — 어느 행이 열렸는지 아이콘만 봐도 안다.
  const editIcons = popup.getByRole('button', { name: 'Edit', exact: true });
  const pressedOpen = await editIcons.nth(0).getAttribute('aria-pressed');
  const pressedOther = await editIcons.nth(1).getAttribute('aria-pressed');

  // 펼쳐진 카드의 테두리·배경이 접힌 카드와 다르다 (story 6) — 둘 다 달라야 한다.
  const cardStyles = await popup.evaluate(() => {
    const cards = [...document.querySelectorAll('[class*="rounded-lg"][class*="border"]')].filter(
      (el) => el.querySelector('.group'),
    );
    return cards.map((el) => {
      const cs = getComputedStyle(el);
      return { border: cs.borderTopColor, bg: cs.backgroundColor };
    });
  });
  /*
   * **방향까지 잰다.** 대칭 비교(`!==` 둘)만으로는 삼항을 뒤집어 펼쳐진 카드를 민무늬로
   * 만들어도 통과한다 — story 6이 정확히 반대가 된 상태인데도. 위 `openLayout`이 이미
   * 열린 행이 맨 위임을 못박았으므로 DOM 순서상 `cardStyles[0]`이 펼쳐진 카드다.
   *
   * 방향을 재는 술어는 **배경의 채움 여부**다: 팔레트 값을 못박지 않으면서 "펼쳐진 쪽이
   * 칠해져 있고 접힌 쪽은 민무늬"라는 결정 자체를 겨눈다.
   */
  const isTransparent = (color) => /rgba\(0, 0, 0, 0\)|transparent/.test(color);
  const cardsDiffer =
    cardStyles.length === 2 &&
    cardStyles[0].border !== cardStyles[1].border &&
    cardStyles[0].bg !== cardStyles[1].bg &&
    !isTransparent(cardStyles[0].bg) &&
    isTransparent(cardStyles[1].bg);

  // 같은 버튼을 다시 누르면 접힌다 (story 5).
  await editIcons.nth(0).click();
  const toggledClosed = await pollUntil(() => typeField.count(), (n) => n === 0, 5000, 100);

  /*
   * 순서 복귀는 **저장이든 취소든** 성립해야 한다 (수용 기준). 저장 경로만 재면 취소가
   * 목록 순서를 바꿔 놓아도 통과한다 — 사용자가 기억하는 순서를 지키는 것이 이 결정의
   * 이유이고, 그 이유는 저장 여부와 무관하다. 두 경로를 각각 연다.
   */
  const orderAfterCancel = await (async () => {
    await popup.getByRole('button', { name: 'Edit', exact: true }).nth(1).click();
    await typeField.waitFor({ timeout: 5000 });
    await popup.getByRole('button', { name: 'Cancel' }).click();
    await pollUntil(() => typeField.count(), (n) => n === 0, 5000, 100);
    return pollUntil(rowLayout, (r) => r.length === 2, 5000, 100);
  })();
  const cancelRestoresOrder =
    orderAfterCancel[0]?.text.includes('X-First') && orderAfterCancel[1]?.text.includes('X-Second');

  // 다시 열어 저장 — 접히고 두 행이 원래 순서로 돌아온다 (story 3).
  await popup.getByRole('button', { name: 'Edit', exact: true }).nth(1).click();
  await typeField.waitFor({ timeout: 5000 });
  await popup.getByRole('button', { name: SAVE_BUTTON }).click();
  const collapsed = await pollUntil(() => typeField.count(), (n) => n === 0, 5000, 100);
  const orderAfter = await pollUntil(rowLayout, (r) => r.length === 2, 5000, 100);
  const sameOrder =
    orderAfter[0]?.text.includes('X-First') && orderAfter[1]?.text.includes('X-Second');

  record('N41b: 아코디언 편집 — 행이 남은 채 아래로 펼쳐지고 맨 위로 오며, 아이콘이 눌리고, 저장·취소 둘 다 순서 복귀',
    orderBefore.length === 2 && orderBefore[0]?.text.includes('X-First') &&
      stackOk && pressedOpen === 'true' && pressedOther === 'false' && cardsDiffer &&
      toggledClosed === 0 && cancelRestoresOrder && collapsed === 0 && sameOrder,
    `before=${orderBefore.length}행(첫 X-First=${orderBefore[0]?.text.includes('X-First')}), ` +
      `열림 배치=${JSON.stringify(openLayout.map((r) => ({ y: r.y, first: r.text.includes('X-First') })))} 폼 y=${Math.round(formY)} 세로순서=${stackOk}, ` +
      `눌림=[${pressedOpen},${pressedOther}], 카드 구별=${cardsDiffer}(${JSON.stringify(cardStyles)}), ` +
      `재클릭 접힘=${toggledClosed}, 취소 순서복귀=${cancelRestoresOrder}, 저장 후 폼=${collapsed}, 순서복귀=${sameOrder}`);

  /*
   * N46: 새 규칙 폼 위치 · 흐림 · 응답 쿠키 속성 칩 (ADR 0017, 티켓 05 story 7·12·15).
   *
   * 셋 다 **실제로 그려진 것**을 봐야만 잴 수 있다. 순수 테스트는 칩 목록이 맞는지까지만
   * 말하고, 그 칩이 어느 자리에 어떤 농도로 서는지는 말하지 못한다.
   */
  await seedProfiles([
    baseProfile('p-chip2', 'Chips2', [
      { kind: 'set-cookie', id: 'sc1', name: 'sid', value: 'abc', path: '/', secure: true,
        sameSite: 'lax', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
      hdr({ id: 'off1', name: 'X-Off', value: '1', enabled: false }),
    ]),
  ]);
  await popup.reload();
  const chipRows = popup.locator('.group').filter({ has: popup.getByRole('button', { name: 'Edit', exact: true }) });
  await chipRows.first().waitFor({ timeout: 5000 });

  // (a) 응답 쿠키 속성 칩 — 나가는 줄을 그대로 가른 것. 비운 Domain·Max-Age는 서지 않는다.
  const cookieChips = await chipTexts(chipRows.nth(0));
  const cookieChipsOk = cookieChips.join('|') === 'All URLs|sid=abc|Path=/|SameSite=Lax|Secure';

  /*
   * (b) 꺼진 규칙과 전역 정지의 흐림. 두 상태가 **같은 흐림**인 것이 의도다 — 사용자가
   * 알아야 하는 것이 같기 때문이다(이 규칙은 지금 안 건다). 색 값 자체가 아니라 "켜진 것과
   * 다르다"를 재므로 팔레트가 바뀌어도 이 단언은 살아남는다.
   *
   * 표본은 **안정화 폴링**으로 뜬다 (이 파일의 pollStable 주석). `transition-colors`
   * 보간값을 읽으면 "켜진 것과 다르다"는 즉시 만족되지만 뒤따르는 동일성 단언이 그
   * 중간값으로 실패한다 — 기댓값을 향해 폴링하지 않고 연속 두 번 같은 값만 기다린다.
   */
  const titleColor = (row) => () =>
    row.evaluate(
      (el) => getComputedStyle(el.querySelector('.min-w-0 > div:first-child > span:first-child')).color,
    );
  const onColor = await pollStable(titleColor(chipRows.nth(0)), 'N46 켜진 행 제목색');
  const offColor = await pollStable(titleColor(chipRows.nth(1)), 'N46 꺼진 행 제목색');
  await popup.getByRole('button', { name: 'Pause' }).click();
  const pausedColor = await pollStable(titleColor(chipRows.nth(0)), 'N46 정지 중 제목색');
  await popup.getByRole('button', { name: 'Resume' }).click();
  const resumedColor = await pollStable(titleColor(chipRows.nth(0)), 'N46 재개 후 제목색');
  const dimOk =
    offColor !== onColor && pausedColor === offColor && resumedColor === onColor;

  /*
   * (b2) 삭제 아이콘은 호버에서 붉어진다 (수용 기준) — 되돌릴 수 없어 보이는 동작임을
   * 색으로 먼저 알린다. 여기도 안정화 폴링이라 전이 중간 프레임을 표본으로 삼지 않는다.
   */
  const deleteIcon = chipRows.nth(0).getByRole('button', { name: 'Delete' });
  const deleteColor = () => deleteIcon.evaluate((el) => getComputedStyle(el).color);
  const deleteIdle = await pollStable(deleteColor, 'N46 삭제 아이콘 기본색');
  await deleteIcon.hover();
  const deleteHover = await pollStable(deleteColor, 'N46 삭제 아이콘 호버색');
  await popup.mouse.move(0, 0);
  /*
   * "붉어졌다"를 팔레트 값을 못박지 않고 잰다. 표기가 둘 다 나온다 — 기본색은 `rgb()`인데
   * 시맨틱 `--destructive`는 `oklch()`로 계산되어 나온다. 한쪽만 다루면 토큰 표기가 바뀌는
   * 것만으로 이 단언이 조용히 무너진다.
   */
  const isReddish = (color) => {
    const nums = (color.match(/-?[\d.]+/g) ?? []).map(Number);
    // oklch(L C H) — 붉은 계열은 색상각 0° 부근에 모여 있고, 채도가 0에 가까우면 회색이다.
    if (color.startsWith('oklch')) {
      const [, chroma = 0, hue = 0] = nums;
      return chroma > 0.05 && (hue < 60 || hue > 340);
    }
    const [r = 0, g = 0, b = 0] = nums;
    return r > g && r > b;
  };
  const deleteTurnsRed = deleteHover !== deleteIdle && isReddish(deleteHover);

  /*
   * (c) 새 규칙 폼이 목록 **맨 위**에 열린다 (story 7). 예전에는 목록 아래라, 규칙이 많으면
   * 방금 만들기 시작한 것을 찾아 스크롤해야 했다.
   */
  await popup.getByRole('button', { name: 'Add rule' }).first().click();
  const newTypeField = popup.getByRole('combobox', { name: 'Type', exact: true });
  await newTypeField.waitFor({ timeout: 5000 });
  await popup.waitForTimeout(rowSettleMs()); // 펼침이 끝나 좌표가 굳을 때까지 (유도값)
  const newFormY = await newTypeField.evaluate((el) => el.getBoundingClientRect().y);
  const firstRowY = await chipRows.first().evaluate((el) => el.getBoundingClientRect().y);
  const newFormOnTop = newFormY < firstRowY;
  await popup.getByRole('button', { name: 'Cancel' }).click();
  await newTypeField.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});

  record('N46: 응답 쿠키 속성 칩 · 꺼짐/정지 흐림(같은 농도) · 삭제 호버 붉음 · 새 규칙 폼은 목록 맨 위',
    cookieChipsOk && dimOk && deleteTurnsRed && newFormOnTop,
    `쿠키 칩=${JSON.stringify(cookieChips)}, 흐림 on=${onColor} off=${offColor} paused=${pausedColor} resumed=${resumedColor}, ` +
      `삭제 ${deleteIdle}→${deleteHover}=${deleteTurnsRed}, ` +
      `새 폼 y=${Math.round(newFormY)} < 첫 행 y=${Math.round(firstRowY)}=${newFormOnTop}`);

  /*
   * N47: 폼 시안 정합 — 머리글·저장 글자·응답 쿠키 속성·수렴 저장·두 열 (티켓 06).
   *
   * 다섯 다 **실제로 그려지고 저장까지 가야** 확인된다. 순수 테스트는 수렴 함수가 무엇을
   * 돌려주는지까지만 말하고, 그 결과가 폼의 어느 컨트롤에서 나와 저장소에 닿는지는 말하지
   * 못한다.
   */
  await seedProfiles([
    baseProfile('p-form', 'FormShape', [
      // 넷 중 **화면에 없는** 방식(domain)으로 저장된 규칙 — 수렴이 여기서 관측된다.
      { kind: 'request-header', id: 'f1', name: 'X-Conv', value: '1', enabled: true,
        mode: 'append', emptyMeans: 'send-empty', comment: 'Converge me',
        urlFilter: 'conv.example', urlMatchType: 'domain',
        conditions: { resourceTypes: ['sub_frame'] } },
      // 이웃 — 같은 프로필에 있지만 폼을 열지 않는다. 수렴은 저장한 규칙에만 붙어야 한다.
      { kind: 'request-header', id: 'f2', name: 'X-Untouched', value: '2', enabled: true,
        mode: 'append', emptyMeans: 'send-empty', comment: 'Leave me',
        urlFilter: 'untouched.example', urlMatchType: 'prefix',
        conditions: { resourceTypes: ['sub_frame'] } },
    ]),
  ]);
  await popup.reload();

  // (a) 새 규칙 폼의 머리글과 저장 글자 (story 19·29)
  await popup.getByRole('button', { name: 'Add rule' }).first().click();
  await popup.getByRole('combobox', { name: 'Type', exact: true }).waitFor({ timeout: 5000 });
  const newFormHeading = await popup.getByText('New rule', { exact: true }).isVisible().catch(() => false);
  const newSaveLabel = (await popup.getByRole('button', { name: 'Save', exact: true }).count()) === 1;
  // 닫기 버튼이 폼을 접는다 — 취소와 같은 일을 하는 두 번째 문이다.
  await popup.getByRole('button', { name: 'Close rule form' }).click();
  const closedByX = await popup
    .getByRole('combobox', { name: 'Type', exact: true })
    .waitFor({ state: 'detached', timeout: 5000 })
    .then(() => true, () => false);

  // (b) 편집 폼의 머리글과 저장 글자 — 같은 자리의 같은 버튼이 다른 일을 한다
  await popup.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await popup.getByRole('combobox', { name: 'Type', exact: true }).waitFor({ timeout: 5000 });
  const editFormHeading = await popup.getByText('Edit rule', { exact: true }).isVisible().catch(() => false);
  const editSaveLabel = (await popup.getByRole('button', { name: 'Save changes', exact: true }).count()) === 1;
  // 저장된 방식(domain)은 화면에 없다 — 와일드카드로 접혀 보인다 (story 21).
  const foldedMatch = await popup
    .getByRole('combobox', { name: 'URL match type', exact: true })
    .textContent();

  /*
   * (c) **수렴 저장** — 손대지 않고 저장만 해도 폼이 보여 준 값으로 굳는다 (수용 기준).
   * 매치 방식 domain → 와일드카드(contains), 리소스 sub_frame → 문서 묶음 전체.
   * 반대로 폼이 보여 주지 않은 적용 방식·빈 값의 뜻은 그대로여야 한다.
   */
  await popup.getByRole('button', { name: SAVE_BUTTON }).click();
  const converged = await pollUntil(
    () => sw.evaluate(async () => {
      const { state } = await chrome.storage.local.get('state');
      return state.profiles[0]?.modifications[0] ?? null;
    }),
    (m) => m?.urlMatchType === 'contains',
  );
  const convergeOk =
    converged.urlMatchType === 'contains' &&
    converged.conditions?.resourceTypes?.join() === 'main_frame,sub_frame' &&
    converged.mode === 'append' &&
    converged.emptyMeans === 'send-empty';
  /*
   * **손대지 않은 규칙은 바뀌지 않는다** (수용 기준). 같은 프로필의 이웃은 폼을 지나지
   * 않았으므로 `prefix`도 `sub_frame`도 그대로여야 한다 — 넓히는 변경이 사용자가 스스로
   * 저장한 규칙에만 붙는다는 것이 수렴의 조건이다.
   */
  const untouched = await sw.evaluate(async () => {
    const { state } = await chrome.storage.local.get('state');
    const m = state.profiles[0].modifications.find((x) => x.name === 'X-Untouched');
    return { match: m?.urlMatchType, types: m?.conditions?.resourceTypes?.join() };
  });
  const untouchedIntact = untouched.match === 'prefix' && untouched.types === 'sub_frame';
  await waitFormClosed();

  /*
   * (d) 응답 쿠키 속성 — 세 입력과 세 칩 그룹이 서고, 고른 값이 저장된다 (story 32~34).
   * 비운 Domain·Max-Age는 조립에 붙지 않으므로 저장에도 남지 않는다 (story 35).
   */
  await popup.getByRole('button', { name: 'Add rule' }).first().click();
  await pickOption(popup, 'Type', 'Response cookie');
  await popup.getByLabel('Cookie name', { exact: true }).fill('sid');
  await popup.getByLabel('Cookie value', { exact: true }).fill('abc');
  await popup.getByLabel('Path', { exact: true }).fill('/app');
  await popup.getByRole('button', { name: 'Lax', exact: true }).click();
  /*
   * Secure·HttpOnly는 **스위치**다 — 끔/켬 두 칩이었던 것을 하나로 접었다. 값이 둘뿐인
   * 속성에 고를 것을 둘 세우면, 같은 화면의 다른 on/off(프로필·규칙·저장 후 활성화)와
   * 문법이 갈린다. 여기서 재는 계약은 그대로다: 켠 값이 저장에 실리는가.
   */
  await popup.getByRole('switch', { name: 'Secure', exact: true }).click();
  /*
   * HttpOnly는 **켰다 끈다** — 끔이 기본이라 그냥 두면 "컨트롤이 통째로 없어도 통과"가 된다.
   * 켠 값이 저장에 실리는지와, 다시 끄면 필드가 **부재로 돌아가는지**를 함께 본다: 비운 속성이
   * 조립에 붙지 않는다는 계약(story 35)은 `false`로 남는 것과 다르다.
   */
  const httpOnlySwitch = popup.getByRole('switch', { name: 'HttpOnly', exact: true });
  await httpOnlySwitch.click();
  const httpOnlyOnPressed = (await httpOnlySwitch.getAttribute('aria-checked')) === 'true';
  await httpOnlySwitch.click();
  // SameSite도 같은 왕복 — 'Not set'을 고르면 필드가 지워져야 한다(None을 고른 것과 다르다).
  const sameSiteGroup = popup.getByRole('group', { name: 'SameSite' });
  await sameSiteGroup.getByRole('button', { name: 'Strict', exact: true }).click();
  await sameSiteGroup.getByRole('button', { name: 'Lax', exact: true }).click();
  await popup.getByRole('button', { name: SAVE_BUTTON }).click();
  const cookieSaved = await pollUntil(
    () => sw.evaluate(async () => {
      const { state } = await chrome.storage.local.get('state');
      return state.profiles[0]?.modifications.find((m) => m.kind === 'set-cookie') ?? null;
    }),
    (m) => m?.name === 'sid',
  );
  const cookieOk =
    cookieSaved.value === 'abc' && cookieSaved.path === '/app' &&
    cookieSaved.sameSite === 'lax' && cookieSaved.secure === true &&
    // 끔으로 되돌린 HttpOnly와 비운 Domain·Max-Age는 **부재**다 — false로 남지 않는다.
    httpOnlyOnPressed && cookieSaved.httpOnly === undefined &&
    cookieSaved.domain === undefined && cookieSaved.maxAge === undefined;
  await waitFormClosed();

  /*
   * (d2) 'Not set'은 **필드를 지운다** — None을 고른 것과 다른 쿠키가 나간다. 저장된 값이
   * 있는 규칙을 다시 열어 그 칩을 고르고, 부재로 돌아가는지 본다.
   */
  /*
   * **그 규칙의 행을 짚는다** — `.first()`는 목록의 첫 규칙이지 방금 만든 응답 쿠키가 아니다
   * (같은 프로필에 헤더 규칙 둘이 먼저 있다). 잘못 짚으면 SameSite 칩이 없는 폼이 열린다.
   */
  const cookieRow = popup
    .locator('.group')
    .filter({ has: popup.getByRole('button', { name: 'Edit', exact: true }) })
    .filter({ hasText: 'sid=abc' })
    .first();
  await cookieRow.getByRole('button', { name: 'Edit', exact: true }).click();
  await popup.getByRole('group', { name: 'SameSite' })
    .getByRole('button', { name: 'Not set', exact: true }).click();
  await popup.getByRole('button', { name: SAVE_BUTTON }).click();
  const sameSiteCleared = await pollUntil(
    () => sw.evaluate(async () => {
      const { state } = await chrome.storage.local.get('state');
      const m = state.profiles[0]?.modifications.find((x) => x.kind === 'set-cookie');
      return m ? { has: 'sameSite' in m, name: m.name } : null;
    }),
    (s) => s?.has === false,
  );
  await waitFormClosed();

  /*
   * (e) 팝업은 한 열, 탭은 두 열 (story 30). 컨테이너 폭이 정하므로 표면을 묻지 않는다 —
   * 첫 줄(이름·종류)의 두 칸이 같은 y에 서는지가 두 열의 실질이다.
   */
  /**
   * 같은 줄에 놓일 칸들이 **몇 개의 서로 다른 y**에 서는가 — 1이면 나란히, N이면 쌓였다.
   *
   * "열 수"라고 부르지 않는 이유는 그것이 아니기 때문이다. 세는 것은 **줄 수**이고, 두 열
   * 배치는 줄이 하나라는 뜻이다. 칸은 라벨로 짚는다 — 그리드 부모를 DOM에서 거슬러 올라가
   * 찾으면 배치 방식을 바꾸는 것만으로 조용히 빗나간다.
   */
  const distinctTops = async (cells) => {
    const tops = [];
    for (const cell of cells) {
      const box = await cell.boundingBox();
      if (!box) return null;
      tops.push(Math.round(box.y));
    }
    return new Set(tops).size;
  };
  const openFormAndMeasure = async (page) => {
    await page.getByRole('button', { name: 'Add rule' }).first().click();
    await page.getByRole('combobox', { name: 'Type', exact: true }).waitFor({ timeout: 5000 });
    // 응답 쿠키 속성 세 칸도 같은 규칙을 따른다 (story 30) — 그 칸들은 이 종류에서만 선다.
    await pickOption(page, 'Type', 'Response cookie');
    await page.getByLabel('Domain', { exact: true }).waitFor({ timeout: 5000 });
    await page.waitForTimeout(rowSettleMs());
    return {
      firstRow: await distinctTops([
        page.getByLabel('Name', { exact: true }),
        page.getByRole('combobox', { name: 'Type', exact: true }),
      ]),
      cookieAttrs: await distinctTops([
        page.getByLabel('Domain', { exact: true }),
        page.getByLabel('Path', { exact: true }),
        page.getByLabel('Max-Age', { exact: true }),
      ]),
    };
  };
  const popupLines = await openFormAndMeasure(popup);
  await popup.getByRole('button', { name: 'Cancel' }).click();
  const tabForm = await context.newPage();
  await tabForm.setViewportSize({ width: 1100, height: 700 });
  await tabForm.goto(`chrome-extension://${extensionId}/app.html?locale=en`);
  const tabLines = await openFormAndMeasure(tabForm);
  await tabForm.close();

  record('N47: 폼 — 머리글·저장 글자(새/편집)·닫기, 수렴 저장(손대지 않은 규칙은 불변), 응답 쿠키 속성, 팝업 1열·탭 2열',
    newFormHeading && newSaveLabel && closedByX && editFormHeading && editSaveLabel &&
      /Wildcard/.test(foldedMatch ?? '') && convergeOk && untouchedIntact && cookieOk &&
      sameSiteCleared?.has === false &&
      popupLines.firstRow === 2 && popupLines.cookieAttrs === 3 &&
      tabLines.firstRow === 1 && tabLines.cookieAttrs === 1,
    `새 폼=[${newFormHeading},${newSaveLabel}] X닫기=${closedByX}, 편집=[${editFormHeading},${editSaveLabel}] 접힌 방식="${(foldedMatch ?? '').trim()}", ` +
      `수렴=${convergeOk}(${converged.urlMatchType}/${JSON.stringify(converged.conditions?.resourceTypes)}/${converged.mode}/${converged.emptyMeans}), ` +
      `이웃 불변=${untouchedIntact}(${JSON.stringify(untouched)}), ` +
      `쿠키=${cookieOk}(${JSON.stringify({ v: cookieSaved.value, p: cookieSaved.path, s: cookieSaved.sameSite, sec: cookieSaved.secure, ho: cookieSaved.httpOnly, d: cookieSaved.domain })}), ` +
      `SameSite 안정함=${sameSiteCleared?.has === false}, ` +
      `줄 수 팝업=[${popupLines.firstRow},${popupLines.cookieAttrs}] 탭=[${tabLines.firstRow},${tabLines.cookieAttrs}]`);

  /*
   * N48: **못 쓰는 패턴이면 저장 버튼이 죽고 그 사유가 함께 보인다** (티켓 07).
   *
   * 이 티켓이 존재하는 이유가 여기 있다: 브라우저가 만들지 못하는 패턴으로 Block이 저장되면
   * 목록에는 정상으로 보이고 토글도 켜져 있는데 실제로는 **아무것도 막히지 않는다** — 차단이
   * 걸렸다고 믿는 채로 광고·추적이 그대로 지나간다. 그래서 누른 뒤 알리는 것으로는 늦다.
   *
   * 부재 단언(다른 종류는 안 걸린다)에는 감도 대조를 건다 — 같은 패턴이 Block에서는 실제로
   * 막히는 것을 먼저 보여야, 그 단언이 "검증이 통째로 죽어도 통과"로 퇴화하지 않는다.
   */
  await seedProfiles([baseProfile('p-block', 'BlockGate', [])]);
  await popup.reload();
  await popup.getByRole('button', { name: 'Add rule' }).first().click();
  await popup.getByRole('combobox', { name: 'Type', exact: true }).waitFor({ timeout: 5000 });
  await pickOption(popup, 'Type', 'Block request');
  await pickOption(popup, 'URL match type', 'Regex');

  const saveButton = popup.getByRole('button', { name: SAVE_BUTTON });
  const reasonShown = () =>
    popup.getByText('The browser cannot build a rule from this pattern.').isVisible().catch(() => false);

  // RE2가 받지 않는 역참조 — 브라우저가 이 패턴으로 규칙을 만들지 못한다.
  await popup.getByLabel('URL filter').fill('^https://(ads)\\.example\\.com/\\1');
  const blockedDisabled = await pollUntil(
    () => saveButton.isDisabled(),
    (disabled) => disabled === true,
    5000,
    100,
  );
  const blockedReason = await reasonShown();

  /*
   * 고치면 **되살아난다.** 죽은 채로 남으면 사용자는 고쳐 놓고도 저장하지 못하고, 이 단언이
   * 없으면 "버튼을 늘 죽여 두기"라는 가짜 구현도 통과한다.
   */
  await popup.getByLabel('URL filter').fill('^https://ads\\.example\\.com/');
  const revived = await pollUntil(
    () => saveButton.isDisabled(),
    (disabled) => disabled === false,
    5000,
    100,
  );
  const reasonGone = !(await reasonShown());

  await popup.getByLabel('URL filter').fill('^https://(ads)\\.example\\.com/\\1');
  const blockedAgain = await pollUntil(
    () => saveButton.isDisabled(),
    (disabled) => disabled === true,
    5000,
    100,
  );

  /*
   * **키보드 저장도 같은 판정에서 막힌다.** `disabled`는 포인터 경로만 막으므로, Cmd/Ctrl+Enter가
   * `save()`를 직접 부르는 길이 열려 있으면 헛도는 규칙이 그대로 저장소에 들어간다.
   */
  const blockCountBefore = await blockRuleCount();
  await popup.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
  await popup.waitForTimeout(rowSettleMs());
  const keyboardBlocked = (await blockRuleCount()) === blockCountBefore;

  /*
   * 사유는 **하나뿐이고 지금 참인 쪽**이다. 빈 스코프로 저장을 눌러 `required`를 남긴 뒤
   * 못 쓰는 패턴을 치면 그쪽 문구가 서고, 고치면 둘 다 사라져야 한다 — 저장이 남긴 문구가
   * 폴백으로 살아남으면 버튼은 눌리는데 "이 패턴은 못 쓴다"가 그대로 서 있는 화면이 된다.
   */
  const requiredShown = () => popup.getByText('Required.').isVisible().catch(() => false);
  await popup.getByLabel('URL filter').fill('');
  await saveButton.click(); // 빈 스코프 = required — 저장 시도가 그 문구를 남긴다
  const requiredAfterSave = await pollUntil(requiredShown, (v) => v === true, 5000, 100);
  await popup.getByLabel('URL filter').fill('^https://(ads)\\.example\\.com/\\1');
  const liveWins = (await reasonShown()) && !(await requiredShown());
  await popup.getByLabel('URL filter').fill('^https://ads\\.example\\.com/');
  await pollUntil(() => saveButton.isDisabled(), (d) => d === false, 5000, 100);
  const bothGone = !(await reasonShown()) && !(await requiredShown());

  /*
   * **같은 패턴을 다른 종류에 넣으면 걸리지 않는다** (수용 기준). 종류를 바꾸면 초안이 새로
   * 나면서 스코프가 통째로 비므로, 다시 채워야 "같은 패턴"이 성립한다 — 안 채우면 빈 스코프가
   * 버튼을 살려 두는 것을 보고 "다른 종류는 안 걸린다"고 잘못 읽게 된다.
   */
  await popup.getByLabel('URL filter').fill('^https://(ads)\\.example\\.com/\\1');
  await pollUntil(() => saveButton.isDisabled(), (d) => d === true, 5000, 100);
  await pickOption(popup, 'Type', 'Request header');
  await popup.getByLabel('Header name', { exact: true }).fill('X-Not-Blocked');
  await closeSuggestions(popup);
  await popup.getByLabel('URL filter').fill('^https://(ads)\\.example\\.com/\\1');
  const otherKindEnabled = !(await pollUntil(
    () => saveButton.isDisabled(),
    (disabled) => disabled === false,
    5000,
    100,
  ));

  /*
   * 고친 정규식 Block이 **실제로 저장소까지 간다.** 이 왕복은 예전에 N18l만 밟고 있었고
   * (확인 후 저장), 그 시나리오가 사라지면서 스모크에 Block+정규식 저장이 하나도 남지 않았다.
   */
  await pickOption(popup, 'Type', 'Block request');
  // 종류를 바꾸면 초안이 새로 나므로 매치 방식도 초기값(와일드카드)이다 — 다시 고른다.
  await pickOption(popup, 'URL match type', 'Regex');
  await popup.getByLabel('URL filter').fill('^https://ads\\.example\\.com/');
  await popup.getByRole('button', { name: SAVE_BUTTON }).click();
  const regexBlockSaved = await pollUntil(
    () => sw.evaluate(async () => {
      const { state } = await chrome.storage.local.get('state');
      const m = state.profiles[0]?.modifications.find((x) => x.kind === 'block');
      return m ? { filter: m.urlFilter, match: m.urlMatchType } : null;
    }),
    (m) => m?.match === 'regex',
  );
  await waitFormClosed();

  record('N48: 못 쓰는 패턴 — 버튼·키보드 둘 다 막히고 사유가 하나뿐이며, 고치면 저장되고 다른 종류는 안 걸린다',
    blockedDisabled === true && blockedReason && revived === false && reasonGone &&
      blockedAgain === true && keyboardBlocked &&
      requiredAfterSave === true && liveWins && bothGone &&
      otherKindEnabled &&
      regexBlockSaved?.filter === '^https://ads\\.example\\.com/' &&
      regexBlockSaved?.match === 'regex',
    `막힘=${blockedDisabled}(사유=${blockedReason}), 고치면 되살아남=${revived === false}(사유 사라짐=${reasonGone}), ` +
      `다시 막힘=${blockedAgain}, 키보드 저장 막힘=${keyboardBlocked}, ` +
      `사유 하나=[필수=${requiredAfterSave}, 라이브 우선=${liveWins}, 고치면 둘 다 사라짐=${bothGone}], ` +
      `다른 종류 버튼 살아있음=${otherKindEnabled}, 정규식 Block 저장=${JSON.stringify(regexBlockSaved)}`);

  /*
   * N49: 쿠키 이름·User-Agent 제안 (티켓 08).
   *
   * 헤더 이름 제안(L2 계열)은 그대로 살아 있고, 여기서 재는 것은 **새로 붙은 둘**이다.
   * 특히 UA는 나머지와 갈린다: 사람이 아는 이름으로 찾고 들어가는 것은 전체 문자열이라,
   * "고른 것과 들어간 것이 다르다"를 실제로 봐야 확인된다.
   *
   * 사용 이력은 **저장이 자동으로 남긴다** — 헤더 이름처럼 등록하는 화면이 없다. 그래서
   * 저장 → 새 폼 → 제안에 뜬다는 왕복 전체를 밟아야 그 계약이 확인된다.
   */
  await seedProfiles([baseProfile('p-sugg', 'Suggest', [])]);
  await popup.reload();

  // (a) 쿠키 이름 — 프리셋 사전에서 제안된다
  await popup.getByRole('button', { name: 'Add rule' }).first().click();
  await popup.getByRole('combobox', { name: 'Type', exact: true }).waitFor({ timeout: 5000 });
  await pickOption(popup, 'Type', 'Request cookie');
  const cookieNameInput = popup.getByLabel('Cookie name', { exact: true });
  await cookieNameInput.fill('sess');
  const cookiePresetOption = popup.getByRole('option', { name: 'session_id', exact: true });
  const cookiePresetShown = await cookiePresetOption
    .waitFor({ timeout: 5000 })
    .then(() => true, () => false);
  await cookiePresetOption.click();
  const cookiePicked = await cookieNameInput.inputValue();

  // 직접 친 이름으로 바꿔 저장한다 — 이력에 남는지는 아래 (c)가 본다.
  await cookieNameInput.fill('my_smoke_cookie');
  await closeSuggestions(popup);
  await popup.getByLabel('Cookie value', { exact: true }).fill('1');
  await popup.getByRole('button', { name: SAVE_BUTTON }).click();
  await waitFormClosed();

  /*
   * (b) User-Agent — **라벨로 찾고 값이 들어간다.**
   *
   * 쿼리를 `macOS`로 잡은 것이 요점이다. `iPhone`으로는 이 계약을 못 잰다 — 그 말이 UA 값
   * 문자열에도 들어 있어 필터를 값 기준으로 바꿔도 같은 항목이 뜬다(단위에서 실측 확인).
   * `macOS`는 값에 `Mac OS X`·`Macintosh`로만 나타나므로 라벨을 보지 않으면 하나도 안 걸린다.
   */
  await popup.getByRole('button', { name: 'Add rule' }).first().click();
  await pickOption(popup, 'Type', 'User-Agent');
  const uaInput = popup.getByLabel('User-Agent', { exact: true });
  await uaInput.fill('macOS');
  const uaOption = popup.getByRole('option', { name: 'Safari (macOS)', exact: true });
  const uaLabelShown = await uaOption.waitFor({ timeout: 5000 }).then(() => true, () => false);
  await uaOption.click();
  const uaValue = await uaInput.inputValue();
  const uaInsertedFullString = uaValue.startsWith('Mozilla/5.0 (Macintosh');

  // 직접 친 UA로 바꿔 저장 — 이것도 다음에 제안돼야 한다.
  await uaInput.fill('SmokeBot/9.9');
  await closeSuggestions(popup);
  await popup.getByRole('button', { name: SAVE_BUTTON }).click();
  await waitFormClosed();

  /*
   * (c) **직접 친 값이 다음에도 제안된다** (수용 기준). 저장이 남긴 이력이 새 폼의 제안에
   * 뜨는지 — 저장소까지 갔는지도 함께 본다.
   */
  const history = await sw.evaluate(async () => {
    const { state } = await chrome.storage.local.get('state');
    return { cookies: state.customCookieNames, agents: state.customUserAgents };
  });
  await popup.getByRole('button', { name: 'Add rule' }).first().click();
  await pickOption(popup, 'Type', 'Request cookie');
  await popup.getByLabel('Cookie name', { exact: true }).fill('my_smoke');
  const rememberedCookie = await popup
    .getByRole('option', { name: 'my_smoke_cookie', exact: true })
    .waitFor({ timeout: 5000 })
    .then(() => true, () => false);
  await closeSuggestions(popup);
  await pickOption(popup, 'Type', 'User-Agent');
  await popup.getByLabel('User-Agent', { exact: true }).fill('SmokeBot');
  const rememberedUa = await popup
    .getByRole('option', { name: 'SmokeBot/9.9', exact: true })
    .waitFor({ timeout: 5000 })
    .then(() => true, () => false);
  await closeSuggestions(popup);
  await popup.getByRole('button', { name: 'Cancel' }).click();
  await waitFormClosed();

  record('N49: 쿠키 이름·UA 제안 — 프리셋에서 고르고, UA는 라벨로 찾아 값이 들어가며, 직접 친 값이 다음에도 뜬다',
    cookiePresetShown && cookiePicked === 'session_id' &&
      uaLabelShown && uaInsertedFullString &&
      history.cookies?.includes('my_smoke_cookie') && history.agents?.includes('SmokeBot/9.9') &&
      rememberedCookie && rememberedUa,
    `쿠키 프리셋=${cookiePresetShown}(고른 값="${cookiePicked}"), ` +
      `UA 라벨=${uaLabelShown} 값 삽입=${uaInsertedFullString}("${uaValue.slice(0, 28)}…"), ` +
      `이력 저장=${JSON.stringify(history)}, 다음 제안=[쿠키 ${rememberedCookie}, UA ${rememberedUa}]`);

  /*
   * N38: 백업 sync 스위치 (티켓 07, R-1 단순 계약).
   *
   * 스위치는 **앞으로의** 저장 위치만 정한다. 그래서 셋을 함께 본다 — (a) 선택이 저장되고
   * 다시 열어도 유지되며, (b) 끄는 것이 클라우드의 기존 스냅샷을 **지우거나 옮기지 않고**,
   * (c) 히스토리가 **활성 저장소** 것을 보여준다. (b)가 빠지면 스위치가 조용히 파괴적이 되고,
   * (c)가 빠지면 local로 바꿔도 클라우드 목록이 남아 어디에 저장되는지 거짓 표시가 된다.
   */
  await popup.reload();
  await popup.getByRole('button', { name: 'Show backups' }).click();
  await settleScreen(popup, 'Backup history');
  const syncSwitch = () => popup.getByRole('switch', { name: 'Cloud sync' });
  const cloudKeys = () => sw.evaluate(async () => Object.keys(await chrome.storage.sync.get(null)).sort());
  const manifestCount = (areaName) =>
    sw.evaluate(async (a) => {
      const kv = await chrome.storage[a].get('bk:manifest');
      return kv['bk:manifest']?.snapshots?.length ?? 0;
    }, areaName);
  // 히스토리 행은 "N active profile(s)"를 달고 나온다 (섹션 I와 같은 선택자).
  const historyRows = () => popup.locator('li').filter({ hasText: 'profile' }).count();

  const switchOnBefore = await syncSwitch().getAttribute('aria-checked');
  const cloudBefore = await cloudKeys();
  const syncSnapshots = await manifestCount('sync');
  const rowsWhileOn = await pollUntil(historyRows, (n) => n === syncSnapshots, 5000, 200);

  await syncSwitch().click();
  const storedOff = await pollUntil(
    () => sw.evaluate(async () => (await chrome.storage.local.get('state')).state?.syncBackup),
    (v) => v === false,
  );
  // 토글이 예약한 자동 백업이 (이제 local로) 내려앉을 시간을 준 뒤에 읽는다 —
  // 그래야 아래 행 수 비교가 착지 중인 스냅샷과 경합하지 않는다.
  await popup.waitForTimeout(4000);
  await popup.reload();
  await popup.getByRole('button', { name: 'Show backups' }).click();
  await settleScreen(popup, 'Backup history');
  const switchOffAfterReopen = await syncSwitch().getAttribute('aria-checked');
  const localSnapshots = await manifestCount('local');
  const rowsWhileOff = await pollUntil(historyRows, (n) => n === localSnapshots, 5000, 200);
  const cloudAfter = await cloudKeys();
  // 클라우드 키는 하나도 사라지지 않는다 (자동 백업이 더할 수는 있으므로 부분집합으로 본다).
  const cloudIntact = cloudBefore.every((k) => cloudAfter.includes(k));

  // 다시 켜면 클라우드 히스토리가 그대로 돌아온다 — 어느 쪽도 잃지 않았다는 증거.
  await syncSwitch().click();
  const rowsBackOn = await pollUntil(historyRows, (n) => n === syncSnapshots, 5000, 200);
  await pollUntil(
    () => sw.evaluate(async () => (await chrome.storage.local.get('state')).state?.syncBackup),
    (v) => v === true,
  );
  record('N38: 백업 sync 스위치 — 선택 유지, 클라우드 스냅샷 보존, 활성 저장소 히스토리',
    switchOnBefore === 'true' && storedOff === false && switchOffAfterReopen === 'false' &&
      cloudIntact && rowsWhileOn === syncSnapshots && rowsWhileOff === localSnapshots &&
      rowsBackOn === syncSnapshots,
    `on=${switchOnBefore}→stored-off=${storedOff}, reopen-checked=${switchOffAfterReopen}, ` +
      `cloud ${cloudBefore.length}→${cloudAfter.length} keys (intact=${cloudIntact}), ` +
      `rows sync ${rowsWhileOn}/${syncSnapshots} → local ${rowsWhileOff}/${localSnapshots} → back ${rowsBackOn}`);

  /*
   * N40: 설정·백업 화면 마무리 (티켓 09).
   *
   * 셋을 함께 본다 — (a) 백업 화면의 JSON 내보내기·가져오기가 **왕복**한다: 내보낸 파일
   * 하나만으로 통째로 지운 프로필이 규칙째 돌아온다. 내보내기만 보면 파일이 실제로 읽히는지
   * 모르고, 가져오기만 보면 우리가 쓴 파일이 우리가 읽는 파일인지 모른다. (b) 언어 선택이
   * 실제 문구를 바꾸고 **다시 열어도** 유지된다 — 저장을 빼면 새로고침에 날아간다.
   * (c) 단축키 목록이 등록된 커맨드를 읽기 전용으로 보여 준다(바꾸는 컨트롤 없음).
   */
  await seedProfiles([
    baseProfile('p-rt', 'RoundTrip', [hdr({ id: 'm1', name: 'X-Round-Trip', value: 'rt' })]),
  ]);
  await popup.reload();
  await popup.getByRole('button', { name: 'Show backups' }).click();
  await popup.getByRole('button', { name: 'Export…' }).click();
  const [rtDownload] = await Promise.all([
    popup.waitForEvent('download'),
    popup.getByRole('button', { name: /^Export \(1\)$/ }).click(),
  ]);
  const rtJson = readFileSync(await rtDownload.path(), 'utf8');

  // 프로필을 통째로 지운다 — 되살아난다면 그것은 방금 내보낸 파일에서 온 것이다.
  await seedProfiles([]);
  await pollSessionRuleCount(sw, 0);
  await popup.reload();
  await popup.getByRole('button', { name: 'Show backups' }).click();
  await popup.getByRole('button', { name: 'Import…' }).click();
  await popup.getByLabel('Import file').setInputFiles({
    name: 'round-trip.json', mimeType: 'application/json', buffer: Buffer.from(rtJson),
  });
  await popup.getByRole('button', { name: 'Run import' }).click();
  const rtState = await pollUntil(
    () => sw.evaluate(async () => (await chrome.storage.local.get('state')).state),
    (s) => s?.profiles?.length === 1,
    8000,
    200,
  );
  const rtProfile = rtState?.profiles?.[0];
  const rtMod = rtProfile?.modifications?.[0];
  const roundTripped =
    rtProfile?.name === 'RoundTrip' &&
    rtProfile.modifications.length === 1 &&
    rtMod?.name === 'X-Round-Trip' &&
    rtMod?.value === 'rt';

  /*
   * 언어는 `?locale=` 없이 연 화면에서 본다. 오버라이드는 무엇보다 앞서는 강제 로케일이라,
   * 그것을 달고 열면 저장된 선호가 화면을 바꾸는지 영영 알 수 없다.
   *
   * 대신 **저장된 선호를 먼저 en으로 심는다**. 오버라이드가 없을 때의 폴백은 브라우저 UI
   * 언어인데 그 값은 이 스위트가 정하지 못한다 — `--lang=en-US`로 띄워도
   * `chrome.i18n.getUILanguage()`는 호스트 OS 언어를 따라간다(이 기기에서는 ko다). 선호를
   * 심어 두면 화면이 en에서 시작하는 것이 기기와 무관하게 확정되고, 그 시작 자체가
   * "저장된 선호가 브라우저 UI 언어를 이긴다"의 실측이 된다.
   */
  await sw.evaluate(async () => {
    const { state } = await chrome.storage.local.get('state');
    await chrome.storage.local.set({ state: { ...state, locale: 'en' } });
  });
  const langPage = await context.newPage();
  await langPage.goto(`chrome-extension://${extensionId}/popup.html`);
  const startedEn = await langPage
    .getByRole('button', { name: 'Pause' })
    .waitFor({ timeout: 5000 })
    .then(() => true, () => false);
  await langPage.getByRole('button', { name: 'Show settings' }).click();
  await settleScreen(langPage, 'Theme');
  await langPage.getByRole('button', { name: '한국어' }).click();
  // 고른 즉시 바뀌는지 — 헤더의 Pause는 어느 화면에서나 보이는 문구다.
  const switchedToKo = await langPage
    .getByRole('button', { name: '일시정지' })
    .waitFor({ timeout: 5000 })
    .then(() => true, () => false);

  await langPage.reload();
  const keptKo = await langPage
    .getByRole('button', { name: '일시정지' })
    .waitFor({ timeout: 5000 })
    .then(() => true, () => false);

  /*
   * (c) **단축키 목록을 재지 않는다** (티켓 09). 스펙이 그 화면을 범위 밖에 뒀고
   * ("시안에 목록이 있지만 넣지 않는다") 시안에도 없어 카드가 걷혔다. 등록된 커맨드 자체는
   * 그대로 살아 있고 — L1이 `toggle-pause` 등록을 재고 있다 — 없어진 것은 그것을 옮겨 적던
   * 화면뿐이다. 설정 화면에 그 카드가 되살아나지 않았는지는 N17b가 본다.
   */

  // 새로고침이 레일을 프로필 화면으로 되돌려 놨다 — 언어 칩으로 돌아가려면 다시 들어간다.
  await langPage.getByRole('button', { name: '환경설정 화면' }).click();
  await settleScreen(langPage, '테마');

  // 되돌아오는 길도 있어야 한다 — 한 번 고르면 갇히는 선택이면 안 된다.
  await langPage.getByRole('button', { name: 'English' }).click();
  const switchedBackToEn = await langPage
    .getByRole('button', { name: 'Pause' })
    .waitFor({ timeout: 5000 })
    .then(() => true, () => false);
  await langPage.close();

  record('N40: 백업 화면 JSON 왕복 + 언어 선택(유지·복귀)',
    roundTripped && startedEn && switchedToKo && keptKo && switchedBackToEn,
    `왕복=${roundTripped}(${rtProfile?.name}/${rtMod?.name}=${rtMod?.value}), ` +
      `en시작=${startedEn} → ko=${switchedToKo} → 재열람 ko=${keptKo} → en복귀=${switchedBackToEn}`);

  /*
   * N42: "저장 후 바로 활성화" 토글 (티켓 11, story 17).
   *
   * 지금까지 새 규칙은 언제나 켜진 채로 태어났다 — 만들어 두고 나중에 켜는 길이 없었다.
   * 토글 하나가 그 선택을 돌려주되, **만지지 않은 저장은 이전과 완전히 같아야** 한다.
   * 그래서 넷을 함께 본다 — (a) 끄고 저장한 규칙이 꺼진 채 저장되고 목록에도 꺼진 행으로
   * 남는다, (b) 토글을 만지지 않은 저장은 켜진 채로 남는다(기본 켜짐 회귀 방지), (c) 꺼진
   * 규칙은 브라우저에 걸리지 않는다(compile의 `m.enabled` 필터), (d) 기존 규칙을 편집하려
   * 열면 토글이 그 규칙의 현재 값을 비추고 손대지 않은 저장이 상태를 뒤집지 않는다.
   * (b)가 빠지면 이 티켓 자체가 조용한 회귀가 되고, (d)가 빠지면 편집이 꺼 둔 규칙을
   * 되살린다.
   *
   * **순서가 증거다** — 꺼진 규칙을 먼저 저장하고 켜진 규칙을 나중에 저장한다. 꺼진 규칙은
   * 아무것도 방출하지 않아 규칙 세트에 관측 가능한 변화를 남기지 않으므로, 그 저장 직후의
   * 배리어는 이전 세트로 즉시 만족돼 (c)가 헛돈다. 뒤이은 켜진 규칙의 방출을 배리어로
   * 삼으면 그때 관측한 세트는 두 저장을 모두 반영한 것이라 (c)가 진짜 단언이 된다.
   */
  await seedProfiles([
    baseProfile('p-activate', 'Activate', [
      hdr({ id: 'm-live', name: 'X-Act-Live', value: 'live' }),
      hdr({ id: 'm-seeded-off', name: 'X-Act-Seeded', value: 'seeded', enabled: false }),
    ]),
  ]);
  await popup.reload();
  // 준비 배리어는 관측이다 — 시드가 실제로 컴파일돼 걸린 뒤에 폼을 만진다.
  await pollSessionRuleMatch(sw, headerOpLive('X-Act-Live'), 'X-Act-Live 시드 방출');

  const activateSwitch = () =>
    popup.getByRole('switch', { name: 'Enable after saving', exact: true });
  const readMod = (name) => () =>
    sw.evaluate(async (n) => {
      const { state } = await chrome.storage.local.get('state');
      return state.profiles[0].modifications.find((m) => m.name === n) ?? null;
    }, name);

  // (a) 끄고 저장 — 폼을 열면 켜져 있고(기본값), 끄면 그 선택이 저장에 실린다.
  await popup.getByRole('button', { name: 'Add rule' }).first().click();
  await popup.getByRole('combobox', { name: 'Type', exact: true }).waitFor({ timeout: 5000 });
  const defaultOn = (await activateSwitch().getAttribute('aria-checked')) === 'true';
  await popup.getByLabel('Header name', { exact: true }).fill('X-Act-Dark');
  await closeSuggestions(popup);
  await popup.getByLabel('Value', { exact: true }).fill('dark');
  await activateSwitch().click();
  const offBeforeSave = (await activateSwitch().getAttribute('aria-checked')) === 'false';
  await popup.getByRole('button', { name: SAVE_BUTTON }).click();
  await waitFormClosed();
  const darkMod = await pollUntil(readMod('X-Act-Dark'), (m) => m !== null);
  const savedOff = darkMod?.enabled === false;

  // (b) 토글을 만지지 않은 저장 — 이전과 같이 켜진 채다.
  await popup.getByRole('button', { name: 'Add rule' }).first().click();
  await popup.getByRole('combobox', { name: 'Type', exact: true }).waitFor({ timeout: 5000 });
  await popup.getByLabel('Header name', { exact: true }).fill('X-Act-Default');
  await closeSuggestions(popup);
  await popup.getByLabel('Value', { exact: true }).fill('default');
  await popup.getByRole('button', { name: SAVE_BUTTON }).click();
  await waitFormClosed();
  const defaultMod = await pollUntil(readMod('X-Act-Default'), (m) => m !== null);
  const savedOn = defaultMod?.enabled === true;

  // (c) 켜진 규칙의 방출을 배리어로 삼아, 같은 세트에서 꺼진 규칙의 부재를 단언한다.
  const activateRules = await pollSessionRuleMatch(
    sw,
    headerOpLive('X-Act-Default'),
    'X-Act-Default 방출',
  );
  const darkNotEmitted = !headerOps(activateRules).some(
    (h) => h.header?.toLowerCase() === 'x-act-dark',
  );
  const darkRow = popup
    .locator('.group')
    .filter({ has: popup.getByRole('button', { name: 'Edit', exact: true }) })
    .filter({ hasText: 'X-Act-Dark' })
    .first();
  // 행의 켜고 끄기는 토글 스위치다 (티켓 05) — 예전 체크박스가 시안의 스위치로 바뀌었다.
  const darkRowOff =
    (await darkRow.getByRole('switch').getAttribute('aria-checked')) === 'false';

  // (d) 편집 — 꺼 둔 시드 규칙을 열면 토글도 꺼져 있고, 그대로 저장해도 켜지지 않는다.
  const seededRow = popup
    .locator('.group')
    .filter({ has: popup.getByRole('button', { name: 'Edit', exact: true }) })
    .filter({ hasText: 'X-Act-Seeded' })
    .first();
  await seededRow.getByRole('button', { name: 'Edit', exact: true }).click();
  await popup.getByRole('combobox', { name: 'Type', exact: true }).waitFor({ timeout: 5000 });
  const editReflectsOff = (await activateSwitch().getAttribute('aria-checked')) === 'false';
  await popup.getByRole('button', { name: SAVE_BUTTON }).click();
  await waitFormClosed();
  const seededAfterEdit = await pollUntil(readMod('X-Act-Seeded'), (m) => m !== null);
  const editKeptOff = seededAfterEdit?.enabled === false;

  // (e) 종류를 바꿔도 선택이 남는다 — 초안 전환이 enabled를 승계한다.
  await popup.getByRole('button', { name: 'Add rule' }).first().click();
  await popup.getByRole('combobox', { name: 'Type', exact: true }).waitFor({ timeout: 5000 });
  await activateSwitch().click();
  await pickOption(popup, 'Type', 'Block request');
  const keptAcrossKind = (await activateSwitch().getAttribute('aria-checked')) === 'false';
  await popup.getByRole('button', { name: 'Cancel', exact: true }).click();
  await waitFormClosed();

  record('N42: 저장 후 바로 활성화 — 기본 켜짐·끄면 꺼진 채 저장·미방출, 편집은 뒤집지 않고 종류 전환에도 유지',
    defaultOn && offBeforeSave && savedOff && savedOn && darkNotEmitted && darkRowOff &&
      editReflectsOff && editKeptOff && keptAcrossKind,
    `기본켜짐=${defaultOn}, 끈뒤=${offBeforeSave}, 꺼진채저장=${savedOff}(enabled=${darkMod?.enabled}), ` +
      `미조작저장=${savedOn}(enabled=${defaultMod?.enabled}), 미방출=${darkNotEmitted}, 행꺼짐=${darkRowOff}, ` +
      `편집반영=${editReflectsOff}, 편집유지=${editKeptOff}(enabled=${seededAfterEdit?.enabled}), 종류전환유지=${keptAcrossKind}`);

  /*
   * N43: 히스토리 한 행 삭제 (티켓 12, story 36).
   *
   * 삭제는 일괄 "클라우드 백업 삭제"(R-1)·전체 초기화(R-3)와 **다른 동작**이다. 그래서
   * 넷을 함께 본다 — (a) 첫 클릭은 확인만 켜고 아무것도 지우지 않는다, (b) 복원 확인과
   * 삭제 확인은 서로를 취소한다(확인 중인 행·동작은 한 번에 하나), (c) 확인 클릭 뒤에야
   * **그 행만** 사라지고 활성 저장소의 매니페스트가 하나 줄며 그 청크 키도 함께 없어진다,
   * (d) 같은 저장소의 다른 스냅샷과 **반대쪽 저장소**는 그대로다. (a)가 빠지면 오클릭
   * 하나가 스냅샷을 지우고, (c)·(d)가 빠지면 한 행을 정리하려던 손이 저장소를 통째로 비운
   * 것을 못 잡는다. 손상 행에도 삭제가 서는지 함께 본다 — 복원이 막힌 스냅샷을 치울 길은
   * 그것뿐이다.
   *
   * **픽스처는 결정론을 위해 늦은 자동 백업을 재우는 장치다** — 시드가 부른 자동 백업이
   * 착지한 것을 스냅샷 안의 표식으로 관측한 뒤, 그 스냅샷을 복제해 매니페스트 맨 앞에
   * 놓는다. 맨 앞 항목의 체크섬이 지금 상태의 페이로드와 같아지므로, 이 시나리오 도중
   * 뒤늦게 발화하는 자동 백업은 planBackup의 skip 경로로 빠져 매니페스트를 건드리지
   * 않는다. 즉 이 시나리오는 개수 단언을 흔들지 않으려고 경합을 **재운다** — 그러므로
   * 이 시나리오의 green은 삭제 ↔ 자동 백업 경합에 대해 아무것도 말하지 않는다.
   * **그 경합의 증거는 S3 통합 시임에 있다** — `src/runtime/service-worker.integration.test.ts`가
   * `bootstrap()` + 진짜 저장소 어댑터 + 제어형 fake로 인터리빙을 소진한다. 끝단간 쪽은 아래
   * **N44**가 겹친 삭제를 진짜 채널·진짜 저장소로 본다.
   *
   * (전에 가리켰던 `backupStore.test.ts`·`background-bootstrap.test.ts`의 테스트들은 실제로는
   * 증거가 아니었다 — 근거는 스펙의 `기존 경합 테스트의 처분` 절. 티켓 02가 S3로 옮기며 고쳤다.)
   *
   * 여기서 확인하는 것은 사용자가 보는 확인 흐름과 삭제의 범위뿐이다.
   */
  const SNAP_MARKER = 'SnapDelete';
  await seedProfiles([
    baseProfile('p-snapdel', SNAP_MARKER, [hdr({ id: 'm1', name: 'X-Snap-Del', value: 'sd' })]),
  ]);
  // 활성 저장소는 저장된 스위치가 정한다 (R-1) — 화면과 같은 곳을 본다.
  const snapArea = (await sw.evaluate(
    async () => (await chrome.storage.local.get('state')).state?.syncBackup ?? true,
  ))
    ? 'sync'
    : 'local';
  const snapOther = snapArea === 'sync' ? 'local' : 'sync';

  const snapLanded = await pollUntil(
    () =>
      sw.evaluate(async ([area, marker]) => {
        const kv = await chrome.storage[area].get(null);
        const entry = kv['bk:manifest']?.snapshots?.[0];
        if (!entry) return false;
        let text = '';
        for (let i = 0; i < entry.chunkCount; i += 1) {
          const part = kv[`bk:${entry.id}:${i}`];
          if (typeof part !== 'string') return false;
          text += part;
        }
        return text.includes(marker);
      }, [snapArea, SNAP_MARKER]),
    (landed) => landed === true,
    55_000,
    500,
  );
  // pollUntil은 타임아웃에 마지막 값을 돌려준다 — 배리어로 쓰려면 반환값을 검사해야 한다.
  if (snapLanded !== true) {
    throw new Error(`N43 준비 실패: ${snapArea} 저장소에 시드 스냅샷이 착지하지 않았다`);
  }

  const seededSnap = await sw.evaluate(async ([area, other]) => {
    const kv = await chrome.storage[area].get(null);
    const manifest = kv['bk:manifest'];
    const newest = manifest.snapshots[0];
    const writes = {};
    // 지울 행: 정상 스냅샷의 복제본(같은 청크·체크섬, 다른 키·id).
    for (let i = 0; i < newest.chunkCount; i += 1) {
      writes[`bk:del-row:${i}`] = kv[`bk:${newest.id}:${i}`];
    }
    const clone = {
      ...newest,
      id: 'del-row',
      createdAt: Date.UTC(2020, 0, 2, 3, 4),
      profileCount: 7,
    };
    // 복원이 막히는 손상 행 — 청크가 아예 없다.
    const corrupt = {
      id: 'del-corrupt',
      createdAt: Date.UTC(2020, 0, 1, 3, 4),
      chunkCount: 1,
      checksum: 'deadbeef',
      profileCount: 9,
    };
    writes['bk:manifest'] = { ...manifest, snapshots: [clone, ...manifest.snapshots, corrupt] };
    await chrome.storage[area].set(writes);
    // 반대쪽 저장소의 표식 — 이 삭제가 넘보면 안 되는 구역이다.
    await chrome.storage[other].set({ 'bk:del-other:0': 'other-store-payload' });
    return { keptId: newest.id };
  }, [snapArea, snapOther]);

  const bkView = (area) =>
    sw.evaluate(async (a) => {
      const kv = await chrome.storage[a].get(null);
      return {
        ids: (kv['bk:manifest']?.snapshots ?? []).map((s) => s.id),
        keys: Object.keys(kv)
          .filter((k) => k.startsWith('bk:'))
          .sort(),
      };
    }, area);

  await popup.reload();
  await popup.getByRole('button', { name: 'Show backups' }).click();
  await settleScreen(popup, 'Backup history');
  const delRow = popup.locator('li').filter({ hasText: '7 active profiles' }).first();
  const corruptRow = popup.locator('li').filter({ hasText: '9 active profiles' }).first();
  await delRow.waitFor({ timeout: 5000 });
  const corruptDeletable = await corruptRow
    .getByRole('button', { name: 'Delete backup', exact: true })
    .isVisible();

  const snapBefore = await bkView(snapArea);
  const otherBefore = await bkView(snapOther);

  // (a) 첫 클릭은 확인만 켠다 — 저장소는 아직 그대로여야 한다.
  await delRow.getByRole('button', { name: 'Delete backup', exact: true }).click();
  const deleteArmed = await delRow
    .getByRole('button', { name: 'Confirm delete backup', exact: true })
    .isVisible();
  const armed = await bkView(snapArea);
  const armedNothingRemoved = armed.ids.includes('del-row') && armed.keys.includes('bk:del-row:0');

  /*
   * (b) **복원에는 되물음이 없다.** 예전에는 두 확인(복원·삭제)이 서로를 끄는지를 여기서
   * 쟀는데, 복원이 즉시 실행 + 실행 취소 토스트로 바뀌면서 되물음이 하나만 남았다 —
   * "한 번에 하나뿐"은 이제 `Confirming` 타입이 한 값짜리 유니온인 것으로 강제된다.
   * 남은 관측은 그 되물음이 실제로 사라졌는지다(누르지 않고 센다 — 누르면 복원이 돈다).
   */
  const restoreHasNoConfirm =
    (await delRow.getByRole('button', { name: /Confirm restore/ }).count()) === 0;
  const deleteStillArmed = await delRow
    .getByRole('button', { name: 'Confirm delete backup', exact: true })
    .isVisible();

  // (c) 확인 클릭에서만 실행된다.
  await delRow.getByRole('button', { name: 'Confirm delete backup', exact: true }).click();
  const snapAfter = await pollUntil(
    () => bkView(snapArea),
    (v) => !v.ids.includes('del-row'),
    8000,
    200,
  );
  const rowsLeft = await pollUntil(() => delRow.count(), (n) => n === 0, 5000, 200);
  const otherAfter = await bkView(snapOther);

  const deletedGone =
    !snapAfter.ids.includes('del-row') && !snapAfter.keys.some((k) => k.startsWith('bk:del-row:'));
  const othersKept =
    snapAfter.ids.includes(seededSnap.keptId) &&
    snapAfter.ids.includes('del-corrupt') &&
    snapBefore.keys
      .filter((k) => !k.startsWith('bk:del-row:'))
      .every((k) => snapAfter.keys.includes(k));
  const countDropped = snapAfter.ids.length === snapBefore.ids.length - 1;
  const otherIntact =
    JSON.stringify(otherAfter) === JSON.stringify(otherBefore) &&
    otherAfter.keys.includes('bk:del-other:0');

  record('N43: 히스토리 한 행 삭제 — 2단계 확인(복원 확인과 상호 취소), 그 행·그 청크만 사라지고 반대쪽 저장소는 무사',
    corruptDeletable && deleteArmed && armedNothingRemoved && restoreHasNoConfirm &&
      deleteStillArmed && deletedGone && othersKept && countDropped && rowsLeft === 0 && otherIntact,
    `손상행 삭제가능=${corruptDeletable}, 1클릭 확인=${deleteArmed}·무삭제=${armedNothingRemoved}, ` +
      `복원 되물음 없음=${restoreHasNoConfirm}(삭제확인 유지=${deleteStillArmed}), ` +
      `매니페스트(${snapArea}) ${snapBefore.ids.length}→${snapAfter.ids.length}, 남은 행=${rowsLeft}, ` +
      `그 청크 잔재=${snapAfter.keys.some((k) => k.startsWith('bk:del-row:'))}, 나머지 보존=${othersKept}, ` +
      `반대쪽(${snapOther}) 키 ${otherBefore.keys.length}→${otherAfter.keys.length} 동일=${otherIntact}`);

  /*
   * N44: 겹친 스냅샷 삭제의 끝단간 정합 (티켓 06, 스펙 S4).
   *
   * 이 시나리오가 따로 있는 이유는 **규모가 아니라 배선**이다. S3(`service-worker.integration.test.ts`)
   * 의 인터리빙 소진은 제어형 fake 위에서 돌므로 "Writer Lane이 실제로 배선됐는가"를 증명하지
   * 못한다 — 새 요청 핸들러를 레인 밖에 달아도 단위는 전부 green이다. 여기서는 진짜 서비스워커·
   * 진짜 메시지 채널·진짜 `chrome.storage`를 지난다.
   *
   * 겹치게 만드는 방법이 UI 클릭이 아닌 이유: 패널은 **확인 중인 행·동작을 한 번에 하나만**
   * 허용하므로(N43의 (b)) 두 행을 동시에 확인 상태로 둘 수 없다. 그래서 패널이 쓰는 것과 같은
   * 변이 채널로 두 요청을 보내되 **어느 것도 await하지 않고 둘 다 출발시킨 뒤 함께 기다린다** —
   * 두 요청이 실제로 함께 떠 있는 것은 그 구성이 보장한다.
   *
   * 메시지 `type` 문자열을 여기 적어 두는 것은 결합이지만 **닫힌 결합**이다: 상수가 바뀌면
   * 구독자가 응답하지 않아 응답이 `undefined`가 되고 삭제가 일어나지 않아, 아래 단언이 조용히
   * 통과하는 대신 큰 소리로 깨진다.
   *
   * 단언은 전부 **결과 불변식**이라 타이밍에 흔들리지 않는다 — 레인이 서면 결과가 결정론적이다.
   * 특히 `noOrphanRows`는 레인이 없을 때의 실패 모양을 정면으로 겨눈다: 삭제마다 매니페스트를
   * 통째로 다시 쓰므로 나중 것이 앞 것의 결과를 지워, **목록에는 있는데 청크는 없는 행**이
   * 남는다(사용자에게는 지운 적 없는 백업이 '손상됨'으로 보인다).
   *
   * `bothAccepted`도 장식이 아니다. 삭제는 쓰기 뒤에 `verifySnapshotDeleteComplete`로 자기
   * 결과를 되읽는데, 그 술어가 **읽은 시점 매니페스트에 있던 다른 스냅샷이 쓰기 뒤에 사라졌는지**
   * (`lostSiblings`)를 함께 본다. 두 삭제의 읽기·쓰기가 엇갈리면 나중 것이 앞 것이 지운 형제를
   * 손실로 보고 **스스로 `{ok:false, remaining}`을 낸다** — 프로덕션 코드에 이미 있는 경합
   * 탐지기를 그대로 단언에 쓰는 것이다.
   *
   * 다만 그 함의는 **한쪽으로만 흐른다**: `ok:false`가 나오면 엇갈렸다는 뜻이지만, 둘 다
   * `ok:true`라고 해서 엇갈리지 않았다는 것이 따라오지는 않는다. A가 쓰고·검증하고, 그 뒤 B가
   * **낡은 읽기**로 쓰고·검증하는 순서에서는 B의 검증이 자기 id도 형제 손실도 발견하지 못해
   * 둘 다 `ok:true`가 나오는데, 최종 상태에는 A가 지웠던 행이 매니페스트에 되살아나 있고 그
   * 청크는 없다. 그 경우를 잡는 것은 `bothRowsGone`·`noOrphanRows`다. 그러므로 이 단언들을
   * 줄이면 안 된다 — `bothAccepted` 하나로는 부족하다.
   *
   * **N43처럼 늦은 자동 백업을 재운다** — 매니페스트 맨 앞에 놓는 유지 행의 체크섬이 지금 상태의
   * 페이로드와 같으므로 뒤늦게 발화하는 자동 백업은 planBackup의 skip 경로로 빠진다. 그러므로 이
   * 시나리오의 green은 **삭제 ↔ 자동 백업** 경합에 대해서는 아무것도 말하지 않는다(그쪽은 S3가
   * 본다). 여기서 보는 것은 **삭제 ↔ 삭제**이고, 그것이 릴리스 r3의 R-3이 나던 자리다.
   */
  // 이 시나리오가 스위트에 더하는 비용을 숫자로 남긴다 (티켓 06 수용 기준). 시드도 저장소를
  // 전량 읽고 다시 쓰므로 **시드 앞에서** 재기 시작한다 — 시드를 뺀 숫자는 실제 추가 비용이
  // 아니다. 폴러들의 타임아웃은 8초지만 조건이 서면 즉시 빠지므로 행복 경로의 비용은 훨씬 작다.
  const raceT0 = Date.now();
  const raceSeed = await sw.evaluate(async (area) => {
    const kv = await chrome.storage[area].get(null);
    const manifest = kv['bk:manifest'];
    // 청크가 실제로 있는 정상 항목 — 복제본들이 이것의 청크·체크섬을 그대로 쓴다.
    const real = (manifest?.snapshots ?? []).find((s) => typeof kv[`bk:${s.id}:0`] === 'string');
    if (!real) return { ok: false, why: '청크가 있는 정상 스냅샷이 없다' };

    const chunks = [];
    for (let i = 0; i < real.chunkCount; i += 1) chunks.push(kv[`bk:${real.id}:${i}`]);

    // `bk:` 구역을 비우고 정확히 셋만 세운다 — 잔재 단언이 옛 항목에 흐려지지 않게.
    await chrome.storage[area].remove(Object.keys(kv).filter((k) => k.startsWith('bk:')));

    const writes = {};
    const clone = (id, profileCount, createdAt) => {
      chunks.forEach((part, i) => {
        writes[`bk:${id}:${i}`] = part;
      });
      return { ...real, id, profileCount, createdAt };
    };
    // 유지 행을 **배열 맨 앞**에 둔다 — planBackup은 `existing[0]`의 체크섬을 보므로, 그것이
    // 지금 페이로드와 같아 늦은 자동 백업이 skip으로 빠진다. 순서를 정하는 것은 아래 배열이고
    // `createdAt`은 목록에 그려질 날짜일 뿐이다.
    const keep = clone('race-keep', 13, Date.UTC(2021, 0, 3, 5, 6));
    const a = clone('race-a', 11, Date.UTC(2021, 0, 2, 5, 6));
    const b = clone('race-b', 12, Date.UTC(2021, 0, 1, 5, 6));
    writes['bk:manifest'] = { ...manifest, snapshots: [keep, a, b] };
    await chrome.storage[area].set(writes);
    return { ok: true, chunkCount: real.chunkCount };
  }, snapArea);
  if (!raceSeed.ok) {
    throw new Error(`N44 준비 실패: ${raceSeed.why}`);
  }

  await popup.reload();
  await popup.getByRole('button', { name: 'Show backups' }).click();
  await settleScreen(popup, 'Backup history');
  const keepRow = popup.locator('li').filter({ hasText: '13 active profiles' }).first();
  await keepRow.waitFor({ timeout: 5000 });
  const raceBefore = await bkView(snapArea);
  /*
   * 시드가 착지했는지 **관측한다** — 가정하지 않는다. 지울 두 행이 전송 시점 매니페스트에
   * 없으면 없는 스냅샷을 지우는 것은 멱등이라 `{ok:true}`가 나오고, 결과 불변식들도 전부
   * 성립해 이 시나리오가 **겹친 삭제를 한 번도 성립시키지 못한 채** 통과한다. 그 퇴화 경로가
   * 지금 도달 가능한지는 리뷰에서 반박됐지만(`keptListed`가 매니페스트 덮어쓰기 계열을 잡는다),
   * 준비 상태를 관측하는 것은 이 파일의 규율이고 N43도 같은 자리에 배리어를 둔다.
   */
  if (raceBefore.ids.join(',') !== 'race-keep,race-a,race-b') {
    throw new Error(`N44 준비 실패: 매니페스트가 [${raceBefore.ids.join(',')}]`);
  }

  // 두 삭제를 **동시에** 띄운다 — 패널이 쓰는 것과 같은 채널이다.
  const raceResults = await popup.evaluate(
    async ([type, area, ids]) =>
      Promise.all(
        ids.map((snapshotId) =>
          chrome.runtime.sendMessage({
            type,
            mutation: { op: 'delete-snapshot', snapshotId, target: area },
          }),
        ),
      ),
    ['headerkit:backup-mutation', snapArea, ['race-a', 'race-b']],
  );
  const bothAccepted = raceResults.every((r) => r?.ok === true);

  const raceAfter = await pollUntil(
    () => bkView(snapArea),
    (v) => !v.ids.includes('race-a') && !v.ids.includes('race-b'),
    8000,
    200,
  );

  const bothRowsGone = !raceAfter.ids.includes('race-a') && !raceAfter.ids.includes('race-b');
  const bothDataGone = !raceAfter.keys.some(
    (k) => k.startsWith('bk:race-a:') || k.startsWith('bk:race-b:'),
  );
  const keptListed = raceAfter.ids.includes('race-keep');
  const keptDataWhole = Array.from(
    { length: raceSeed.chunkCount },
    (_, i) => `bk:race-keep:${i}`,
  ).every((k) => raceAfter.keys.includes(k));
  // 레인이 없으면 정확히 이 단언이 깨진다 — 목록에는 있는데 청크가 없는 행이 남는다.
  const noOrphanRows = await sw.evaluate(async (area) => {
    const kv = await chrome.storage[area].get(null);
    return (kv['bk:manifest']?.snapshots ?? []).every((s) =>
      Array.from({ length: s.chunkCount }, (_, i) => `bk:${s.id}:${i}`).every(
        (k) => typeof kv[k] === 'string',
      ),
    );
  }, snapArea);

  /*
   * 세 번째는 목록에 있을 뿐 아니라 **손상이 아니다**. 사용자가 보는 목록으로 확인한다.
   *
   * **목록을 다시 읽는 것이 핵심이다.** 삭제를 원시 채널로 보냈으므로 패널의 목록 effect
   * (`backup-panel.tsx`의 deps `[open, loadSnapshots, target]` — 셋 다 이 구간에서 고정)는 다시
   * 돌지 않는다. 재조회 없이 DOM을 읽으면 **경합 전에 렌더된 목록**을 보게 되고, 그것은 시드가
   * 참으로 만들어 둔 것이지 경합 결과가 아니다 — 즉 시나리오를 지워도 참인 단언이 된다.
   * 다시 읽으면 프로덕션 `listSnapshots`가 경합 **후** 저장소를 실제로 디코드해(청크 전부 +
   * 체크섬 대조) 낸 판정을 보게 된다.
   *
   * 손상 여부는 별도 텍스트 검사를 두지 않는다. 손상 행은 복원 버튼 **대신** 손상 표식이
   * 그려지므로(`backup-panel.tsx`), 아래 복원이 성립한 것 자체가 `status !== 'corrupt'`의
   * 증거다 — 표식 문자열을 부정 검사하는 것보다 강하고, 카탈로그 언어에 걸리지도 않는다.
   *
   * 복원은 그대로 두면 공허해진다: 지금 상태와 스냅샷 내용이 같아서(그래서 자동 백업이
   * 재워졌다) 복원해도 관측되는 변화가 없어 **복원하지 않아도 참인 단언**이 된다. 그래서 먼저
   * 상태를 더럽힌다 — 스냅샷에 없는 프로필을 넣고 복원이 그것을 **치우는지** 본다. 저장소
   * 단언은 이미 끝났으므로 여기서 자동 백업이 깨어나도 무해하다.
   */
  await popup.reload();
  await popup.getByRole('button', { name: 'Show backups' }).click();
  await settleScreen(popup, 'Backup history');
  const snapRows = popup.locator('li').filter({ hasText: /active profiles?/ });
  const keepRowAfter = snapRows.filter({ hasText: '13 active profiles' }).first();
  const keptRowVisible = await keepRowAfter
    .waitFor({ timeout: 5000 })
    .then(() => true, () => false);
  // 지운 둘이 사용자가 보는 목록에서도 사라졌다 — 저장소만이 아니라 화면까지 본다.
  const deletedRowsUnlisted =
    (await snapRows.filter({ hasText: '11 active profiles' }).count()) === 0 &&
    (await snapRows.filter({ hasText: '12 active profiles' }).count()) === 0;

  const DIRTY_MARKER = 'RaceDirty';
  let restored = false;
  // 유지 행이 없으면 복원 클릭이 던져 `record`에 닿지 못한다 — 크래시 대신 FAIL로 남긴다.
  if (keptRowVisible) {
    await sw.evaluate(async (marker) => {
      const { state } = await chrome.storage.local.get('state');
      state.profiles = [
        ...state.profiles,
        { id: 'race-dirty', name: marker, active: false, shortLabel: 'D', color: '#16a34a', modifications: [] },
      ];
      await chrome.storage.local.set({ state });
    }, DIRTY_MARKER);

    await keepRowAfter.getByRole('button', { name: 'Restore backup', exact: true }).click();
    restored =
      (await pollUntil(
        () =>
          sw.evaluate(async ([keptName, dirtyName]) => {
            const { state } = await chrome.storage.local.get('state');
            const names = (state?.profiles ?? []).map((p) => p.name);
            return names.includes(keptName) && !names.includes(dirtyName);
          }, [SNAP_MARKER, DIRTY_MARKER]),
        (ok) => ok === true,
        8000,
        200,
      )) === true;
  }

  const twoFewer = raceAfter.ids.length === raceBefore.ids.length - 2;

  record('N44: 겹친 스냅샷 삭제 — 둘 다 사라지고 그 데이터도 남지 않으며 세 번째는 온전히 복원된다',
    bothAccepted && bothRowsGone && bothDataGone && twoFewer && keptListed && keptDataWhole &&
      noOrphanRows && keptRowVisible && deletedRowsUnlisted && restored,
    `동시 요청 둘 수락=${bothAccepted}(${JSON.stringify(raceResults)}), ` +
      `매니페스트(${snapArea}) ${raceBefore.ids.length}→${raceAfter.ids.length} ` +
      `[${raceAfter.ids.join(',')}] 둘 줄었나=${twoFewer}, 둘 다 없음=${bothRowsGone}, ` +
      `그 청크 잔재=${!bothDataGone}, 고아 행 없음=${noOrphanRows}, ` +
      `유지 행 목록=${keptListed}·청크 온전=${keptDataWhole}, ` +
      `경합 후 목록 재조회: 유지 행=${keptRowVisible}·지운 둘 부재=${deletedRowsUnlisted}, ` +
      `복원=${restored}, ${Date.now() - raceT0}ms`);

  /*
   * N39: 2단계 전체 초기화 (티켓 08, R-3).
   *
   * 초기화는 되돌릴 수 없으므로 **한 번 더 눌러 확인**하기 전에는 아무것도 지워지면 안 된다.
   * 그래서 둘을 함께 본다 — (a) 첫 클릭 뒤에도 프로필·백업 키가 그대로이고, (b) 확인 클릭
   * 뒤에야 상태가 default로 돌아가며 **두 저장소**의 옛 스냅샷이 사라진다. (a)가 빠지면
   * 오클릭 하나가 전부를 지우고, (b)가 빠지면 지웠다는 표시만 남는다.
   *
   * 마지막 시나리오다 — 이 뒤에 남는 상태는 없다.
   */
  const RESET_MARKER = 'ResetMarker';
  // 지워질 것이 분명한 표식을 심는다: 상태의 프로필 + 두 저장소의 백업 키.
  await sw.evaluate(async (marker) => {
    const { state } = await chrome.storage.local.get('state');
    state.profiles = [
      ...state.profiles,
      { id: 'reset-marker', name: marker, active: true, shortLabel: 'R', color: '#dc2626', modifications: [] },
    ];
    state.theme = 'dark';
    state.badgeVisible = false;
    await chrome.storage.local.set({ state });
    for (const area of ['local', 'sync']) {
      await chrome.storage[area].set({ [`bk:${marker}:0`]: `payload ${marker}` });
    }
  }, RESET_MARKER);

  const bkDump = () =>
    sw.evaluate(async () => {
      const out = [];
      for (const area of ['local', 'sync']) {
        const kv = await chrome.storage[area].get(null);
        for (const [key, value] of Object.entries(kv)) {
          if (key.startsWith('bk:')) out.push(`${key}=${JSON.stringify(value)}`);
        }
      }
      return out.join('|');
    });
  const readState = () => sw.evaluate(async () => (await chrome.storage.local.get('state')).state);

  await popup.reload();
  await popup.getByRole('button', { name: 'Show backups' }).click();
  await settleScreen(popup, 'Backup history');

  // 1단계: 첫 클릭은 확인만 켠다 — 아직 아무것도 지워지지 않는다.
  await popup.getByRole('button', { name: 'Reset everything' }).click();
  await popup.waitForTimeout(1000);
  const confirmVisible = await popup.getByRole('button', { name: 'Erase everything?' }).isVisible();
  const stateAfterFirst = await readState();
  const dumpAfterFirst = await bkDump();
  const survivedFirstClick =
    stateAfterFirst.profiles.some((p) => p.name === RESET_MARKER) &&
    dumpAfterFirst.includes(RESET_MARKER);

  // 2단계: 확인 클릭에서만 실행된다.
  await popup.getByRole('button', { name: 'Erase everything?' }).click();
  const stateAfterConfirm = await pollUntil(readState, (s) => s?.profiles?.length === 1, 15000, 200);
  const dumpAfterConfirm = await pollUntil(
    bkDump,
    (dump) => !dump.includes(RESET_MARKER),
    15000,
    200,
  );
  const rulesAfter = await pollUntil(
    () => sw.evaluate(async () => (await chrome.declarativeNetRequest.getSessionRules()).length),
    (n) => n === 0,
    15000,
    200,
  );
  const defaults =
    stateAfterConfirm.profiles.length === 1 &&
    stateAfterConfirm.profiles[0].name === 'Default Profile' &&
    stateAfterConfirm.theme === 'system' &&
    stateAfterConfirm.badgeVisible === true &&
    stateAfterConfirm.syncBackup === true &&
    Object.keys(stateAfterConfirm.materialized ?? {}).length === 0;

  record('N39: 2단계 전체 초기화 — 확인 전에는 무사, 확인 후 상태·두 저장소의 백업이 비워진다',
    confirmVisible && survivedFirstClick && defaults &&
      !dumpAfterConfirm.includes(RESET_MARKER) && rulesAfter === 0,
    `1클릭: 확인버튼=${confirmVisible}, 표식 생존=${survivedFirstClick} · ` +
      `2클릭: 프로필 ${stateAfterConfirm.profiles.length}개(${stateAfterConfirm.profiles[0]?.name}), ` +
      `theme=${stateAfterConfirm.theme}, badge=${stateAfterConfirm.badgeVisible}, sync=${stateAfterConfirm.syncBackup}, ` +
      `표식 잔재=${dumpAfterConfirm.includes(RESET_MARKER)}, 세션 규칙=${rulesAfter}`);

  /*
   * N50: **백업 화면이 시안의 카드 넷이다** (티켓 09 AC1·AC2·AC3·AC4).
   *
   * 넷을 한 자리에서 세는 이유는 이 화면의 계약이 "무엇이 어느 카드에 있는가"이기 때문이다 —
   * 개별 동작(복원·삭제·초기화)은 N39·N43·N44가 이미 재고, 여기서 잃기 쉬운 것은 **구성**이다.
   *
   * 동기화 카드는 저장 위치와 마지막 시각을 말하고 **기기 수는 말하지 않는다**: 브라우저가
   * 알려 주지 않는 값이라 셀 방법이 없고, 세는 척하면 화면이 조용히 거짓을 말한다.
   */
  await seedProfiles([baseProfile('p-cards', 'Cards', [hdr({ id: 'm1', name: 'X-Cards', value: '1' })])]);
  await popup.reload();
  await popup.getByRole('button', { name: 'Show backups' }).click();
  await settleScreen(popup, 'Backup history');
  const backupCards = await popup.evaluate(() =>
    [...document.querySelectorAll('[data-slot="card"]')].map(
      (c) => c.querySelector('[data-slot="card-title"]')?.textContent?.trim() ?? '',
    ),
  );
  const syncCard = popup
    .locator('[data-slot="card"]')
    .filter({ has: popup.getByRole('switch', { name: 'Cloud sync' }) });
  const syncText = (await syncCard.textContent()) ?? '';
  // 저장 위치는 말한다. 마지막 시각은 스냅샷이 있으면 시각을, 없으면 "아직 없다"를 말한다.
  const saysLocation = /new backups (go to your browser account|stay in this browser)/i.test(syncText);
  /*
   * 시각 문구가 **어느 저장소인지 밝히는지**까지 본다 (code-review). 예전 단언은
   * `Last backup: ` 또는 `No backups yet` 아무거나 통과시켰는데, 그 느슨함이 정확히
   * 이 카드의 자기모순을 놓쳤다 — 동기화를 끈 직후 로컬이 비면 "백업 없음" 바로 아래에
   * "클라우드에 백업이 남아 있습니다"가 나란히 선다.
   */
  const saysWhen =
    /Last backup in (your browser account|this browser): /.test(syncText) ||
    /Nothing backed up in (your browser account|this browser) yet\./.test(syncText);
  // 히스토리 카드의 빈 상태 문장이 동기화 카드에까지 번지지 않는다 — 같은 화면에 두 번 서면 안 된다.
  const borrowsHistoryEmpty = /No backups yet/.test(syncText);
  // 기기 수 — `N devices`·`2 browsers` 같은 표현이 하나도 없어야 한다.
  const saysDeviceCount = /\d+\s*(devices?|browsers?|기기|브라우저)/i.test(syncText);
  record('N50: 백업 화면 — 카드 넷(JSON·동기화·히스토리·초기화), 동기화는 위치·시각만 말하고 기기 수는 말하지 않는다',
    backupCards.length === 4 &&
      backupCards[0] === 'JSON export & import' &&
      backupCards[1] === 'Cloud sync' &&
      backupCards[2] === 'Backup history' &&
      backupCards[3] === 'Reset everything' &&
      saysLocation && saysWhen && !saysDeviceCount && !borrowsHistoryEmpty,
    `카드=${JSON.stringify(backupCards)}, 위치=${saysLocation}, 시각(저장소 명시)=${saysWhen}, ` +
      `기기수=${saysDeviceCount}, 히스토리 문장 차용=${borrowsHistoryEmpty}`);

  /*
   * N51: **복원이 걷어 간 것을 말한다** (티켓 02에서 이월한 빚).
   *
   * `restore`는 `parseImport`가 돌려준 `notices`를 통째로 버리고 있었다 — 스냅샷이 레거시
   * 필터나 퇴역 조건을 담고 있으면 복원이 그것을 조용히 걷어 가고, 사용자는 자기 규칙이
   * 왜 넓어졌는지 알 길이 없었다. 가져오기 경로는 같은 배열을 이미 배너로 올리고 있었으므로
   * 없던 것은 자리뿐이다.
   *
   * 스냅샷을 손으로 만든다 — 지금 버전이 만드는 백업에는 레거시 필터가 없다(저장소 문이
   * 읽는 즉시 걷어낸다). 체크섬은 제품과 같은 FNV-1a라 페이지 안에서 그대로 계산한다.
   */
  const legacyPayload = JSON.stringify({
    headerkit: 1,
    profiles: [
      {
        id: 'legacy-restore', name: 'LegacyRestore', active: false, color: '#2563eb',
        modifications: [
          { kind: 'request-header', id: 'lm1', name: 'X-Legacy-Restore', value: 'lr',
            enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
        ],
        filters: [{ kind: 'url', id: 'lf1', enabled: true, pattern: 'legacy\\.example' }],
      },
    ],
  });
  const seeded = await sw.evaluate(async ([payload]) => {
    // 제품의 `checksum`과 같은 FNV-1a — 다르면 스냅샷이 손상으로 읽혀 복원이 막힌다.
    const sum = (text) => {
      let hash = 0x811c9dc5;
      for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
      }
      return (hash >>> 0).toString(16).padStart(8, '0');
    };
    const area = (await chrome.storage.local.get('state')).state?.syncBackup ?? true ? 'sync' : 'local';
    const entry = {
      id: 'legacy-snap', createdAt: Date.UTC(2021, 4, 6, 7, 8),
      chunkCount: 1, checksum: sum(payload), profileCount: 1,
    };
    await chrome.storage[area].set({
      'bk:legacy-snap:0': payload,
      'bk:manifest': { snapshots: [entry] },
    });
    return area;
  }, [legacyPayload]);
  await popup.reload();
  await popup.getByRole('button', { name: 'Show backups' }).click();
  await settleScreen(popup, 'Backup history');
  // 2단계 확인 — 첫 클릭은 확인만 켠다.
  await popup.getByRole('button', { name: 'Restore backup' }).first().click();
  const restoreNotice = await pollUntil(
    () => popup.locator('[role="status"], ul li').allTextContents(),
    (texts) => texts.some((x) => /moved the old profile filters onto each rule/i.test(x)),
    8000,
    200,
  );
  const noticeShown = restoreNotice.some((x) => /moved the old profile filters onto each rule/i.test(x));
  const restoredProfile = await pollUntil(
    () => sw.evaluate(async () => (await chrome.storage.local.get('state')).state.profiles.map((p) => p.name)),
    (names) => names.includes('LegacyRestore'),
  );
  record('N51: 복원이 걷어 간 것을 말한다 — 레거시 필터 공지가 화면에 선다 (티켓 02 이월)',
    noticeShown && restoredProfile.includes('LegacyRestore'),
    `저장소=${seeded}, 공지=${noticeShown}, 복원된 프로필=${JSON.stringify(restoredProfile)}`);

  /*
   * N52: **권한이 실제로 줄었다** (티켓 10 AC4·AC5, ADR 0002 개정).
   *
   * 매니페스트에서 빠진 것을 세는 것만으로는 부족하다 — 권한을 빼서 **무언가 조용히
   * 망가졌는지**가 진짜 물음이고, 티켓이 "확인 없이 빼면 다른 곳이 조용히 망가진다"고
   * 못박은 지점이다. 그래서 셋을 함께 잰다:
   *
   *  (a) 매니페스트에 `alarms`·`tabs`가 없다 — 요구하는 권한이 실제로 줄었다.
   *  (b) `chrome.alarms`가 서비스워커에서 **아예 없다** — 알람 코드가 남아 있으면 여기서 드러난다.
   *  (c) 그런데도 `tabs.create`를 쓰는 '탭에서 열기'가 여전히 탭을 연다 — **이 메서드가 애초에
   *      권한을 요구하지 않는다**는 것이 근거다. 기억이 아니라 이 브라우저에서 실측해 남긴다.
   *
   * `chrome.tabs`는 권한 없이도 **객체가 존재하고 `query`도 함수로 잡힌다** — `tabs` 권한이
   * 지키는 것은 API 표면이 아니라 탭의 특권 속성(url·title·favIconUrl)이기 때문이다. 그래서
   * 부재를 단언하지 않고 관측만 상세에 남긴다: 여기서 부재를 요구했다면 브라우저가 그렇게
   * 동작하지 않는다는 이유로 이 시나리오가 거짓 실패를 냈을 것이다.
   */
  const manifest = await sw.evaluate(() => chrome.runtime.getManifest());
  const perms = manifest.permissions ?? [];
  const alarmsApiGone = await sw.evaluate(() => typeof chrome.alarms === 'undefined');
  const tabsQueryGone = await sw.evaluate(
    () => typeof chrome.tabs === 'undefined' || typeof chrome.tabs.query !== 'function',
  );

  await seedProfiles([baseProfile('p-perm', 'Perm', [])]);
  await popup.reload();
  const beforeTabs = context.pages().length;
  await popup.getByRole('button', { name: 'Open in tab' }).click();
  const openedTab = await pollUntil(
    () => Promise.resolve(context.pages().length),
    (n) => n > beforeTabs,
    5000,
    100,
  );
  const appTab = context.pages().find((pg) => pg.url().includes('/app.html'));
  if (appTab && appTab !== tabApp) await appTab.close();

  record('N52: 권한 축소 — alarms·tabs가 매니페스트와 런타임 양쪽에서 사라졌고, 탭 열기는 그대로 된다',
    !perms.includes('alarms') && !perms.includes('tabs') &&
      perms.includes('declarativeNetRequest') && perms.includes('storage') &&
      alarmsApiGone && openedTab > beforeTabs,
    `permissions=${JSON.stringify(perms)}, host=${JSON.stringify(manifest.host_permissions)}, ` +
      `alarms API 부재=${alarmsApiGone}, tabs.query 부재=${tabsQueryGone}, ` +
      `탭 열림=${openedTab > beforeTabs} (${beforeTabs}→${openedTab})`);

  /*
   * N53: 대형 편집기 다이얼로그의 열림·닫힘 전이 (ADR 0012).
   *
   * 이 계약은 만들어질 때 관측이 하나도 없었다 — J3은 값이 저장되는지만 보고, 모션 시나리오
   * (N29·N30·N33)는 패널·셀렉트·스크롤바를 본다. ADR 0012가 "새로 만든 계약은 곧바로
   * 목록에 올린다"고 적어 둔 이유가 이것이다.
   *
   * **두 가지를 함께 본다.** 시간만 재면 "느려서 늦게 사라졌다"와 구분되지 않고, 선언만
   * 보면 선언이 실제로 발화하는지를 모른다. 그래서 (1) 팝업의 `transition-property`가
   * 무엇인지와 (2) 닫기부터 DOM에서 사라지기까지 얼마가 걸리는지를 같이 잰다.
   *
   * reduced-motion의 계약은 **부재**다(0초 전이가 아니라 `transition-property: none`).
   * Base UI는 팝업 자신의 애니메이션이 끝나기를 기다렸다 언마운트하므로, 전이가 없으면
   * 즉시 사라지고 있으면 전이 길이만큼 남는다 — 그 차이가 이 단언의 관측 창이다.
   *
   * 닫기는 **Escape**로 한다. 다이얼로그의 '취소'와 규칙 폼의 '취소'가 같은 이름이라
   * 이름으로는 고를 수 없고, 포털의 Esc는 폼까지 버블되지 않아(rule-form의 onKeyDown 주석)
   * 다이얼로그만 닫힌다.
   */
  const measureDialogClose = async (page) => {
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    await page.getByRole('button', { name: /open large editor/i }).first().click();
    await page.getByRole('dialog').waitFor({ timeout: 5000 });
    /*
     * **열림 전이가 끝나기를 기다린다.** 열리는 중에 닫으면 Base UI는 중단된 애니메이션을
     * '끝난 것'으로 쳐서(`useAnimationsFinished`의 `treatAbortedAsFinished`) 곧바로
     * 언마운트한다 — 닫힘 전이는 멀쩡히 살아 있는데 관측만 한 프레임으로 나온다.
     * 처음에 이 대기 없이 재다가 정확히 그 함정에 빠졌다(기본 12ms / reduced 14ms).
     */
    await page.waitForTimeout(POPUP_FADE_S * 1000 + 120);
    const transition = await page.evaluate(() => {
      const el = document.querySelector('[data-slot="dialog-popup"]');
      return el ? getComputedStyle(el).transitionProperty : null;
    });
    await page.evaluate(() => {
      window.__dialogGoneMs = null;
      const start = performance.now();
      const tick = () => {
        if (!document.querySelector('[data-slot="dialog-popup"]')) {
          window.__dialogGoneMs = performance.now() - start;
        } else {
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
    });
    await page.keyboard.press('Escape');
    const observed = await page
      .waitForFunction(() => window.__dialogGoneMs != null, null, { timeout: 5000 })
      .then(() => true, () => false);
    return {
      transition,
      goneMs: observed ? await page.evaluate(() => window.__dialogGoneMs) : null,
    };
  };

  await seedProfiles([
    baseProfile('p-dlg', 'Dialog', [
      { kind: 'request-header', id: 'm1', name: 'X-Dlg', value: 'v', enabled: true,
        mode: 'override', emptyMeans: 'remove', comment: '' },
    ]),
  ]);
  await popup.emulateMedia({ reducedMotion: null });
  await popup.reload();
  await popup.getByRole('button', { name: 'Edit', exact: true }).first().waitFor({ timeout: 5000 });
  const livelyDialog = await measureDialogClose(popup);
  await popup.emulateMedia({ reducedMotion: 'reduce' });
  await popup.reload();
  await popup.getByRole('button', { name: 'Edit', exact: true }).first().waitFor({ timeout: 5000 });
  const reducedDialog = await measureDialogClose(popup);
  await popup.emulateMedia({ reducedMotion: null });
  // 창은 넉넉히 잡는다 — 재는 것은 "전이가 돌았는가"이지 정확한 밀리초가 아니다.
  // 기본 180ms(POPUP_FADE_S) 대 즉시(0~1프레임) 사이라 경계가 넓다.
  const dialogFadeMs = POPUP_FADE_S * 1000;
  const movesOn = (t) => typeof t === 'string' && t.includes('opacity') && t.includes('scale');
  record('N53: 대형 편집기 다이얼로그 — 기본은 opacity·scale 전이만큼 남고 reduced는 전이가 없다',
    movesOn(livelyDialog.transition) &&
      typeof livelyDialog.goneMs === 'number' && livelyDialog.goneMs >= dialogFadeMs * 0.66 &&
      reducedDialog.transition === 'none' &&
      typeof reducedDialog.goneMs === 'number' && reducedDialog.goneMs < dialogFadeMs / 3,
    `기본 transition="${livelyDialog.transition}" 잔류=${livelyDialog.goneMs?.toFixed?.(0)}ms, ` +
    `reduced transition="${reducedDialog.transition}" 잔류=${reducedDialog.goneMs?.toFixed?.(0)}ms ` +
    `(전이 ${dialogFadeMs}ms)`);

  {
    /*
     * N19c: 마지막 규칙을 지우면 빈 상태가 **행이 다 접힌 뒤에** 선다.
     *
     * 예전에는 목록이 비는 그 순간 안내가 통째로 나타났다 — 지우는 행이 아직 260ms 동안
     * 접히는 중이라, 그 행 옆에 "규칙이 없습니다"가 나란히 서는 프레임이 생긴다.
     *
     * **존재 시각으로 잰다.** 보이는지가 아니라 DOM에 생기는 시각이다: 안내는 등장 모션이
     * 붙어 높이 0에서 시작하므로 가시성으로 재면 전이 길이까지 함께 세게 되어, 무엇이
     * 늦춘 것인지(순서인지 모션인지) 구별되지 않는다. 클릭 시각은 페이지 안에서 잡는다 —
     * CDP 왕복을 t0에 넣으면 그 왕복 시간이 계약처럼 보인다.
     */
    await seedProfiles([
      baseProfile('p-last', 'LastOne', [hdr({ id: 'only', name: 'X-Only', value: '1' })]),
    ]);
    await popup.reload();
    await popup.getByRole('button', { name: 'Delete', exact: true }).first().waitFor({ timeout: 5000 });
    await popup.evaluate(() => {
      window.__emptyMs = null;
      const seen = () =>
        [...document.querySelectorAll('p')].some((p) => p.textContent.trim().startsWith('No rules yet'));
      window.addEventListener(
        'click',
        () => {
          const t0 = performance.now();
          const tick = () => {
            if (seen()) window.__emptyMs = performance.now() - t0;
            else if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
            else window.__emptyMs = -1;
          };
          requestAnimationFrame(tick);
        },
        { once: true, capture: true },
      );
    });
    await popup.getByRole('button', { name: 'Delete', exact: true }).first().click();
    const emptyAfterMs = await popup
      .waitForFunction(() => window.__emptyMs != null, null, { timeout: 5000 })
      .then(() => popup.evaluate(() => window.__emptyMs), () => null);
    const rowExitMs = ROW_TRANSITION.duration * 1000;
    record('N19c: 마지막 규칙 삭제 — 빈 상태는 행이 접힌 뒤에 선다 (성급하게 앞서지 않는다)',
      typeof emptyAfterMs === 'number' && emptyAfterMs >= rowExitMs * 0.8 && emptyAfterMs < 3000,
      `안내 등장=${emptyAfterMs?.toFixed?.(0)}ms (행 접힘 ${rowExitMs}ms)`);
  }

  {
    /*
     * N19d: 새 규칙을 저장하면 그 행이 **폼이 접힌 뒤에** 선다.
     *
     * 폼은 400px, 행은 56px이라 둘이 동시에 움직이면 그 차이만큼 아래 내용이 위로 당겨진다 —
     * 무엇이 생겼는지보다 화면이 줄었다는 것이 먼저 읽힌다. N19c(마지막 규칙 삭제)와 같은
     * 겹침의 반대 방향이고, 같은 방식으로 잰다: 클릭 시각을 페이지 안에서 잡고 행이 DOM에
     * 생기는 시각을 본다.
     */
    await seedProfiles([baseProfile('p-save-seq', 'SaveSeq', [])]);
    await popup.reload();
    await popup.getByRole('button', { name: 'Add rule' }).first().click();
    await popup.getByRole('button', { name: 'Cancel', exact: true }).waitFor({ timeout: 5000 });
    /*
     * 행의 제목은 **메모**다(메모가 없으면 종류 이름이 선다 — N19a). 그래서 메모를 채우고
     * 그 문자열이 목록에 서는 시각을 잰다: 헤더 이름으로 찾으면 칩 줄에 섞여 잡히거나
     * 아예 안 잡힌다.
     */
    await popup.getByLabel('Name', { exact: true }).first().fill('SeqRule');
    await popup.getByLabel('Header name', { exact: true }).first().fill('X-Seq');
    await popup.evaluate(() => {
      window.__rowMs = null;
      const seen = () =>
        [...document.querySelectorAll('span')].some((el) => el.textContent.trim() === 'SeqRule');
      window.addEventListener(
        'click',
        () => {
          const t0 = performance.now();
          const tick = () => {
            if (seen()) window.__rowMs = performance.now() - t0;
            else if (performance.now() - t0 < 4000) requestAnimationFrame(tick);
            else window.__rowMs = -1;
          };
          requestAnimationFrame(tick);
        },
        { once: true, capture: true },
      );
    });
    await popup.getByRole('button', { name: SAVE_BUTTON }).click();
    const rowAfterMs = await popup
      .waitForFunction(() => window.__rowMs != null, null, { timeout: 6000 })
      .then(() => popup.evaluate(() => window.__rowMs), () => null);
    // 저장이 실제로 착지했는지도 함께 본다 — 행만 늦게 서고 저장은 안 된 상태를 통과시키지 않는다.
    const savedName = await pollUntil(
      () => sw.evaluate(async () => {
        const { state } = await chrome.storage.local.get('state');
        return state.profiles[0]?.modifications[0]?.name ?? null;
      }),
      (v) => v === 'X-Seq',
    );
    const formExitMs = ROW_TRANSITION.duration * 1000;
    record('N19d: 새 규칙 저장 — 행은 폼이 접힌 뒤에 선다 (겹쳐 움직이지 않는다)',
      typeof rowAfterMs === 'number' && rowAfterMs >= formExitMs * 0.8 && rowAfterMs < 4000 &&
        savedName === 'X-Seq',
      `행 등장=${rowAfterMs?.toFixed?.(0)}ms (폼 접힘 ${formExitMs}ms), 저장=${savedName}`);
    await waitFormClosed();
  }

  // 이 시나리오의 지역 이름을 블록으로 닫는다 — 스모크 본문은 한 스코프라 이름이 겹친다.
  {
    /*
     * N54: 프로필 삭제 (ADR 0017 개정) — 숨었다 나타나고, 두 번 눌러야 지워지고, 마지막
     * 하나까지 지울 수 있다.
     *
     * 세 가지가 함께 걸려야 계약이 산다. **숨김**만 재면 도달할 수 없는 버튼을 통과시키고
     * (호버·포커스 둘 다 본다), **2단 확인**만 재면 한 번 눌러 지워지는 회귀를 놓치며,
     * **마지막 하나**를 안 재면 예외 하나가 조용히 되살아난다.
     */
    await seedProfiles([
      baseProfile('d-1', 'DelA', [hdr({ id: 'm1', name: 'X-Del', value: '1' })]),
      baseProfile('d-2', 'DelB', []),
    ]);
    await popup.reload();
    await popup.getByRole('button', { name: 'Show profiles', exact: true }).waitFor({ timeout: 5000 });
    /*
     * **드래그 목록이 도착하기를 기다린다.** dnd-kit은 지연 청크라(ui-refine 08) 그것이
     * 붙는 순간 정적 fallback 목록이 통째로 교체된다 — 행이 리마운트되므로 행이 들고 있던
     * 되물음도 함께 풀린다. 기다리지 않으면 그 교체가 시나리오 한가운데로 떨어져,
     * 무장해 둔 버튼이 이유 없이 사라진 것처럼 보인다(실제로 그렇게 헛디뎠다).
     */
    await waitSortableReady();
    const profileDelRow = popup.locator('li').filter({ has: popup.getByRole('button', { name: 'Delete DelB' }) });
    const profileDelButton = popup.getByRole('button', { name: 'Delete DelB' });
    const rowOpacity = () =>
      profileDelButton.evaluate((el) => Number(getComputedStyle(el.parentElement).opacity));
    // 평소에는 숨는다 — 264px 열에서 상시 아이콘은 이름을 먼저 자른다.
    const hiddenIdle = (await rowOpacity()) === 0;
    await profileDelRow.hover();
    const shownOnHover = (await pollUntil(rowOpacity, (v) => v === 1, 2000, 50)) === 1;
    // 포커스로도 나타난다 — 호버만이면 키보드·터치에서 부재가 된다.
    await popup.mouse.move(0, 0);
    await popup.getByRole('switch', { name: 'Toggle DelB' }).focus();
    await popup.keyboard.press('Shift+Tab');
    const shownOnFocus = (await pollUntil(rowOpacity, (v) => v === 1, 2000, 50)) === 1;

    // 한 번 누르면 되묻기만 한다 — 저장소는 그대로다.
    await profileDelRow.hover();
    await profileDelButton.click();
    const armed = await popup
      .getByRole('button', { name: 'Confirm delete DelB' })
      .waitFor({ timeout: 5000 })
      .then(() => true, () => false);
    const stillThere = await sw.evaluate(async () => {
      const { state } = await chrome.storage.local.get('state');
      return state.profiles.length;
    });
    // 두 번째 클릭이 지운다.
    await popup.getByRole('button', { name: 'Confirm delete DelB' }).click();
    const afterDelete = await pollUntil(
      () => sw.evaluate(async () => {
        const { state } = await chrome.storage.local.get('state');
        return state.profiles.map((p) => p.id).join('|');
      }),
      (ids) => ids === 'd-1',
    );

    /*
     * 마지막 하나도 지운다 — 그리고 지운 것이 남긴 **실체화 값도 함께** 걷힌다. 남은 프로필은
     * Placeholder 규칙을 갖도록 다시 심어, 걷혔는지를 저장소에서 직접 본다.
     */
    await seedProfiles([
      { ...baseProfile('d-only', 'DelOnly',
        [hdr({ id: 'mp', name: 'X-Ph', value: 'v-{{uuid}}' })]), active: false },
    ]);
    await popup.reload();
    await waitSortableReady();
    await popup.getByRole('switch', { name: 'Toggle DelOnly' }).click();
    const materializedBefore = await pollUntil(
      () => sw.evaluate(async () => {
        const { state } = await chrome.storage.local.get('state');
        return Object.keys(state.materialized ?? {}).length;
      }),
      (n) => n === 1,
    );
    const onlyRow = popup.locator('li').filter({ has: popup.getByRole('button', { name: 'Delete DelOnly' }) });
    await onlyRow.hover();
    await popup.getByRole('button', { name: 'Delete DelOnly' }).click();
    await popup.getByRole('button', { name: 'Confirm delete DelOnly' }).click();
    const emptied = await pollUntil(
      () => sw.evaluate(async () => {
        const { state } = await chrome.storage.local.get('state');
        return { profiles: state.profiles.length, materialized: Object.keys(state.materialized ?? {}).length };
      }),
      (v) => v.profiles === 0,
    );
    // 프로필이 없어진 화면이 그렇게 말한다 — 빈 목록은 이미 표현 가능한 상태다.
    const emptyNoticeShown = await popup
      .getByText('No profiles yet', { exact: false })
      .first()
      .waitFor({ timeout: 5000 })
      .then(() => true, () => false);

    record('N54: 프로필 삭제 — 호버·포커스에만 보이고, 2단 확인이며, 마지막 하나와 실체화 값까지 걷힌다',
      hiddenIdle && shownOnHover && shownOnFocus &&
        armed && stillThere === 2 && afterDelete === 'd-1' &&
        materializedBefore === 1 && emptied.profiles === 0 && emptied.materialized === 0 &&
        emptyNoticeShown,
      `숨김=${hiddenIdle} 호버=${shownOnHover} 포커스=${shownOnFocus}, ` +
      `1클릭 되물음=${armed}(프로필 ${stillThere}개 유지), 2클릭 후=[${afterDelete}], ` +
      `마지막 하나 삭제=${emptied.profiles === 0} 실체화 ${materializedBefore}→${emptied.materialized}, ` +
      `빈 안내=${emptyNoticeShown}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  console.log(
    failed.length === 0
      ? `PASS smoke: ${results.length}/${results.length} 시나리오`
      : `FAIL smoke: ${results.length - failed.length}/${results.length} 시나리오 — 실패 목록은 위 FAIL 줄`,
  );
  process.exitCode = failed.length === 0 ? 0 : 1;
} finally {
  await context.close();
  server.close();
}
