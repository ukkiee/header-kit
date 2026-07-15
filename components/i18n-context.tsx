import { createContext, useContext, type ReactNode } from 'react';
import { makeTranslator, type Locale, type Translator } from '@/core/i18n';

const TranslatorContext = createContext<Translator>(makeTranslator('en'));

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <TranslatorContext.Provider value={makeTranslator(locale)}>
      {children}
    </TranslatorContext.Provider>
  );
}

/** 컴포넌트 어디서나 카탈로그 번역기를 얻는다 — 모든 UI 문자열은 이걸 거친다. */
export function useT(): Translator {
  return useContext(TranslatorContext);
}
