import { lazy, Suspense, useState } from 'react';
import { format } from '@/core/i18n';
import { normalizeProfileColor, PROFILE_COLORS, type Profile } from '@/core/schema';
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
 * 프로필 색 스와치 — 사이드바(양 표면)의 시각 언어 (티켓 10: 디자인의 색 스와치).
 *
 * **활성은 프로필 색으로 채운 사각, 비활성은 회색으로 채운 사각이다.** 둘 다 채움이고
 * 다른 것은 색뿐이다.
 *
 * 예전에는 비활성이 **테두리만 남은 사각**이었다 — "색은 정체성, 형태는 상태"를 지켜
 * 꺼진 프로필의 색도 목록에서 보이게 하려던 것이다. 그 대가가 두 가지였다. 화면에서는
 * 2.5px 도형 안이 뚫려 보여 색 얼룩처럼 읽혔고, 코드에서는 그 테두리가 **사용자 색**이라
 * (색은 `<input type="color">`에서 오므로 아무 값이나 될 수 있다) 흰색에 가까운 색을
 * 고르면 라이트 캔버스에서 도형이 통째로 사라졌다 — 그래서 `--input` 윤곽선을 한 겹 더
 * 겹쳐야 했다. 회색 채움 하나가 그 겹을 없앤다: 색이 사용자 값과 무관해지므로 대비가
 * 색 선택에 매이지 않는다.
 *
 * 채움 색이 `--input`인 이유는 그 토큰이 bg·surface·fill 어느 면 위에서도 3:1을 넘기도록
 * (라이트 최저 3.18:1, 다크 3.20:1) 고른 값이기 때문이다 — 상태를 나르는 비텍스트 요소의
 * 하한이 이걸로 선다.
 *
 * **트레이드오프**: 꺼진 프로필의 색이 목록에서 보이지 않는다. 색 채널 하나를 상태에
 * 내준 셈인데, 상태는 여기 말고도 세 곳에서 말한다 — `profileSelectLabel`의
 * aria-label(문자열), 같은 행의 인라인 토글(손잡이 **위치**), 이름 아래 메타의 낱말.
 * 색 하나에 상태를 싣지 않는다는 계약(스펙 story 38)은 그대로다.
 */
function ProfileDot({ profile }: { profile: Pick<Profile, 'active' | 'color'> }) {
  return (
    <span
      aria-hidden
      // 관측 표지 — 이 사각형이 칩 안에서 밖으로 옮겨 가자 "칩 안 첫 `aria-hidden` span"으로
      // 집던 스모크 셋이 한꺼번에 메타 줄을 집었다(실측). 구조는 표지가 아니다.
      data-profile-swatch=""
      className={`size-2.5 shrink-0 rounded-[3px] ${profile.active ? '' : 'bg-input'}`}
      style={profile.active ? { backgroundColor: profile.color } : undefined}
    />
  );
}

/**
 * 프로필 색 고르기 (ADR 0017 재개정) — **자유 선택이 위, 팔레트 10색이 아래.**
 *
 * **커밋 지점은 닫힘 하나다.** 팔레트도 색면도 초안만 옮기고, 팝오버가 닫힐 때 한 번 보낸다
 * (Escape는 버린다 — 이름 편집과 같은 규약). 그래서 팔레트는 별도 경로가 아니라 자유 선택으로
 * 들어가는 지름길이다.
 *
 * 스와치는 **항상 버튼이다**(사용자 결정). 편집 중에만 버튼이던 시절의 근거는 "264px 열에
 * 아이콘을 상시로 더할 수 없다"였는데, 이것은 더해지는 아이콘이 아니라 **이미 거기 있던
 * 사각형**이라 자리가 늘지 않는다. 근거 전체는 `profile-dot.tsx`의 호출부가 적는다.
 *
 * 트리거의 겉보기 크기는 스와치 그대로(10px)이고 `-m-1 p-1`로 **누를 수 있는 넓이만** 18px로
 * 넓힌다 — 음수 여백이 그만큼을 레이아웃에서 도로 걷어가므로 행 폭은 변하지 않는다.
 */
export function ProfileColorField({
  profile,
  onCommit,
}: {
  profile: Pick<Profile, 'name' | 'color' | 'active'>;
  /** 정규화를 통과하고 **실제로 달라진** 값일 때만 불린다. */
  onCommit: (color: string) => void;
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
  /**
   * 팔레트가 색을 옮긴 횟수 — 자유 선택을 **다시 마운트**시키는 열쇠다.
   *
   * 피커를 제어하지 않는 이유는 그 파일이 적는다(제어하면 손실 왕복 echo가 돌아온다).
   * 그래서 "위에서 색을 밀어 넣는" 유일한 경로인 팔레트만 이 값을 올리고, 드래그로 들어오는
   * 변경은 올리지 않는다 — 매 프레임 remount하면 색면을 잡고 있을 수 없다.
   */
  const [paletteTick, setPaletteTick] = useState(0);

  // 지금 색도 접어서 비교한다 — 저장된 값이 `#ABC`든 `#aabbcc`든 같은 색이면 같아야 한다.
  const current = normalizeProfileColor(profile.color);
  /**
   * **화면이 지금 보여 주는 색** — 초안이 있으면 그것, 없으면 저장된 색.
   *
   * 팔레트의 표시가 이 값을 따라야 한다: 팔레트를 누르면 커밋 없이 초안만 옮기므로,
   * 저장된 색을 기준으로 표시하면 방금 고른 칸이 표시되지 않는다.
   */
  const shown = normalizeProfileColor(draft ?? profile.color);

  /** 정규화와 무변화 판정의 단 하나의 자리 — 팔레트와 자유 선택이 같은 문을 지난다. */
  const commit = (next: string) => {
    const normalized = normalizeProfileColor(next);
    if (normalized === null || normalized === current) return;
    onCommit(normalized);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next, details) => {
        setOpen(next);
        if (next) return;
        /*
         * **닫히는 순간이 커밋 지점이다 — 팔레트도 자유 선택도 마찬가지다.**
         *
         * 팔레트가 누른 자리에서 바로 커밋하고 닫던 시절에는 두 경로의 규약이 갈렸고,
         * 무엇보다 고른 색을 **되돌릴 길이 없었다**. 지금은 팔레트가 초안만 옮기므로
         * 색면·hex 입력이 그 색으로 따라가고, 마음에 안 들면 다른 칸을 눌러 보면 된다.
         *
         * **Escape는 버린다** — 이름 편집이 쓰는 그 규약이다(`profile-dot`의 입력).
         * 나머지 닫힘(바깥 누름·트리거 재클릭·포커스 이탈)은 커밋한다: blur가 커밋이라는
         * 규칙에 예외를 만들지 않는 편이 예측 가능하다.
         */
        if (details.reason !== 'escape-key' && draft !== null) commit(draft);
        setDraft(null);
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={format(t('ariaProfileColor'), { name: profile.name })}
            // `cursor-pointer` — Tailwind v4 preflight에 버튼 커서 규칙이 없어(실측) 명시하지
            // 않으면 화살표로 그려진다. 이 저장소의 누름 표면들이 전부 같은 이유로 명시한다.
            /*
              `ml-1`이 `-m-1`의 왼쪽을 되돌린다. 스와치가 칩 **안**에 있던 시절에는 칩의
              `px-2`가 그립과의 사이에 8px을 두었는데, 밖으로 나오면서 그 8px이 사라져
              사각형이 그립에 붙었다(실측 10px → 2px). 나머지 세 방향의 음수 여백은
              그대로다 — 그것이 18px 클릭 넓이를 레이아웃에서 도로 걷어가는 장치다.
            */
            className={`-m-1 ml-1 flex shrink-0 cursor-pointer items-center justify-center rounded-[5px] p-1 ${focusRing}`}
          >
            {/*
              **평상시 생김새는 `ProfileDot`이 정한다** — 활성은 프로필 색, 비활성은 중립
              회색(`--input`). 그 규칙은 상태를 나르는 채널 하나이므로(ADR 0017) 스와치가
              버튼이 됐다고 잃을 수 없다. 같은 컴포넌트를 그대로 쓰는 것이 두 자리가 갈라서지
              않는 유일한 방법이다.
              
              **고르는 중에만 예외**다: 팝오버가 열려 있으면 지금 고르는 색을 그대로 칠한다.
              비활성 프로필의 색을 고르는데 사각형이 회색으로 남아 있으면 무엇을 고르는지가
              화면에 없다.
            */}
            {open ? (
              <span
                aria-hidden
                data-profile-swatch=""
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ backgroundColor: draft ?? profile.color }}
              />
            ) : (
              <ProfileDot profile={profile} />
            )}
          </button>
        }
      />
      <PopoverContent align="start" className="w-56 gap-2">
        {/*
          **자유 선택이 위, 팔레트가 아래다** (사용자 결정 — 순서를 뒤집었다).

          팔레트는 열 칸이 한 줄 반이라 눈이 훑는 데 시간이 안 걸리고, 색면은 크고 정밀해
          다루는 데 시간이 걸린다. 큰 것을 위에 두면 팝오버를 연 목적(색을 고르는 것)이
          맨 위에 서고, 팔레트는 "정해진 것 중에서"라는 지름길로 아래에 남는다.

          청크가 도착하기 전 자리를 **같은 높이로** 잡아 둔다 — 비워 두면 팝오버가 열린 뒤
          한 번 자라면서 그림자와 화살표가 함께 튄다.
        */}
        <p className="text-xs text-muted-foreground">{t('profileColorCustom')}</p>
        <Suspense fallback={<div className="h-40" aria-hidden />}>
          <ProfileColorPicker
            key={paletteTick}
            defaultValue={draft ?? profile.color}
            onValueChange={setDraft}
          />
        </Suspense>
        <p className="text-xs text-muted-foreground">{t('profileColorPalette')}</p>
        {/*
          팔레트 — 누르면 **초안만 옮긴다**(사용자 요청). 팝오버는 열린 채로 남고 위 색면·hex
          입력이 그 색으로 따라간다. 그래서 팔레트는 별도의 커밋 경로가 아니라 **자유 선택으로
          들어가는 지름길**이 된다: 정해진 열 개 중에서 고르고, 마음에 들면 닫고, 아니면 옆으로
          한 칸 옮기거나 색면에서 다듬는다.
        */}
        <div className="grid grid-cols-5 gap-1.5">
          {PROFILE_COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={format(t('ariaProfileColorSwatch'), { color: swatch })}
              // 표시는 **지금 보여 주는 색**을 따른다 — 링 **두께**가 바뀌므로 색만으로
              // 알리지 않는다. 저장된 색을 기준으로 하면 방금 누른 칸이 표시되지 않는다.
              aria-pressed={shown === swatch}
              className={`h-6 cursor-pointer rounded-md ring-offset-1 ring-offset-popover ${focusRing} ${
                shown === swatch ? 'ring-2 ring-foreground' : 'ring-1 ring-foreground/15'
              }`}
              style={{ backgroundColor: swatch }}
              onClick={() => {
                setDraft(swatch);
                setPaletteTick((n) => n + 1);
              }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
