import { describe, expect, it } from 'vitest';
import { makeTranslator } from '@/core/i18n';
import type { Filter } from '@/core/schema';
import { filterView } from './filter-summary';

const t = makeTranslator('en');
const ko = makeTranslator('ko');

describe('filterView', () => {
  it('URL/제외 URL — 패턴 요약, 제목은 종류 라벨', () => {
    const url: Filter = { kind: 'url', id: 'f1', enabled: true, pattern: 'api\\.example' };
    expect(filterView(url, t)).toEqual({ title: 'URL filter', badge: 'FILTER', summary: 'api\\.example' });
    expect(filterView(url, ko).title).toBe('URL 필터');

    const exclude: Filter = { kind: 'exclude-url', id: 'f2', enabled: true, pattern: 'admin' };
    expect(filterView(exclude, t).summary).toBe('admin');
  });

  it('리소스 종류·메서드 — 값 나열', () => {
    expect(
      filterView({ kind: 'resource-type', id: 'f', enabled: true, resourceTypes: ['xmlhttprequest', 'script'] }, t)
        .summary,
    ).toBe('xmlhttprequest · script');
    expect(
      filterView({ kind: 'request-method', id: 'f', enabled: true, methods: ['post', 'put'] }, t).summary,
    ).toBe('post · put');
  });

  it('도메인 계열 — 도메인 문자열', () => {
    expect(filterView({ kind: 'initiator-domain', id: 'f', enabled: true, domain: 'a.io' }, t).summary).toBe('a.io');
    expect(filterView({ kind: 'tab-domain', id: 'f', enabled: true, domain: 'b.io' }, t).summary).toBe('b.io');
  });

  it('시간 — 로컬 시각 + Until 라벨', () => {
    const view = filterView({ kind: 'time', id: 'f', enabled: true, expiresAt: 1789000000000 }, t);
    expect(view.summary).toContain(new Date(1789000000000).getFullYear().toString());
  });

  it('빈 값 폴백 — emptyMarker', () => {
    expect(filterView({ kind: 'url', id: 'f', enabled: true, pattern: '' }, t).summary).toBe('(empty)');
    expect(
      filterView({ kind: 'resource-type', id: 'f', enabled: true, resourceTypes: [] }, ko).summary,
    ).toBe('(비어 있음)');
  });
});
