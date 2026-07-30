/**
 * Writer Lane — 영속 저장소를 고치는 단 하나의 줄 (ADR 0016).
 *
 * `browser.storage`에는 compare-and-swap이 없다. 여러 JS 컨텍스트가 같은 키를 다투는 한
 * 국소적인 재검사·깊이 카운터·세대 번호로는 원리적으로 닫히지 않으므로, 먼저 writer를 서비스
 * 워커 한 컨텍스트로 모으고 **그 안에서 직렬화**한다. 이 모듈이 그 직렬화만 맡는다.
 *
 * **이 모듈을 쓰는 곳은 `runtime/state-writer.ts` 하나다** (structure 게이트 r1). 레인을
 * 잡아 허가를 받는 코드가 늘어나면 그 하나하나가 "한 획득 안에서 병행 쓰기를 띄우는" 실수의
 * 자리가 된다. 그래서 허가는 콜러에게 나가지 않고, 저장소를 고치고 싶은 쪽은 쓰기 서비스의
 * 매소드를 부른다 — 매소드마다 자기 레인 작업이 되므로 겹쳐 불러도 정상적으로 직렬화된다.
 *
 * 레인을 **만드는** 것은 쓰기 서비스의 몫이고, 그 서비스는 컴포지션 루트에서 한 번 만들어진다.
 * 모듈 최상단에 인스턴스를 두지 않는다 — 저장소 어댑터 모듈은 화면과 서비스워커 **양쪽에
 * 실려서**, 모듈 스코프 락은 컨텍스트마다 하나씩 생겨 서로를 전혀 막지 않으면서 안전해 보인다.
 */

declare const PERMIT: unique symbol;

/**
 * 화면 번들에 이 모듈이 섞여 들어왔는지 판정하는 표지 (`scripts/writer-lane-gate.mjs`).
 *
 * 최소화는 식별자를 뭉개도 문자열 리터럴은 남긴다. 그래서 산출물에서 이 문자열의 유무가
 * "화면이 레인을 만들 수 있는가"에 대한 **번들러의 답**이 된다 — 정적 import·동적 import·
 * 재수출·별칭을 전부 지나온 답이라 소스를 훑는 어떤 잣대보다 정확하다. 던지는 메시지 안에
 * 두는 이유는 `createWriterLane`이 살아남는 한 함께 살아남게 하려는 것이다.
 */
const SERVICE_WORKER_ONLY = 'writer-lane:service-worker-only';

/**
 * 저장소를 고쳐도 된다는 허가. 레인이 자기 작업에게만 건네주고, 그 작업이 끝나면 죽는다.
 *
 * **이것은 콜러가 들고 다니는 물건이 아니다.** `runtime/state-writer.ts` 안에서만 존재하고,
 * 그 모듈은 허가를 어디에도 내보내지 않는다. 저장소를 고치는 함수(`platform/stateStore`의
 * 쓰기들)가 이것을 인자로 요구하므로 레인 밖 호출은 컴파일 오류다.
 *
 * **타입만으로는 부족하다** (structure 게이트 r1 R-1, 실증됨). 인자 자리를 요구하는 것은
 * "허가를 가졌다"까지만 강제하고 "지금 그 작업이 도는 중이다"는 강제하지 않는다. 그래서
 * 허가가 자기 유효 기간을 스스로 알고, 쓰기 함수가 **진입할 때와 실제로 쓰기 직전에** 확인한다.
 * 뒤의 확인이 따로 필요한 이유는 실측됐다 — 살아 있을 때 진입한 쓰기가 저장소를 기다리는
 * 동안 작업이 끝나면, 진입 검사만으로는 그 쓰기가 죽은 허가로 착지하는 것을 막지 못한다.
 */
export interface WritePermit {
  readonly [PERMIT]: true;
  /** 이 허가가 아직 유효한지 확인한다 — 아니면 던진다. */
  readonly assertLive: () => void;
}

/**
 * 허가가 작업의 **반환값으로 레인을 빠져나가려 할 때** 그 자리에 놓이는 타입.
 *
 * structure 게이트 r1이 실증한 우회가 `run(async (permit) => permit)` 한 줄이었다 — `T`가
 * 허가로 추론되어 밖으로 나오고, 그것으로 레인 밖에서 쓰는 코드가 타입 검사를 통과했다.
 * 그 경우 `run`의 반환형이 이 타입이 되어 어디에도 대입되지 않는다.
 */
type PermitMustNotEscape = {
  readonly __permitMustNotEscape: 'Writer Lane 허가는 작업의 반환값으로 나갈 수 없다';
};

export interface WriterLane {
  /**
   * 작업을 레인에 세우고 그 결과를 돌려준다. 도착 순서 FIFO이며 우선순위가 없다.
   *
   * **한 작업 안에서 병행 쓰기를 띄우지 말 것.** 레인이 직렬화하는 것은 작업이고, 한 작업
   * 안에서 `Promise.all`로 띄운 두 read-modify-write는 서로 겹친다(structure 게이트 r1이
   * 실증했다 — 릴리스 r3의 R-2가 그 모양으로 되살아났다). 이 규약이 주석으로 족한 유일한
   * 이유는 이 함수의 호출부가 `runtime/state-writer.ts` 안의 몇 줄뿐이고, 저장소를 고치려는
   * 다른 모든 코드는 허가를 얻을 수 없어 그 모듈의 매소드를 부를 수밖에 없기 때문이다 —
   * 매소드마다 자기 작업이 되므로 겹쳐 불러도 레인이 정상적으로 직렬화한다.
   *
   * 중첩되는 경로(전체 초기화가 여러 쓰기를 한 획득에서 하는 것처럼)는 다시 잡지 않고 받은
   * 허가를 **순차로** 쓴다. 재진입 가능한 레인을 만들지 않는 이유는 서비스워커에
   * `AsyncLocalStorage`가 없어 비동기 호출 사슬을 따라갈 표준 수단이 없기 때문이다.
   */
  run<T>(job: (permit: WritePermit) => Promise<T>): Promise<T extends WritePermit ? PermitMustNotEscape : T>;
}

/**
 * 레인 하나를 만든다. `runtime/state-writer.ts`가 서비스 하나마다 한 번 부르고, 그 서비스는
 * 컴포지션 루트에서 한 번 만들어진다. 소스에서 이 함수를 부르는 자리가 하나뿐인지는
 * `scripts/writer-lane-gate.mjs`가 센다.
 *
 * 계약 둘 (플랜 게이트 r1 R-2):
 * - **각 호출자는 자기 실패를 받는다.** 실패는 그것을 요청한 쪽으로만 전파된다.
 * - **레인은 언제나 전진한다.** 작업이 거부하거나 던져도 다음 작업이 실행된다.
 *
 * 두 번째가 왜 명시적 장치인가: 저장 경로는 **설계상 던진다** — 이 버전이 읽을 수 없는 상태
 * 위에 쓰라는 요청은 거부되어야 하고, 명령 검증도 거부를 던진다. 꼬리를 거부된 promise로
 * 두면 그 뒤의 모든 명령과 Backup이 서비스워커가 재시작될 때까지 막힌다. 그래서 꼬리는
 * 결과를 삼킨 사본으로 잇고, 호출자에게는 삼키지 않은 원본을 돌려준다.
 *
 * 허가는 **작업마다 새로 만들어지고 그 작업이 끝나면 죽는다.** 하나를 만들어 돌려 쓰면
 * "허가를 가졌다"와 "지금 쥐고 있다"가 같은 말이 아니게 된다.
 */
export function createWriterLane(): WriterLane {
  let tail: Promise<void> = Promise.resolve();

  return {
    run<T>(job: (permit: WritePermit) => Promise<T>) {
      const result = tail.then(async () => {
        let live = true;
        // 동결한다 — 얼리지 않으면 `permit.assertLive = () => {}` 한 줄로, 캐스트 하나 없이
        // 검사기를 갈아끼울 수 있다 (structure r1 뒤 적대적 검증에서 실측됨).
        const permit = Object.freeze({
          assertLive: () => {
            if (live) return;
            throw new Error(
              `Refusing to write persistent storage outside the Writer Lane (${SERVICE_WORKER_ONLY}). ` +
                'The write permit is no longer held — its job already finished, so this write would ' +
                'land after the lane moved on. Storage is left untouched.',
            );
          },
        }) as unknown as WritePermit;
        try {
          return await job(permit);
        } finally {
          // 작업이 정착하는 그 순간 허가가 죽는다 — 레인이 다음 작업으로 넘어가는 순간과 같다.
          live = false;
        }
      });
      tail = result.then(swallow, swallow);
      // 조건부 반환형은 탈출을 막는 **타입 장치**일 뿐이고 값은 그대로다.
      return result as Promise<T extends WritePermit ? PermitMustNotEscape : T>;
    },
  };
}

function swallow(): void {}
