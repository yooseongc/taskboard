# API_CONTRACT.md — Backend ↔ Frontend 계약

> 최종 갱신: 2026-04-17
>
> 백엔드 라우트( `backend/src/http/router.rs` )와 프론트엔드 호출( `frontend/src/api/*.ts` ) 을 실제 코드에서 추출한 인벤토리입니다.
> 권위 있는 출처는 **코드 자체** — 이 문서는 사람이 훑어보기 위한 단면입니다. 변경 시 이 문서도 함께 갱신하세요.

---

## 1. 통신 원칙

| 항목 | 규칙 |
|---|---|
| 베이스 URL (운영) | 브라우저 → 프론트 nginx → `/api/` 경로만 backend 로 프록시 |
| 베이스 URL (개발 네이티브) | Vite dev server 가 `/api/` → `http://localhost:8080` 프록시 (`vite.config.ts:10-14`) |
| 인증 헤더 | `Authorization: Bearer <JWT>` — `apiFetch` wrapper 가 자동 부착 (`frontend/src/api/client.ts`) |
| 요청 포맷 | `Content-Type: application/json` (dev-login 포함) |
| 401 대응 | 프론트가 `tryRefreshToken()` 호출 → 실패 시 로그아웃 (`frontend/src/auth/refresh.ts`) |
| 낙관적 잠금 | PATCH/DELETE 에 `If-Match: <ETag>` 헤더 또는 body `version` 필수. `backend/src/http/version.rs` |
| 페이지네이션 | 커서 기반 `?limit=1..100&cursor=…`. 응답 `{ items, next_cursor }`. 구현: `backend/src/http/pagination.rs` |
| 에러 | JSON `{ error: {code, message, details?}, x-request-id }` (`backend/src/http/error.rs`) |
| CORS | `CORS_ALLOWED_ORIGINS` 에 나열된 오리진만 허용. 와일드카드 금지 |

---

## 2. 엔드포인트 매트릭스

범례: ✅ 정상 매칭, ⚠️ 주의 필요, 🚫 호출 없음(백엔드만 존재), 🛠 프론트 존재·백엔드 없음.

### 2.1 Auth & Session

| METHOD | PATH | 백엔드 위치 | 프론트 호출 | 비고 |
|---|---|---|---|---|
| POST | `/api/auth/callback` | `identity/handlers.rs:54` | 🚫 | OIDC 콜백 후 whoami 경유, 현재 프론트는 whoami 만 사용 |
| GET | `/api/auth/whoami` | `identity/handlers.rs:66` | `useWhoami` (`api/auth.ts:8`) | ✅ |
| POST | `/api/dev/login` | `identity/handlers.rs:392` (feature=`dev-auth`) | `useDevLogin` (`api/auth.ts:17`) | ✅ `{user_email: string}` |
| POST | `<KC>/realms/<realm>/protocol/openid-connect/token` | (Keycloak) | `handleOidcCallback` (`auth/oidc.ts:92`), `tryRefreshToken` (`auth/refresh.ts:37`) | PKCE / refresh |
| GET | `/api/health` | `http/router.rs:226` | 🚫 (ops 용) | `"ok"` 텍스트. 프론트 nginx 프록시로도 동일 경로 reachable |

### 2.2 Users & Preferences

| METHOD | PATH | 백엔드 | 프론트 | 비고 |
|---|---|---|---|---|
| GET | `/api/users` | `identity/handlers.rs:165` | `useUsers` (`api/users.ts:8`) | ✅ `{items, next_cursor}` |
| GET | `/api/users/me` | `identity/handlers.rs:66` (= whoami) | `useMe` (`api/users.ts:15`) | ✅ |
| PATCH | `/api/users/{id}` | `identity/handlers.rs:78` | `usePatchUser` (`api/users.ts:19`) | ✅ `{active?}` 만. name/email/roles 는 OIDC 클레임 기준으로만 갱신 |
| GET | `/api/users/me/preferences` | `preference_handlers.rs:30` | `usePreferences` | ✅ |
| PATCH | `/api/users/me/preferences` | `preference_handlers.rs:59` | `usePatchPreferences` | ✅ |

### 2.3 Departments

| METHOD | PATH | 백엔드 | 프론트 | 비고 |
|---|---|---|---|---|
| POST | `/api/departments` | `organization/handlers.rs:81` | `useCreateDepartment` | ✅ 201 + ETag |
| GET | `/api/departments` | `organization/handlers.rs:150` | `useDepartments` | ✅ 페이지네이션. `parent_id=root` 지원 |
| GET | `/api/departments/{id}` | `organization/handlers.rs:301` | `useDepartment` | ✅ |
| PATCH | `/api/departments/{id}` | `organization/handlers.rs:321` | `usePatchDepartment` | ✅ `{name?}` 만. `slug` 는 AD 그룹명 매칭용 불변 식별자 |
| DELETE | `/api/departments/{id}` | `organization/handlers.rs:354` | `useDeleteDepartment` | ✅ `?cascade=true` 는 SystemAdmin 전용 |
| GET | `/api/departments/{id}/ancestors` | `organization/handlers.rs:416` | 🚫 | UI 미사용 |
| GET | `/api/departments/{id}/descendants` | `organization/handlers.rs:458` | 🚫 | UI 미사용 |
| POST | `/api/departments/{id}/members` | `organization/handlers.rs:499` | `useAddDepartmentMember` | ✅ |
| GET | `/api/departments/{id}/members` | `organization/handlers.rs:567` | `useDepartmentMembers` | ✅ |
| DELETE | `/api/departments/{id}/members/{user_id}` | `organization/handlers.rs:673` | `useRemoveDepartmentMember` | ✅ |
| PATCH | `/api/departments/{id}/members/{user_id}` | `organization/handlers.rs:702` | 🚫 | Management 페이지에서만 사용 여지 |
| GET | `/api/departments/{id}/boards` | `board_handlers.rs` (list_department_boards) | `useDepartmentBoards` | ✅ |

### 2.4 Boards

| METHOD | PATH | 백엔드 | 프론트 | 비고 |
|---|---|---|---|---|
| POST | `/api/boards?from_template=<uuid>?` | `board_handlers.rs:161` | `useCreateBoard` | ✅ |
| GET | `/api/boards` | `board_handlers.rs:355` | `useBoards` | ✅ |
| GET | `/api/users/me/boards?bucket=<...>` | `board_handlers.rs:1183` | `useMyBoards` | ✅ 사이드바 4-bucket |
| PUT | `/api/users/me/pins/{board_id}` | `board_handlers.rs` (toggle_board_pin) | `useToggleBoardPin` | ✅ |
| GET | `/api/users/{user_id}/boards` | `board_handlers.rs:1485` | `useUserBoards` | ✅ 관리 페이지 |
| PATCH | `/api/boards/{id}/transfer` | `board_handlers.rs:1295` | 🛠 | 프론트 훅 미구현 — UI에서 직접 호출하는지 확인 필요 |
| GET | `/api/audit-logs` | `board_handlers.rs:1433` | 🚫 (SystemAdmin UI 미구현) | |
| GET | `/api/boards/{id}` | `board_handlers.rs:540` | `useBoard` | ✅ ETag 반환 |
| PATCH | `/api/boards/{id}` | `board_handlers.rs:586` | `usePatchBoard` | ✅ `version` 기반 |
| DELETE | `/api/boards/{id}` | `board_handlers.rs:714` | `useDeleteBoard` | ✅ |
| POST | `/api/boards/{id}/members` | `board_handlers.rs:764` | `useAddBoardMember` | ✅ |
| GET | `/api/boards/{id}/members` | `board_handlers.rs:844` | `useBoardMembers` | ✅ |
| DELETE | `/api/boards/{id}/members/{user_id}` | `board_handlers.rs:947` | `useRemoveBoardMember` | ✅ |
| PATCH | `/api/boards/{id}/members/{user_id}` | `board_handlers.rs:1009` | `usePatchBoardMember` | ✅ |
| PUT | `/api/boards/{id}/departments` | `board_handlers.rs:1054` | 🚫 | 프론트 훅 없음 |
| GET | `/api/boards/{id}/departments` | `board_handlers.rs:1147` | 🚫 | |

### 2.5 Board Columns

| METHOD | PATH | 백엔드 | 프론트 | 비고 |
|---|---|---|---|---|
| POST | `/api/boards/{id}/columns` | `task_handlers.rs:22` | `useCreateColumn` | ✅ |
| GET | `/api/boards/{id}/columns` | `task_handlers.rs:130` | `useBoardColumns` | ✅ |
| PATCH | `/api/boards/{id}/columns/{col_id}` | `task_handlers.rs:174` | `usePatchColumn` | ✅ `version` 필수 |
| DELETE | `/api/boards/{id}/columns/{col_id}` | `task_handlers.rs` | `useDeleteColumn` | ✅ |

### 2.6 Tasks

| METHOD | PATH | 백엔드 | 프론트 | 비고 |
|---|---|---|---|---|
| POST | `/api/boards/{id}/tasks` | `task_handlers.rs` (create_task) | `useCreateTask` | ✅ |
| GET | `/api/boards/{id}/tasks?group_by=column` | `task_handlers.rs` (list_board_tasks) | `useBoardTasks` | ✅ |
| GET | `/api/tasks/{id}` | `task_handlers.rs` (get_task) | `useTask` | ✅ ETag |
| PATCH | `/api/tasks/{id}` | `task_handlers.rs` (patch_task) | `usePatchTask` | ✅ |
| DELETE | `/api/tasks/{id}` | `task_handlers.rs` (delete_task) | `useDeleteTask` | ✅ |
| PATCH | `/api/tasks/{id}/move` | `task_handlers.rs` (move_task) | `useMoveTask` | ✅ |
| POST | `/api/tasks/{task_id}/labels` | `task_handlers.rs` (add_task_label) | `useAddLabel` / `addTaskLabel` | ✅ |
| DELETE | `/api/tasks/{task_id}/labels/{label_id}` | `task_handlers.rs` (remove_task_label) | `useRemoveLabel` / `removeTaskLabel` | ✅ |
| POST | `/api/tasks/{task_id}/assignees` | `task_handlers.rs` (add_task_assignee) | `useAddAssignee` / `addTaskAssignee` | ✅ |
| DELETE | `/api/tasks/{task_id}/assignees/{user_id}` | `task_handlers.rs` (remove_task_assignee) | `useRemoveAssignee` / `removeTaskAssignee` | ✅ |
| GET | `/api/tasks/{task_id}/checklists` | `task_handlers.rs` (list_checklists) | `useTaskChecklists` | ✅ |
| POST | `/api/tasks/{task_id}/checklists` | `task_handlers.rs` (create_checklist) | `useCreateChecklist` | ✅ |
| POST | `/api/tasks/{task_id}/checklists/{cl_id}/items` | `task_handlers.rs` (add_checklist_item) | `useAddChecklistItem` | ✅ |
| PATCH | `/api/tasks/{task_id}/checklists/{cl_id}/items/{item_id}` | `task_handlers.rs` (patch_checklist_item) | `usePatchChecklistItem` | ✅ |

### 2.7 Comments

| METHOD | PATH | 백엔드 | 프론트 | 비고 |
|---|---|---|---|---|
| POST | `/api/tasks/{task_id}/comments` | `comment_handlers.rs:46` | `useCreateComment` | ✅ |
| GET | `/api/tasks/{task_id}/comments` | `comment_handlers.rs:118` | `useTaskComments` | ✅ |
| PATCH | `/api/tasks/{task_id}/comments/{comment_id}` | `comment_handlers.rs:229` | `usePatchComment` | ✅ author 또는 admin |
| DELETE | `/api/tasks/{task_id}/comments/{comment_id}` | `comment_handlers.rs` | `useDeleteComment` | ✅ soft delete |

### 2.8 Board Labels

| METHOD | PATH | 백엔드 | 프론트 | 비고 |
|---|---|---|---|---|
| POST | `/api/boards/{id}/labels` | `board_handlers.rs` (create_board_label) | `useCreateBoardLabel` | ✅ |
| GET | `/api/boards/{id}/labels` | `board_handlers.rs` (list_board_labels) | `useBoardLabels` | ✅ |

### 2.9 Custom Fields

| METHOD | PATH | 백엔드 | 프론트 | 비고 |
|---|---|---|---|---|
| GET | `/api/boards/{id}/fields` | `custom_field_handlers.rs:19` | `useBoardCustomFields` | ✅ |
| POST | `/api/boards/{id}/fields` | `custom_field_handlers.rs:38` | `useCreateCustomField` | ✅ |
| PATCH | `/api/boards/{id}/fields/{field_id}` | `custom_field_handlers.rs:87` | `usePatchCustomField` | ✅ |
| DELETE | `/api/boards/{id}/fields/{field_id}` | `custom_field_handlers.rs:125` | `useDeleteCustomField` | ✅ |
| GET | `/api/boards/{id}/field-values` | `custom_field_handlers.rs:155` | `useBoardFieldValues` | ✅ |
| GET | `/api/tasks/{task_id}/fields` | `custom_field_handlers.rs:181` | `useTaskFieldValues` | ✅ |
| PUT | `/api/tasks/{task_id}/fields/{field_id}` | `custom_field_handlers.rs:200` | `useSetTaskFieldValue` / `setTaskFieldValue` | ✅ |

### 2.10 Board Views (Saved Views)

| METHOD | PATH | 백엔드 | 프론트 | 비고 |
|---|---|---|---|---|
| GET | `/api/boards/{id}/views` | `view_handlers.rs:31` | `useBoardViews` | ✅ |
| POST | `/api/boards/{id}/views` | `view_handlers.rs:56` | `useCreateBoardView` | ✅ |
| PATCH | `/api/boards/{id}/views/{view_id}` | `view_handlers.rs:110` | `usePatchBoardView` | ✅ |
| DELETE | `/api/boards/{id}/views/{view_id}` | `view_handlers.rs:169` | `useDeleteBoardView` | ✅ |

### 2.11 Activity

| METHOD | PATH | 백엔드 | 프론트 | 비고 |
|---|---|---|---|---|
| GET | `/api/boards/{id}/activity` | `board_handlers.rs` (list_activity) | `useBoardActivity` | ✅ |

### 2.12 Templates

| METHOD | PATH | 백엔드 | 프론트 | 비고 |
|---|---|---|---|---|
| POST | `/api/templates` | `template_handlers.rs` (create_template) | `useCreateTemplate` | ✅ |
| GET | `/api/templates` | `template_handlers.rs` (list_templates) | `useTemplates` | ✅ |
| GET | `/api/templates/{id}` | `template_handlers.rs` (get_template) | `useTemplate` | ✅ |
| PATCH | `/api/templates/{id}` | `template_handlers.rs` (patch_template) | `usePatchTemplate` | ✅ |
| DELETE | `/api/templates/{id}` | `template_handlers.rs` (delete_template) | `useDeleteTemplate` | ✅ |

---

## 3. 공유 타입 축약

주요 JSON shape. 상세는 `frontend/src/types/api.ts` (클라이언트) 와 `backend/src/*/models.rs` (서버) 양쪽에서 중복 선언됨.

```ts
WhoamiResponse {
  id: UUID; external_id: string; name: string; email: string;
  email_verified: boolean; department_ids: UUID[];
  roles: ("SystemAdmin" | "DepartmentAdmin" | "Member" | "Viewer")[];
  active: boolean; created_at: ISO; updated_at: ISO;
}

Board {
  id: UUID; title: string; description?: string;
  owner_id: UUID; owner_type: "personal" | "department";
  department_ids: UUID[]; version: number;
  created_at: ISO; updated_at: ISO;
}

BoardSummary (list view) extends Board with { pinned, bucket, member_count?, column_count? }

Task {
  id: UUID; board_id: UUID; column_id: UUID; position: number;
  title: string; summary?: string; description?: string;
  priority: "low"|"medium"|"high"|"urgent";
  status: "open"|"in_progress"|"done"|"archived";
  start_date?: ISO; due_date?: ISO;
  icon?: string | null;                // emoji prefix (migration 0018)
  labels: LabelRef[]; assignees: AssigneeInfo[];
  checklist_summary: { total: number; checked: number };
  comment_count: number;
  created_by: UUID; version: number;
  created_at: ISO; updated_at: ISO;
}

AssigneeInfo / UserRef {
  id: UUID; name: string; email: string;
  department_names: string[];          // JOIN-populated, used by AvatarStack chip
}

// PatchTaskRequest.icon uses three-way semantics via double_option:
//   absent  → leave current icon alone
//   "🚀"   → set to value
//   null    → clear the icon
// See backend http::serde_helpers::double_option.

CustomField {
  id; board_id; name; field_type;
  options: { label: string; color?: string }[];
  position; required; show_on_card; created_at;
}
// allow-list for field_type: text, number, select, date, checkbox, url, email, phone, person
// 추가 시 반드시 backend custom_field_handlers.rs 의 validator 와 frontend TaskDrawer.tsx 의 위젯 스위치를 함께 갱신

BoardView {
  id; board_id; name;
  view_type: "board" | "table" | "calendar";
  config: Record<string, unknown>;   // 뷰별로 필터/정렬/컬럼 가시성 등
  owner_id; shared; position; created_at; updated_at;
}
```

---

## 4. 발견된 불일치 · 드리프트

### 4.1 필드 no-op (사일런트 드롭) — 해소 (2026-04-17)

과거 `usePatchUser` 와 `usePatchDepartment` 훅 시그니처가 백엔드 수용 범위보다 넓었으나, 훅을 실제 수용 범위로 축소했다. 지금은 매칭됨.

- `usePatchUser` → `{ active? }` 만. name/email/roles 는 OIDC 클레임 기준으로 로그인마다 `upsert_user_from_claims` 로 재동기화됨.
- `usePatchDepartment` → `{ name? }` 만. `slug` 는 AD 그룹명 exact-match 의 대상이므로 UI 에서 변경 불가 원칙.

> 결정 근거: 사용자·부서는 진실의 원천이 Keycloak/AD. 내부 UI 로 수정하면 다음 로그인에 덮어써져 UX 가 깨지므로, Taskboard 는 `active` 토글과 부서 표시명(name) 만 자체 관리.

### 4.2 직접 `fetch` vs 훅 중복 — 해소 (2026-04-17)

DnD 핸들러에서 동적 `taskId` 로 API 를 호출하는 5 지점이 훅 대신 `apiFetch` 를 직접 쓰고 있었다.
다음 raw 함수를 `api/tasks.ts` 와 `api/customFields.ts` 에 추가해 URL/메서드/바디 구성을 한 곳에 모았다.

- `addTaskAssignee(taskId, userId)`, `removeTaskAssignee(taskId, userId)`
- `addTaskLabel(taskId, labelId)`, `removeTaskLabel(taskId, labelId)`
- `setTaskFieldValue(taskId, fieldId, value)`

기존 hook (`useAddAssignee` 등) 도 위 raw 함수를 감싸는 형태로 재구성했다. 고정 `taskId` 가 있는 consumer 는 hook, 드래그처럼 `taskId` 가 매번 바뀌는 flow 는 raw 함수 + 명시적 `invalidate()` 사용.

### 4.3 백엔드만 존재 (프론트 미사용)

- `POST /api/auth/callback` — OIDC 플로우에서 whoami 경유로 대체됨
- `GET /api/departments/{id}/ancestors|descendants` — 계층 네비게이션 UI 미구현
- `PATCH /api/departments/{id}/members/{user_id}` — 부서 역할 변경 UI 없음
- `PUT|GET /api/boards/{id}/departments` — 보드에 부서 연결 UI 미노출
- `GET /api/audit-logs` — SystemAdmin 감사 로그 뷰 미구현

### 4.4 프론트만 존재 (백엔드 무엇과도 매칭 안됨)

현재는 없음 — 모든 프론트 호출이 백엔드 라우트에 매핑됨. (2026-04-17 시점)

### 4.5 토큰 저장 방침 (2026-04-17 결정)

- access token / refresh token 은 모두 localStorage 에 저장 (`frontend/src/auth/index.ts`, `refresh.ts`).
- 키: `taskboard_token`, `taskboard_refresh_token`.
- 초기 설계(D-024, "memory-only") 는 페이지 새로고침 UX 손실이 커서 뒤집힘. Keycloak refresh token 은 서버측 revoke 가능하므로 XSS 경감은 로그아웃/세션 만료 주기로 처리.
- regression guard 테스트(`frontend/src/auth/index.test.ts`) 도 이 방침에 맞게 재작성됨.

---

## 5. 에러·낙관적 잠금·페이지네이션

### 에러 응답 표준

```json
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "Task has been modified by another user.",
    "details": { "current_version": 5 }
  }
}
```

- HTTP 상태코드는 code 범주에 맞춰 (`401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 VERSION_CONFLICT`, `412 PRECONDITION_REQUIRED`, `422 VALIDATION_ERROR` 등).
- 모든 응답에 `X-Request-ID` 헤더.
- 프론트 `apiFetch` 가 401 → `tryRefreshToken` 한 번 시도 후 실패 시 로그인 페이지로 전송.

### ETag / `version`

- 모든 mutable 리소스(Board/Column/Task/…)는 `version: int` 필드 유지.
- 서버는 `ETag: W/"<version>"` 헤더로 응답.
- 클라이언트는 PATCH/DELETE 시 `If-Match` 헤더 **또는** body 의 `version` 필드를 보냄. 둘 다 없으면 `412 Precondition Required`.
- 버전 불일치 시 `409 VERSION_CONFLICT` + `details.current_version`. 클라이언트는 최신 데이터 재조회 후 재시도 권장.

### 커서 페이지네이션

- `limit: 1..100` (기본 20 내외).
- `cursor`: base64(JSON) — 내부에 `(created_at|added_at|joined_at, id)` 튜플.
- 응답 `{ items: [...], next_cursor: string | null }`.
- `cursor` 위조·변조 시 400 반환.

---

## 6. 기여 체크리스트

새 엔드포인트 추가 시:

1. `backend/src/.../handlers.rs` 에 핸들러 작성, `router.rs` 에 등록
2. `authz/check.rs` 권한 분기 반영 (필요 시 `matrix.rs` 액션 추가)
3. `frontend/src/types/api.ts` 에 응답 타입 추가
4. `frontend/src/api/<resource>.ts` 에 훅 추가 (직접 `fetch` 하지 말 것)
5. React Query key 규칙: `['<resource>', id, ...sub]`
6. 본 문서 (`doc/API_CONTRACT.md`) 해당 섹션에 한 줄 추가

필드 rename / 삭제 시:

- 프론트 훅 시그니처 → `types/api.ts` → 모든 사용처 동시 갱신
- 백엔드 models.rs / handlers.rs 양쪽 확인
- 마이그레이션 필요하면 번호 순차 증가 (`backend/migrations/NNNN_<name>.sql`)
