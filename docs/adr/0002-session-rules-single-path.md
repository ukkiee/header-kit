# 네트워크 규칙은 session rules 단일 경로로 관리한다

프로필 저장소(`storage.local`)를 단일 진실 원천으로 삼고, 변경·브라우저 시작 시마다 활성 Profile 전체를 DNR session rules로 전량 재생성한다. Tab Filter의 `tabIds` 조건이 session rule 전용이라 session 경로는 어차피 필수이며, dynamic rules를 병용하면 두 규칙 저장소의 정합성을 상시 맞춰야 하는 반면 unsafe 규칙 quota는 5,000으로 동일해 얻는 것이 없다. 대가로 브라우저 재시작 직후 service worker가 재생성을 마치기 전까지 수백 ms의 규칙 공백을 감수한다.
