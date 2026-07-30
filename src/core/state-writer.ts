import type { Command } from './commands';
import type { ResetEffects, ResetResult } from './reset';
import type { StoredState } from './schema';

/**
 * 영속 저장소를 고치는 **유일한 문**의 계약 (ADR 0016).
 *
 * 계약이 `core`에 있고 구현이 `platform`에 있는 이유는 층 방향이다. 구현은 저장소 어댑터를
 * **직수입**해야 하므로(그 이유는 구현 파일에 적혀 있다) `platform`에 살아야 하는데, 컴포지션
 * 루트(`runtime/background-bootstrap`)는 이 문을 주입받아 쓴다. 둘이 함께 이름 부를 수 있는
 * 층이 여기뿐이다 — `core/reset.ts`가 `ResetEffects`를 두는 것과 같은 결이다.
 */
export interface StateWriter {
  /**
   * 전이 명령 하나를 적용해 저장한다.
   *
   * 겹쳐 불러도 도착 순서대로 직렬화되며, 겹쳐 도착한 전이가 전부 최종 상태에 남는다 —
   * `Promise.all([writer.execute(a), writer.execute(b)])`가 안전하다는 뜻이다. 각 호출이
   * 자기 레인 작업이 되기 때문이다.
   */
  execute(command: Command): Promise<StoredState>;
  /** 검증을 통과한 v1→v2를 굳힌다. 읽기부터 커밋까지가 한 획득 안에서 돈다. 이미 v2면 `false`. */
  commitMigration(): Promise<boolean>;
  /**
   * 전체 초기화 — 백업 정리와 상태 리셋이 **한 획득 안에서 순차로** 돈다.
   *
   * 순서·검증은 `core/reset`이 정하고, 저장소를 만지는 효과는 **전부 구현이 소유한다.**
   * 호출부가 넘기는 것은 예약 정책 둘뿐이다 — 저장소 조작을 인자로 받으면 그 콜백이 레인 작업
   * 안에서 돌아 백업 read-modify-write를 fan-out할 수 있고, 그것이 없애기로 한 바로 그 슬롯이다
   * (structure 게이트 r2 R-2). 실패는 삼키지 않고 `ResetResult`로 올려 보낸다 — 화면 문구
   * 매핑은 호출부의 몫이다.
   */
  fullReset(policy: AutoBackupPolicy): Promise<{ result: ResetResult; state?: StoredState }>;
}

/**
 * 전체 초기화가 건드리는 **예약 정책**만 (D8: 예약 정책은 레인이 대체하지 않는다).
 *
 * 취소할 수 없는 타이머의 무효화와 "끝까지 간 초기화만 곧바로 다시 예약한다"는 판단은 성격이
 * 달라 컴포지션 루트에 남는다. 저장소를 만지는 효과는 여기 없다 — 그것이 R-2의 요점이다.
 */
export type AutoBackupPolicy = Pick<ResetEffects, 'suspendAutoBackup' | 'resumeAutoBackup'>;
