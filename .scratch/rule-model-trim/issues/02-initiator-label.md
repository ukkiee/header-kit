# 02 — Initiator 도메인 라벨 정리

**What to build:** 조건 편집의 "Initiator 도메인"이 한국어에서 `요청 출처 도메인`으로 뜨고, 노트가 탭 도메인과 대조되어 "요청을 실제로 보낸 쪽 vs 보고 있는 탭"이 한눈에 갈린다. 카피만 바뀌고 매칭 동작·스키마·en 라벨은 그대로다. (스펙 Initiator 라벨 절)

**Blocked by:** None — can start immediately. (01과 독립 — 순서 무관.)

**Status:** done

- [x] `src/core/i18n.ts`의 **ko 카탈로그만** 변경: `condInitiator`를 `요청 출처 도메인`으로, `condInitiatorNote`를 탭 도메인과 대조되는 문구로("요청을 실제로 보낸 쪽(임베드된 위젯 등)과 매칭 — 보고 있는 탭과 다름" 취지). 카탈로그 **키는 불변**(`condInitiator`·`condInitiatorNote`)
- [x] en 값(`Initiator domains`, en 노트)은 그대로 — Chrome Network 패널 용어와 일치 유지
- [x] 스키마·컴파일·조건 매칭(`initiatorDomains` 차원)은 전혀 건드리지 않는다 — Initiator 조건이 든 규칙의 동작 불변
- [x] i18n en/ko parity 테스트 통과 (키 대칭 유지)
- [x] smoke: 조건 필드에서 새 ko 라벨 텍스트(`요청 출처 도메인`)가 뜨는지 한 번 단언 (ko 로케일)
- [x] 전 게이트 green
