import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * AC: "모든 UI 문자열이 메시지 카탈로그를 거친다". 카탈로그 키-parity(i18n.test)만으로는
 * UI가 실제로 t()를 쓰는지 알 수 없으므로, 컴포넌트 JSX에 하드코딩된 사용자 대면
 * 영문 문자열이 없는지(=번역 우회) 정적으로 검사한다.
 */

const COMPONENTS_DIR = join(import.meta.dirname, '.');

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

function collectFiles(): string[] {
  return readdirSync(COMPONENTS_DIR)
    .filter((f) => f.endsWith('.tsx') && !f.endsWith('.stories.tsx') && !f.endsWith('.test.tsx'))
    .map((f) => join(COMPONENTS_DIR, f));
}

describe('i18n 커버리지', () => {
  it('컴포넌트 JSX에 카탈로그를 우회하는 하드코딩 영문 문구가 없다', () => {
    const offenders: string[] = [];
    for (const file of collectFiles()) {
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
