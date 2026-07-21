import { describe, expect, it } from 'vitest';
import { makeTranslator } from '@/core/i18n';
import type { WarningView } from '@/core/summary';
import { warningText } from './warning-text';

const en = makeTranslator('en');
const ko = makeTranslator('ko');

const view = (code: WarningView['code'], params: WarningView['params'] = {}): WarningView => ({
  code,
  params,
});

describe('warningText', () => {
  it('여섯 경고 code 모두 라벨·상세를 낸다 (미보간 키 누수 없음)', () => {
    const views: WarningView[] = [
      view('empty-header-name'),
      view('header-overlap', { header: 'X-A' }),
      view('regex-too-long', { limit: 2000 }),
      view('quota-exceeded', { quota: 'total-rules', limit: 5000 }),
      view('missing-materialization'),
      view('append-not-allowed', { header: 'Host' }),
    ];
    for (const w of views) {
      for (const translate of [en, ko]) {
        const { label, detail } = warningText(w, translate);
        expect(label.length).toBeGreaterThan(0);
        expect(detail.length).toBeGreaterThan(0);
        // {param} 자리표시자가 그대로 남지 않았는지 확인.
        expect(detail).not.toMatch(/\{\w+\}/);
      }
    }
  });

  it('quota는 total/regex를 params.quota로 분기한다', () => {
    const total = warningText(view('quota-exceeded', { quota: 'total-rules', limit: 5000 }), en);
    const regex = warningText(view('quota-exceeded', { quota: 'regex-rules', limit: 1000 }), en);
    expect(total.detail).toContain('Session');
    expect(total.detail).toContain('5000');
    expect(regex.detail).toContain('Regex');
    expect(regex.detail).toContain('1000');
    expect(total.detail).not.toBe(regex.detail);
  });

  it('header/limit 보간이 상세에 실제 값으로 들어간다', () => {
    expect(warningText(view('header-overlap', { header: 'X-Custom' }), en).detail).toContain(
      'X-Custom',
    );
    expect(warningText(view('append-not-allowed', { header: 'Host' }), ko).detail).toContain('Host');
    expect(warningText(view('regex-too-long', { limit: 2048 }), ko).detail).toContain('2048');
  });

  it('로케일에 따라 라벨이 달라진다 (en ≠ ko)', () => {
    const w = view('empty-header-name');
    expect(warningText(w, en).label).not.toBe(warningText(w, ko).label);
  });
});
