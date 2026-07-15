# 09 — Backup / 복원

Status: done
Blocked by: 08

## Parent

`.scratch/header-kit-mvp/spec.md`

## What to build

브라우저 계정 동기화 저장소(`storage.sync`)로의 자동 Backup과 복원. 외부 서버는 관여하지 않는다.

- 분할 직렬화: 항목당 8KB·전체 102,400바이트 quota를 고려한 청크 분할.
- 원자성: 스냅샷은 불변 ID를 갖고, 청크를 모두 쓴 뒤 매니페스트를 마지막에 기록(manifest-last 커밋).
- 보존: 고정 개수 링 — 오래된 스냅샷부터 삭제. 새 스냅샷 커밋이 완료되기 전까지 마지막 정상 스냅샷은 절대 삭제하지 않는다.
- 무결성: 청크 수·체크섬 메타데이터로 손상 스냅샷을 감지해 복원 목록에 표시. 실패한 쓰기의 잔여 청크 정리.
- 복원: 스냅샷 목록에서 선택, 복원은 Import와 동일한 활성화 경계를 통과한다.

## Acceptance criteria

- [ ] Profile 변경이 자동으로 Backup 되고 복원 목록에 나타난다
- [ ] quota 고갈 시나리오에서 링 보존이 동작하고 정상본이 남는다 (테스트)
- [ ] 중단된 다중 항목 쓰기가 매니페스트 부재로 무시되고 잔여 청크가 정리된다 (테스트)
- [ ] 손상 청크가 감지되어 해당 스냅샷이 복원 목록에 손상으로 표시된다 (테스트)
- [ ] 복원이 활성화 경계 실체화를 수행한다

## Blocked by

- 08-import-export.md

## Comments

**2026-07-15 구현 완료.** 테스트 111/111, 실브라우저 스모크 30/30 (I1 자동 Backup manifest-last 커밋, I2 복원 전체 교체+활성화 경계 재실체화).

순수 코어(core/backup): 청크 분할·FNV-1a 체크섬·planBackup(pre정리→청크→manifest-last 커밋→post정리 3단계, 링 보존, 직전 정상본 pre 보호, too-large)·listSnapshots(손상 표시)·decode. 어댑터(storage/backupStore)는 단계 순서만 집행. restore-profiles는 Import와 동일 정규화·활성화 경계, Pause 보존.

2축 코드리뷰 반영:
- **quota 바이트 정직성 (핵심)**: CHUNK_SIZE가 UTF-16 문자 수를 셌으나 sync quota는 JSON.stringify UTF-8 바이트 기준 — 한글·이스케이프에서 초과 가능. jsonBytes 기반으로 청크 분할·예산·매니페스트 항목 크기를 전부 바이트로 재계산(이진 탐색 분할, 서로게이트 보호). 한글 페이로드 테스트 추가.
- **손상 스냅샷 링 좀비 방지**: 청크 유실 스냅샷을 링 후보에서 제외(isIntact) — corrupt 항목이 슬롯을 영구 점유하지 않음. 테스트 추가.
- **자동 백업 견고화**: 30초 최소 간격(시간당 sync 쓰기 1,800 quota 보호) + 코얼레싱(연속 편집이 백업을 무한 연기 못함) + SW 기동 시 catch-up(디바운스 중 SW 사망 대비). apply 밖 별도 채널인 이유 주석화.
- backupPayload 공통화(중복 제거).

기록: 파일 다운로드/복원 UX는 스모크로 커버, 링 슬롯당 near-duplicate(id 재생성으로 텍스트 변함)는 복원 빈도 고려 시 허용 수준으로 판단.
