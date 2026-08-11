#!/usr/bin/env node
// 가로 오버플로 게이트 — 최대 길이 이름이 좁은 팝업의 레이아웃을 깨는 것을 잡는다.
//
// **준비 상태를 관측하지 않으면 이 게이트는 거꾸로 선다.** 아무것도 그려지지 않은 화면에는
// 넘치는 원소가 없어서 **빈 트리가 가장 잘 통과한다.** 앱은 비동기 상태 로딩이 끝나기
// 전까지 아무것도 렌더하지 않고 정렬 가능한 목록은 지연 import된다 — 고정 시간을 기다리면
// 느린 실행에서 빈 화면이나 절반만 그려진 화면을 훑고 "넘침 없음"을 보고한다.
//
// 그래서 훑기 전에 **관측 가능한 준비 표지 셋**을 요구하고, 제한 시간 안에 나타나지 않으면
// 그 자체가 FAIL이다 — 기다림이 끝났다는 이유로 훑기로 넘어가지 않는다.
//
// 무엇을 재고 무엇을 재지 않는지의 정본은 `docs/agents/verification.md`다.
import { launchWithExtension, POPUP_SIZE, resolveExtensionPath, seedState } from './ui-harness.mjs';
import { tokenFail } from './artifacts-arg.mjs';

// 이름표는 레지스트리의 게이트 id와 같아야 한다 — 러너가 `^(PASS|FAIL|N/A) <id>:`로 읽는다.
const LABEL = 'overflow-gate';
const fail = tokenFail(LABEL);

/** 준비 표지를 기다리는 제한 시간. 넘으면 훑지 않고 FAIL이다. */
const READY_TIMEOUT_MS = 15_000;

/**
 * 본문 서체(`global.css`의 `--font-sans` 첫 항목). 폰트 준비를 `fonts.check()`만으로 재면
 * **폰트가 아예 없을 때도 참**이다(실측: `@font-face`를 전부 지운 빌드에서 status=loaded,
 * check=true). 그러면 게이트가 폴백 글자 폭으로 훑으면서 "폰트 적용 확인"을 찍는다 —
 * 검사하지 않으면서 초록이다. 그래서 **등록된 face가 실제로 있는지**까지 본다.
 *
 * 한글 글리프는 이 서체에 없어 한국어 행은 언제나 폴백으로 그려진다. 이 표지가 고정하는 것은
 * "웹폰트가 도착했다"이지 "모든 글자가 이 서체로 그려진다"가 아니다.
 */
const BODY_FONT = 'Geist Variable';

/**
 * 경계 시드 — 최대 길이 en/ko 이름을 섞은 다수 프로필. 사이드바 목록이 길어져도 팝업 가로
 * 오버플로가 없어야 한다. 개수를 상수로 두는 이유는 **렌더된 행 수를 이 값과 대조**해
 * "다 그려졌다"를 개수로 확인하기 때문이다.
 */
const PROFILE_COUNT = 14;
const boundaryProfiles = Array.from({ length: PROFILE_COUNT }, (_, i) => ({
  id: `bnd${i}`,
  name:
    i % 2
      ? `아주 길고 긴 한국어 프로필 이름 경계 검증 ${i} — 칩과 사이드바에서 반드시 잘려야 한다`
      : `An extremely long English profile name for boundary verification ${i} that must truncate`,
  active: i % 3 === 0,
  shortLabel: `B${i % 10}`,
  color: '#2563eb',
  modifications: [],
}));

const seedFor = (profiles) => ({
  schemaVersion: 1,
  paused: false,
  customHeaderNames: [],
  materialized: {},
  profiles,
});

const resolved = resolveExtensionPath(process.argv.slice(2));
if (resolved.error) fail(resolved.error);

const { context, sw, extensionId } = await launchWithExtension(resolved.dir);
try {
  // 시드가 실패하면 화면이 비고, 빈 화면에는 넘치는 원소가 없다 — 아래 준비 표지가
  // 그 경우를 통과시키지 않는 것이 이 게이트의 전제다.
  await seedState(sw, seedFor(boundaryProfiles));

  const popup = await context.newPage();
  await popup.setViewportSize({ width: POPUP_SIZE.width, height: 600 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html?locale=ko`);

  /**
   * 준비 표지 셋. 셋 다 **관측**이지 기다림이 아니다:
   *   1. 심은 프로필이 전부 렌더됐는가 — 행 수를 시드 개수와 대조한다.
   *   2. 지연 로드되는 목록이 실제로 들어왔는가 — `data-profile-list="sortable"`.
   *      정적 fallback과 같은 모양을 그리므로 화면만 봐서는 구분되지 않는다.
   *   3. 폰트가 적용됐는가 — 웹폰트 전의 폴백은 글자 폭이 달라 넘침 판정이 바뀐다.
   */
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
    // 무엇이 준비되지 않았는지 말한다 — "시간이 지났다"로 끝나면 고칠 자리를 찾지 못한다.
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
      `준비 표지가 ${READY_TIMEOUT_MS}ms 안에 서지 않았다 — 훑지 않는다. ` +
        `지연 목록=${observed.sortable ? '도착' : observed.static ? '아직 정적 fallback' : '없음'} · ` +
        `렌더된 행=${observed.rows}/${PROFILE_COUNT} · ` +
        `${BODY_FONT} face=${observed.faces}개/${observed.fontsStatus}`,
    );
  }
  const readiness = await ready.jsonValue();

  /**
   * 문서 수준 오버플로 + 요소 수준 가로 스크롤러. 내부 가로 스크롤 표면 자체가 금지이므로
   * 스크롤로 흡수된 오버플로도 실패다 — 보이지 않는 스크롤로 조용히 흡수되면 사용자에겐
   * 아무 단서가 없다.
   */
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

  if (overflowPx > 0 || innerScrollers.length > 0) {
    fail(
      `가로 오버플로 ${overflowPx}px · 내부 가로 스크롤러 ${innerScrollers.length}개` +
        `${innerScrollers.length > 0 ? ` [${innerScrollers.join(', ')}]` : ''}`,
    );
  }
  console.log(
    `PASS ${LABEL}: 가로 오버플로 0px · 내부 스크롤러 0개 ` +
      `(프로필 ${readiness.rows}행 · 지연 목록 도착 · ${BODY_FONT} face ${readiness.faces}개 로드 뒤 훑음)`,
  );
} finally {
  await context.close();
}
