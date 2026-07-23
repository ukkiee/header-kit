import type { ReactNode } from 'react';

const headerRow = 'flex items-center gap-1';

export interface PanelSectionProps {
  title: ReactNode;
  /**
   * 헤더 우측 슬롯 — Export/Import 버튼, 접힘 표시 아이콘 등.
   * `renderHeader`를 함께 쓰면 이 슬롯은 **트리거 안쪽**에 놓인다 — 그때는 포커스
   * 가능한 요소를 넣지 말 것(중첩 버튼이 되고 Tab 정지가 늘어난다).
   */
  actions?: ReactNode;
  /**
   * 헤더 행을 감싸는 요소를 호출자가 정한다 — **헤더 전체가 클릭 대상**이어야 하는
   * 패널이 쓴다(CollapsiblePanel). 기본은 `<header>`.
   *
   * 요소가 아니라 함수를 받는다: 셸이 정하는 레이아웃 클래스와 헤더 내용을 인자로
   * 넘겨 호출자가 직접 조립하게 하면, `cloneElement`로 남의 props를 헤집지 않아도 되고
   * 클래스가 어디서 합쳐지는지가 호출부에 그대로 보인다.
   */
  renderHeader?: (header: { className: string; children: ReactNode }) => ReactNode;
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
      {renderHeader
        ? renderHeader({ className: headerRow, children: headerContent })
        : <header className={headerRow}>{headerContent}</header>}
      {children}
    </section>
  );
}
