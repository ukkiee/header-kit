import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * AC: "모든 UI 문자열이 메시지 카탈로그를 거친다". 카탈로그 키-parity(i18n.test)만으로는
 * UI가 실제로 t()를 쓰는지 알 수 없으므로, UI JSX에 하드코딩된 사용자 대면 영문
 * 문자열이 없는지(=번역 우회) 정적으로 검사한다.
 *
 * UI는 이제 ui(프리미티브)·features(도메인)·app(셸) 세 레이어로 흩어져 있으므로
 * 각 루트를 재귀로 훑는다. 평면 스캔은 features를 놓쳐 vacuous pass가 된다.
 */

const ROOTS = [
  join(import.meta.dirname, '.'), // src/ui — 프리미티브 + 교차 컨텍스트
  join(import.meta.dirname, '..', 'features'), // 도메인 행/패널
  join(import.meta.dirname, '..', 'app'), // App 셸 (Alert 배너 등)
];

// JSX 텍스트 노드(닫는 태그가 뒤따르는)의 하드코딩 영문 문구. 이렇게 하면
// `Promise<...>` 같은 TypeScript 제네릭 오탐을 배제한다.
const JSX_TEXT = />(\s*[A-Z][A-Za-z][A-Za-z ,.'…?-]{2,})<\//g;

// 번역 대상이 아닌 것: 기술 리터럴·아이콘·코드·프로토콜 헤더 상수.
const ALLOW = [
  /^HeaderKit$/,
  /^chrome:\/\//,
  /^X-/, // 예시 헤더 이름 (placeholder 아님)
  /^[A-Z][A-Za-z]+(-[A-Z][A-Za-z]+)+$/, // 하이픈 헤더 상수 (Content-Security-Policy 등)
];

function collectFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectFiles(full));
    } else if (
      entry.name.endsWith('.tsx') &&
      !entry.name.endsWith('.stories.tsx') &&
      !entry.name.endsWith('.test.tsx')
    ) {
      out.push(full);
    }
  }
  return out;
}

describe('i18n 커버리지', () => {
  it('UI JSX에 카탈로그를 우회하는 하드코딩 영문 문구가 없다', () => {
    const files = ROOTS.flatMap(collectFiles);
    // 재귀가 실제로 여러 레이어를 훑는지(= 평면 스캔 회귀 방지) 확인한다.
    expect(files.length).toBeGreaterThan(15);

    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      for (const match of src.matchAll(JSX_TEXT)) {
        const text = match[1]!.trim();
        if (text === '' || ALLOW.some((re) => re.test(text))) continue;
        // {t(...)} 표현식은 '>' 뒤에 '{'가 오므로 이 정규식에 걸리지 않는다.
        offenders.push(`${file.split('/').pop()}: "${text}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
