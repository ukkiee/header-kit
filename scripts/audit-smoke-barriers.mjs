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
 * `package.json`은 설정 가드라 스크립트를 등록하지 않는다. 직접 돌린다:
 *   node scripts/audit-smoke-barriers.mjs [검사할 smoke.mjs 경로]
 * 인자를 주면 다른 리비전의 사본도 검사할 수 있다(회귀 전 상태가 실제로 flag되는지 확인).
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

const target = process.argv[2] ?? new URL('./smoke.mjs', import.meta.url).pathname;
const lines = readFileSync(target, 'utf8').split('\n');

const findRecord = (id) => lines.findIndex((line) => line.includes(`record('${id}:`));
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

if (problems.length > 0) {
  console.error(`FAIL ${problems.length} barrier(s) missing in ${target}`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`OK ${SEED_GATED.length + STABLE_GATED.length} barriers verified in ${target}`);
