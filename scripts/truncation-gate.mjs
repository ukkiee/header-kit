#!/usr/bin/env node
// 말줄임 게이트 — **앱이 스스로 하는 말**이 자기 칸에 들어가지 못하는 것을 잡는다.
//
// `overflow-gate`가 이것을 재지 못한다. 그 게이트는 가로 오버플로와 가로 스크롤러를 재는데,
// `text-overflow: ellipsis`는 오버플로를 **흡수하는** 쪽이라 넘친 문구는 그 판정에 나타나지
// 않는다. 두 번 물렸다: 정지 토스트가 `일시정지 중입니다. 지금은 어떤 수정도 적용되…`로
// 끝났고, 프로필 행 메타의 `0 rules · not applied`는 87px 칸에 107px을 요구해 **규칙 0개인
// 갓 만든 프로필이 처음부터 잘려 있었다.** 둘 다 사람 눈이 유일한 방어였다.
//
// **시드가 짧다 — 그것이 이 게이트의 전제다.** 사용자가 넣은 긴 이름·긴 헤더 값은 잘려야
// 한다(좁은 열에 무한정 늘릴 수 없고, `truncate`가 그 자리의 안전장치다). 이름을 한 글자로
// 심으면 잘린 채 남는 것은 카탈로그 문구뿐이고, 그것이 이 게이트가 겨냥하는 결함이다.
// **`overflow-gate`와 시드가 정반대라 한 실행에 얹을 수 없다** — 그쪽은 최대 길이 이름을
// 심어 레이아웃이 버티는지 보고, 이쪽은 가장 짧은 데이터로 문구만 남긴다.
//
// **준비 상태를 관측하지 않으면 이 게이트도 거꾸로 선다** — 아무것도 그려지지 않은 화면에는
// 잘린 원소가 없어서 **빈 트리가 가장 잘 통과한다.** `overflow-gate`가 세운 그 표지 셋을
// 같은 이유로 요구한다. 폰트가 특히 그렇다: 폴백은 글자 폭이 달라 잘림 판정 자체가 바뀐다.
//
// 무엇을 재고 무엇을 재지 않는지의 정본은 `docs/agents/verification.md`다.
import { launchWithExtension, POPUP_SIZE, resolveExtensionPath, seedState } from './ui-harness.mjs';
import { tokenFail } from './artifacts-arg.mjs';

// 이름표는 레지스트리의 게이트 id와 같아야 한다 — 러너가 `^(PASS|FAIL|N/A) <id>:`로 읽는다.
const LABEL = 'truncation-gate';
const fail = tokenFail(LABEL);

/** 준비 표지를 기다리는 제한 시간. 넘으면 훑지 않고 FAIL이다. */
const READY_TIMEOUT_MS = 15_000;

/** 본문 서체 — 근거는 `overflow-gate`의 같은 상수가 적는다(폴백 폭이 판정을 바꾼다). */
const BODY_FONT = 'Geist Variable';

/**
 * **가장 짧은 시드.** 이름은 한 글자, 규칙 이름도 한 글자다. 프로필 둘을 두는 이유는 상태
 * 낱말이 `applied`와 `off` 둘 다 서야 하기 때문이다 — 이번에 잡힌 것이 `off` 쪽이었고,
 * 켜진 프로필만 심었다면 그 문구는 화면에 서지도 않았다.
 */
const PROFILE_COUNT = 2;
const shortProfiles = [
  {
    id: 'a',
    name: 'A',
    active: true,
    shortLabel: 'A',
    color: '#2563eb',
    modifications: [
      {
        kind: 'request-header',
        id: 'm1',
        name: 'X-A',
        value: 'v',
        enabled: true,
        mode: 'override',
        emptyMeans: 'remove',
        comment: '',
      },
    ],
  },
  { id: 'b', name: 'B', active: false, shortLabel: 'B', color: '#86868d', modifications: [] },
];

const seedFor = (profiles) => ({
  schemaVersion: 1,
  paused: false,
  syncBackup: true,
  customHeaderNames: [],
  materialized: {},
  profiles,
});

/**
 * 잘린 **잎** 요소를 모은다. 자식이 있는 요소는 텍스트를 자식에게 넘기므로 그 자식이 진짜
 * 잘린 자리이고, 조상까지 세면 같은 결함이 여러 줄로 불어난다.
 */
const COLLECT = () => {
  const out = [];
  for (const el of document.querySelectorAll('*')) {
    if (el.children.length > 0) continue;
    const text = (el.textContent ?? '').trim();
    if (!text) continue;
    const st = getComputedStyle(el);
    const clipped = st.textOverflow === 'ellipsis' || st.overflow === 'hidden' || st.overflowX === 'hidden';
    if (!clipped) continue;
    if (el.scrollWidth <= el.clientWidth) continue;
    out.push({ text, client: el.clientWidth, scroll: el.scrollWidth, over: el.scrollWidth - el.clientWidth });
  }
  return out;
};

/**
 * 훑는 자리. 화면 넷과 **정지 토스트**다 — 토스트는 화면 전환만으로는 서지 않으므로 직접
 * 띄운다(이번에 잡힌 둘 중 하나가 그 쪽지였다).
 *
 * 로케일 **둘 다** 돈다. 글자 폭이 언어마다 달라 한쪽만 재면 반쪽이다 — 이번 둘은 en에서
 * 넘쳤고 ko는 같은 자리에서 멀쩡했다.
 */
const LOCALES = ['en', 'ko'];
const SCREENS = [
  { key: 'profiles', label: { en: 'Show profiles', ko: '프로필 화면' } },
  { key: 'backups', label: { en: 'Show backups', ko: '백업 화면' } },
  { key: 'settings', label: { en: 'Show settings', ko: '환경설정 화면' } },
];
const PAUSE_LABEL = { en: 'Pause', ko: '일시정지' };
const ADD_RULE_LABEL = { en: 'Add rule', ko: '규칙 추가' };

const resolved = resolveExtensionPath(process.argv.slice(2));
if (resolved.error) fail(resolved.error);

const { context, sw, extensionId } = await launchWithExtension(resolved.dir);
const findings = [];
let scanned = 0;
try {
  // 시드가 실패하면 화면이 비고, 빈 화면에는 잘린 원소가 없다 — 준비 표지가 그것을 막는다.
  await seedState(sw, seedFor(shortProfiles));
  await sw.evaluate(async () => {
    // 백업 히스토리에 행 하나 — 그 카드의 문구들도 훑기에 들어온다.
    await chrome.storage.sync.set({
      'bk:manifest': {
        snapshots: [{ id: 's1', createdAt: 1789500000000, chunkCount: 1, checksum: 'abc', profileCount: 1 }],
      },
      'bk:s1:0': JSON.stringify({ headerkit: 1, profiles: [] }),
    });
  });

  for (const locale of LOCALES) {
    /*
     * **로케일마다 시드를 다시 심는다.** 두 회차가 컨텍스트를 공유하므로, 앞 회차가 켠
     * 일시정지가 그대로 남아 다음 회차의 헤더 버튼이 `재개`가 된다(실측 — 그 상태로는
     * 정지 토스트를 띄우지 못해 게이트가 자기 탓으로 FAIL을 냈다).
     */
    await seedState(sw, seedFor(shortProfiles));

    const popup = await context.newPage();
    await popup.setViewportSize({ width: POPUP_SIZE.width, height: POPUP_SIZE.height });
    await popup.goto(`chrome-extension://${extensionId}/popup.html?locale=${locale}`);

    // 준비 표지 셋 — 근거는 이 파일 머리와 `overflow-gate`의 같은 자리가 적는다.
    let ready;
    try {
      ready = await popup.waitForFunction(
        ({ expected, font }) => {
          const list = document.querySelector('ul[data-profile-list="sortable"]');
          const rows = list ? list.querySelectorAll(':scope > li').length : 0;
          const faces = [...document.fonts].filter((f) => f.family.replaceAll(/^["']|["']$/g, '') === font);
          const fontsLoaded = faces.some((f) => f.status === 'loaded') && document.fonts.status === 'loaded';
          if (list && rows === expected && fontsLoaded) return { rows, faces: faces.length };
          return false;
        },
        { expected: PROFILE_COUNT, font: BODY_FONT },
        { timeout: READY_TIMEOUT_MS },
      );
    } catch {
      const observed = await popup.evaluate(
        (font) => ({
          sortable: Boolean(document.querySelector('ul[data-profile-list="sortable"]')),
          static: Boolean(document.querySelector('ul[data-profile-list="static"]')),
          rows: document.querySelectorAll('ul[data-profile-list] > li').length,
          fontsStatus: document.fonts.status,
          faces: [...document.fonts].filter((f) => f.family.replaceAll(/^["']|["']$/g, '') === font).length,
        }),
        BODY_FONT,
      );
      fail(
        `준비 표지가 ${READY_TIMEOUT_MS}ms 안에 서지 않았다 (${locale}) — 훑지 않는다. ` +
          `지연 목록=${observed.sortable ? '도착' : observed.static ? '아직 정적 fallback' : '없음'} · ` +
          `렌더된 행=${observed.rows}/${PROFILE_COUNT} · ` +
          `${BODY_FONT} face=${observed.faces}개/${observed.fontsStatus}`,
      );
    }
    const readiness = await ready.jsonValue();

    const sweep = async (where) => {
      scanned += 1;
      for (const row of await popup.evaluate(COLLECT)) findings.push({ locale, where, ...row });
    };

    for (const screen of SCREENS) {
      try {
        await popup.getByRole('button', { name: screen.label[locale] }).first().click({ timeout: 5000 });
      } catch {
        fail(`${locale}에서 ${screen.key} 화면으로 갈 수 없다 — 훑지 못한 자리를 통과로 적지 않는다.`);
      }
      // 화면이 바뀐 뒤 레이아웃이 앉는 것을 기다린다 — 전이 중에는 폭이 아직 최종이 아니다.
      await popup.waitForTimeout(500);
      await sweep(screen.key);
    }

    // 규칙 폼 — 종류별 안내 문구가 여기서만 선다.
    try {
      await popup.getByRole('button', { name: SCREENS[0].label[locale] }).first().click({ timeout: 5000 });
      await popup.waitForTimeout(400);
      await popup.getByRole('button', { name: ADD_RULE_LABEL[locale] }).first().click({ timeout: 5000 });
      await popup.waitForTimeout(700);
    } catch {
      fail(`${locale}에서 규칙 폼을 열 수 없다 — 훑지 못한 자리를 통과로 적지 않는다.`);
    }
    await sweep('rule-form');

    /*
     * 정지 토스트 — 화면 전환으로는 서지 않는다. 이번에 잡힌 둘 중 하나가 이 쪽지였고,
     * 띄우지 않으면 이 게이트는 그 결함을 다시 놓친다.
     */
    try {
      // 폼을 먼저 닫는다 — 열린 채로 두면 그 위의 헤더 버튼에 닿지 못한다.
      await popup.keyboard.press('Escape');
      await popup.waitForTimeout(500);
      await popup.getByRole('button', { name: PAUSE_LABEL[locale] }).first().click({ timeout: 5000 });
      /*
       * **`role=alert`로 기다리지 않는다.** 이 쪽지는 `aria-live="polite"` 영역이라 그 역할로는
       * 잡히지 않는다(실측). 표지로 기다린다 — 역할로 기다리면 영원히 서지 않는다.
       */
      await popup.locator('[data-slot="toast-title"]').first().waitFor({ timeout: 5000 });
      await popup.waitForTimeout(400); // 들어오는 전이가 끝나야 폭이 최종이다
    } catch {
      fail(`${locale}에서 정지 토스트를 띄우지 못했다 — 훑지 못한 자리를 통과로 적지 않는다.`);
    }
    await sweep('paused-toast');

    await popup.close();
    if (readiness.rows !== PROFILE_COUNT) {
      fail(`${locale}: 렌더된 행이 ${readiness.rows}개다 — 시드 ${PROFILE_COUNT}개와 다르다.`);
    }
  }

  if (findings.length > 0) {
    // 같은 문구가 여러 자리에서 나오므로 문구로 묶되, 어디서 얼마나 넘쳤는지를 남긴다.
    const seen = new Map();
    for (const f of findings) {
      const e = seen.get(f.text) ?? { worst: f, where: new Set() };
      e.where.add(`${f.locale}/${f.where}`);
      if (f.over > e.worst.over) e.worst = f;
      seen.set(f.text, e);
    }
    const lines = [...seen.values()]
      .sort((a, b) => b.worst.over - a.worst.over)
      .map(
        (e) =>
          `"${e.worst.text.slice(0, 60)}" ${e.worst.over}px 넘침(칸 ${e.worst.client}px) [${[...e.where].join(', ')}]`,
      );
    fail(
      `카탈로그 문구 ${seen.size}종이 자기 칸에 들어가지 않는다 — ${lines.join(' · ')}. ` +
        `시드는 한 글자짜리라 잘린 것은 사용자 데이터가 아니라 **앱이 스스로 하는 말**이다.`,
    );
  }

  console.log(
    `PASS ${LABEL}: 잘린 카탈로그 문구 0종 ` +
      `(로케일 ${LOCALES.length} × 자리 ${scanned / LOCALES.length}곳 = 훑기 ${scanned}회 · ` +
      `${POPUP_SIZE.width}px 팝업 · 준비 표지 셋 관측 뒤)`,
  );
} finally {
  await context.close();
}
