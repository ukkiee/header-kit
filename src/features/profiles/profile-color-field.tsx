import { lazy, Suspense, useState } from 'react';
import { format } from '@/core/i18n';
import { normalizeProfileColor, PROFILE_COLORS } from '@/core/schema';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover';
import { useT } from '@/ui/i18n-context';
import { focusRing } from '@/ui/tokens';

/**
 * 자유 선택은 **지연 청크**다 — 근거는 그 파일이 적는다. 팔레트는 여기 남는다: 열 개의
 * `<button>`뿐이라 나눌 것이 없고, 팝오버를 연 사람이 가장 먼저 보는 것이라 기다림이
 * 끼면 안 된다.
 */
const ProfileColorPicker = lazy(() => import('./profile-color-picker'));

/**
 * 프로필 색 고르기 (ADR 0017 재개정) — **팔레트 10색이 기본, 그 아래가 자유 선택.**
 *
 * 자리가 **이름 편집 중**인 이유는 폭이다. 프로필 열은 264px에 못박혀 있고 그 안에 그립·이름·
 * 메타·이름변경·삭제·스위치가 이미 서 있다 — 아이콘을 하나 더 상시로 들이면 이름이 먼저
 * 잘린다(ADR 0017이 삭제 아이콘을 숨긴 그 근거). 대신 **이미 거기 있는 색 스와치**가 편집
 * 중에만 버튼이 된다: 새로 드는 자리가 0이고, 색을 바꾸는 것이 곧 그 사각형이라 매핑도 직접적이다.
 *
 * 트리거의 겉보기 크기는 스와치 그대로(10px)이고 `-m-1 p-1`로 **누를 수 있는 넓이만** 18px로
 * 넓힌다 — 음수 여백이 그만큼을 레이아웃에서 도로 걷어가므로 행 폭은 변하지 않는다.
 */
export function ProfileColorField({
  profileName,
  color,
  onCommit,
  onOpenChange,
}: {
  profileName: string;
  color: string;
  /** 정규화를 통과하고 **실제로 달라진** 값일 때만 불린다. */
  onCommit: (color: string) => void;
  /**
   * 열림을 **위로도 알린다** — 팝오버 내용이 포털이라 편집 셸의 경계 밖이고, 그 셸은 열려
   * 있는 동안 blur 커밋을 멈춰야 하기 때문이다(`profile-dot`의 `handleEditorBlur`).
   */
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  /**
   * 열림을 **제어한다** — 팔레트를 누르면 그 자리에서 닫아야 하기 때문이다. 고른 뒤에도
   * 팝오버가 남아 있으면 "골랐다"의 답이 화면에 없다.
   */
  const [open, setOpen] = useState(false);
  /**
   * 자유 선택의 초안 — 열려 있는 동안만 산다.
   *
   * **명령을 여기서 보내지 않는 이유**: 컬러피커의 `onValueChange`는 색면을 드래그하는 내내
   * 불린다. 그대로 보내면 한 번 훑는 동안 dNR 재컴파일과 백업 스냅샷이 수십 번 예약된다
   * (`onStateChanged`가 `converge(); scheduleBackup();`을 함께 부른다) — 이름 편집이 매
   * 키입력마다 보내지 않는 것과 같은 이유다. 팝오버가 닫힐 때 **한 번만** 커밋한다.
   */
  const [draft, setDraft] = useState<string | null>(null);

  // 지금 색도 접어서 비교한다 — 저장된 값이 `#ABC`든 `#aabbcc`든 같은 색이면 같아야 한다.
  const current = normalizeProfileColor(color);

  /** 정규화와 무변화 판정의 단 하나의 자리 — 팔레트와 자유 선택이 같은 문을 지난다. */
  const commit = (next: string) => {
    const normalized = normalizeProfileColor(next);
    if (normalized === null || normalized === current) return;
    onCommit(normalized);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        onOpenChange(next);
        if (next) return;
        // 닫히는 순간이 자유 선택의 커밋 지점이다. 팔레트는 누른 그 자리에서 이미 커밋했다.
        if (draft !== null) commit(draft);
        setDraft(null);
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={format(t('ariaProfileColor'), { name: profileName })}
            className={`-m-1 flex shrink-0 items-center justify-center rounded-[5px] p-1 ${focusRing}`}
          >
            {/*
              스와치의 생김새는 `ProfileDot`과 같아야 한다 — 편집을 열고 닫을 때 같은 자리의
              같은 사각형이 모양을 바꾸면 그것이 색이라는 사실이 흔들린다. 다만 여기서는
              **언제나 색으로 칠한다**: 이 사각형이 지금 말하는 것은 프로필의 켬/끔이 아니라
              "이 색을 고치는 중"이다.
            */}
            <span
              aria-hidden
              className="size-2.5 rounded-[3px]"
              style={{ backgroundColor: draft ?? color }}
            />
          </button>
        }
      />
      <PopoverContent align="start" className="w-56 gap-2">
        {/*
          팔레트 — 누르는 즉시 커밋하고 닫는다. 열 개는 고른 값이 **이산적**이라 초안을 둘
          이유가 없고, 닫힘이 곧 "골랐다"의 답이 된다.
        */}
        <div className="grid grid-cols-5 gap-1.5">
          {PROFILE_COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={format(t('ariaProfileColorSwatch'), { color: swatch })}
              // 지금 색에는 표시가 선다 — 링 **두께**가 바뀌므로 색만으로 알리지 않는다.
              aria-pressed={current === swatch}
              className={`h-6 rounded-md ring-offset-1 ring-offset-popover ${focusRing} ${
                current === swatch ? 'ring-2 ring-foreground' : 'ring-1 ring-foreground/15'
              }`}
              style={{ backgroundColor: swatch }}
              onClick={() => {
                setDraft(null);
                commit(swatch);
                setOpen(false);
              }}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{t('profileColorCustom')}</p>
        {/*
          청크가 도착하기 전 자리를 **같은 높이로** 잡아 둔다 — 비워 두면 팝오버가 열린 뒤
          한 번 자라면서 그림자와 화살표가 함께 튄다.
        */}
        <Suspense fallback={<div className="h-40" aria-hidden />}>
          <ProfileColorPicker value={draft ?? color} onValueChange={setDraft} />
        </Suspense>
      </PopoverContent>
    </Popover>
  );
}
