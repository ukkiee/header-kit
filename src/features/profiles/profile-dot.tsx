import type { Profile } from '@/core/schema';

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
