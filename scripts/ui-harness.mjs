/**
 * 실 확장을 로드한 브라우저를 띄우는 공용 배관. `overflow-gate`와 `ui-perf`가 같은 방식으로
 * 띄워야 둘이 재는 대상이 같은 확장이라는 것이 성립한다 — 사본 둘로 두면 한쪽만 조용히
 * 달라진다(`artifacts-arg.mjs`가 소비자 셋에 세운 계약과 같은 이유다).
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { artifactsDirFrom, missingArtifacts } from './artifacts-arg.mjs';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 팝업 크기 — ADR 0005의 고정 셸. 계측도 훑기도 실제 팝업과 같은 크기에서 해야 한다. */
export const POPUP_SIZE = { width: 760, height: 580 };

/**
 * 러너가 넘긴 이 회차의 산출물을 쓴다 (D4a). 인자가 없으면 기존 기본 경로다.
 * 오류는 던지지 않고 돌려준다 — 부르는 쪽이 자기 게이트 id로 FAIL 줄을 찍어야 하기 때문이다.
 */
export function resolveExtensionPath(argv) {
  const parsed = artifactsDirFrom(argv, path.join(REPO_ROOT, '.output', 'chrome-mv3'));
  if (parsed.error) return parsed;
  const dir = path.isAbsolute(parsed.dir) ? parsed.dir : path.join(process.cwd(), parsed.dir);
  if (!existsSync(path.join(dir, 'manifest.json'))) {
    return { error: missingArtifacts(path.join(dir, 'manifest.json')) };
  }
  return { dir };
}

/**
 * 확장을 로드한 컨텍스트와 서비스워커를 준다. 서비스워커를 함께 주는 이유는 시드가
 * `chrome.storage`를 거쳐야 하기 때문이다 — 페이지 쪽에서 심으면 확장 저장소가 아니다.
 */
export async function launchWithExtension(extensionPath, { locale = 'ko' } = {}) {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      `--lang=${locale}`,
    ],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extensionId = new URL(sw.url()).host;
  return { context, sw, extensionId };
}

/** 확장 저장소에 상태를 통째로 심는다. */
export const seedState = (sw, state) =>
  sw.evaluate(async (value) => chrome.storage.local.set({ state: value }), state);
