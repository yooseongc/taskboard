# 역할 및 권한 시스템

이 문서는 Taskboard의 조직/역할/보드 권한 모델을 정의한다. 코드 변경 시 이 문서를 함께 갱신할 것.

## 1. 글로벌 역할 (Global Role)

| 역할 | 설명 | 부여 방법 |
|---|---|---|
| **SystemAdmin** | 시스템 전체 관리. 모든 보드/부서/사용자 관리, 보드 transfer/삭제. | 환경변수 `SYSTEM_ADMIN_EMAILS`에 이메일 등록 |
| **DepartmentAdmin** | 자신 부서(+하위)의 부서 보드 관리, 부서원 관리. | `department_members.role_in_department = 'DepartmentAdmin'` |
| **Member** | 모든 사용자의 기본. 자신 부서 보드는 자동 Admin, 개인 보드 생성 가능, 초대받은 보드 참여. | 부서 소속 시 자동 |

> **Viewer 글로벌 역할은 제거됨.** 부서가 없는 사용자도 Member로 취급한다 (개인 보드는 만들 수 있음).

## 2. 보드 소유 타입 (Board Owner Type)

`boards.owner_type` 컬럼 (TEXT, CHECK 제약).

| 타입 | 설명 |
|---|---|
| **department** | 부서 보드. 1개 이상의 부서에 귀속. 해당 부서원은 자동 Admin. |
| **personal** | 개인 보드. 단일 사용자 소유 (`owner_id`). 생성자 = Admin. |

- 부서 보드: `board_departments` 1+개 행
- 개인 보드: `board_departments` 행 없음, `owner_id`만 사용

## 3. 보드 역할 (Board Role)

`board_members.role_in_board` 컬럼 (lowercase TEXT).

| 역할 | 권한 |
|---|---|
| **admin** | 보드 설정, 멤버 관리, 모든 태스크/필드/뷰 CRUD |
| **editor** | 태스크 CRUD, 댓글 작성 |
| **viewer** | 읽기 + **댓글 작성 가능** |

## 4. 권한 매트릭스

최종 권한 = `max(global_decision, board_decision)`.

### 4.1 글로벌 역할 × 리소스

| 리소스/액션 | SystemAdmin | DepartmentAdmin (자기 부서) | Member |
|---|---|---|---|
| Board.Create | ✅ | ✅ (부서 보드) | ✅ (개인 보드) |
| Board.Read | ✅ | ✅ | ✅ (자기 부서/개인/초대) |
| Board.Update | ✅ | ✅ | ❌ (보드 역할로) |
| Board.Delete | ✅ | ✅ | ❌ |
| Board.Transfer | ✅ (모든 보드) | ✅ (자기 부서 보드 → 자기 부서) | ❌ |
| Department.Manage | ✅ | ✅ (자기 부서+하위) | ❌ |
| User.Manage | ✅ | ✅ (자기 부서원) | ❌ |

### 4.2 보드 역할 × 리소스

| 리소스/액션 | admin | editor | viewer |
|---|---|---|---|
| Task.Read | ✅ | ✅ | ✅ |
| Task.Create | ✅ | ✅ | ❌ |
| Task.Update | ✅ | ✅ | ❌ |
| Task.Delete | ✅ | ✅ | ❌ |
| Comment.Create | ✅ | ✅ | ✅ |
| Comment.Update (own) | ✅ | ✅ | ✅ |
| Comment.Delete | ✅ | ✅ (own) | ✅ (own) |
| BoardSettings.Update | ✅ | ❌ | ❌ |
| BoardMembers.Manage | ✅ | ❌ | ❌ |

### 4.3 자동 부여 규칙

- **DepartmentAdmin** → 자신 부서의 부서 보드 자동 `admin`
- **부서원 (Member)** → 자신 부서의 부서 보드 자동 `editor`
- **개인 보드 생성자** → 자동 `admin`
- **SystemAdmin** → 모든 보드 `admin` 효과

## 5. 보드 분류 (UI)

사용자가 본인의 보드를 4개 카테고리로 조회.

| 카테고리 | 조건 |
|---|---|
| **★ 즐겨찾기** | `board_pins`에 등록한 보드 (다른 카테고리와 중복 표시) |
| **부서 보드** | `owner_type='department'` AND 사용자가 해당 부서원 |
| **개인 보드** | `owner_type='personal'` AND `owner_id=사용자id` |
| **초대받은 보드** | `board_members`에 있으나 위 둘에 해당 안 됨 |

조회: `GET /api/users/me/boards?bucket=favorites|department|personal|invited`

## 6. 보드 멤버 추가 (초대)

- 보드 `admin`이 다른 사용자를 `board_members`에 직접 추가 (pending 상태 없음 — 조직 내 사용 전제)
- 추가 시 역할 지정 (admin/editor/viewer)
- API: `POST /api/boards/{id}/members` body: `{ user_id, role_in_board }`

## 7. 보드 Transfer

| 액션 | 가능자 | 범위 |
|---|---|---|
| 부서 보드 → 다른 부서 | 보드 `admin` 중 자신 소속 부서 → 자기 소속 부서 | 자기 소속 부서 한정 |
| 부서 보드 ↔ 개인 보드 | SystemAdmin만 | 모든 보드 |
| 부서 보드 → 다른 부서 (외부) | SystemAdmin만 | 모든 보드 |
| 개인 보드 → 다른 사용자 | 보드 `admin` (자신=owner) | 누구든 사용자 |

API: `PATCH /api/boards/{id}/transfer` body: `{ owner_type, owner_id?, department_ids? }`

## 8. 즐겨찾기 (Pin)

- `board_pins` 테이블: `(user_id, board_id)` 복합 PK + `pinned_at`
- API: `PUT /api/users/me/pins/{board_id}` (toggle)
- 사이드바 최상단 "★ 즐겨찾기" 섹션에 표시

## 9. 권한 변경 감사 로그 (Audit Log)

`auth_audit_log` 테이블에 모든 권한/역할 변경을 기록.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | UUID | PK |
| `actor_id` | UUID | 변경 수행자 |
| `action` | TEXT | `member.add`, `member.remove`, `member.role_change`, `dept.role_change`, `board.transfer`, `user.activate`, `user.deactivate` |
| `target_type` | TEXT | `board_member`, `dept_member`, `board`, `user` |
| `target_id` | UUID | 대상 ID |
| `before` | JSONB | 변경 전 상태 (선택) |
| `after` | JSONB | 변경 후 상태 |
| `created_at` | TIMESTAMPTZ | |

조회: `GET /api/audit-logs?actor_id=&action=&from=&to=` (SystemAdmin 전용)

## 10. OIDC 조직 동기화

- JIT 프로비저닝 시 OIDC 토큰의 `groups` 클레임에서 부서 정보 추출
- AD 연동 전제로 그룹명 = 부서 slug 정확 매칭
- 매칭된 부서에 `department_members` 자동 등록 (`role_in_department='Member'`)
- 사용자가 더 이상 그룹에 없으면 다음 로그인 시 부서원 자동 제거

## 11. 환경변수

| 변수 | 설명 |
|---|---|
| `SYSTEM_ADMIN_EMAILS` | SystemAdmin 이메일 (콤마 구분) |
| `OIDC_DEPT_CLAIM` | 부서 추출용 클레임명 (기본: `groups`) |
| `OIDC_DEPT_SYNC_ENABLED` | 부서 자동 동기화 on/off (기본: true) |

## 12. 데이터 마이그레이션 (기존 → 신 모델)

- `boards.owner_type`: 기본 `personal`, `board_departments` 있는 보드는 `department`로 백필
- `board_members.role_in_board`: `BoardAdmin→admin`, `BoardMember→editor`, `BoardViewer→viewer`
- 글로벌 Viewer 사용자: Member로 승격 (실질적 변화 없음)

## 13. 구현 단계

1. DB 마이그레이션 (`owner_type`, 보드 역할 lowercase, `auth_audit_log`, `board_pins`)
2. 백엔드 권한 모델 (Viewer 제거, viewer + comment 권한)
3. 보드 분류 + 즐겨찾기 API
4. 보드 생성 다이얼로그 (개인/부서) + 사이드바 4-bucket
5. 초대(멤버 관리) UI 한국어 역할명 적용
6. 통합 관리 페이지 (DirectoryPage → ManagementPage)
7. OIDC 부서 자동 동기화
8. 보드 transfer + 감사 로그 UI
