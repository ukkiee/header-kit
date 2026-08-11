#!/usr/bin/env node
// 하네스 코어가 조용히 부푸는 것을 잡는다 (ADR 0018).
//
// 항상 로드되는 문서는 커지면 커진 만큼 매 태스크에 비용이 붙는데, **커졌다는 사실이 아무
// 데도 나타나지 않는다.** 이 게이트가 그것을 나타나게 하는 유일한 장치다.
//
// 무엇을 재고 무엇을 재지 않는지의 정본은 `docs/agents/verification.md`다. 여기에는 코드가
// 그렇게 생긴 이유만 적는다.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenFail } from './artifacts-arg.mjs';

const LABEL = 'core-line-budget';
const fail = tokenFail(LABEL);

const BEGIN = '<!-- core:begin -->';
const END = '<!-- core:end -->';
/**
 * 코어가 자기 예산을 말하는 한 가지 모양. 게이트가 값을 들고 있지 않은 이유는, 그러면
 * 예산을 올리는 일이 코어를 건드리지 않고도 되기 때문이다 — 늘어난 쪽이 스스로 선언한다.
 */
const DECLARATION = /^Target\s+(\S+)\s+lines$/;

function parseArgs(argv) {
  let dir = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== '--dir') fail(`알 수 없는 인자: ${argv[i]} — 받는 것은 --dir <트리> 뿐이다`);
    if (dir !== null) fail('--dir가 두 번 왔다 — 어느 트리를 재라는 것인지 판정할 수 없다');
    const v = argv[i + 1];
    if (v === undefined || v.trim() === '' || v.startsWith('-')) {
      fail(`--dir에 트리가 없다 (받은 값: ${v === undefined ? '없음' : `"${v}"`})`);
    }
    dir = v;
    i += 1;
  }
  return dir;
}

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(parseArgs(process.argv.slice(2)) ?? join(here, '..'));
const path = join(root, 'AGENTS.md');
// 없는 것은 통과가 아니다. 파일이 사라진 트리에서 조용히 초록을 내면 이 게이트는 코어가
// 삭제된 상태를 가장 잘 통과한다.
if (!existsSync(path)) fail(`AGENTS.md가 없다: ${path}`);

const lines = readFileSync(path, 'utf8').split('\n');
const at = (marker) => lines.flatMap((l, i) => (l.trim() === marker ? [i] : []));
const begins = at(BEGIN);
const ends = at(END);

// 마커 쌍이 정확히 하나가 아니면 FAIL이다. 마커를 잃은 문서가 빈 구간을 돌려주는 것은
// "코어가 비었다"가 아니라 "읽지 못했다"이고, 둘을 섞으면 아무것도 재지 않으면서 초록인
// 상태가 생긴다 — 이 게이트가 막으려는 것과 정확히 같은 모양이다.
if (begins.length !== 1 || ends.length !== 1) {
  fail(`코어 마커가 정확히 한 쌍이어야 한다 (begin ${begins.length}, end ${ends.length}): ${path}`);
}
if (ends[0] < begins[0]) fail(`코어 마커의 순서가 뒤집혔다: ${path}`);

/** 마커 **사이**만 잰다 — 마커 줄 자신도, 바깥의 설정 블록도 들지 않는다. */
const core = lines.slice(begins[0] + 1, ends[0]);

const declared = core.flatMap((l) => {
  const m = DECLARATION.exec(l.trim());
  return m === null ? [] : [m[1]];
});
// 선언이 정확히 하나가 아니면 FAIL이다. 값이 같은 둘을 허락하지 않는 이유는, 한쪽만 고치는
// 편집이 곧바로 "서로 다른 선언 둘"을 만들기 때문이다 — 그 상태를 만들 수 없게 한다.
if (declared.length !== 1) {
  fail(
    declared.length === 0
      ? `코어가 예산을 선언하지 않았다 — 마커 사이에 "Target <N> lines" 한 줄이 있어야 한다`
      : `코어의 예산 선언이 ${declared.length}개다 (${declared.join(', ')}) — 하나만 산다`,
  );
}
// 정수만 받는다. `Target many lines`가 NaN으로 흘러 비교를 조용히 거짓으로 만들면, 예산이
// 없는 코어가 예산을 지킨 것으로 보고된다.
if (!/^\d+$/.test(declared[0])) fail(`예산이 정수가 아니다: "Target ${declared[0]} lines"`);
const budget = Number(declared[0]);

// 빈 줄도 센다. 항상 로드되는 문서에서는 빈 줄도 비용이고, "무엇을 셀지"에 판단이 끼면
// 그 판단이 예산을 우회하는 자리가 된다.
const used = core.length;
if (used > budget) {
  fail(
    `코어가 예산을 넘었다: ${used}/${budget}줄 (${used - budget}줄 초과) — ` +
      `예산을 올리지 말고 옮기세요. 옮기는 순서는 코어의 "Amending this core"가 적는다.`,
  );
}

process.stdout.write(`PASS ${LABEL}: 코어 ${used}/${budget}줄 (여유 ${budget - used}줄)\n`);
