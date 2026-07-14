/**
 * 실브라우저 스모크 (이슈 01 인수 조건):
 *  A. 팝업 상태 → storage → session rule → 실요청 헤더 적용/해제
 *  B. PRD 검증 항목 ①: allow 규칙 vs 낮은 priority modifyHeaders 우선순위 상호작용
 *  C. PRD 검증 항목 ②: 5,000 규칙 규모의 session rules 전량 교체
 *
 * 실행: bun run build && bun run smoke
 */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

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
    res.setHeader('content-type', 'text/html');
    res.end('<!doctype html><title>echo</title>ok');
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

async function pollSessionRuleCount(sw, expected, timeoutMs = 5000) {
  const start = Date.now();
  let count = -1;
  while (Date.now() - start < timeoutMs) {
    count = await sw.evaluate(async () => {
      const rules = await chrome.declarativeNetRequest.getSessionRules();
      return rules.length;
    });
    if (count === expected) return count;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`session rule count ${count} !== expected ${expected}`);
}

const { server, port } = await startEchoServer();
const origin = `http://127.0.0.1:${port}`;

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
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
              { kind: 'request-header', id: 'm1', name: 'X-HeaderKit-Smoke', value: 'ok', enabled: true },
            ],
          },
        ],
      },
    });
  });

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
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
              { kind: 'request-header', id: 't1', name: 'X-Conf', value: 'top-wins', enabled: true },
            ],
          },
          {
            id: 'bottom',
            name: 'Bottom',
            active: true,
            shortLabel: 'B',
            color: '#16a34a',
            modifications: [
              { kind: 'request-header', id: 'b1', name: 'X-Conf', value: 'bottom', enabled: true },
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

  const pollBadge = async (expected, timeoutMs = 3000) => {
    const start = Date.now();
    let text = '';
    while (Date.now() - start < timeoutMs) {
      text = await sw.evaluate(() => chrome.action.getBadgeText({}));
      if (text === expected) return text;
      await new Promise((r) => setTimeout(r, 100));
    }
    return text;
  };

  const multiBadge = await pollBadge('2');
  record('D2: 다중 활성 시 배지에 활성 개수 표시', multiBadge === '2', `badge="${multiBadge}"`);

  await popup.reload();
  await popup.getByRole('button', { name: 'Pause all' }).click();
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

  // ---------- E. 이슈 05: 네이티브 Filter ----------
  const seedProfiles = (profiles) =>
    sw.evaluate(async (p) => {
      await chrome.storage.local.set({ state: { schemaVersion: 1, paused: false, profiles: p } });
    }, profiles);

  const baseProfile = (id, name, mods, filters) => ({
    id,
    name,
    active: true,
    shortLabel: name.charAt(0),
    color: '#2563eb',
    modifications: mods,
    filters,
  });

  // E1: URL Filter가 적용 범위를 좁힌다
  await seedProfiles([
    baseProfile('p-url', 'UrlF',
      [{ kind: 'request-header', id: 'm1', name: 'X-F5', value: 'on', enabled: true }],
      [{ kind: 'url', id: 'f1', enabled: true, pattern: 'tagged' }]),
  ]);
  await pollSessionRuleCount(sw, 1);
  const tagged = await fetchEchoHeaders(page, '/headers?tagged=1');
  const untagged = await fetchEchoHeaders(page, '/headers');
  record('E1: URL Filter — 매칭 요청에만 적용', tagged['x-f5'] === 'on' && untagged['x-f5'] === undefined,
    `tagged=${tagged['x-f5']}, untagged=${untagged['x-f5']}`);

  // E2: Exclude URL Filter + 하향 전파 — 아래 Profile의 수정까지 해당 URL에서 차단
  await seedProfiles([
    baseProfile('p-top', 'Top',
      [{ kind: 'request-header', id: 't1', name: 'X-Top', value: '1', enabled: true }],
      [{ kind: 'exclude-url', id: 'f1', enabled: true, pattern: 'blocked' }]),
    baseProfile('p-bottom', 'Bot',
      [{ kind: 'request-header', id: 'b1', name: 'X-Bottom', value: '1', enabled: true }],
      []),
  ]);
  await pollSessionRuleCount(sw, 3); // allow 1 + modify 2
  const normal = await fetchEchoHeaders(page, '/headers');
  const excluded = await fetchEchoHeaders(page, '/headers?blocked=1');
  record('E2: Exclude — 매칭 URL에서 자기+하위 Profile 수정 차단',
    normal['x-top'] === '1' && normal['x-bottom'] === '1' &&
    excluded['x-top'] === undefined && excluded['x-bottom'] === undefined,
    `normal=[${normal['x-top']},${normal['x-bottom']}], excluded=[${excluded['x-top']},${excluded['x-bottom']}]`);

  // E3: Request Method Filter
  await seedProfiles([
    baseProfile('p-method', 'Meth',
      [{ kind: 'request-header', id: 'm1', name: 'X-Post-Only', value: 'on', enabled: true }],
      [{ kind: 'request-method', id: 'f1', enabled: true, methods: ['post'] }]),
  ]);
  await pollSessionRuleCount(sw, 1);
  const viaGet = await fetchEchoHeaders(page, '/headers');
  const viaPost = await fetchEchoHeaders(page, '/headers', 'POST');
  record('E3: Method Filter — POST에만 적용', viaGet['x-post-only'] === undefined && viaPost['x-post-only'] === 'on',
    `GET=${viaGet['x-post-only']}, POST=${viaPost['x-post-only']}`);

  // E5: Resource Type Filter — main_frame 내비게이션에만 적용, XHR 제외
  await seedProfiles([
    baseProfile('p-rt', 'Rt',
      [{ kind: 'request-header', id: 'm1', name: 'X-Doc-Only', value: 'on', enabled: true }],
      [{ kind: 'resource-type', id: 'f1', enabled: true, resourceTypes: ['main_frame'] }]),
  ]);
  await pollSessionRuleCount(sw, 1);
  const viaXhr = await fetchEchoHeaders(page, '/headers');
  await page.goto(`${origin}/headers?nav=1`);
  const viaNav = JSON.parse(await page.evaluate(() => document.body.innerText));
  await page.goto(origin);
  record('E5: Resource Type Filter — 문서 요청에만 적용',
    viaXhr['x-doc-only'] === undefined && viaNav['x-doc-only'] === 'on',
    `xhr=${viaXhr['x-doc-only']}, nav=${viaNav['x-doc-only']}`);

  // E6: Initiator Domain Filter — 요청 출처가 매칭될 때만 적용
  const idProfile = (domain) => [
    baseProfile('p-id', 'Id',
      [{ kind: 'request-header', id: 'm1', name: 'X-From-Local', value: 'on', enabled: true }],
      [{ kind: 'initiator-domain', id: 'f1', enabled: true, domain }]),
  ];
  await seedProfiles(idProfile('127.0.0.1'));
  await pollSessionRuleCount(sw, 1);
  const matched = await fetchEchoHeaders(page, '/headers');
  await seedProfiles(idProfile('nomatch.example'));
  await new Promise((r) => setTimeout(r, 300));
  const unmatched = await fetchEchoHeaders(page, '/headers');
  record('E6: Initiator Domain Filter — 출처 도메인 매칭 시에만 적용',
    matched['x-from-local'] === 'on' && unmatched['x-from-local'] === undefined,
    `matched=${matched['x-from-local']}, unmatched=${unmatched['x-from-local']}`);

  // E4: 유효하지 않은 regex는 저장 시점(권위 경로)에 거부된다
  const rejection = await popup.evaluate(async () => {
    return chrome.runtime.sendMessage({
      type: 'headerkit:command',
      command: {
        type: 'add-filter',
        profileId: 'p-method',
        filter: { kind: 'url', id: 'bad', enabled: true, pattern: '(unclosed' },
      },
    });
  });
  const stateAfter = await sw.evaluate(async () => {
    const { state } = await chrome.storage.local.get('state');
    return state.profiles[0].filters.length;
  });
  record('E4: invalid regex 명령이 오류로 거부되고 저장되지 않음',
    rejection?.ok === false && /regex/i.test(rejection?.error ?? '') && stateAfter === 1,
    `ok=${rejection?.ok}, error="${rejection?.error}", filters=${stateAfter}`);

  // ---------- F. 이슈 06: 탭 계열 Filter · Time Filter ----------
  await page.close(); // 이전 섹션의 127.0.0.1 탭이 tab-domain 매칭을 오염시키지 않도록

  // F1: Tab Filter — 지정 탭에만 적용, 탭 닫힘 시 자동 해제
  const pageA = await context.newPage();
  await pageA.goto(`${origin}/?who=A`);
  const pageB = await context.newPage();
  await pageB.goto(`${origin}/?who=B`);
  const tabIdByUrl = (tabs, marker) =>
    tabs.find((t) => t.url && t.url.includes(marker))?.id;
  const openTabs = await sw.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    return tabs.map((t) => ({ id: t.id, url: t.url }));
  });
  const tabAId = tabIdByUrl(openTabs, 'who=A');

  await seedProfiles([
    baseProfile('p-tab', 'Tab',
      [{ kind: 'request-header', id: 'm1', name: 'X-Tab-Only', value: 'on', enabled: true }],
      [{ kind: 'tab', id: 'f1', enabled: true, tabId: tabAId }]),
  ]);
  await pollSessionRuleCount(sw, 1);
  const inA = await fetchEchoHeaders(pageA, '/headers');
  const inB = await fetchEchoHeaders(pageB, '/headers');
  record('F1a: Tab Filter — 지정 탭에만 적용', inA['x-tab-only'] === 'on' && inB['x-tab-only'] === undefined,
    `A=${inA['x-tab-only']}, B=${inB['x-tab-only']}`);

  await pageA.close();
  await pollSessionRuleCount(sw, 0);
  const inBAfterClose = await fetchEchoHeaders(pageB, '/headers');
  record('F1b: 대상 탭 닫힘 → 규칙 자동 해제', inBAfterClose['x-tab-only'] === undefined,
    `rules=0, B=${inBAfterClose['x-tab-only']}`);

  // F2: Tab Domain Filter — 탭의 도메인 기준, 이탈 시 자동 비활성
  await seedProfiles([
    baseProfile('p-td', 'Td',
      [{ kind: 'request-header', id: 'm1', name: 'X-Tab-Domain', value: 'on', enabled: true }],
      [{ kind: 'tab-domain', id: 'f1', enabled: true, domain: '127.0.0.1' }]),
  ]);
  await pollSessionRuleCount(sw, 1);
  const onDomain = await fetchEchoHeaders(pageB, '/headers');
  await pageB.goto(`http://localhost:${port}/`);
  await pollSessionRuleCount(sw, 0); // 도메인 이탈 → 매칭 탭 없음 → 규칙 해제
  const offDomain = await fetchEchoHeaders(pageB, '/headers');
  record('F2: Tab Domain Filter — 도메인 안 적용, 이탈 시 자동 해제',
    onDomain['x-tab-domain'] === 'on' && offDomain['x-tab-domain'] === undefined,
    `on=${onDomain['x-tab-domain']}, off=${offDomain['x-tab-domain']}`);
  await pageB.goto(origin);

  // F3: Time Filter — 만료 알람이 Profile을 끄고 배지가 비워진다
  await seedProfiles([
    {
      ...baseProfile('p-time', 'Ti',
        [{ kind: 'request-header', id: 'm1', name: 'X-Timed', value: 'on', enabled: true }],
        [{ kind: 'time', id: 'f1', enabled: true, expiresAt: Date.now() + 1500 }]),
    },
  ]);
  await pollSessionRuleCount(sw, 1);
  const beforeExpiry = await fetchEchoHeaders(pageB, '/headers');

  const pollProfileOff = async (timeoutMs = 20_000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const active = await sw.evaluate(async () => {
        const { state } = await chrome.storage.local.get('state');
        return state.profiles[0].active;
      });
      if (active === false) return true;
      await new Promise((r) => setTimeout(r, 250));
    }
    return false;
  };
  const turnedOff = await pollProfileOff();
  const afterExpiry = await fetchEchoHeaders(pageB, '/headers');
  const expiredBadge = await sw.evaluate(() => chrome.action.getBadgeText({}));
  record('F3: Time Filter 만료 → 알람이 Profile off + 규칙 해제 + 배지 비움',
    beforeExpiry['x-timed'] === 'on' && turnedOff && afterExpiry['x-timed'] === undefined && expiredBadge === '',
    `before=${beforeExpiry['x-timed']}, off=${turnedOff}, after=${afterExpiry['x-timed']}, badge="${expiredBadge}"`);

  // ---------- G. 이슈 07: Placeholder 실체화 수명주기 ----------
  const UUID_RE = /^req-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  // 비활성으로 심고, 활성화는 실제 팝업 토글(활성화 경계 = 명령 경로)로 수행한다.
  await seedProfiles([
    {
      ...baseProfile('p-ph', 'Ph',
        [{ kind: 'request-header', id: 'm1', name: 'X-Trace-Id', value: 'req-{{uuid}}', enabled: true }],
        []),
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
  await popup.getByRole('button', { name: 'Import', exact: true }).click();
  await pollSessionRuleCount(sw, 1); // tab 참조가 정리(UNSET)됐으므로 규칙이 전 탭에 적용된다
  const importedState = await sw.evaluate(async () => {
    const { state } = await chrome.storage.local.get('state');
    return state;
  });
  const importedProfile = importedState.profiles.find((p) => p.name === 'Imported');
  const importedHeader = (await fetchEchoHeaders(pageB, '/headers'))['x-imported-id'];
  record('H1: 활성 Import → id 재생성 + 탭 참조 정리 + 활성화 경계 실체화',
    importedProfile !== undefined &&
    importedProfile.id !== 'src-p1' &&
    importedProfile.filters[0]?.tabId === -1 &&
    /^imp-[0-9a-f-]{36}$/.test(importedHeader ?? ''),
    `id=${importedProfile?.id?.slice(0, 8)}, tabId=${importedProfile?.filters[0]?.tabId}, header=${importedHeader}`);

  await popup.getByRole('button', { name: 'Import…' }).click();
  await popup.getByLabel('Import JSON').fill('{broken json');
  await popup.getByRole('button', { name: 'Import', exact: true }).click();
  const importError = await popup.getByRole('alert').textContent();
  const profileCountAfter = await sw.evaluate(async () => {
    const { state } = await chrome.storage.local.get('state');
    return state.profiles.length;
  });
  record('H2: 깨진 Import는 거부되고 상태가 불변', /JSON/i.test(importError ?? '') && profileCountAfter === 1,
    `error="${importError}", profiles=${profileCountAfter}`);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exitCode = failed.length === 0 ? 0 : 1;
} finally {
  await context.close();
  server.close();
}
