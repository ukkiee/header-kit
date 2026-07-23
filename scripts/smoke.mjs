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
  const onDomain = await fetchEchoHeaders(pageB, '/headers');
  await pageB.goto(`http://localhost:${port}/`);
  await pollSessionRuleCount(sw, 0); // 도메인 이탈 → 매칭 탭 없음 → 그 규칙만 미방출
  const offDomain = await fetchEchoHeaders(pageB, '/headers');
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

  // 자동 백업은 최소 간격(30s) 스로틀이 있으므로 그보다 넉넉히 기다린다.
  const backupCount = await pollUntil(
    () => sw.evaluate(async () => {
      const kv = await chrome.storage.sync.get('bk:manifest');
      return kv['bk:manifest']?.snapshots?.length ?? 0;
    }),
    (count) => count >= 1,
    35_000,
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
  await popup.getByRole('button', { name: 'Toggle backups' }).click();
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
  await popup.getByRole('button', { name: 'Toggle preferences' }).click();
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

  // L3: 시크릿 안내가 노출된다 (기본 로드 확장은 시크릿 미허용)
  const incognitoNote = await popup
    .getByText(/incognito|시크릿/i)
    .first()
    .isVisible()
    .catch(() => false);
  record('L3: 시크릿 미허용 안내가 노출된다', incognitoNote, `visible=${incognitoNote}`);

  // ---------- M. 이슈 03: Cookie/Set-Cookie/CSP/Redirect ----------
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

  // M3: CSP 응답 헤더 합성
  await seedProfiles([
    baseProfile('p-csp', 'Cs',
      [modBase('csp', { directives: [{ name: 'default-src', value: "'none'" }] })]),
  ]);
  await pollSessionRuleCount(sw, 1);
  const cspHeader = await pageB.evaluate(async () => {
    const res = await fetch('/headers', { cache: 'no-store' });
    return res.headers.get('content-security-policy');
  });
  record('M3: CSP 디렉티브 합성 → 응답 헤더', cspHeader === "default-src 'none'", `csp=${cspHeader}`);

  // M3b: 새 UI 경로(확장 편집)로 CSP 디렉티브 값 변경 → 실제 응답 헤더 반영 (슬라이스 05)
  await popup.reload();
  await popup.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await popup.getByLabel('CSP directive value').fill("'self'");
  await popup.getByRole('button', { name: 'Save', exact: true }).click();
  const cspEdited = await pollUntil(
    () => pageB.evaluate(async () => {
      const res = await fetch('/headers', { cache: 'no-store' });
      return res.headers.get('content-security-policy');
    }),
    (v) => v === "default-src 'self'",
  );
  record('M3b: UI 확장 편집으로 CSP 값 변경 → 실응답 반영', cspEdited === "default-src 'self'",
    `csp=${cspEdited}`);

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
  const pickOption = async (page, triggerLabel, optionName) => {
    await page.getByRole('combobox', { name: triggerLabel, exact: true }).click();
    await page.getByRole('option', { name: optionName, exact: true }).click();
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
  await popup.getByRole('button', { name: 'Toggle preferences' }).click();
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

  // N18e: CSP 디렉티브 이름이 비면 Save 차단 — 인라인 오류 + 이름 입력에 aria-invalid + 저장 안 됨 (release r1 R-2)
  await pickOption(popup, 'Type', 'CSP');
  await popup.getByRole('button', { name: 'directive' }).click(); // 빈 디렉티브 1개 추가
  const cspNameInput = popup.getByLabel('CSP directive name').first();
  await cspNameInput.waitFor({ timeout: 5000 });
  await popup.getByRole('button', { name: 'Save', exact: true }).click();
  const cspInlineError = await popup.getByText('Required.', { exact: true }).first()
    .waitFor({ timeout: 5000 }).then(() => true, () => false);
  const cspAriaInvalid = await cspNameInput.getAttribute('aria-invalid');
  const modsAfterCspBlock = await sw.evaluate(async () => {
    const { state } = await chrome.storage.local.get('state');
    return state.profiles[0].modifications.length;
  });
  record('N18e: CSP 빈 디렉티브 이름 Save 차단 — 인라인 오류·aria-invalid·스토리지 불변',
    cspInlineError && cspAriaInvalid === 'true' && modsAfterCspBlock === 1,
    `error=${cspInlineError}, aria-invalid=${cspAriaInvalid}, mods=${modsAfterCspBlock}`);
  // 폼은 열어둔 채 다음 케이스(N18c)로 — 종류 전환이 스테일 오류를 지운다.

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

  // ADR 0012가 열거한 버튼 프리미티브 넷을 같은 프로브로 훑는다.
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
  record('N21b: 감도 대조 — 기본 모션에서 버튼·칩·아이콘버튼·메뉴항목이 호버·누름에 변형한다',
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
  record('N21c: reduced-motion — 네 프리미티브 모두 호버·누름에 transform이 없다',
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
  const firstFrameMenuOpacities = async (page, openMenu) => {
    await page.evaluate(() => {
      window.__menuProbe = null;
      const observer = new MutationObserver(() => {
        const menu = document.querySelector('[role="menu"]');
        if (!menu) return;
        observer.disconnect();
        requestAnimationFrame(() => {
          window.__menuProbe = [...menu.querySelectorAll('[role="menuitem"]')].map((el) =>
            Number(getComputedStyle(el).opacity),
          );
        });
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 5000);
    });
    await openMenu();
    const observed = await page
      .waitForFunction(() => window.__menuProbe !== null, null, { timeout: 5000 })
      .then(() => true, () => false);
    return observed ? page.evaluate(() => window.__menuProbe) : null;
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
  const staggerLively = await firstFrameMenuOpacities(popup, openProfileMenu(popup));
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
  const staggerStill = await firstFrameMenuOpacities(popup, openProfileMenu(popup));
  // "앞 항목이 뒤 항목보다 더 진행돼 있다"까지 봐야 **순차**를 단언한 것이다.
  // 단순히 "1 미만인 항목이 있다"로는 stagger를 0으로 만들어 전부 동시에 fade해도 통과한다.
  const isSequential =
    Array.isArray(staggerLively) &&
    staggerLively.length > 1 &&
    staggerLively.every((o, i) => i === 0 || staggerLively[i - 1] > o);
  record('N23a: 메뉴 순차 등장 — 앞 항목이 뒤보다 앞서고, reduced-motion은 즉시 완성',
    isSequential &&
      staggerSettled.length > 0 && staggerSettled.every((o) => o === 1) &&
      Array.isArray(staggerStill) && staggerStill.length > 0 && staggerStill.every((o) => o === 1),
    `lively=${JSON.stringify(staggerLively)}, sequential=${isSequential}, settled=${JSON.stringify(staggerSettled)}, reduced=${JSON.stringify(staggerStill)} (항목 ${menuItemCount}, 창 ${settleMs}ms)`);

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
  const openDelayedSavePopup = async ({ reject }) => {
    const page = await context.newPage();
    await page.addInitScript(
      ({ delayMs, rejectSave }) => {
        window.__commandCalls = 0;
        const original = chrome.runtime.sendMessage.bind(chrome.runtime);
        chrome.runtime.sendMessage = (message, ...rest) => {
          if (message?.type !== 'headerkit:command') return original(message, ...rest);
          window.__commandCalls += 1;
          return new Promise((resolve) => {
            setTimeout(() => {
              if (rejectSave) resolve({ ok: false, error: 'Rejected.' });
              else original(message, ...rest).then(resolve);
            }, delayMs);
          });
        };
      },
      { delayMs: SAVE_DELAY_MS, rejectSave: reject },
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
    const page = await openDelayedSavePopup({ reject: false });
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
    const page = await openDelayedSavePopup({ reject: true });
    await fillNewRule(page, 'X-Rejected');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const alertShown = await page.getByText('Rejected.', { exact: true }).first()
      .waitFor({ timeout: 5000 }).then(() => true, () => false);
    const afterReject = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('button')];
      const save = buttons.find((b) => /^(Save|Saving…)$/.test(b.textContent?.trim() ?? ''));
      const cancel = buttons.find((b) => b.textContent?.trim() === 'Cancel');
      const name = document.querySelector('input[aria-label="Header name"]');
      return {
        label: save?.textContent?.trim() ?? '',
        saveEnabled: save ? !save.disabled : false,
        cancelEnabled: cancel ? !cancel.disabled : false,
        draft: name?.value ?? '',
      };
    });
    const storedAfterReject = await sw.evaluate(async () =>
      (await chrome.storage.local.get('state')).state.profiles[0].modifications.length);
    await page.close();
    record('N24b: 저장 거부 — 라벨 복귀·버튼 재활성·폼과 초안 유지·거부 메시지',
      alertShown && afterReject.label === 'Save' && afterReject.saveEnabled && afterReject.cancelEnabled &&
        afterReject.draft === 'X-Rejected' && storedAfterReject === 0,
      `alert=${alertShown}, label="${afterReject.label}", save-enabled=${afterReject.saveEnabled}, ` +
      `cancel-enabled=${afterReject.cancelEnabled}, draft="${afterReject.draft}", stored=${storedAfterReject}`);
  }

  // N24c: 폼 닫힘 — reduced-motion에서는 exit 창 없이 즉시 제거된다(스펙의 관측 계약).
  // 기본 모션에서는 MotionRow의 height 전이만큼 남아 있어야 대조가 성립한다.
  const measureFormRemoval = async (page) => {
    await page.getByRole('button', { name: 'Add rule' }).click();
    await page.getByRole('button', { name: 'Cancel' }).waitFor({ timeout: 5000 });
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
    await page.getByRole('button', { name: 'Cancel' }).click();
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
  const livelyClose = await measureFormRemoval(popup);
  await popup.emulateMedia({ reducedMotion: 'reduce' });
  await popup.reload();
  await popup.getByRole('button', { name: 'Add rule' }).waitFor({ timeout: 5000 });
  const reducedClose = await measureFormRemoval(popup);
  await popup.emulateMedia({ reducedMotion: null });
  record('N24c: 폼 닫힘 — reduced-motion은 exit 창 없이 즉시, 기본 모션은 전이만큼 남는다',
    typeof reducedClose === 'number' && reducedClose < exitWindowMs &&
      typeof livelyClose === 'number' && livelyClose >= exitWindowMs,
    `reduced=${reducedClose?.toFixed?.(0)}ms, lively=${livelyClose?.toFixed?.(0)}ms (exit 창 ${exitWindowMs}ms)`);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exitCode = failed.length === 0 ? 0 : 1;
} finally {
  await context.close();
  server.close();
}
