import { format, type Translator } from '@/core/i18n';
import type { Profile } from '@/core/schema';

/** 프로필 선택 컨트롤의 접근성 이름 — 칩 스위처·사이드바가 같은 규약을 공유한다. */
export function profileSelectLabel(
  profile: Pick<Profile, 'name' | 'active'>,
  t: Translator,
): string {
  return format(t('ariaSelectProfile'), {
    name: profile.name,
    state: t(profile.active ? 'ariaStateOn' : 'ariaStateOff'),
  });
}

/** 프로필 on/off 도트 — 칩 스위처와 사이드바가 같은 시각 언어를 공유한다. */
export function ProfileDot({ profile }: { profile: Pick<Profile, 'active' | 'color'> }) {
  return (
    <span
      aria-hidden
      className={`size-1.5 shrink-0 rounded-full ${profile.active ? '' : 'bg-zinc-300 dark:bg-zinc-600'}`}
      style={profile.active ? { backgroundColor: profile.color } : undefined}
    />
  );
}
