import { computeBadge } from '@/core/badge';
import type { Command } from '@/core/commands';
import { compile, type TabInfo } from '@/core/compile';
import { createCommandExecutor } from '@/core/executor';
import { hasExpiredProfiles, nextExpiry } from '@/core/expiry';
import { createReconciler } from '@/core/reconciler';
import type { NetRule } from '@/core/rules';
import type { StoredState } from '@/core/schema';
import { backupPayload } from '@/core/backup';
import { summarizeCompile } from '@/core/summary';
import {
  loadState,
  onCommand,
  onStateChanged,
  persistState,
  publishSummary,
} from '@/storage/state';
import { performBackup } from '@/storage/backupStore';
import { onTabsChanged, queryTabInfos } from '@/storage/tabs';

const EXPIRY_ALARM = 'headerkit-expiry';

interface Snapshot {
  state: StoredState;
  tabs: TabInfo[];
  now: number;
}

async function replaceSessionRules(rules: NetRule[]): Promise<void> {
  const existing = await browser.declarativeNetRequest.getSessionRules();
  await browser.declarativeNetRequest.updateSessionRules({
    removeRuleIds: existing.map((rule) => rule.id),
    addRules: rules as Browser.declarativeNetRequest.Rule[],
  });
}

async function validateRegexPattern(pattern: string): Promise<string | null> {
  const trimmed = pattern.trim();
  if (trimmed === '') return null;
  const { isSupported, reason } = await browser.declarativeNetRequest.isRegexSupported({
    regex: trimmed,
  });
  return isSupported ? null : `Invalid regex pattern (${reason ?? 'unsupported'})`;
}

/** 저장 시점 검증: regex Filter는 플랫폼이 실제 지원하는지 확인 후에만 저장된다. */
async function validateCommand(command: Command): Promise<string | null> {
  if (command.type === 'add-filter' || command.type === 'update-filter') {
    const filter = command.filter;
    if (filter.kind !== 'url' && filter.kind !== 'exclude-url') return null;
    return validateRegexPattern(filter.pattern);
  }

  // Import도 전량 수용/거부 — regex 하나라도 플랫폼이 거부하면 전체를 거부하되,
  // 오류는 항목 단위로 전부 모아 알려준다.
  if (command.type === 'import-profiles') {
    const errors: string[] = [];
    for (const profile of command.profiles) {
      for (const [index, filter] of profile.filters.entries()) {
        if (filter.kind !== 'url' && filter.kind !== 'exclude-url') continue;
        const error = await validateRegexPattern(filter.pattern);
        if (error !== null) {
          errors.push(`"${profile.name}" ${filter.kind} filter #${index + 1}: ${error}`);
        }
      }
    }
    if (errors.length > 0) return errors.join('\n');
  }
  return null;
}

async function applyBadge(state: StoredState): Promise<void> {
  const badge = computeBadge(state);
  await browser.action.setBadgeText({ text: badge.text });
  await browser.action.setBadgeBackgroundColor({ color: badge.color });
}

/** 다음 Time Filter 만료에 알람을 건다 — 만료 예정이 없으면 알람을 지운다. */
async function scheduleExpiryAlarm(state: StoredState, now: number): Promise<void> {
  const when = nextExpiry(state, now);
  if (when === null) {
    await browser.alarms.clear(EXPIRY_ALARM);
  } else {
    await browser.alarms.create(EXPIRY_ALARM, { when });
  }
}

export default defineBackground(() => {
  const reconciler = createReconciler<Snapshot>({
    loadSnapshot: async () => ({
      state: await loadState(),
      tabs: await queryTabInfos(),
      now: Date.now(),
    }),
    compile: (snapshot) =>
      compile(snapshot.state.profiles, {
        paused: snapshot.state.paused,
        tabs: snapshot.tabs,
        now: snapshot.now,
        materialized: snapshot.state.materialized,
      }),
    // 규칙·배지·만료 알람·상태 요약을 같은 스냅샷·같은 세대 보증 아래 반영한다.
    apply: async (result, snapshot) => {
      // 규칙 적용은 실패해도(예: quota) 나머지 반영·요약을 막지 않는다 —
      // 실패는 삼키지 않고 요약의 applyError로 노출한다 (이슈 05 이연분).
      let applyError: string | null = null;
      try {
        await replaceSessionRules(result.rules);
      } catch (error) {
        applyError = error instanceof Error ? error.message : String(error);
      }
      await applyBadge(snapshot.state);
      await scheduleExpiryAlarm(snapshot.state, snapshot.now);
      // 요약은 background가 실제 적용한 그 결과·스냅샷에서 만든다 — UI는 이걸
      // 읽기만 하므로 독립 재컴파일로 인한 불일치가 없다.
      await publishSummary(
        summarizeCompile(result, {
          profiles: snapshot.state.profiles,
          paused: snapshot.state.paused,
          applyError,
        }),
      );
      // 이미 지난 만료(과거 시각 입력, SW 휴면 중 경과 등)는 알람을 기다리지
      // 않고 즉시 만료 전이를 태운다 — 규칙만 죽고 토글·배지가 켜진 채
      // 남는 거짓 상태를 방지 (만료 후에는 활성이 남지 않으므로 수렴).
      if (hasExpiredProfiles(snapshot.state, snapshot.now)) {
        void executor
          .execute({ type: 'expire-profiles', now: snapshot.now })
          .catch((error) => console.error('[HeaderKit] expiry failed', error));
      }
    },
    onError: (error) => console.error('[HeaderKit] reconcile failed', error),
  });

  // 상태 전이의 단일 권위 실행자 — 모든 쓰기는 이 큐를 거친다.
  const executor = createCommandExecutor({
    load: loadState,
    save: persistState,
    validate: validateCommand,
  });
  onCommand((command) => executor.execute(command));

  const converge = () => void reconciler.requestReconcile();

  // 자동 Backup — 재조정 apply가 아니라 별도 채널로 돈다: 탭 이벤트발
  // 재컴파일마다 sync 쓰기를 태우지 않기 위한 의도적 예외이며, 실행 시점에
  // 상태를 새로 읽으므로 세대 문제는 없다 (planBackup의 내용 동일 스킵이
  // 중복·루프를 막는다).
  // - 타이머는 코얼레싱한다(재예약 없음) → 연속 편집이 백업을 무한 연기하지 못한다.
  // - 최소 30초 간격 → 시간당 sync 쓰기 quota(1,800) 안쪽으로 유지된다.
  // - SW가 타이머와 함께 죽으면 다음 기동의 catch-up이 따라잡는다.
  let backupTimer: ReturnType<typeof setTimeout> | undefined;
  let lastBackupAt = 0;
  const runBackup = async () => {
    backupTimer = undefined;
    lastBackupAt = Date.now();
    try {
      const state = await loadState();
      await performBackup(backupPayload(state), state.profiles.length);
    } catch (error) {
      console.error('[HeaderKit] backup failed', error);
    }
  };
  const scheduleBackup = () => {
    if (backupTimer !== undefined) return; // 이미 예약됨 — 가장 이른 실행 유지
    const delay = Math.max(3_000, lastBackupAt + 30_000 - Date.now());
    backupTimer = setTimeout(() => void runBackup(), delay);
  };

  onStateChanged(() => {
    converge();
    scheduleBackup();
  });
  onTabsChanged(converge);
  browser.runtime.onStartup.addListener(converge);
  browser.runtime.onInstalled.addListener(converge);
  // 키보드 단축키: Pause 토글은 권위 상태 기준으로 뒤집는 단일 writer 명령을
  // 지난다 — 연타해도 lost-update가 없다.
  browser.commands.onCommand.addListener((command) => {
    if (command !== 'toggle-pause') return;
    void executor
      .execute({ type: 'toggle-pause' })
      .catch((error) => console.error('[HeaderKit] toggle-pause failed', error));
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== EXPIRY_ALARM) return;
    // 만료 전이도 단일 writer 경로를 지난다 — 저장 변경이 재컴파일·배지를 촉발한다.
    void executor
      .execute({ type: 'expire-profiles', now: Date.now() })
      .catch((error) => console.error('[HeaderKit] expiry failed', error));
  });

  // Service worker가 깨어날 때마다 저장소 기준으로 수렴시키고,
  // 디바운스 중 SW가 죽어 유실된 백업을 catch-up 한다 (내용 동일이면 스킵됨).
  converge();
  scheduleBackup();
});
