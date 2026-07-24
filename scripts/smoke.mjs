/**
 * 실브라우저 스모크 (이슈 01 인수 조건):
 *  A. 팝업 상태 → storage → session rule → 실요청 헤더 적용/해제
 *  B. PRD 검증 항목 ①: allow 규칙 vs 낮은 priority modifyHeaders 우선순위 상호작용
 *  C. PRD 검증 항목 ②: 5,000 규칙 규모의 session rules 전량 교체
 *
 * 실행: bun run build && bun run smoke
 */
import { readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { menuStaggerTotalMs, ROW_TRANSITION } from '../src/ui/motion-tokens.ts';

const EXT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../.output/chrome-mv3',
);

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
 * 접이식 패널을 **열린 상태로 만든다** — 이미 열려 있으면 아무것도 하지 않는다.
 *
 * 예전에는 각 시나리오가 토글을 그냥 한 번 눌러 열었다. 그 방식은 "기본은 닫힘"에
 * 의존하는데, 기본값이 열림으로 바뀌자 같은 클릭이 패널을 **닫아** 뒤따르는 단언이
 * 전부 무너졌다. 여는 것이 목적인 자리에서는 목적을 그대로 적는다.
 */
async function ensurePanelOpen(page, label) {
  const toggle = page.getByRole('button', { name: label });
  await toggle.waitFor({ timeout: 5000 });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await page.waitForTimeout(300); // 높이 전환이 끝난 뒤에 안쪽을 만진다
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

  const pollBadge = (expected, timeoutMs = 3000) =>
    pollUntil(() => sw.evaluate(() => chrome.action.getBadgeText({})), (t) => t === expected, timeoutMs, 100);

  const multiBadge = await pollBadge('2');
  record('D2: 다중 활성 시 배지에 활성 개수 표시', multiBadge === '2', `badge="${multiBadge}"`);

  await popup.reload();
  // Pause/Resume은 aria-label(en 카탈로그)로 선택한다 — 팝업은 ?locale=en.
  await popup.getByRole('button', { name: 'Pause' }).click();
  await pollSessionRuleCount(sw, 0);
  headers = await fetchEchoHeaders(page);
  const pausedBadge = await pollBadge('II');
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

  // E2: 제외 도메인 조건 — 해당 도메인 요청에는 적용되지 않는다 (네이티브 excludedRequestDomains)
  await seedProfiles([
    baseProfile('p-ex', 'Ex',
      [{ kind: 'request-header', id: 'm1', name: 'X-Ex', value: 'on', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '',
        conditions: { excludedDomains: ['localhost'] } }]),
  ]);
  await pollSessionRuleCount(sw, 1);
  const onIncluded = await fetchEchoHeaders(page, '/headers');
  await page.goto(`http://localhost:${port}/`);
  const onExcluded = await fetchEchoHeaders(page, '/headers');
  await page.goto(origin);
  record('E2: 제외 도메인 — 해당 도메인에서만 미적용',
    onIncluded['x-ex'] === 'on' && onExcluded['x-ex'] === undefined,
    `127.0.0.1=${onIncluded['x-ex']}, localhost=${onExcluded['x-ex']}`);

  // E3: 메서드 조건
  await seedProfiles([
    baseProfile('p-method', 'Meth',
      [{ kind: 'request-header', id: 'm1', name: 'X-Post-Only', value: 'on', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '',
        conditions: { requestMethods: ['post'] } }]),
  ]);
  await pollSessionRuleCount(sw, 1);
  const viaGet = await fetchEchoHeaders(page, '/headers');
  const viaPost = await fetchEchoHeaders(page, '/headers', 'POST');
  record('E3: 메서드 조건 — POST에만 적용', viaGet['x-post-only'] === undefined && viaPost['x-post-only'] === 'on',
    `GET=${viaGet['x-post-only']}, POST=${viaPost['x-post-only']}`);

  // E5: 리소스 종류 조건 — main_frame 내비게이션에만 적용, XHR 제외
  await seedProfiles([
    baseProfile('p-rt', 'Rt',
      [{ kind: 'request-header', id: 'm1', name: 'X-Doc-Only', value: 'on', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '',
        conditions: { resourceTypes: ['main_frame'] } }]),
  ]);
  await pollSessionRuleCount(sw, 1);
  const viaXhr = await fetchEchoHeaders(page, '/headers');
  await page.goto(`${origin}/headers?nav=1`);
  const viaNav = JSON.parse(await page.evaluate(() => document.body.innerText));
  await page.goto(origin);
  record('E5: 리소스 종류 조건 — 문서 요청에만 적용',
    viaXhr['x-doc-only'] === undefined && viaNav['x-doc-only'] === 'on',
    `xhr=${viaXhr['x-doc-only']}, nav=${viaNav['x-doc-only']}`);

  // E6: Initiator 도메인 조건 — 요청 출처가 매칭될 때만 적용
  const idProfile = (domain) => [
    baseProfile('p-id', 'Id',
      [{ kind: 'request-header', id: 'm1', name: 'X-From-Local', value: 'on', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '',
        conditions: { initiatorDomains: [domain] } }]),
  ];
  await seedProfiles(idProfile('127.0.0.1'));
  await pollSessionRuleCount(sw, 1);
  const matched = await fetchEchoHeaders(page, '/headers');
  await seedProfiles(idProfile('nomatch.example'));
  await new Promise((r) => setTimeout(r, 300));
  const unmatched = await fetchEchoHeaders(page, '/headers');
  record('E6: Initiator 도메인 조건 — 출처 도메인 매칭 시에만 적용',
    matched['x-from-local'] === 'on' && unmatched['x-from-local'] === undefined,
    `matched=${matched['x-from-local']}, unmatched=${unmatched['x-from-local']}`);

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

  // ---------- F. 탭 도메인 조건 · 규칙 자동 해제 (ADR 0010) ----------
  await page.close(); // 이전 섹션의 127.0.0.1 탭이 탭 도메인 매칭을 오염시키지 않도록
  const pageB = await context.newPage();
  await pageB.goto(`${origin}/?who=B`);

  // F1: 탭 도메인 조건 — 해당 도메인 탭이 있을 때만 적용, 이탈 시 자동 해제
  await seedProfiles([
    baseProfile('p-td', 'Td',
      [{ kind: 'request-header', id: 'm1', name: 'X-Tab-Domain', value: 'on', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '',
        conditions: { tabDomains: ['127.0.0.1'] } }]),
  ]);
  await pollSessionRuleCount(sw, 1);
  // 세션 규칙이 등록됐다(count=1)고 곧바로 요청에 적용된 건 아니다 — updateSessionRules
  // 해소와 실제 네트워크 반영 사이에 지연이 있고, 탭 도메인 규칙은 탭 추적까지 얽혀 더 크다.
  // 룰 카운트만 보고 한 번 fetch하면 그 지연에 걸려 헤더가 아직 안 붙는다(F1 흔들림).
  // 효과 자체(헤더 유무)를 폴링해 적용을 관측한다 — 매 시도가 no-store 새 요청이다.
  const onDomain = await pollUntil(
    () => fetchEchoHeaders(pageB, '/headers'),
    (h) => h['x-tab-domain'] === 'on',
  );
  await pageB.goto(`http://localhost:${port}/`);
  await pollSessionRuleCount(sw, 0); // 도메인 이탈 → 매칭 탭 없음 → 그 규칙만 미방출
  const offDomain = await pollUntil(
    () => fetchEchoHeaders(pageB, '/headers'),
    (h) => h['x-tab-domain'] === undefined,
  );
  record('F1: 탭 도메인 조건 — 도메인 안 적용, 이탈 시 자동 해제',
    onDomain['x-tab-domain'] === 'on' && offDomain['x-tab-domain'] === undefined,
    `on=${onDomain['x-tab-domain']}, off=${offDomain['x-tab-domain']}`);
  await pageB.goto(origin);

  // F3: 규칙 자동 해제 — 만료 알람이 그 규칙만 끄고 expiresAt을 소비, 프로필·배지는 유지
  await seedProfiles([
    baseProfile('p-time', 'Ti',
      [
        { kind: 'request-header', id: 'm1', name: 'X-Timed', value: 'on', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '',
          conditions: { expiresAt: Date.now() + 1500 } },
        { kind: 'request-header', id: 'm2', name: 'X-Stays', value: 'on', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
      ]),
  ]);
  await pollSessionRuleCount(sw, 2);
  const beforeExpiry = await fetchEchoHeaders(pageB, '/headers');

  const expiredMod = await pollUntil(
    () => sw.evaluate(async () => {
      const { state } = await chrome.storage.local.get('state');
      const p = state.profiles[0];
      return { active: p.active, enabled: p.modifications[0].enabled, conditions: p.modifications[0].conditions ?? null };
    }),
    (s) => s.enabled === false,
    20_000,
    250,
  );
  const afterExpiry = await pollUntil(
    () => fetchEchoHeaders(pageB, '/headers'),
    (h) => h['x-timed'] === undefined,
  );
  const expiredBadge = await sw.evaluate(() => chrome.action.getBadgeText({}));
  record('F3: 규칙 만료 → 그 규칙만 off + expiresAt 소비, 프로필·다른 규칙·배지 유지',
    beforeExpiry['x-timed'] === 'on' && beforeExpiry['x-stays'] === 'on'
      && expiredMod.enabled === false && expiredMod.active === true && expiredMod.conditions === null
      && afterExpiry['x-timed'] === undefined && afterExpiry['x-stays'] === 'on' && expiredBadge === 'T',
    `before=[${beforeExpiry['x-timed']},${beforeExpiry['x-stays']}], mod-off=${expiredMod.enabled === false}, active=${expiredMod.active}, cond=${JSON.stringify(expiredMod.conditions)}, after=[${afterExpiry['x-timed']},${afterExpiry['x-stays']}], badge="${expiredBadge}"`);

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
  record('G4: 활성 중 템플릿 편집 → 즉시 재실체화', editResult?.ok === true && /^edit-/.test(afterEdit ?? ''),
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

  await popup.getByRole('button', { name: 'Import…' }).click();
  await popup.getByLabel('Import JSON').fill(exportJson);
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
  await popup.getByLabel('Import JSON').fill('{broken json');
  await popup.getByRole('button', { name: 'Run import' }).click();
  const importError = await popup.getByRole('alert').textContent();
  const profileCountAfter = await sw.evaluate(async () => {
    const { state } = await chrome.storage.local.get('state');
    return state.profiles.length;
  });
  record('H2: 깨진 Import는 거부되고 상태가 불변', /JSON/i.test(importError ?? '') && profileCountAfter === 1,
    `error="${importError}", profiles=${profileCountAfter}`);

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
  await ensurePanelOpen(popup, 'Toggle backups');
  const restoreRow = popup.locator('li').filter({ hasText: 'profile' }).first();
  await restoreRow.getByRole('button', { name: 'Restore backup' }).click();
  await restoreRow.getByRole('button', { name: 'Confirm restore' }).click();

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
  await tabApp.getByRole('heading', { name: 'HeaderKit' }).waitFor();
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
  // 에디터는 초안에만 반영 — 폼 Save가 원자 저장한다 (ADR 0006)
  await tabApp.getByRole('button', { name: 'Save', exact: true }).click();
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
  const respHeader = await pageB.evaluate(async () => {
    const res = await fetch('/headers', { cache: 'no-store' });
    return res.headers.get('x-injected-resp');
  });
  record('K1: Response Header 수정이 실응답에 반영', respHeader === 'yes', `x-injected-resp=${respHeader}`);

  // K2: send-empty는 빈 문자열을, remove는 헤더 자체를 없앤다 (직접 대조)
  await seedProfiles([
    baseProfile('p-se', 'Se', [hdr({ id: 'm1', name: 'X-Empty-Test', value: '', emptyMeans: 'send-empty' })]),
  ]);
  await pollSessionRuleCount(sw, 1);
  const sentEmpty = await fetchEchoHeaders(pageB, '/headers');
  await seedProfiles([
    baseProfile('p-rm3', 'Rm', [hdr({ id: 'm1', name: 'X-Empty-Test', value: '', emptyMeans: 'remove' })]),
  ]);
  await new Promise((r) => setTimeout(r, 300));
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
  const appended = (await fetchEchoHeaders(pageB, '/headers'))['accept-language'];
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

  // L2: autocomplete 사용자 항목 등록 → datalist 제안에 노출
  await seedProfiles([
    baseProfile('p-ac', 'Ac', [hdr({ id: 'm1', name: '', value: 'v' })]),
  ]);
  await popup.reload();
  // 단일 셸(ADR 0005): 환경설정은 레일 화면 경유, datalist 검사는 프로필 화면 복귀 후
  await popup.getByRole('button', { name: 'Show preferences' }).click();
  await ensurePanelOpen(popup, 'Toggle preferences');
  await popup.getByLabel('New autocomplete header').fill('X-Team-Custom');
  await popup.getByRole('button', { name: 'Add autocomplete header' }).click();
  const savedCustom = await sw.evaluate(async () =>
    (await chrome.storage.local.get('state')).state.customHeaderNames,
  );
  await popup.getByRole('button', { name: 'Show profiles' }).click();
  // 이름 입력은 규칙 폼 안에만 있다 — Edit로 폼을 연다 (ADR 0006)
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
  await acNameInput.pressSequentially('X', { delay: 20 });
  await popup.getByRole('option').first().waitFor({ timeout: 5000 });
  const options = await popup.getByRole('option').allTextContents();
  record('L2a: autocomplete — 앱 팝업으로 제안, 사용자 항목 우선, 접두 필터',
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
  const AUTOCOMPLETE_CHUNK = '**/header-name-autocomplete-*.js';
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
      if (r.url().includes('header-name-autocomplete')) chunkRequests.push(r.url());
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
    await broken.getByRole('button', { name: 'Save', exact: true }).first().click();
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
  const cookieEcho = await pageB.evaluate(async () => {
    const res = await fetch('/setcookie', { cache: 'no-store' });
    return res.json();
  });
  record('M1: Request Cookie append가 Cookie 헤더에 반영', /smoke_sid=xyz/.test(cookieEcho.cookie ?? ''),
    `cookie=${cookieEcho.cookie}`);

  // M2: Set-Cookie 응답 헤더 주입
  await seedProfiles([
    baseProfile('p-sc', 'Sc',
      [modBase('set-cookie', { value: 'injected=1; Path=/', mode: 'append', emptyMeans: 'remove' })]),
  ]);
  await pollSessionRuleCount(sw, 1);
  // 브라우저는 fetch 응답의 Set-Cookie를 JS에 숨기므로, 실제 쿠키가 설정됐는지
  // document.cookie로 확인한다 (DNR이 append한 Set-Cookie를 브라우저가 처리).
  const docCookie = await pageB.evaluate(async () => {
    await fetch('/headers', { cache: 'no-store' });
    await new Promise((r) => setTimeout(r, 100));
    return document.cookie;
  });
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
  const overridden = (await pageB.evaluate(async () => {
    const res = await fetch('/setcookie', { cache: 'no-store' });
    return res.json();
  })).cookie;
  record('M2b: Cookie override가 기존 Cookie 헤더를 통째 교체', overridden === 'session=new',
    `cookie=${overridden}`);

  // M2c: Request Cookie remove는 기존 Cookie가 있어도 헤더를 제거한다
  await seedProfiles([
    baseProfile('p-ckr', 'Cr',
      [modBase('cookie', { name: 'anything', value: '', mode: 'override', emptyMeans: 'remove' })]),
  ]);
  await pollSessionRuleCount(sw, 1);
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
  const afterScOverride = await pageB.evaluate(async () => {
    await fetch('/withcookie', { cache: 'no-store' });
    await new Promise((r) => setTimeout(r, 100));
    return document.cookie;
  });
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
  const landed = await pageB.evaluate(async () => {
    const res = await fetch('/redir-src?q=1', { cache: 'no-store', redirect: 'follow' });
    return res.text();
  });
  record('M4: Redirect regex 캡처 그룹 치환', /\/redir-dst\?q=1/.test(landed), `landed=${landed}`);

  // M4b: 새 UI 경로(확장 편집)로 치환·패턴 편집 → 실제 리다이렉트 반영 (슬라이스 05)
  await popup.reload();
  await popup.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await popup.getByLabel('Redirect substitution').fill(`http://127.0.0.1:${port}/redir-alt\\1`);
  await popup.getByRole('button', { name: 'Save', exact: true }).click();
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
  await popup.getByRole('button', { name: 'Save', exact: true }).waitFor({ state: 'detached', timeout: 5000 });
  await popup.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await popup.getByLabel('Redirect pattern').fill(`^http://127\\.0\\.0\\.1:${port}/redir-two(.*)`);
  await popup.getByRole('button', { name: 'Save', exact: true }).click();
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
  // 커맨드 왕복(add/remove-profile) 후 렌더를 기다리며 이름 입력 값을 폴링한다.
  const pollProfileName = (test, timeoutMs = 5000) =>
    pollUntil(() => popup.getByLabel('Profile name').inputValue().catch(() => ''), test, timeoutMs, 100);

  // 첫 활성(Alpha)이 자동 선택 → 사이드바에서 Beta 선택으로 전환
  await popup.getByRole('button', { name: 'Select profile Beta' }).click();
  const shownName = await pollProfileName((v) => v === 'Beta');
  record('N1: 사이드바 선택 → 본문 프로필 전환', shownName === 'Beta', `name=${shownName}`);

  // N1b: 사이드바 항목이 on/off 상태를 반영한다 (aria-label = 도트와 같은 소스)
  const betaOff = await popup.getByRole('button', { name: 'Select profile Beta (off)' }).isVisible();
  await popup.getByRole('switch', { name: 'Toggle Beta' }).click();
  const betaOn = await popup
    .getByRole('button', { name: 'Select profile Beta (on)' })
    .waitFor({ timeout: 5000 })
    .then(() => true, () => false);
  record('N1b: 사이드바 도트/라벨이 프로필 on/off 반영', betaOff && betaOn, `off=${betaOff}, on=${betaOn}`);
  await popup.getByRole('switch', { name: 'Toggle Beta' }).click();

  // N2: + 새 프로필 → 생성된 프로필이 선택된다
  await popup.getByRole('button', { name: '+ New profile' }).click();
  const createdName = await pollProfileName((v) => /^Profile \d+$/.test(v));
  record('N2: 새 프로필 생성 → 즉시 선택', /^Profile \d+$/.test(createdName), `name=${createdName}`);

  // 삭제는 ⋯ 메뉴의 2단 확인(Delete → Delete?)으로 수행한다 (슬라이스 06)
  const deleteSelected = async () => {
    await popup.getByRole('button', { name: 'Profile menu', exact: true }).click();
    await popup.getByRole('menuitem', { name: 'Delete' }).click();
    await popup.getByRole('menuitem', { name: 'Delete?' }).click();
  };

  // N3: 선택 프로필 삭제 → 재조정 불변식(첫 활성 → 첫 프로필)으로 폴백
  await deleteSelected();
  const afterDeleteName = await pollProfileName((v) => v === 'Alpha');
  record('N3: 선택 프로필 삭제 → 첫 활성 프로필로 폴백', afterDeleteName === 'Alpha', `name=${afterDeleteName}`);

  // N4: 마지막 프로필까지 삭제 → 빈 상태 안내가 보인다
  await deleteSelected(); // Alpha 삭제 → Beta 선택(첫 프로필)
  await pollProfileName((v) => v === 'Beta');
  await deleteSelected(); // Beta 삭제 → 빈 목록
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

  // N6: 폼 조건 disclosure — 제외 도메인 추가 → 배지 표기 → 비우면 conditions 제거 (ADR 0010)
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
  await popup.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await popup.getByRole('button', { name: 'Conditions' }).click(); // disclosure 열기
  await popup.getByLabel('Excluded domains').fill('skip.example.com');
  await popup.getByRole('button', { name: 'Save', exact: true }).click();
  const condAdded = await pollFirstMod((m) => m?.conditions?.excludedDomains?.[0] === 'skip.example.com');
  await waitFormClosed();
  // 조건은 이제 배지 줄로 표시된다 (ui-refine 05) — 제외 도메인은 부정 접두(~)
  const condSummaryShown = await popup.getByText('~skip.example.com', { exact: true }).first().isVisible().catch(() => false);
  // 조건이 있는 규칙의 폼은 disclosure가 열린 채 시작 — 비우면 conditions 자체가 제거된다
  await popup.getByRole('button', { name: 'Edit', exact: true }).first().click();
  const disclosureOpen = await popup.getByLabel('Excluded domains').isVisible().catch(() => false);
  await popup.getByLabel('Excluded domains').fill('');
  await popup.getByRole('button', { name: 'Save', exact: true }).click();
  const condCleared = await pollFirstMod((m) => m !== null && m.conditions === undefined);
  await waitFormClosed();
  record('N6: 폼 조건 편집 — 추가·요약 표기·비우면 제거',
    condAdded?.conditions?.excludedDomains?.[0] === 'skip.example.com' && condSummaryShown
      && disclosureOpen && condCleared?.conditions === undefined,
    `added=${JSON.stringify(condAdded?.conditions)}, summary=${condSummaryShown}, open=${disclosureOpen}, cleared=${condCleared?.conditions === undefined}`);

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
  await popup.getByRole('button', { name: 'Edit', exact: true }).nth(1).click();
  // 폼은 한 번에 하나만 열린다
  const formCount = await popup.getByRole('combobox', { name: 'Mode' }).count();
  await pickOption(popup, 'Mode', 'Append');
  await popup.getByLabel('comment').fill('smoke comment');
  await popup.getByRole('button', { name: 'Save', exact: true }).click();
  const editedMod = await pollMod((m) => m?.mode === 'append' && m?.comment === 'smoke comment');
  record('N7: 규칙 폼 편집 — 모드·메모 원자 저장',
    formCount === 1 && editedMod?.mode === 'append' && editedMod?.comment === 'smoke comment',
    `forms=${formCount}, mode=${editedMod?.mode}, comment="${editedMod?.comment}"`);
  await waitFormClosed();

  // N7b: 빈 값 처리 — 폼에서 값 비우고 When empty=Send empty 저장
  await popup.getByRole('button', { name: 'Edit', exact: true }).nth(1).click();
  await popup.getByLabel('Value', { exact: true }).fill('');
  await pickOption(popup, 'When empty', 'Send empty');
  await popup.getByRole('button', { name: 'Save', exact: true }).click();
  const emptyMeansMod = await pollMod((m) => m?.emptyMeans === 'send-empty');
  record('N7b: 빈 값 → Send empty 저장 반영',
    emptyMeansMod?.emptyMeans === 'send-empty' && emptyMeansMod?.value === '',
    `emptyMeans=${emptyMeansMod?.emptyMeans}, value="${emptyMeansMod?.value}"`);

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
  await popup.mouse.up();
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

  // (d) 메뉴엔 이동 항목이 없다 — 복제·삭제만
  await popup.getByRole('button', { name: 'Select profile Bottom' }).click();
  await popup.getByRole('button', { name: 'Profile menu', exact: true }).click();
  await popup.getByRole('menuitem', { name: 'Duplicate' }).waitFor({ timeout: 5000 });
  const moveUpGone = (await popup.getByRole('menuitem', { name: 'Move up' }).count()) === 0;
  const moveDownGone = (await popup.getByRole('menuitem', { name: 'Move down' }).count()) === 0;
  await popup.keyboard.press('Escape');

  record('N8: 드래그·키보드 재정렬+Esc 취소(원순서·포커스 유지), 메뉴 이동 제거',
    winnerBefore === 'top-wins'
      && dragOrder[0]?.startsWith('Bottom') && dragWinner === 'bottom-wins'
      && kbdOrder[0]?.startsWith('Bottom') && kbdWinner === 'bottom-wins'
      && cancelKeptOrder && focusKept && moveUpGone && moveDownGone,
    `drag=[${dragOrder.join('|')}]/${dragWinner}, kbd=[${kbdOrder.join('|')}]/${kbdWinner}, cancel-kept=${cancelKeptOrder}, focus-kept=${focusKept}, menu-move-gone=[${moveUpGone},${moveDownGone}]`);

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
    () => tabApp.getByLabel('Profile name').inputValue().catch(() => ''),
    (v) => v === 'Gamma',
  );
  // 레일 전환은 fade-in(ui-refine 08)이라 대상 화면 렌더를 기다린다(즉시 isVisible 아님).
  await tabApp.getByRole('button', { name: 'Show backups' }).click();
  const backupsShown = await tabApp.getByRole('button', { name: 'Toggle backups' })
    .waitFor({ timeout: 5000 }).then(() => true, () => false);
  await tabApp.getByRole('button', { name: 'Show preferences' }).click();
  const prefsShown = await tabApp.getByRole('button', { name: 'Toggle preferences' })
    .waitFor({ timeout: 5000 }).then(() => true, () => false);
  await tabApp.getByRole('button', { name: 'Show profiles' }).click();
  record('N9: 탭 앱 셸 — 검색 필터·사이드바 선택·레일 전환',
    searchResult.length === 1 && searchResult[0]?.startsWith('Beta') && sidebarSelected === 'Gamma'
      && backupsShown && prefsShown,
    `search=[${searchResult.join('|')}], selected=${sidebarSelected}, backups=${backupsShown}, prefs=${prefsShown}`);

  // N10: 표면 동일성 — 탭 앱에서 규칙 폼으로 추가 → 실제 요청 반영 (ADR 0006 원자 저장)
  await tabApp.getByRole('button', { name: 'Add rule' }).click();
  await tabApp.getByLabel('Header name', { exact: true }).waitFor({ timeout: 5000 });
  await tabApp.getByLabel('Header name', { exact: true }).fill('X-From-Tab');
  await closeSuggestions(tabApp);
  await tabApp.getByLabel('Value', { exact: true }).fill('yes');
  await tabApp.getByRole('button', { name: 'Save', exact: true }).click();
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
  // 폼 열림 마커: 'When empty'는 값 종류에서 항상 노출 (Mode는 append 불가 시 숨김 — ui-refine 04)
  const kbFormOpened = await popup
    .getByRole('combobox', { name: 'When empty' })
    .waitFor({ timeout: 5000 })
    .then(() => true, () => false);
  await popup.getByRole('button', { name: 'Cancel' }).click();
  record('N11: 키보드 — 사이드바 전환·규칙 폼 열기',
    kbSwitched === 'KeyB' && kbFormOpened,
    `sidebar=${kbSwitched}, form=${kbFormOpened}`);

  // N12: 프로필 헤더 편집(이름·뱃지 라벨·뱃지 색) → 상태 반영 (매트릭스 행 14 마감)
  // 각 편집은 UI 반영을 기다린 뒤 다음 편집 — 전체 객체 전송 모델의 순차 편집 규약.
  await popup.getByLabel('Profile name').fill('Renamed');
  // 스토리지가 아닌 UI(프롭) 반영을 기다린다 — 다음 편집이 스테일 프롭으로 이름을 되돌리지 않게.
  await pollProfileName((v) => v === 'Renamed');
  await popup.getByLabel('Badge label').fill('RN');
  await pollUntil(() => popup.getByLabel('Badge label').inputValue(), (v) => v === 'RN', 5000, 100);
  await popup.getByLabel('Badge color').fill('#dc2626');
  // 최종 상태를 한 번에 단언 — 뒤 편집이 앞 편집을 덮었으면 여기서 잡힌다.
  const finalMeta = await pollUntil(
    () => sw.evaluate(async () => {
      const { state } = await chrome.storage.local.get('state');
      const p = state.profiles.find((x) => x.id === 'k-a');
      return { name: p?.name, shortLabel: p?.shortLabel, color: p?.color };
    }),
    (m) => m.name === 'Renamed' && m.shortLabel === 'RN' && m.color === '#dc2626',
    5000,
    100,
  );
  record('N12: 헤더 이름·뱃지 편집 → 상태 반영',
    finalMeta.name === 'Renamed' && finalMeta.shortLabel === 'RN' && finalMeta.color === '#dc2626',
    `name=${finalMeta.name}, badge=${finalMeta.shortLabel}, color=${finalMeta.color}`);

  // N12b: 팝업 사이드바 검색 필터 (ADR 0005 — 검색이 양 표면에서 동작)
  await popup.getByLabel('Search profiles').fill('Renamed');
  const popupSearch = await pollUntil(
    () => popup.locator('[aria-label^="Select profile"]').allTextContents(),
    (names) => names.length === 1,
  );
  await popup.getByLabel('Search profiles').fill('');
  record('N12b: 팝업 사이드바 검색 필터',
    popupSearch.length === 1 && popupSearch[0]?.startsWith('Renamed'),
    `search=[${popupSearch.join('|')}]`);

  // N13: Export 경로 — 실제 다운로드 캡처 → 페이로드 검증 (release r1 R-2)
  // 현재 상태: Renamed(k-a) + KeyB(k-b). 전체 선택 기본 → 2개 내보내기.
  await popup.getByRole('button', { name: 'Export…' }).click();
  const [exportDownload] = await Promise.all([
    popup.waitForEvent('download'),
    popup.getByRole('button', { name: /Export… \(2\)/ }).click(),
  ]);
  const exportPayload = JSON.parse(readFileSync(await exportDownload.path(), 'utf8'));
  record('N13: Export 다운로드 → 페이로드 검증',
    exportDownload.suggestedFilename() === 'headerkit-profiles.json'
      && exportPayload.headerkit === 1
      && exportPayload.profiles?.length === 2
      && exportPayload.profiles.some((p) => p.name === 'Renamed'),
    `file=${exportDownload.suggestedFilename()}, profiles=${exportPayload.profiles?.length}, names=[${exportPayload.profiles?.map((p) => p.name).join('|')}]`);

  // N14: ko 로케일 접근성 이름 — aria-label이 en/ko 카탈로그를 경유한다 (aria-label-i18n)
  // 상태: Renamed(k-a, 켬) + KeyB(k-b, 꺼짐)
  const popupKo = await context.newPage();
  await popupKo.goto(`chrome-extension://${extensionId}/popup.html?locale=ko`);
  const koToggle = await popupKo
    .getByRole('switch', { name: 'Renamed 켬/끔' })
    .waitFor({ timeout: 5000 })
    .then(() => true, () => false);
  const koMenu = await popupKo.getByRole('button', { name: '프로필 메뉴' }).isVisible().catch(() => false);
  const koSidebarItem = await popupKo.getByRole('button', { name: 'KeyB 프로필 선택 (끔)' }).isVisible().catch(() => false);
  const koRowToggle = await popupKo
    .getByRole('button', { name: '편집' })
    .first()
    .isVisible()
    .catch(() => false);
  // 아이콘 버튼(ui-refine 03)의 ko aria — 삭제 아이콘이 카탈로그 경유 이름을 갖는다
  const koDeleteIcon = (await popupKo.getByRole('button', { name: '삭제', exact: true }).count()) > 0;
  await popupKo.close();
  record('N14: ko 접근성 이름 — aria 카탈로그 경유',
    koToggle && koMenu && koSidebarItem && koRowToggle && koDeleteIcon,
    `toggle=${koToggle}, menu=${koMenu}, sidebar=${koSidebarItem}, row=${koRowToggle}, delete-icon=${koDeleteIcon}`);

  // N14b: 조건 편집의 ko 라벨 — Initiator 조건이 '요청 출처 도메인'으로 뜬다 (rule-model-trim 02).
  // 이 변경의 목적은 "요청 보낸 쪽 vs 보고 있는 탭"의 **구별**이라, 새 라벨 존재만으로는
  // 목적 달성을 못 본다 — 대조 대상인 '탭 도메인'이 그대로인지, 옛 라벨이 필드 라벨
  // 자리로 남지 않았는지 함께 건다.
  const condKo = await context.newPage();
  await condKo.goto(`chrome-extension://${extensionId}/popup.html?locale=ko`);
  const condKoEdit = condKo.getByRole('button', { name: '편집' }).first();
  await condKoEdit.waitFor({ timeout: 5000 });
  await condKoEdit.click();
  // 토글을 그냥 누르면 "기본은 닫힘"에 기대게 된다 — 조건이 붙은 규칙의 폼은 열린 채
  // 시작하므로(N6), 같은 클릭이 패널을 닫아 아래 단언이 통째로 무너진다.
  await ensurePanelOpen(condKo, '조건');
  const initiatorKo = await condKo
    .getByLabel('요청 출처 도메인', { exact: true })
    .waitFor({ timeout: 5000 })
    .then(() => true, () => false);
  // 옛 라벨은 필드 라벨 자리로만 되살아날 수 있다 — 페이지 전역 문자열 검색은 스키마
  // 용어 initiatorDomains가 어디든 렌더되면 오탐이라, 라벨 스코프로 좁혀 정확히 건다.
  const oldInitiatorGone = (await condKo.getByLabel('Initiator 도메인', { exact: true }).count()) === 0;
  const tabDomainKept = await condKo
    .getByLabel('탭 도메인', { exact: true })
    .waitFor({ timeout: 5000 })
    .then(() => true, () => false);
  await condKo.close();
  record('N14b: ko 조건 라벨 — 요청 출처 도메인(옛 라벨 부재) + 탭 도메인 유지',
    initiatorKo && oldInitiatorGone && tabDomainKept,
    `initiator=${initiatorKo}, old-gone=${oldInitiatorGone}, tab=${tabDomainKept}`);

  // N15: 규칙 단위 URL 필터 (ADR 0007/0008) — contains(비정규식)와 regex 두 방식 모두
  // 매칭 URL에만 적용되고, 무스코프 규칙은 전역이며, 프로필 필터는 건드리지 않는다.
  // 상태: Renamed(k-a, 켬, X-K:1) + KeyB. 팝업은 Renamed 선택.
  // 1) 기존 규칙(X-K)에 contains 스코프(기본 방식) 부여 — 평문 부분 문자열
  await popup.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await popup.getByLabel('URL filter').fill('scope=1');
  await popup.getByRole('button', { name: 'Save', exact: true }).click();
  // 2) 무스코프 규칙(X-U) 추가
  await popup.getByRole('button', { name: 'Add rule' }).click();
  await popup.getByLabel('Header name', { exact: true }).fill('X-U');
  await closeSuggestions(popup);
  await popup.getByLabel('Value', { exact: true }).fill('u');
  await popup.getByRole('button', { name: 'Save', exact: true }).click();
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
  const scopedSummary = await popup.getByText(/scope=1.*→.*X-K/i).first().isVisible().catch(() => false);
  // 3) regex(고급) 방식으로 전환 — 실요청 검증
  await waitFormClosed();
  await popup.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await pickOption(popup, 'URL match type', 'Regex (advanced)');
  await popup.getByLabel('URL filter').fill(`127\\.0\\.0\\.1:${port}/headers\\?scope=2`);
  await popup.getByRole('button', { name: 'Save', exact: true }).click();
  const regexIn = await pollUntil(
    () => fetchEchoHeaders(pageB, '/headers?scope=2'),
    (h) => h['x-k'] === '1',
  );
  const regexOut = await fetchEchoHeaders(pageB, '/headers');
  // 4) 스코프 비우면 두 필드 모두 제거 → 어디서나 적용
  await waitFormClosed();
  await popup.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await popup.getByLabel('URL filter').fill('');
  await popup.getByRole('button', { name: 'Save', exact: true }).click();
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
  await popup.getByRole('button', { name: 'Conditions' }).click();
  const firstChip = popup.getByRole('button', { name: 'main_frame', exact: true });
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
  // 다중 선택: 두 번째 칩도 켜서 함께 저장된다
  await popup.getByRole('button', { name: 'script', exact: true }).click();
  await popup.getByRole('button', { name: 'Save', exact: true }).click();
  const pollChipConditions = (test) =>
    pollUntil(
      () => sw.evaluate(async () => {
        const { state } = await chrome.storage.local.get('state');
        return state.profiles[0]?.modifications[0]?.conditions ?? null;
      }),
      test,
    );
  const chipSaved = await pollChipConditions((c) => c?.resourceTypes?.length === 2);
  await waitFormClosed();
  // 해제: 첫 칩을 끄고 저장하면 배열에서 빠진다
  await popup.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await popup.getByRole('button', { name: 'main_frame', exact: true }).click();
  await popup.getByRole('button', { name: 'Save', exact: true }).click();
  const chipDeselected = await pollChipConditions((c) => c?.resourceTypes?.length === 1);
  record('N16: 칩 그룹 — 캡션 호버 비전파, 다중 토글 저장, 해제 반영',
    bgIdle === bgCaptionHover && bgChipHover !== bgIdle && pressedAfterClick === 'true'
      && chipSaved?.resourceTypes?.includes('main_frame') && chipSaved?.resourceTypes?.includes('script')
      && chipDeselected?.resourceTypes?.join() === 'script',
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
  // 툴팁은 키보드 포커스(focus-visible)에 열린다 — 프로그램적 focus()가 아니라 실제 Tab
  await popup.getByRole('checkbox').first().focus();
  await popup.keyboard.press('Tab');
  const tooltipOnFocus = await popup
    .getByRole('tooltip')
    .filter({ hasText: 'Edit' })
    .waitFor({ timeout: 5000 })
    .then(() => true, () => false);
  record('N17a: 행 액션 — 호버 시 표시 + 아이콘 툴팁(호버·포커스)',
    opacityIdle === '0' && opacityRowHover === '1' && tooltipOnHover && tooltipOnFocus,
    `idle=${opacityIdle}, row-hover=${opacityRowHover}, tooltip-hover=${tooltipOnHover}, tooltip-focus=${tooltipOnFocus}`);

  // 환경설정: 단축키 문구 없음, 기본 사전 비제거 pill, 사용자 항목만 X
  await popup.getByRole('button', { name: 'Show preferences' }).click();
  await ensurePanelOpen(popup, 'Toggle preferences');
  const hintGone = !(await popup.getByText(/chrome:\/\/extensions\/shortcuts/).isVisible().catch(() => false));
  const acceptPill = popup.locator('li').filter({ hasText: /^Accept$/ }).first();
  const stdShown = await acceptPill.waitFor({ timeout: 5000 }).then(() => true, () => false);
  const stdNoRemove = (await acceptPill.getByRole('button').count()) === 0;
  // 사용자 항목은 시드로 초기화됐으므로 여기서 추가해 X 버튼을 확인한다
  await popup.getByLabel('New autocomplete header').fill('X-Team-Custom');
  await popup.getByRole('button', { name: 'Add autocomplete header' }).click();
  const userRemovable = await popup
    .getByRole('button', { name: 'Remove X-Team-Custom' })
    .waitFor({ timeout: 5000 })
    .then(() => true, () => false);
  await popup.getByRole('button', { name: 'Show profiles' }).click();
  record('N17b: 환경설정 — 단축키 문구 제거, 기본 사전 비제거, 사용자 항목만 제거 가능',
    hintGone && stdShown && stdNoRemove && userRemovable,
    `hint-gone=${hintGone}, std=${stdShown}, std-no-x=${stdNoRemove}, user-x=${userRemovable}`);

  // N18: 저장 검증 + 폼 정리 + 폼 키보드 (ui-refine 04)
  await seedProfiles([
    baseProfile('p-form', 'Form',
      [{ kind: 'request-header', id: 'm1', name: 'X-Base', value: '1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' }]),
  ]);
  await popup.reload();

  // a: 빈 헤더 이름 Save → 인라인 오류 + aria-invalid + 저장 안 됨(폼 유지)
  await popup.getByRole('button', { name: 'Add rule' }).click();
  const nameInput = popup.getByLabel('Header name', { exact: true }).first();
  // 클릭 직후 한 번만 읽으면 레이스다 — 헤더 이름 입력은 지연 청크가 도착하며 한 번
  // 교체되고(ui-polish 03), 그 찰나에 읽으면 이전 노드나 body를 보게 된다. 사용자에게
  // 보이는 계약은 "폼이 열리면 이 필드에 포커스가 있다"이므로 정착을 기다려 단언한다.
  const autofocused = await popup
    .waitForFunction(
      () => {
        const el = document.querySelector('input[aria-label="Header name"]');
        return !!el && document.activeElement === el;
      },
      null,
      { timeout: 500 },
    )
    .then(() => true, () => false);
  await popup.getByRole('button', { name: 'Save', exact: true }).click();
  const inlineError = await popup.getByText('Required.', { exact: true }).first()
    .waitFor({ timeout: 5000 }).then(() => true, () => false);
  const ariaInvalid = await nameInput.getAttribute('aria-invalid');
  const modsAfterBlockedSave = await sw.evaluate(async () => {
    const { state } = await chrome.storage.local.get('state');
    return state.profiles[0].modifications.length;
  });
  record('N18a: 빈 필수 필드 Save 차단 — 인라인 오류·aria-invalid·스토리지 불변·autofocus',
    autofocused && inlineError && ariaInvalid === 'true' && modsAfterBlockedSave === 1,
    `autofocus=${autofocused}, error=${inlineError}, aria-invalid=${ariaInvalid}, mods=${modsAfterBlockedSave}`);

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
  const keptKinds = ['Request header', 'Response header', 'Request cookie', 'Response cookie', 'Redirect'];
  record('N18f: Type 셀렉트 옵션 — CSP 없음, 헤더 계열·쿠키·Redirect 유지',
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
  await popup.getByRole('button', { name: 'Save', exact: true }).click();
  const redirectErrors = await popup.getByText('Required.', { exact: true }).count();
  await pickOption(popup, 'Type', 'Response cookie');
  const setCookieSelected = await popup.getByRole('combobox', { name: 'Type', exact: true }).textContent();
  record('N18b: 종류 전환 시 스테일 오류 없음 + 응답 쿠키·쿠키 이름 라벨 + Redirect 2필드 오류',
    cookieLabelShown && noStaleError && redirectErrors === 2 && /Response cookie/.test(setCookieSelected ?? ''),
    `cookie-label=${cookieLabelShown}, no-stale=${noStaleError}, redirect-errors=${redirectErrors}, kind="${(setCookieSelected ?? '').trim()}"`);

  // c: 모드 숨김 — 비허용 요청 헤더 이름이면 Mode 미노출, 허용(Accept)이면 노출
  await pickOption(popup, 'Type', 'Request header');
  await popup.getByLabel('Header name', { exact: true }).fill('X-Custom');
  await closeSuggestions(popup);
  const modeHidden = (await popup.getByRole('combobox', { name: 'Mode' }).count()) === 0;
  await popup.getByLabel('Header name', { exact: true }).fill('Accept');
  await closeSuggestions(popup);
  const modeShown = (await popup.getByRole('combobox', { name: 'Mode' }).count()) === 1;
  // d: regex 선택 시 placeholder 분기
  await pickOption(popup, 'URL match type', 'Regex (advanced)');
  const regexPlaceholder = await popup.getByLabel('URL filter').getAttribute('placeholder');
  record('N18c: 모드 미노출/노출 + regex placeholder 분기',
    modeHidden && modeShown && /\^https/.test(regexPlaceholder ?? ''),
    `hidden=${modeHidden}, shown=${modeShown}, placeholder="${regexPlaceholder}"`);

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
  await popup.getByRole('button', { name: 'Add rule' }).click();
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
  const formStillOpen = await popup.getByRole('button', { name: 'Save', exact: true }).isVisible().catch(() => false);
  // 폼 본문의 Esc는 폼을 닫는다
  await popup.keyboard.press('Escape');
  const escClosed = await popup.getByRole('button', { name: 'Save', exact: true })
    .waitFor({ state: 'detached', timeout: 5000 }).then(() => true, () => false);
  record('N18d: Cmd/Ctrl+Enter 저장 + Select 팝업 Esc는 폼 유지 + 폼 Esc는 닫힘',
    kbdSaved === true && popupClosedFormKept === 0 && formStillOpen && escClosed,
    `saved=${kbdSaved}, popup-only-close=${popupClosedFormKept === 0 && formStillOpen}, form-esc-closed=${escClosed}`);

  // N19: 조건 배지 줄 + 빈 상태 CTA (ui-refine 05)
  const expiryMs = Date.now() + 3_600_000;
  await seedProfiles([
    baseProfile('p-badge', 'Badges', [
      { kind: 'request-header', id: 'm1', name: 'X-Plain', value: '1', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '' },
      { kind: 'request-header', id: 'm2', name: 'X-Cond', value: '2', enabled: true, mode: 'override', emptyMeans: 'remove', comment: '',
        conditions: { requestMethods: ['post'], excludedDomains: ['cdn.example.com'], expiresAt: expiryMs } },
    ]),
  ]);
  await popup.reload();
  const rows = popup.locator('.group').filter({ has: popup.getByRole('button', { name: 'Edit', exact: true }) });
  // 조건 없는 행의 높이 = 내부 텍스트(제목+요약) + 세로 패딩(py-2=16px). 배지 줄이
  // 없으므로 높이에 0을 기여해야 한다 — '기존 높이 유지'의 실질 불변식(AC2).
  const plainRowH = await rows.nth(0).evaluate((el) => el.getBoundingClientRect().height);
  const plainContentH = await rows.nth(0).locator('.min-w-0').evaluate((el) => el.getBoundingClientRect().height);
  const condRowH = await rows.nth(1).evaluate((el) => el.getBoundingClientRect().height);
  const plainHeightIsContentOnly = Math.abs(plainRowH - (plainContentH + 16)) <= 1.5;
  // 조건 있는 행에만 배지 노출: POST(메서드), ~cdn(제외, 부정 접두), 만료(시계)
  const methodBadge = await popup.getByText('POST', { exact: true }).isVisible().catch(() => false);
  const excludeBadge = await popup.getByText('~cdn.example.com', { exact: true }).isVisible().catch(() => false);
  const plainHasNoBadge = (await rows.nth(0).getByText('POST', { exact: true }).count()) === 0;
  record('N19a: 조건 배지 줄 — 값 배지·제외 부정 접두, 조건 없는 행은 배지 줄이 높이에 0 기여',
    methodBadge && excludeBadge && plainHasNoBadge && plainHeightIsContentOnly && plainRowH < condRowH,
    `method=${methodBadge}, exclude=${excludeBadge}, plain-no-badge=${plainHasNoBadge}, plainH=${Math.round(plainRowH)}=content(${Math.round(plainContentH)})+16?${plainHeightIsContentOnly}, condH=${Math.round(condRowH)}`);

  // 빈 상태: 규칙 0개 프로필 → 안내 + CTA로 폼 열림
  await popup.getByRole('button', { name: '+ New profile' }).click();
  await pollProfileName((v) => /^Profile \d+$/.test(v));
  const emptyHintShown = await popup.getByText('No rules yet. Add one below.').isVisible().catch(() => false);
  // 빈 상태 CTA(Add rule)를 누르면 규칙 폼이 열린다
  await popup.getByRole('button', { name: 'Add rule' }).click();
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
  await popup.getByRole('button', { name: 'Add rule' }).click();
  await popup.getByLabel('Header name', { exact: true }).fill('X-M3');
  await closeSuggestions(popup);
  await popup.getByLabel('Value', { exact: true }).fill('3');
  await popup.getByRole('button', { name: 'Save', exact: true }).click();
  const afterAdd = await pollSessionRuleCount(sw, 3).then(() => true, () => false);
  // 규칙 삭제(행 exit): 삭제 → 실요청 반영 + AnimatePresence exit가 상태를 막지 않음
  await popup.getByRole('button', { name: 'Delete', exact: true }).first().click();
  const afterDelete = await pollSessionRuleCount(sw, 2).then(() => true, () => false);
  // 레일 화면 전환(cross-fade) 후 대상 화면이 뜬다
  await popup.getByRole('button', { name: 'Show preferences' }).click();
  const prefsAfterFade = await popup.getByRole('button', { name: 'Toggle preferences' })
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
    const button = await transformStates(page, page.getByRole('button', { name: 'Add rule' }));
    const chip = await transformStates(page, page.getByRole('button', { name: 'New profile' }));
    await page.getByRole('button', { name: 'Profile menu', exact: true }).click();
    // 항목은 열릴 때 순차 등장한다(ui-polish 05) — 그 y 애니메이션이 도는 중에 읽으면
    // "rest"가 진행 중 변형을 잡는다. 스태거가 끝날 때까지 기다린 뒤 누름·호버를 본다.
    await page.getByRole('menuitem', { name: 'Duplicate' }).first().waitFor({ timeout: 5000 });
    await page.waitForTimeout(menuStaggerTotalMs(await page.getByRole('menuitem').count()) + 150);
    const item = await transformStates(page, page.getByRole('menuitem', { name: 'Duplicate' }));
    return { button, chip, icon, item };
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
  record('N21b: 감도 대조 — 버튼·칩·아이콘버튼·메뉴항목이 호버·누름에 변형한다',
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
  record('N21c: reduced-motion — 네 표면 모두 호버·누름에 transform이 없다',
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

  // 넘치지 않으면 스크롤바가 DOM에 아예 없어야 한다 — 트랙을 기본 노출(opacity-60)로 둔
  // 근거가 이것이다. 보이면 곧 "넘치는 내용이 있다"는 신호여야 어포던스가 성립한다.
  await seedProfiles([baseProfile('p-short', 'Short', manyRules.slice(0, 1))]);
  await popup.reload();
  await popup.getByRole('button', { name: 'Add rule' }).waitFor({ timeout: 5000 });
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

  // N23: 메뉴 순차 등장 + 삭제 2단 확인 라벨 전환 (ui-polish 05, ADR 0012).
  // 관측 창이 한 프레임이라 Playwright 왕복으로는 못 잡는다 — 페이지 안에 관측자를
  // 심어 두고, 대상이 나타난 **다음 애니메이션 프레임**의 계산 opacity를 찍는다.
  // 대기 시간은 motion-tokens의 상수에서 온다(테스트가 자기 숫자를 들지 않는다).
  /**
   * 메뉴가 삽입된 직후부터 리드 항목이 정착(≈1)할 때까지 **매 프레임** 항목 opacity를 모은다.
   *
   * 예전엔 삽입 감지 후 rAF **한 번**만 표본했는데, 그 첫 프레임엔 motion의 애니메이션이
   * 아직 안 붙어 전부 초기값 0으로 읽혔다([0,0]). 그러면 "앞 항목이 뒤보다 진행돼 있다"는
   * 순차 단언이 0 > 0 = false로 헛돌아 간헐 실패했다(N23a 흔들림). 프레임을 모으면 스태거가
   * 실제로 보이는 중간 프레임을 골라낼 수 있어 한 프레임의 타이밍에 기대지 않는다.
   */
  const menuStaggerFrames = async (page, openMenu) => {
    await page.evaluate(() => {
      window.__menuFrames = null;
      const observer = new MutationObserver(() => {
        const menu = document.querySelector('[role="menu"]');
        if (!menu) return;
        observer.disconnect();
        const frames = [];
        const read = () =>
          [...menu.querySelectorAll('[role="menuitem"]')].map((el) => Number(getComputedStyle(el).opacity));
        let n = 0;
        const tick = () => {
          const frame = read();
          frames.push(frame);
          n += 1;
          // 리드 항목이 정착했거나 40프레임(≈0.66s)이면 멈춘다 — reduced-motion은 처음부터
          // [1,…]이라 첫 프레임에 바로 멈춘다.
          if ((frame[0] ?? 1) >= 0.99 || n >= 40) {
            window.__menuFrames = frames;
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 5000);
    });
    await openMenu();
    const observed = await page
      .waitForFunction(() => window.__menuFrames !== null, null, { timeout: 5000 })
      .then(() => true, () => false);
    return observed ? page.evaluate(() => window.__menuFrames) : null;
  };

  const firstFrameLabelOpacity = async (page, labelText, act) => {
    await page.evaluate((text) => {
      window.__labelProbe = null;
      const observer = new MutationObserver(() => {
        const el = [...document.querySelectorAll('[role="menuitem"], [role="menuitem"] *')].find(
          (node) => node.children.length === 0 && node.textContent?.trim() === text,
        );
        if (!el) return;
        observer.disconnect();
        requestAnimationFrame(() => {
          window.__labelProbe = Number(getComputedStyle(el).opacity);
        });
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      setTimeout(() => observer.disconnect(), 3000);
    }, labelText);
    await act();
    const observed = await page
      .waitForFunction(() => window.__labelProbe !== null, null, { timeout: 3000 })
      .then(() => true, () => false);
    return observed ? page.evaluate(() => window.__labelProbe) : null;
  };

  const openProfileMenu = (page) => () =>
    page.getByRole('button', { name: 'Profile menu', exact: true }).click();

  await seedProfiles([baseProfile('p-menu', 'Kebab', [])]);

  // N23a: 순차 등장 — 기본 모션에서는 첫 프레임에 아직 덜 나온 항목이 있고(대조),
  // reduced-motion에서는 처음부터 전부 완성돼 있다(부재). 대조를 먼저 둬 지연 로드된
  // features가 그 시점에 도착했음을 근거로 남긴다(티켓 04와 같은 이유).
  await popup.emulateMedia({ reducedMotion: null });
  await popup.reload();
  await popup.getByRole('button', { name: 'Profile menu', exact: true }).waitFor({ timeout: 5000 });
  await popup.waitForTimeout(700);
  const staggerFrames = await menuStaggerFrames(popup, openProfileMenu(popup));
  const menuItemCount = await popup.getByRole('menuitem').count();
  const settleMs = menuStaggerTotalMs(menuItemCount) + 200;
  await popup.waitForTimeout(settleMs);
  const staggerSettled = await popup.evaluate(() =>
    [...document.querySelectorAll('[role="menuitem"]')].map((el) => Number(getComputedStyle(el).opacity)),
  );
  await popup.keyboard.press('Escape');

  await popup.emulateMedia({ reducedMotion: 'reduce' });
  await popup.reload();
  await popup.getByRole('button', { name: 'Profile menu', exact: true }).waitFor({ timeout: 5000 });
  await popup.waitForTimeout(700);
  const stillFrames = await menuStaggerFrames(popup, openProfileMenu(popup));
  // "앞 항목이 뒤 항목보다 더 진행돼 있다"까지 봐야 **순차**를 단언한 것이다. 단순히 "1 미만인
  // 항목이 있다"로는 stagger를 0으로 만들어 전부 동시에 fade해도 통과한다. 모은 프레임 중
  // **하나라도** 엄격 내림차순이면 스태거가 관측된 것이다 — 한 프레임의 타이밍에 안 기댄다.
  const isSequential =
    Array.isArray(staggerFrames) &&
    staggerFrames.some((f) => f.length > 1 && f.every((o, i) => i === 0 || f[i - 1] > o));
  // reduced-motion: 어느 프레임에서도 부분값이 없다(처음부터 전부 완성).
  const reducedComplete =
    Array.isArray(stillFrames) &&
    stillFrames.length > 0 &&
    stillFrames.every((f) => f.length > 0 && f.every((o) => o === 1));
  record('N23a: 메뉴 순차 등장 — 앞 항목이 뒤보다 앞서고, reduced-motion은 즉시 완성',
    isSequential &&
      staggerSettled.length > 0 && staggerSettled.every((o) => o === 1) &&
      reducedComplete,
    `sequential=${isSequential}(${staggerFrames?.length}프레임), settled=${JSON.stringify(staggerSettled)}, reduced-complete=${reducedComplete} (항목 ${menuItemCount}, 창 ${settleMs}ms)`);

  // N23b: 삭제 2단 확인 라벨 — 첫 클릭은 메뉴를 열어 둔 채 라벨만 바꾼다.
  const reducedLabel = await firstFrameLabelOpacity(popup, 'Delete?', () =>
    popup.getByRole('menuitem', { name: 'Delete', exact: true }).click());
  const reducedMenuOpen = await popup.getByRole('menuitem').count();
  await popup.keyboard.press('Escape');

  await popup.emulateMedia({ reducedMotion: null });
  await popup.reload();
  await popup.getByRole('button', { name: 'Profile menu', exact: true }).waitFor({ timeout: 5000 });
  await popup.waitForTimeout(700);
  await popup.getByRole('button', { name: 'Profile menu', exact: true }).click();
  await popup.getByRole('menuitem', { name: 'Delete', exact: true }).waitFor({ timeout: 5000 });
  await popup.waitForTimeout(settleMs);
  const livelyLabel = await firstFrameLabelOpacity(popup, 'Delete?', () =>
    popup.getByRole('menuitem', { name: 'Delete', exact: true }).click());
  record('N23b: 삭제 확인 라벨 — 기본 모션은 fade 중, reduced-motion은 즉시 완성(메뉴 유지)',
    reducedLabel === 1 && typeof livelyLabel === 'number' && livelyLabel < 1 && reducedMenuOpen === 2,
    `reduced=${reducedLabel}, lively=${livelyLabel}, reduced-menu-items=${reducedMenuOpen}`);

  // N23c: 메뉴 조작 기능 회귀 없음 — 키보드 이동·Esc·항목 선택.
  await popup.keyboard.press('Escape');
  await popup.reload();
  await popup.getByRole('button', { name: 'Profile menu', exact: true }).waitFor({ timeout: 5000 });
  await popup.getByRole('button', { name: 'Profile menu', exact: true }).click();
  await popup.getByRole('menuitem').first().waitFor({ timeout: 5000 });
  await popup.keyboard.press('ArrowDown');
  await popup.waitForTimeout(150);
  // Base UI 메뉴는 aria-activedescendant 방식이라 activeElement는 팝업 컨테이너다 —
  // 하이라이트는 항목의 data-highlighted로 읽어야 한다(popupItem 토큰이 쓰는 그 속성).
  const highlighted = await popup.evaluate(
    () => document.querySelector('[role="menuitem"][data-highlighted]')?.textContent?.trim() ?? '');
  await popup.keyboard.press('Escape');
  const closedByEsc = await popup
    .getByRole('menuitem')
    .first()
    .waitFor({ state: 'detached', timeout: 3000 })
    .then(() => true, () => false);
  await popup.getByRole('button', { name: 'Profile menu', exact: true }).click();
  await popup.getByRole('menuitem', { name: 'Duplicate', exact: true }).click();
  const duplicated = await sw.evaluate(async () =>
    (await chrome.storage.local.get('state')).state.profiles.length);
  record('N23c: 메뉴 기능 회귀 없음 — 키보드 이동·Esc 닫기·항목 선택',
    highlighted.length > 0 && closedByEsc && duplicated === 2,
    `highlighted="${highlighted}", esc-closed=${closedByEsc}, profiles=${duplicated}`);

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
    await page.getByRole('button', { name: 'Add rule' }).waitFor({ timeout: 5000 });
    return page;
  };
  const fillNewRule = async (page, name) => {
    await page.getByRole('button', { name: 'Add rule' }).click();
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
    await page.getByRole('button', { name: 'Save', exact: true }).click();
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
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const recovered = await page
      .getByRole('button', { name: 'Save', exact: true })
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
    await page.getByRole('button', { name: 'Add rule' }).click();
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
  await popup.getByRole('button', { name: 'Add rule' }).waitFor({ timeout: 5000 });
  await popup.waitForTimeout(700);
  const livelyClose = await measureFormRemoval(popup, { via: 'cancel' });
  const livelySave = await measureFormRemoval(popup, { via: 'save' });
  await popup.emulateMedia({ reducedMotion: 'reduce' });
  await popup.reload();
  await popup.getByRole('button', { name: 'Add rule' }).waitFor({ timeout: 5000 });
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

  // N25: URL 매치 방식 셀렉트 폭 고정 (ui-polish 07, stories 1·2·3).
  // 폭 안정성만 보면 폭을 좁게 잡아 라벨이 잘려도 통과한다 — 두 단언을 함께 건다.
  // 로케일마다 라벨 길이가 달라 en에서만 재면 ko 회귀를 놓치므로 양쪽을 순회한다.
  const measureMatchTypeWidths = async (page, matchLabel, editLabel, probeAfterPick) => {
    await page.getByRole('button', { name: editLabel, exact: true }).first().click();
    const trigger = page.getByRole('combobox', { name: matchLabel, exact: true });
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
    return { options, rows, popupAtLeastAnchor, probes };
  };

  await seedProfiles([
    baseProfile('p-width', 'Width', [
      { kind: 'request-header', id: 'm1', name: 'Accept', value: 'v', enabled: true, mode: 'override',
        emptyMeans: 'remove', comment: '', urlFilter: 'example.com' },
    ]),
  ]);
  await popup.reload();
  // 폭이 고정이면 옆의 패턴 입력도 자리를 지킨다 — 사용자가 말한 증상이 이것이다.
  const widthEn = await measureMatchTypeWidths(popup, 'URL match type', 'Edit', () =>
    popup
      .getByLabel('URL filter')
      .first()
      .evaluate((el) => Number(el.getBoundingClientRect().left.toFixed(2))),
  );
  const patternLeftEdges = widthEn.probes;
  await popup.getByRole('button', { name: 'Cancel', exact: true }).click();

  const widthPopupKo = await context.newPage();
  await widthPopupKo.setViewportSize({ width: 760, height: 580 });
  await widthPopupKo.goto(`chrome-extension://${extensionId}/popup.html?locale=ko`);
  await widthPopupKo.getByRole('button', { name: '규칙 추가' }).waitFor({ timeout: 5000 });
  const widthKo = await measureMatchTypeWidths(widthPopupKo, 'URL 매치 방식', '편집');
  await widthPopupKo.close();

  const stableWidth = (rows) =>
    rows.length > 1 &&
    Math.max(...rows.map((r) => r.width)) - Math.min(...rows.map((r) => r.width)) <= 0.5;
  // 노드를 못 찾으면(-1) 통과시키지 않는다 — R-2가 지키려는 단 하나의 단언이라
  // 공허하게 참이 되면 안 된다.
  const noClipping = (rows) =>
    rows.length > 0 && rows.every((r) => r.scroll >= 0 && r.scroll <= r.client + 1);
  const patternStable =
    patternLeftEdges.length > 1 &&
    Math.max(...patternLeftEdges) - Math.min(...patternLeftEdges) <= 0.5;
  record('N25: 매치 방식 셀렉트 — en/ko 모든 옵션에서 폭 동일·라벨 미절단, 패턴 입력 고정',
    stableWidth(widthEn.rows) && noClipping(widthEn.rows) &&
      stableWidth(widthKo.rows) && noClipping(widthKo.rows) &&
      widthEn.popupAtLeastAnchor && widthKo.popupAtLeastAnchor && patternStable,
    `en 폭=${[...new Set(widthEn.rows.map((r) => r.width))].join('/')} 미절단=${noClipping(widthEn.rows)}, ` +
    `ko 폭=${[...new Set(widthKo.rows.map((r) => r.width))].join('/')} 미절단=${noClipping(widthKo.rows)}, ` +
    `패턴 좌변=${[...new Set(patternLeftEdges)].join('/')}, 팝업≥앵커=${widthEn.popupAtLeastAnchor && widthKo.popupAtLeastAnchor}`);

  // N26: 검증 실패 시 첫 누락 입력으로 포커스 (ui-polish 08, stories 12~16).
  // 저장 전에 포커스를 일부러 딴 곳(종류 셀렉트)에 둔다 — 폼 열림 autoFocus가 남아
  // 있는 상태로 재면 "이동했다"가 아니라 "원래 거기 있었다"를 보게 된다.
  const focusAfterBlockedSave = async (page, { kind, expected, setup }) => {
    await page.getByRole('button', { name: 'Add rule' }).click();
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
    await page.getByRole('button', { name: 'Save', exact: true }).click();
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
    // story 13: 포커스만이 아니라 **바로 타이핑**돼야 한다. 버튼에 포커스가 가면
    // 포커스 단언은 통과하지만 여기서 걸린다.
    let typeable = false;
    if (onTarget) {
      await page.keyboard.type('zz');
      typeable = (await target.inputValue().catch(() => '')) === 'zz';
    }
    const errorShown = (await page.getByText('Required.', { exact: true }).count()) > 0;
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.waitForTimeout(rowSettleMs());
    return { onTarget, typeable, errorShown };
  };

  await seedProfiles([baseProfile('p-focus', 'Focus', [])]);
  await popup.reload();
  await popup.getByRole('button', { name: 'Add rule' }).waitFor({ timeout: 5000 });

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
      expected: (page) => page.getByLabel('Redirect substitution', { exact: true }),
    }),
  };
  const allOnTarget = Object.values(focusCases).every((r) => r.onTarget);
  const allTypeable = Object.values(focusCases).every((r) => r.typeable);
  const allErrorsShown = Object.values(focusCases).every((r) => r.errorShown);
  record('N26: 검증 차단 시 첫 누락 입력으로 포커스 — 종류별 매핑·즉시 타이핑·오류 유지',
    allOnTarget && allTypeable && allErrorsShown,
    Object.entries(focusCases)
      .map(([k, r]) => `${k}=${r.onTarget ? (r.typeable ? 'ok' : '포커스만') : 'MISS'}`)
      .join(' ') + `, 오류표시=${allErrorsShown}`);

  // N27: 아코디언 헤더 전체가 클릭 대상 (ui-polish 09, stories 24~27).
  // 예전에는 오른쪽 끝 아이콘 버튼만 눌렸다 — 제목·여백을 눌러도 같은 동작이어야 하고,
  // 그러면서 포커스 대상은 하나로 남아야 한다(Tab 정지가 늘면 키보드 사용자가 손해다).
  await popup.reload();
  await popup.getByRole('button', { name: 'Show preferences' }).click();
  const prefsHeader = popup.getByRole('button', { name: 'Toggle preferences', exact: true });
  // 헤더가 버튼이 아니게 되는 것이 이 테스트가 잡으려는 회귀다 — waitFor가 던져
  // 스위트를 중단시키면 FAIL로 기록되지 않는다(N22c·N24c에서 이미 겪었다).
  const headerIsButton = await prefsHeader
    .waitFor({ timeout: 5000 })
    .then(() => true, () => false);

  const headerState = () =>
    prefsHeader.evaluate((el) => ({
      expanded: el.getAttribute('aria-expanded'),
      // 헤더 안에 포커스 가능한 것이 또 있으면 Tab 정지가 늘어난다.
      innerFocusables: el.querySelectorAll('button, a, input, select, textarea, [tabindex]').length,
      // 아이콘은 트리거 안의 시각 표시로만 남는다 — 회전으로 상태를 보인다.
      // Tailwind v4의 rotate-180은 `transform`이 아니라 CSS `rotate` 속성을 쓴다 —
      // transform만 읽으면 둘 다 'none'이라 회전 여부를 못 본다.
      iconRotate: el.querySelector('svg')
        ? getComputedStyle(el.querySelector('svg')).rotate
        : 'no-icon',
      // 클릭 대상이 정말 행 전체인지 — 부모 섹션 폭과 같아야 한다. 절대 px로 재면
      // 레이아웃이 바뀌었을 때 무엇을 보는지 알 수 없다.
      spansRow:
        Math.abs(
          el.getBoundingClientRect().width -
            (el.closest('section')?.getBoundingClientRect().width ?? 0),
        ) <= 1,
      // 폭만 넓히고 높이를 줄이면 "조준하지 않아도 된다"가 세로로는 나빠진다.
      // WCAG 2.5.8의 최소 타깃 24px.
      height: Math.round(el.getBoundingClientRect().height),
    })).catch(() => ({ expanded: 'missing', innerFocusables: -1, iconRotate: 'missing', spansRow: false, height: 0 }));

  // 패널은 이제 **열린 채로 시작한다** — 그래서 첫 상태가 expanded=true이고, 아래 세
  // 클릭은 닫힘→열림→닫힘으로 교대한다. 이 값을 하드코딩된 false로 두면 기본값이 바뀔 때
  // "토글이 동작한다"가 아니라 "처음이 닫힘이다"를 검사하는 테스트가 된다.
  const opened = await headerState();
  // 1) 제목 텍스트를 눌러 닫는다
  await popup.getByText('Preferences', { exact: true }).first().click().catch(() => {});
  await popup.waitForTimeout(250);
  const afterTitle = await headerState();
  // 2) 여백(아이콘 왼쪽)을 눌러 다시 연다
  // 클릭 지점을 아이콘의 **실제 사각형**에서 유도한다 — 매직 px로 잡으면 아이콘이
  // 커지거나 패딩이 바뀌었을 때 "여백"이 조용히 두 번째 아이콘 클릭이 된다.
  const geometry = await prefsHeader
    .evaluate((el) => {
      const header = el.getBoundingClientRect();
      const icon = el.querySelector('svg')?.getBoundingClientRect();
      if (!icon) return null;
      return {
        iconX: icon.x + icon.width / 2,
        iconY: icon.y + icon.height / 2,
        // 아이콘 왼쪽 가장자리와 제목 오른쪽 사이의 빈 구간 한가운데
        gapX: (icon.x + header.x + header.width * 0.55) / 2,
        gapY: header.y + header.height / 2,
        gapIsLeftOfIcon: (icon.x + header.x + header.width * 0.55) / 2 < icon.x - 2,
      };
    })
    .catch(() => null);
  const clickedGap = geometry !== null && geometry.gapIsLeftOfIcon;
  if (clickedGap) {
    await popup.mouse.click(geometry.gapX, geometry.gapY);
    await popup.waitForTimeout(250);
  }
  const afterGap = await headerState();
  // 3) 아이콘 자체를 눌러도 같은 동작
  if (geometry) {
    await popup.mouse.click(geometry.iconX, geometry.iconY);
    await popup.waitForTimeout(250);
  }
  const afterIcon = await headerState();

  // 백업 패널도 같은 셸을 쓴다 — 한쪽만 고쳐 두는 일이 없게 함께 본다.
  await popup.getByRole('button', { name: 'Show backups' }).click();
  const backupsHeader = popup.getByRole('button', { name: 'Toggle backups', exact: true });
  const backupsIsFullRow = await backupsHeader
    .waitFor({ timeout: 5000 })
    .then(() =>
      backupsHeader.evaluate(
        (el) =>
          el.tagName === 'BUTTON' &&
          el.querySelectorAll('button').length === 0 &&
          Math.abs(el.getBoundingClientRect().width - (el.closest('section')?.getBoundingClientRect().width ?? 0)) <= 1,
      ),
    )
    .catch(() => false);

  record('N27: 아코디언 헤더 — 제목·여백·아이콘 어디를 눌러도 토글, 포커스 대상은 하나',
    headerIsButton &&
      opened.expanded === 'true' &&
      afterTitle.expanded === 'false' &&
      afterGap.expanded === 'true' &&
      afterIcon.expanded === 'false' &&
      [opened, afterTitle, afterGap, afterIcon].every((s) => s.innerFocusables === 0) &&
      opened.iconRotate !== 'none' && afterTitle.iconRotate === 'none' &&
      opened.spansRow &&
      opened.height >= 24 &&
      clickedGap &&
      backupsIsFullRow,
    `헤더=버튼:${headerIsButton}, expanded=${opened.expanded}→제목:${afterTitle.expanded}→여백:${afterGap.expanded}→아이콘:${afterIcon.expanded}, ` +
    `내부 focusable=${opened.innerFocusables}, 행 전체=${opened.spansRow}, 높이=${opened.height}px, ` +
    `아이콘 회전=${opened.iconRotate}→${afterTitle.iconRotate}, 백업도 전체행=${backupsIsFullRow}`);

  // ---------- N29~N32: ui-polish 후속 다듬기 ----------
  //
  // 이 넷은 전부 "Base UI가 마운트를 소유하는 표면의 CSS 전이"이거나 순수 배치라, 값이
  // 조용히 사라져도 기능 테스트는 통과한다. 티켓 09에서 아코디언 헤더의 누름 계약이
  // 목록에 없어 게이트를 그냥 지나간 적이 있어, 새로 만든 계약은 곧바로 목록에 올린다.

  // N29: 접이식 패널 — 기본 열림 + 닫힘 전환. reduced-motion이면 전이가 **없다**.
  //
  // **시간으로 잰다.** 처음에는 중간 높이의 개수를 셌는데, 그 단언은 전이가 20회 중 6~9회
  // 통째로 사라지는 결함을 통과시켰다 — 한 번 돌려서 운 좋게 애니메이션이 걸리면 초록이었다.
  // 닫히기까지 걸린 시간은 전이가 없으면 한 자릿수 ms로 떨어져 운에 기대지 않는다.
  // 상한은 `ROW_TRANSITION`에서 유도한다(패널도 MotionRow를 탄다) — 값을 손으로 적으면
  // 토큰이 바뀔 때 조용히 어긋난다.
  const panelCloseMs = async (page, label) =>
    page.evaluate(async (name) => {
      const trigger = document.querySelector(`button[aria-label="${name}"]`);
      const panelId = trigger.getAttribute('aria-controls');
      let goneAt = null;
      trigger.click();
      const t0 = performance.now();
      while (performance.now() - t0 < 600) {
        const panel = document.getElementById(panelId);
        const height = panel ? Math.round(panel.getBoundingClientRect().height) : 0;
        if (height === 0 && goneAt === null) goneAt = Math.round(performance.now() - t0);
        await new Promise((r) => requestAnimationFrame(r));
      }
      return goneAt;
    }, label);

  // 이 블록은 상태를 직접 심는다 — 앞 시나리오가 남긴 프로필에 기대면 순서가 바뀔 때
  // 조용히 깨진다. 아래 N30·N31이 규칙 폼을 열어야 하므로 규칙 하나를 함께 심는다.
  await seedProfiles([baseProfile('p-tune', 'Tune', [hdr({ id: 'm1', name: 'X-P', value: '1' })])]);

  await popup.emulateMedia({ reducedMotion: null });
  await popup.reload();
  await popup.getByRole('button', { name: 'Show preferences' }).click();
  await popup.getByRole('button', { name: 'Toggle preferences', exact: true }).waitFor({ timeout: 5000 });
  const prefsDefaultOpen = await popup
    .getByRole('button', { name: 'Toggle preferences', exact: true })
    .getAttribute('aria-expanded');
  const livelyCloseMs = await panelCloseMs(popup, 'Toggle preferences');

  await popup.emulateMedia({ reducedMotion: 'reduce' });
  await popup.reload();
  await popup.getByRole('button', { name: 'Show preferences' }).click();
  await popup.getByRole('button', { name: 'Toggle preferences', exact: true }).waitFor({ timeout: 5000 });
  const reducedCloseMs = await panelCloseMs(popup, 'Toggle preferences');
  await popup.emulateMedia({ reducedMotion: null });
  await popup.reload();

  await popup.getByRole('button', { name: 'Show backups' }).click();
  const backupsDefaultOpen = await popup
    .getByRole('button', { name: 'Toggle backups', exact: true })
    .getAttribute('aria-expanded');

  // 전이가 있으면 최소한 그 길이의 절반은 걸린다(마운트 지연·프레임 정렬 여유를 남긴다).
  // 없으면 한 자릿수 ms다 — 둘 사이가 넓어 경계가 흔들리지 않는다.
  const closeFloorMs = Math.round(ROW_TRANSITION.duration * 1000 * 0.5);
  record('N29: 접이식 패널 — 기본 열림 + 닫힘 전환(reduced-motion에서는 없음)',
    prefsDefaultOpen === 'true' && backupsDefaultOpen === 'true' &&
      livelyCloseMs !== null && livelyCloseMs >= closeFloorMs &&
      reducedCloseMs !== null && reducedCloseMs < closeFloorMs,
    `기본열림 환경설정=${prefsDefaultOpen}·백업=${backupsDefaultOpen}, ` +
    `닫힘 기본=${livelyCloseMs}ms reduced=${reducedCloseMs}ms (하한 ${closeFloorMs}ms)`);

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
      const pop = document.querySelector('[role="listbox"]');
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
    const save = pick('Save');
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

  // N32: 레일 화면(백업·환경설정)에서 프로필을 고르면 프로필 화면으로 돌아온다.
  // 사이드바는 늘 보이므로 거기서 고를 수 있는데, 본문이 그대로면 선택이 어디에도
  // 반영되지 않아 눌러도 아무 일이 없는 것처럼 보였다.
  await seedProfiles([
    baseProfile('p-a', 'Alpha', [hdr({ id: 'm1', name: 'X-A', value: '1' })]),
    { ...baseProfile('p-b', 'Beta', []), active: false },
  ]);
  await popup.reload();
  await popup.getByRole('button', { name: 'Show preferences' }).click();
  await popup.waitForTimeout(300);
  const onPrefs = await popup.evaluate(() =>
    [...document.querySelectorAll('nav button')].map((b) => b.getAttribute('aria-pressed')));
  await popup.getByRole('button', { name: /^Select profile Beta/ }).click();
  await popup.waitForTimeout(400);
  const afterSelect = await popup.evaluate(() => ({
    rail: [...document.querySelectorAll('nav button')].map((b) => b.getAttribute('aria-pressed')),
    // 프로필 화면으로 돌아왔다면 규칙 편집기가 있다.
    hasEditor: [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Add rule'),
    // 그리고 편집 중인 것이 방금 고른 프로필이어야 한다.
    editing: document.querySelector('input[aria-label="Profile name"]')?.value ?? null,
  }));
  record('N32: 레일 화면에서 프로필을 고르면 프로필 화면으로 돌아온다',
    onPrefs[2] === 'true' && afterSelect.rail[0] === 'true' &&
      afterSelect.hasEditor && afterSelect.editing === 'Beta',
    `환경설정 화면 pressed=${JSON.stringify(onPrefs)} → 선택 후 pressed=${JSON.stringify(afterSelect.rail)}, ` +
    `편집기=${afterSelect.hasEditor}, 편집중="${afterSelect.editing}"`);

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
    await page.getByRole('button', { name: 'Add rule' }).waitFor({ timeout: 5000 });
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
    preferences: await railProbe(popup, 'Show preferences'),
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

  const allRail = [...Object.values(railEn), ...Object.values(railKo)];
  const everyIconOk = allRail.every(
    (r) =>
      r.found && r.hoverTip && r.hoverTipClosed && r.focusTip &&
      // 셸을 바꾸며 32×28 / 아이콘 16px보다 작아지지 않았는지
      r.width >= 32 && r.height >= 28 && r.icon >= 16,
  );
  record('N28: 레일 아이콘 셋 — en/ko 호버·포커스·Tab 툴팁, 클릭 대상·선택 표시 유지',
    everyIconOk && tabTip &&
      railSelected.pressed === 'true' && railSelected.background !== unselectedBg,
    `아이콘 ${allRail.length}개 전부 ok=${everyIconOk} (예: ${railEn.backups.width}x${railEn.backups.height}/icon${railEn.backups.icon}), ` +
    `Tab 툴팁=${tabTip}, 선택 배경 ${unselectedBg} → ${railSelected.background} (pressed=${railSelected.pressed})`);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exitCode = failed.length === 0 ? 0 : 1;
} finally {
  await context.close();
  server.close();
}
