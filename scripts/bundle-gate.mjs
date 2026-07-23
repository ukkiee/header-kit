#!/usr/bin/env node
// 번들 크기 게이트 — popup 초기 공용 청크가 기준선 386.0KB 대비 한도 미만인지 강제한다.
// 빌드 산출물(.output)을 검사한다.
//
// 한도 이력: 60KB(ui-refine 08 초기 추정) → 120KB(ui-refine 08 재트리아지, plan r1 R-3)
// → 135KB(ui-polish 02 재트리아지). 마지막 재조정 근거는 추정이 아니라 실측이다 —
// ScrollArea 도입(+12.6KB) 후 ui-diag 시작 지표가 first paint 60.0ms(기준선 64.0),
// dom ready 37.9ms(기준선 36.7)로 회귀가 없었다. 이 게이트는 체감 속도의 대리 지표인데
// 이제 직접 지표(ui-diag 시작 성능)가 있고, 그쪽이 실제 판정을 맡는다.
// 자세한 경위는 .scratch/ui-polish/issues/02-scroll-area.md.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BASELINE_KB = 386.0; // 기준선(ui-refine 이전 공용 청크, min·비압축)
const MAX_INCREASE_KB = 135; // 허용 증가량 (ui-polish 02 재트리아지 — 위 이력 참고)
const CHUNKS_DIR = '.output/chrome-mv3/chunks';

const files = readdirSync(CHUNKS_DIR);
// popup이 첫 페인트에 로드하는 공용 초기 청크 = global-*.js. dnd-kit·motion features는
// 별도 지연 청크(sortable-profile-list-*, motion-*)라 초기 로드에 포함되지 않는다.
const globalFile = files.find((f) => f.startsWith('global-') && f.endsWith('.js'));
if (!globalFile) {
  console.error('FAIL: global 청크를 찾을 수 없습니다 — 먼저 `bun run build`를 실행하세요.');
  process.exit(1);
}

const sizeKb = statSync(join(CHUNKS_DIR, globalFile)).size / 1024;
const increase = sizeKb - BASELINE_KB;
const deferred = files
  .filter((f) => /^(sortable-profile-list|motion)-.*\.js$/.test(f))
  .map((f) => `${f} ${(statSync(join(CHUNKS_DIR, f)).size / 1024).toFixed(0)}KB`);

const pass = increase < MAX_INCREASE_KB;
console.log(
  `bundle gate: global ${sizeKb.toFixed(1)}KB = baseline ${BASELINE_KB}KB + ${increase.toFixed(1)}KB ` +
    `(한도 +${MAX_INCREASE_KB}KB) — ${pass ? 'PASS' : 'FAIL'}`,
);
console.log(`  deferred chunks (초기 제외): ${deferred.join(', ')}`);

if (!pass) {
  console.error('FAIL: popup 초기 공용 청크 증가가 한도를 초과했습니다.');
  process.exit(1);
}
