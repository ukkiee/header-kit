#!/usr/bin/env node
// 접근성 진단이 나빠지는 것을 잡는다 — 기존 위반은 베이스라인이 안고, 새 위반은 못 들어온다.
//
// 무엇을 재고 무엇을 재지 않는지, 지문에 줄·열을 넣지 않는 이유, 이 게이트가 주지 않는 것의
// 정본은 `docs/agents/verification.md`다. 여기에는 코드가 그렇게 생긴 이유만 적는다.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tokenFail } from './artifacts-arg.mjs';

// 이름표는 레지스트리의 게이트 id와 **같아야** 한다. 러너는 `^(PASS|FAIL|N/A) <id>:`로 읽으므로
// 다르면 게이트가 혼자서는 초록인데 러너에서는 늘 빨강이다(실측). 자리 일치 검사는 이 대조를
// 하지 않는다 — 돌려 봐야 안다.
const LABEL = 'a11y-gate';
const fail = tokenFail(LABEL);

const repo = process.cwd();
const BASELINE = join(repo, 'scripts', 'a11y-baseline.txt');

/** 인자 하나뿐이다. 중복·오타는 거절한다 — 무엇을 했는지가 호출 문면에서 읽혀야 한다. */
function parseArgs(argv) {
  let update = false;
  for (const a of argv) {
    if (a !== '--update') return { error: `알 수 없는 인자: ${a} — 받는 것은 --update 뿐이다` };
    if (update) return { error: '--update가 두 번 왔다' };
    update = true;
  }
  return { update };
}

const parsed = parseArgs(process.argv.slice(2));
if (parsed.error) fail(parsed.error);

/**
 * `--jsx-a11y-plugin`은 규칙을 **더한다**(실측: 116 → 151, 기존 규칙군도 그대로 돈다).
 * 설정 파일의 `plugins` 배열은 반대로 기본 세트를 갈아치우므로 그쪽에는 넣지 않는다 —
 * 넣으면 여기서 베이스라인으로 허용하기로 한 기존 위반들이 `lint` 게이트를 빨갛게 만든다.
 */
let report;
try {
  const out = execFileSync(
    join(repo, 'node_modules', '.bin', 'oxlint'),
    ['--jsx-a11y-plugin', '-f', 'json', '.'],
    {
      cwd: repo,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  report = JSON.parse(out);
} catch (e) {
  // 위반이 있으면 종료 코드가 1이다 — 그때도 stdout에 JSON이 온다.
  const out = e.stdout ?? '';
  try {
    report = JSON.parse(out);
  } catch {
    fail(`oxlint를 읽을 수 없다: ${String(e.message).split('\n')[0]}`);
  }
}

/**
 * 지문 = `규칙 | 파일 | 진단 대상의 정규화된 식별자`.
 *
 * 식별자는 스팬이 가리키는 소스에서 **이름만** 뽑는다(`autoFocus={editing}` → `autoFocus`,
 * `div` → `div`). 표현식 전체를 쓰면 그 안의 변수 이름만 바꿔도 지문이 갈려 평범한 편집이
 * 빨강이 된다. 이름은 그 진단이 무엇을 가리키는지를 위치에도 표현식에도 기대지 않고 말한다.
 *
 * 스팬 오프셋은 **바이트** 기준이다 — 이 저장소의 소스에는 한국어 주석이 있어 문자열로
 * 자르면 엉뚱한 곳을 읽는다(실측으로 그렇게 됐다).
 */
const sources = new Map();
const readSource = (file) => {
  if (!sources.has(file)) sources.set(file, readFileSync(join(repo, file)));
  return sources.get(file);
};

/**
 * 스팬이 가리키는 것에서 **이름**을 뽑는다. 셋 다 실측된 모양이다:
 *   `<img src={src} />` → `img`   (요소 단위 규칙: alt-text·click-events-have-key-events …)
 *   `autoFocus={true}`  → `autoFocus`
 *   `div`               → `div`
 *
 * 이름을 못 뽑으면 **자르지 않고 해시한다.** 접두를 잘라 쓰면 두 가지가 함께 깨진다:
 * 앞부분이 같은 서로 다른 위반이 한 지문으로 접혀 **새 위반이 숨고**, 잘린 끝에 공백이 남으면
 * 방금 뜬 베이스라인이 다시 읽을 때 달라져 `--update`로도 풀리지 않는 빨강이 된다(리뷰 실측).
 * 해시는 표현식이 바뀌면 갈리므로 마지막 수단이다.
 */
function identifierOf(text) {
  const element = /^<\s*([A-Za-z_$][\w$.:-]*)/.exec(text);
  if (element) return element[1];
  const name = /^[A-Za-z_$][\w$-]*/.exec(text);
  if (name) return name[0];
  return `#${createHash('sha1').update(text).digest('hex').slice(0, 12)}`;
}

/**
 * 스팬이 **자기가 들어 있는 여는 태그** 안에 있으면 그 태그 이름을 준다. 아니면 null이다.
 *
 * 규칙은 정확하다: 오프셋 앞의 마지막 `<` 뒤에 `>`가 하나도 없으면 그 `<`의 태그가 아직 열려
 * 있는 것이고, 스팬은 그 태그 **안**(속성 자리)에 있다. `>`가 끼어 있으면 태그 밖이므로 접두를
 * 붙이지 않는다.
 *
 * **앞의 여는 태그를 뒤로 훑는 방식은 틀렸다**(릴리스 r2 F1, 실측): 그 방식은 이미 닫힌 형제를
 * 고른다 — `<span …>{caption}</span>` 다음 줄의 `div` 위반이 `span.div`로 키를 받았고, 그러면
 * 무관한 형제의 이름만 바꿔도 위반한 요소는 그대로인 채 지문이 갈려 **평범한 마크업 편집이
 * 빨강**이 된다. 그 빨강을 푸는 베이스라인 재취득이 진짜 새 위반을 함께 축복한다.
 */
function openTagAt(source, offset) {
  const before = source.subarray(0, offset).toString('utf8');
  const lt = before.lastIndexOf('<');
  if (lt === -1) return null;
  if (before.indexOf('>', lt) !== -1) return null; // 태그가 이미 닫혔다 — 우리는 그 밖에 있다
  const name = /^<\s*([A-Za-z_$][\w$.:-]*)/.exec(before.slice(lt));
  return name === null ? null : name[1];
}

function fingerprint(diagnostic) {
  const span = diagnostic.labels?.[0]?.span;
  const rule = diagnostic.code;
  if (!span) return `${rule} | ${diagnostic.filename} | (스팬 없음)`;
  const source = readSource(diagnostic.filename);
  const text = source
    .subarray(span.offset, span.offset + span.length)
    .toString('utf8')
    .replace(/\s+/g, ' ')
    .trim();
  const name = identifierOf(text);
  // 스팬이 여는 태그 전체(`<img …>`)를 가리키거나 태그 이름 자체(`div`)를 가리키면 그것이 이미
  // 요소다 — 접두를 붙이면 무관한 바깥 요소가 지문에 섞인다. 속성 자리에 있는 스팬만
  // `요소.속성`으로 좁힌다(실측: `autoFocus` → `Input.autoFocus`).
  const element = text.startsWith('<') ? null : openTagAt(source, span.offset);
  return `${rule} | ${diagnostic.filename} | ${element === null ? name : `${element}.${name}`}`;
}

// 훑은 파일이 0이면 진단도 0이고, 그것은 "위반이 없다"가 아니라 **재지 못했다**이다. 그대로
// 두면 전부 사라진 것으로 읽혀 게이트가 조용히 통과한다 — 이 저장소가 여러 게이트에서 막아 온
// 형태다(리뷰 실측).
if ((report.number_of_files ?? 0) === 0) {
  fail('훑은 파일이 0이다 — 위반이 없는 것이 아니라 재지 못한 것이다');
}

/** 같은 파일 안에 구분 불가능한 진단이 여럿이면 **개수까지가 지문의 일부**다. */
const observed = new Map();
for (const d of report.diagnostics ?? []) {
  if (!d.code?.startsWith('jsx-a11y(')) continue;
  const key = fingerprint(d);
  observed.set(key, (observed.get(key) ?? 0) + 1);
}

const HEADER = `# 접근성 지문 베이스라인 — \`scripts/a11y-gate.mjs\`가 읽고 \`--update\`가 쓴다.
# 한 줄은 \`<개수> <규칙> | <파일> | <식별자>\`. 손으로 고치지 말고 \`--update\`를 쓰세요.
# 이 파일이 무엇을 보장하고 무엇을 보장하지 않는지는 \`docs/agents/verification.md\`가 적는다.
`;

const serialize = (counts) =>
  `${HEADER}${[...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, n]) => `${n} ${key}`)
    .join('\n')}\n`;

function readBaseline() {
  if (!existsSync(BASELINE)) return null;
  const counts = new Map();
  for (const raw of readFileSync(BASELINE, 'utf8').split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const m = /^(\d+) (.+)$/.exec(line);
    if (!m) fail(`베이스라인을 읽을 수 없다: "${line}" — \`<개수> <지문>\` 꼴이어야 한다`);
    // 같은 지문이 두 줄이면 뒤가 앞을 덮어 허용치가 조용히 넓어진다(`1 X` 밑의 `99 X`).
    if (counts.has(m[2])) fail(`베이스라인에 같은 지문이 두 번 있다: ${m[2]}`);
    counts.set(m[2], Number(m[1]));
  }
  return counts;
}

if (parsed.update) {
  // **`--update`는 좁히기만 하는 것이 아니다.** 지금 있는 위반을 그대로 축복하므로 새 위반도
  // 함께 들어간다. 무엇이 늘었는지 반드시 말한다 — 말하지 않으면 이 명령이 게이트를 끄는
  // 가장 쉬운 길이 된다. (`manifest-gate`는 표면을 넓히려면 선언을 손으로 고치게 해서
  // 사람이 한 번 멈추는데, 여기는 명령 하나다. 그 비대칭은 검증 문서가 적는다.)
  const before = existsSync(BASELINE) ? readBaseline() : new Map();
  const widened = [...observed.entries()].filter(([key, n]) => n > (before.get(key) ?? 0));
  writeFileSync(BASELINE, serialize(observed));
  for (const [key, n] of widened) console.log(`  넓힘(${before.get(key) ?? 0} → ${n}): ${key}`);
  const total = [...observed.values()].reduce((a, b) => a + b, 0);
  console.log(
    `PASS ${LABEL}: 베이스라인을 다시 썼다 — 지문 ${observed.size}종 · 진단 ${total}건` +
      `${widened.length > 0 ? ` · **넓어진 지문 ${widened.length}종**` : ''}`,
  );
  process.exit(0);
}

const baseline = readBaseline();
if (baseline === null) {
  fail(`베이스라인이 없다: ${BASELINE} — 먼저 \`bun run a11y-gate --update\`로 뜨세요`);
}

// 새 지문과 개수 증가가 FAIL이다. **줄어든 것은 통과**하되 무엇이 사라졌는지 말한다 —
// 지우지 않으면 그 위반을 다시 들여도 통과하기 때문이다.
const added = [];
for (const [key, n] of observed) {
  const was = baseline.get(key) ?? 0;
  if (n > was) added.push(was === 0 ? `새 지문: ${key}` : `늘어남(${was} → ${n}): ${key}`);
}
const gone = [];
for (const [key, n] of baseline) {
  const now = observed.get(key) ?? 0;
  if (now < n) gone.push(now === 0 ? `사라짐: ${key}` : `줄어듦(${n} → ${now}): ${key}`);
}

// **전부 사라진 것**은 다 고친 것일 수도, 도구가 조용히 꺼진 것일 수도 있다. 둘을 구분할 수
// 없으므로 통과시키지 않는다 — 규칙군이 무음이 되면 그 뒤로는 무엇을 넣어도 초록이기 때문이다.
// 정말 다 고쳤다면 `--update`가 그 사실을 베이스라인에 적는다.
if (baseline.size > 0 && observed.size === 0) {
  fail(
    `베이스라인의 지문 ${baseline.size}종이 **전부** 사라졌다 — 다 고친 것인지 도구가 돌지 않은 ` +
      `것인지 이 게이트는 구분할 수 없다. 확인한 뒤 \`bun run a11y-gate --update\`로 적으세요.`,
  );
}

for (const g of gone) console.log(`  ${g}`);
if (gone.length > 0) {
  console.log(
    `  → \`bun run a11y-gate --update\`로 베이스라인을 좁히세요. 그러지 않으면 같은 위반이 다시 들어와도 통과합니다.`,
  );
}

if (added.length > 0) {
  for (const a of added) console.error(`  ${a}`);
  fail(`접근성 진단이 늘었다 — ${added.length}건`);
}

const total = [...observed.values()].reduce((a, b) => a + b, 0);
console.log(
  `PASS ${LABEL}: 새 접근성 진단 없음 (지문 ${observed.size}종 · 진단 ${total}건, 베이스라인 안)` +
    `${gone.length > 0 ? ` · 사라진 지문 ${gone.length}종` : ''}`,
);
