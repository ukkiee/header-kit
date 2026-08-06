import type { ReactNode } from 'react';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/ui/card';

export interface SectionCardProps {
  title: ReactNode;
  /** 헤더 우측 슬롯 — 전송 카드의 내보내기/가져오기 토글 같은 것. */
  actions?: ReactNode;
  children?: ReactNode;
}

/**
 * 제목 있는 카드 하나 — 백업 화면의 카드 넷이 **이 한 벌**을 쓴다 (ADR 0017, 티켓 09).
 *
 * 셋(동기화·히스토리·초기화)은 `BackupPanel`이, 하나(JSON 내보내기·가져오기)는
 * `TransferPanel`이 그린다. 처음에는 각자 `Card`를 조립했는데, 주석은 "같은 셸을 쓴다"고
 * 말하면서 실제로는 두 벌이었다(code-review) — 한쪽만 고쳐지는 날 같은 화면의 카드들이
 * 서로 다른 여백과 글자 크기를 갖는다. 공유는 주석이 아니라 코드가 들고 있어야 한다.
 *
 * 방금 걷어낸 `PanelSection`이 하던 일과 같지만 모양이 다르다: 그쪽은 구분선 위의 섹션이었고
 * 이쪽은 시안의 카드다. 본문 게이팅은 여전히 호출자가 소유한다 — 전송 패널은 모드에 따라,
 * 히스토리는 목록 유무에 따라 다른 것을 그린다.
 */
export function SectionCard({ title, actions, children }: SectionCardProps) {
  return (
    <Card size="sm" className="gap-2 text-xs">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {actions && <CardAction className="flex gap-1">{actions}</CardAction>}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">{children}</CardContent>
    </Card>
  );
}
