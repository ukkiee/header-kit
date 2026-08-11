// README가 주장하는 것이 실제와 일치하는지 잰다.
//
// README는 러너가 검사하는 **네 자리 밖**에 있다. 게이트가 하나 늘거나 이름이 바뀌어도 러너는
// README를 보지 않으므로, 이 문서만 조용히 낡아 "무엇이 보장되는가"를 틀리게 말하게 된다.
// 그런데 이 문서의 주된 일이 바로 **초록이 무엇을 뜻하는지 과장하지 않는 것**이라, 낡은 README는
// 다른 낡은 문서보다 나쁘다 — 없는 보장을 있다고 말한다.
//
// 재는 것은 산문이 아니라 **집합과 이름**이다. 임계값과 근거는 각자의 정본에 두고, 여기서는
// 다루는 게이트 집합이 레지스트리와 같은지, 한계 칸이 비지 않았는지, 치라는 명령과 가리키는
// 경로가 실재하는지만 본다. 산문까지 재려 하면 문서를 고칠 때마다 빨강이 나고, 그 빨강을 푸는
// 길이 검사를 무르게 하는 것이 된다.
//
// **검사 자신이 픽스처로 물린다.** `problems()`가 텍스트를 인자로 받는 이유가 그것이다 — 실제
// README만 먹이면 마커 가드는 한 번도 실행되지 않고, 그것이 깨져도 아무도 모른 채 이 파일은
// 늘 초록이다. 관계를 깨뜨리는 픽스처가 없는 단언은 검사가 아니라 주장이다.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const readme = readFileSync(join(REPO, 'README.md'), 'utf8');
const registry = readFileSync(join(REPO, 'scripts', 'gates.txt'), 'utf8');
const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));

const BEGIN = '<!-- gate-limits:begin -->';
const END = '<!-- gate-limits:end -->';

/** 레지스트리의 게이트 id — "무엇이 게이트인가"의 정의는 여기 하나뿐이다. */
const registryIds = registry
  .split('\n')
  .filter((l) => l.startsWith('gate:'))
  .map((l) => l.slice('gate:'.length).split('|')[0].trim());

/**
 * 한계 표의 행들. `{ id, limit }`.
 *
 * 마커 사이만 읽는 이유는 러너가 게이트 표에서 배운 것과 같다: 문서에 표가 여럿이면 다른 표의
 * 행이 게이트 행으로 읽힌다. 마커가 정확히 한 쌍이 아니면 **빈 목록을 돌려주지 않고 던진다** —
 * 빈 목록은 "게이트가 없다"가 아니라 "읽지 못했다"이고, 둘을 섞으면 아무것도 재지 않으면서
 * 초록인 상태가 생긴다.
 */
function limitRows(text) {
  const lines = text.split('\n');
  const begins = lines.filter((l) => l.trim() === BEGIN).length;
  const ends = lines.filter((l) => l.trim() === END).length;
  if (begins !== 1 || ends !== 1) {
    throw new Error(`gate-limits 마커가 정확히 한 쌍이어야 한다 (begin ${begins}, end ${ends})`);
  }
  const from = lines.indexOf(lines.find((l) => l.trim() === BEGIN));
  const to = lines.indexOf(lines.find((l) => l.trim() === END));
  if (to < from) throw new Error('gate-limits 마커의 순서가 뒤집혔다');
  return lines
    .slice(from + 1, to)
    .map((l) => /^\|\s*`([^`]+)`\s*\|(.*)\|\s*$/.exec(l.trim()))
    .filter(Boolean)
    .map((m) => ({ id: m[1], limit: m[2].trim() }));
}

/** 명령 주장. 코드 블록 안까지 본다 — 사람이 복사하는 것이 거기 있다. */
const commandsIn = (text) => [...text.matchAll(/\bbun run ([A-Za-z0-9:_-]+)/g)].map((m) => m[1]);

/** 백틱 안의 저장소 경로만 본다. 산문 속 이름을 경로로 읽으면 평범한 문장이 빨강이 된다. */
const pathsIn = (text) => [...text.matchAll(/`((?:docs|scripts|src)\/[A-Za-z0-9._/-]+)`/g)].map((m) => m[1]);

/**
 * 어긋난 것들을 사람이 읽는 줄로 준다. 빈 배열이 통과다.
 *
 * 텍스트와 기대 집합을 **인자로** 받으므로 픽스처가 각 관계를 하나씩 깨뜨릴 수 있다.
 */
function problems(text, ids, scripts) {
  const out = [];
  const rows = limitRows(text);
  const covered = rows.map((r) => r.id);

  for (const id of ids) if (!covered.includes(id)) out.push(`레지스트리에 있는데 README에 없다: ${id}`);
  for (const id of covered) if (!ids.includes(id)) out.push(`README에만 있고 레지스트리에 없다: ${id}`);
  for (const [i, id] of covered.entries()) {
    if (covered.indexOf(id) !== i) out.push(`README에서 id가 중복된다: ${id}`);
  }
  // 한계 칸이 비면 이 문서의 **주된 일**이 그 행에서 빠진다. 게이트 이름만 적힌 행은 "이 게이트가
  // 무엇을 보장하지 않는가"에 답하지 않으면서 집합 검사만 만족시킨다.
  for (const r of rows) if (r.limit === '') out.push(`한계 칸이 비었다: ${r.id}`);

  for (const c of new Set(commandsIn(text))) {
    if (!(c in scripts)) out.push(`없는 명령을 치라고 한다: bun run ${c}`);
  }
  return out;
}

/** 픽스처용 최소 README. rows는 `[id, 한계]` 쌍. */
const doc = (rows, { markers = 1, extraEnd = 0 } = {}) =>
  [
    '# fixture',
    'bun run gate 로 전부 돌린다.',
    ...Array.from({ length: markers }, () => BEGIN),
    ...rows.map(([id, limit]) => `| \`${id}\` | ${limit} |`),
    ...Array.from({ length: markers + extraEnd }, () => END),
  ].join('\n');

const SCRIPTS = { gate: 'node scripts/run-gates.mjs' };

describe('README parity — 실제 README', () => {
  it('어긋난 것이 없다', () => {
    expect(problems(readme, registryIds, pkg.scripts)).toEqual([]);
  });

  it('검사가 공허하지 않다 — 실제로 읽은 것이 있다', () => {
    // 위 단언은 "어긋남이 없다"만 본다. 아무것도 못 읽어도 어긋남은 0이다.
    expect(limitRows(readme).length).toBe(registryIds.length);
    expect(registryIds.length).toBeGreaterThan(0);
    expect(commandsIn(readme)).toContain('gate');
    expect(pathsIn(readme).length).toBeGreaterThan(0);
  });

  it('가리키는 저장소 경로가 전부 존재한다', () => {
    const missing = [...new Set(pathsIn(readme))].filter((p) => {
      try {
        readFileSync(join(REPO, p));
        return false;
      } catch (e) {
        // 디렉터리를 가리키는 표기(`docs/adr/`)도 받는다.
        return e.code !== 'EISDIR';
      }
    });
    expect(missing).toEqual([]);
  });
});

describe('README parity — 관계를 깨뜨리면 잡는다', () => {
  it('전부 맞으면 통과한다', () => {
    expect(problems(doc([['a', '한계']]), ['a'], SCRIPTS)).toEqual([]);
  });

  it('레지스트리에 있는 게이트가 README에 없으면 잡는다', () => {
    // 이것이 없으면 게이트가 하나 늘었는데 **그 한계가 아무 데도 없는** 상태가 통과한다.
    expect(problems(doc([['a', '한계']]), ['a', 'b'], SCRIPTS)).toContain(
      '레지스트리에 있는데 README에 없다: b',
    );
  });

  it('README에만 있는 게이트를 잡는다', () => {
    expect(
      problems(
        doc([
          ['a', '한계'],
          ['ghost', '한계'],
        ]),
        ['a'],
        SCRIPTS,
      ),
    ).toContain('README에만 있고 레지스트리에 없다: ghost');
  });

  it('한계 칸이 비면 잡는다 — 이 문서의 주된 일이 빠진 자리다', () => {
    expect(problems(doc([['a', '']]), ['a'], SCRIPTS)).toContain('한계 칸이 비었다: a');
  });

  it('id가 중복되면 잡는다', () => {
    expect(
      problems(
        doc([
          ['a', '한계'],
          ['a', '다른 한계'],
        ]),
        ['a'],
        SCRIPTS,
      ),
    ).toContain('README에서 id가 중복된다: a');
  });

  it('없는 명령을 치라고 하면 잡는다', () => {
    const text = `${doc([['a', '한계']])}\nbun run nope 를 치세요.`;
    expect(problems(text, ['a'], SCRIPTS)).toContain('없는 명령을 치라고 한다: bun run nope');
  });

  it('마커가 없으면 던진다 — 빈 목록으로 접지 않는다', () => {
    // 접으면 마커를 잃은 문서가 "어긋남 0"으로 통과한다.
    expect(() => problems('# fixture\n| `a` | 한계 |', ['a'], SCRIPTS)).toThrow(/마커/);
  });

  it('마커 쌍이 둘이면 던진다', () => {
    expect(() => problems(doc([['a', '한계']], { markers: 2 }), ['a'], SCRIPTS)).toThrow(/마커/);
  });

  it('여는 마커만 있으면 던진다', () => {
    const text = `# fixture\n${BEGIN}\n| \`a\` | 한계 |`;
    expect(() => problems(text, ['a'], SCRIPTS)).toThrow(/마커/);
  });
});
