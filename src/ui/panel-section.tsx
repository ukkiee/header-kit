import { cloneElement, type ReactElement, type ReactNode } from 'react';

const headerRow = 'flex items-center gap-1';

export interface PanelSectionProps {
  title: ReactNode;
  /** 헤더 우측 액션 슬롯 — Export/Import 버튼 등. */
  actions?: ReactNode;
  /**
   * 헤더 행을 다른 요소로 렌더한다 — **헤더 전체가 클릭 대상**이어야 하는 패널이 쓴다
   * (CollapsiblePanel). 기본은 `<header>`. 넘긴 요소에 이 셸의 레이아웃 클래스와
   * 헤더 내용이 합쳐진다. 그래야 클릭 가능 영역이 제목·여백·아이콘 전체가 된다.
   */
  renderHeader?: ReactElement<{ className?: string; children?: ReactNode }>;
  children?: ReactNode;
}

/**
 * 보조 패널 셸 — border-t 구분선 + 헤더(title + flex-1 spacer + actions)를 흡수한다.
 * BackupPanel/PreferencesPanel/TransferPanel의 삼중 스캐폴드를 대체한다.
 * 본문 게이팅(open show/hide vs mode)은 패널마다 모델이 달라 호출자가 소유한다 —
 * 그래서 이름은 collapse가 아니라 section 셸을 뜻하는 PanelSection.
 */
export function PanelSection({ title, actions, renderHeader, children }: PanelSectionProps) {
  const headerContent = (
    <>
      <span className="text-xs font-medium text-zinc-400">{title}</span>
      <span className="flex-1" />
      {actions}
    </>
  );
  return (
    <section className="flex flex-col gap-2 border-t border-zinc-200 pt-2 dark:border-zinc-800">
      {renderHeader ? (
        cloneElement(renderHeader, {
          className: `${headerRow} ${renderHeader.props.className ?? ''}`,
          children: headerContent,
        })
      ) : (
        <header className={headerRow}>{headerContent}</header>
      )}
      {children}
    </section>
  );
}
