import type { ReactNode } from 'react';

export interface PanelSectionProps {
  title: ReactNode;
  /** 헤더 우측 액션 슬롯 — show/hide 토글, Export/Import 버튼 등. */
  actions?: ReactNode;
  children?: ReactNode;
}

/**
 * 보조 패널 셸 — border-t 구분선 + 헤더(title + flex-1 spacer + actions)를 흡수한다.
 * BackupPanel/PreferencesPanel/TransferPanel의 삼중 스캐폴드를 대체한다.
 * 본문 게이팅(open show/hide vs mode)은 패널마다 모델이 달라 호출자가 소유한다 —
 * 그래서 이름은 collapse가 아니라 section 셸을 뜻하는 PanelSection.
 */
export function PanelSection({ title, actions, children }: PanelSectionProps) {
  return (
    <section className="flex flex-col gap-2 border-t border-zinc-200 pt-2 dark:border-zinc-800">
      <header className="flex items-center gap-1">
        <span className="text-xs font-medium text-zinc-400">{title}</span>
        <span className="flex-1" />
        {actions}
      </header>
      {children}
    </section>
  );
}
