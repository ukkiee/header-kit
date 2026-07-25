# 02 — 스키마 v2 + v1→v2 마이그레이션 (프리팩터)

**What to build:** 새 규칙 종류를 "쉽게" 만들기 위한 사전 정지작업. StoredState와 export/backup 포맷 버전을 v1→v2로 올리고, storage.local의 권위 있는 v1 상태를 v2로 안전하게 올리는 명명된 마이그레이션을 둔다. 사용자에게 새 기능은 없지만, 기존 데이터가 손실 없이 v2로 넘어간다. "make the change easy(이 티켓), then make the easy change(03·04의 새 종류)."

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] SCHEMA_VERSION과 export/backup 포맷 버전을 v1→v2로 올린다
- [ ] 명명된 v1→v2 마이그레이션이 **모든 프로필·규칙을 보존**하고 검증 성공 후에만 v2로 persist한다
- [ ] 마이그레이션 실패 시 **default 프로필로 대체하지 않고** 원본을 보존하며 오류를 표면화한다 (현재의 "버전 불일치→default 폴백"을 권위 v1 상태에는 적용하지 않는다)
- [ ] v2 리더가 더 높은 버전(v3+) 상태를 만나면 데이터를 지우지 않고 보존하며 "더 새 버전"으로 둔다
- [ ] import의 미지 종류는 **조용히 버리지 않고** 명시적 오류로 거부한다
- [ ] 테스트: **실제 v1 storage.local fixture**에서 stateStore가 로드될 때 마이그레이션이 데이터를 보존하는지 (v1 파일 import·백업 복원과 **별도**), 마이그레이션 실패 시 원본 보존, v3+ 보존, import 미지 종류 오류 거부
- [ ] 전 게이트 그린
