#!/usr/bin/env node
/*
 * 스모크 준비 배리어 감사 (티켓 14).
 *
 * 왜 필요한가: `pollSessionRuleCount`는 규칙 **개수**만 본다. 1개 → 1개 교체에서는
 * `updateSessionRules`가 원자적이라 개수가 기대치를 한 번도 벗어나지 않아, 배리어가
 * `pollUntil` 첫 프로브에서 **이전 테스트의 규칙 세트로** 즉시 만족된다. 그러면 단언이
 * 정확히 한 테스트씩 밀려 흔들린다(M2b가 `cookie=existing=preset`을 관측한 그 결함).
 *
 * 그래서 개수 배리어가 무효인 자리에서는 "이번 시드의 규칙이 실제로 살아 있다"는
 * **양성 증거**를 record 전에 확보해야 한다. 그 규칙이 지켜지는지 사람의 기억이 아니라
 * 스크립트가 지킨다 — 새 시나리오가 같은 함정에 다시 빠지는 것을 막는다.
 *
 * 게이트로 등록되어 있다(티켓 01). `bun run smoke-barriers`.
 *
 * 이 감사는 처음에 **의도적으로 등록하지 않았고**, 그 이유는 "인자로 다른 리비전의 사본도
 * 검사할 수 있다"였다. 그 능력은 등록과 공존하므로 등록을 막지 못한다:
 *   bun run smoke-barriers                    # 기본 — scripts/smoke.mjs
 *   bun run smoke-barriers /tmp/old-smoke.mjs # 회귀 전 상태가 실제로 flag되는지 확인
 * 반면 미등록의 비용은 실재했다. 이 감사가 막는 것은 단언이 한 테스트씩 밀리는 결함인데,
 * 사람이 기억해야 돌아가면 기억하지 않은 날 무방비해진다. 개정 이유는 판정 대장에 있다.
 */
import { readFileSync } from 'node:fs';

/** 시드 → 네트워크 관측으로 값을 만드는 자리 — 시드와 record 사이에 효과·내용 배리어가 있어야 한다. */
const SEED_GATED = ['K1', 'K2', 'K3', 'M1', 'M2', 'M2b', 'M2c', 'M2d', 'M2e', 'M4'];
/** 전이 중간 프레임을 읽지 않아야 하는 자리 — 안정화 폴링이 있어야 한다. */
const STABLE_GATED = ['N34b'];
/** 준비 상태를 **관측**하는 배리어들. 맨 waitForTimeout은 관측이 아니라 가정이라 세지 않는다. */
const BARRIER = /pollSessionRuleMatch\(|pollUntil\(|pollStable\(/;
const STABLE_BARRIER = /pollStable\(/;
/** 안정화 배리어는 관측 헬퍼 안에 있을 수 있어 record 직전 창을 본다. */
const STABLE_WINDOW = 60;

/**
 * 주석을 걷어낸다. 걷지 않으면 **배리어를 주석으로 접은 파일이 그대로 통과한다** — 흔들리는
 * 대기를 디버깅하며 `pollSessionRuleMatch(...)` 호출을 잠시 접어 두는 것이 정상 경로이고,
 * 그 상태에서 초록이 나면 이 감사가 막겠다고 선언한 결함(단언이 한 테스트씩 밀리는 것)이
 * 그대로 커밋된다. 지우는 것과 접는 것은 런타임 효과가 같은데 판정만 갈렸다(실측).
 * 형제 둘이 이미 같은 일을 한다 — `browser-parity.mjs`의 `withoutComments`,
 * `writer-lane-gate.mjs`의 `stripComments`.
 *
 * **줄 수를 보존해야 한다.** 이 감사의 창 계산(`STABLE_WINDOW`·시드~record 사이)이 전부 줄
 * 번호 기준이므로, 블록 주석을 지우면 창이 어긋나고 사유의 줄 번호도 원본과 달라진다. 그래서
 * 블록 주석은 삭제하지 않고 **같은 길이의 공백으로 덮는다.**
 *
 * `://`는 주석 시작으로 보지 않는다 — URL이 든 줄이 통째로 접히면 그 줄의 진짜 배리어 호출도
 * 함께 사라져 멀쩡한 시나리오가 빨강이 된다.
 */
const stripComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const target = process.argv[2] ?? new URL('./smoke.mjs', import.meta.url).pathname;
const lines = stripComments(readFileSync(target, 'utf8')).split('\n');

/**
 * `record('<id>: …` 는 한 줄이 아닐 수 있다. 포매터가 인자를 나누면 `record(` 와 id 리터럴이
 * 다른 줄에 놓인다 — 실측으로 포맷 적용에서 8개가 그렇게 됐고, 한 줄 안에서만 찾던 이 감사는
 * 그 8개를 "찾을 수 없다"로 보고했다. **없는 것과 모양이 바뀐 것은 다르다.**
 *
 * 그래서 id 리터럴이 있는 줄을 먼저 찾고 거기서 위로 `record(` 를 짚는다. 창(window) 계산이
 * 호출 시작 줄을 기준으로 서야 "시드와 record 사이"라는 뜻이 그대로 유지된다.
 */
const findRecord = (id) => {
  const at = lines.findIndex((line) => line.includes(`'${id}:`));
  if (at < 0) return -1;
  for (let i = at; i >= Math.max(0, at - 3); i -= 1) {
    if (lines[i].includes('record(')) return i;
  }
  return at;
};
/** 정의(`const seedProfiles = …`)가 아니라 **호출**만 센다. */
const isSeedCall = (line) => /(?:await\s+)?seedProfiles\(/.test(line) && !/const\s+seedProfiles/.test(line);

const problems = [];

for (const id of SEED_GATED) {
  const recordAt = findRecord(id);
  if (recordAt < 0) {
    problems.push(`${id}: record('${id}: … ) 를 찾을 수 없다`);
    continue;
  }
  let seedAt = -1;
  for (let i = recordAt - 1; i >= 0; i -= 1) {
    if (isSeedCall(lines[i])) {
      seedAt = i;
      break;
    }
  }
  if (seedAt < 0) {
    problems.push(`${id}: record 앞에 seedProfiles( 호출이 없다`);
    continue;
  }
  const window = lines.slice(seedAt + 1, recordAt);
  if (!window.some((line) => BARRIER.test(line))) {
    problems.push(
      `${id}: 시드(줄 ${seedAt + 1})와 record(줄 ${recordAt + 1}) 사이에 준비 배리어가 없다 — ` +
        `pollSessionRuleMatch/pollUntil/pollStable 중 하나로 이번 시드의 효과를 양성 확인할 것`,
    );
  }
}

for (const id of STABLE_GATED) {
  const recordAt = findRecord(id);
  if (recordAt < 0) {
    problems.push(`${id}: record('${id}: … ) 를 찾을 수 없다`);
    continue;
  }
  const window = lines.slice(Math.max(0, recordAt - STABLE_WINDOW), recordAt);
  if (!window.some((line) => STABLE_BARRIER.test(line))) {
    problems.push(
      `${id}: record(줄 ${recordAt + 1}) 앞 ${STABLE_WINDOW}줄에 pollStable( 이 없다 — ` +
        `고정 대기로 전이 중간 프레임을 표본으로 삼을 수 있다`,
    );
  }
}

// 상태 줄은 `<PASS|FAIL|N/A> smoke-barriers: …` 꼴이다. 게이트 러너가 이것을 읽어 종료
// 코드와 대조하므로, FAIL을 찍고 0으로 끝나는 종류의 어긋남이 잡힌다 (scripts/gates.txt의
// `verdict: token`). 저장소가 소유한 게이트만 이 계약을 진다 — tsc·vitest처럼 남이 만든
// 도구에까지 요구하면 게이트마다 래퍼가 생기고 그 래퍼가 새 거짓말 자리가 된다.
if (problems.length > 0) {
  console.error(`FAIL smoke-barriers: ${problems.length} barrier(s) missing in ${target}`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`PASS smoke-barriers: ${SEED_GATED.length + STABLE_GATED.length} barriers verified in ${target}`);
