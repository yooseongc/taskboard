# Phase 4 Continuation Plan — Task Board 기능 완성

## Context

Phase 4 Developer 가 Priority 2 (뼈대 + 매트릭스/에러/페이지네이션) 까지 구현했다. 74개 라우트가 매핑돼 있으나 핸들러는 전부 stub (500 반환). DB pool 이 main.rs 에 연결되지 않았고, AuthnUser extractor 는 항상 401 을 반환한다. 이 상태에서 Phase 5 (Reviewer) 에 넘기면 리뷰할 실질 코드가 없다.

**목표**: Developer 서브에이전트를 단계적으로 재호출하여 Priority 3~4 (핵심 CRUD + Frontend 골든 패스) 까지 끌어올린다. Phase 5 리뷰어가 인증 흐름, 권한 평가, 낙관적 락, 트랜잭션 패턴, SQL 정합성을 의미 있게 감사할 수 있는 수준.

## Key Technical Decisions

| 결정 | 선택 | 이유 |
|------|------|------|
| sqlx 쿼리 | `sqlx::query_as` 런타임 쿼리 (compile-time check 비사용) | 로컬 PG 없음, `.sqlx/` 오프라인 모드 미구성 |
| AppState | `#[derive(Clone)] struct AppState { pool: PgPool, config: AppConfig }` → axum `.with_state()` | 표준 axum 패턴 |
| 트랜잭션 | 핸들러 레벨 `pool.begin()` → 작업 → `tx.commit()` | activity_log 와 본 mutation 동일 TX |
| UUID | 앱 레벨 `uuid7::now_v7()` (S-026 errata 반영) | DB DEFAULT 없음, UUIDv7 time-ordered |
| ETag | 공용 `version_from_request()` helper (S-003) | If-Match 또는 body version 파싱, 428/400/409 분류 |
| handlers 분할 | `collaboration/handlers.rs` → `board_handlers.rs`, `task_handlers.rs`, `comment_handlers.rs`, `template_handlers.rs` 분리 | 37 stub 이 1000+ 줄 핸들러 1개 파일이 되는 걸 방지 |
| Position compaction | MVP 에서는 기본 산술만 (last + 1024.0). gap < 1e-9 compaction 은 TODO | 정상 사용에서 도달 불가능, 리뷰어에게 TODO 명시 |

## Execution Steps

### Step 1 — Foundation: AppState + DB Pool + Auth Extractor + Dev Login

**목적**: 모든 후속 핸들러가 의존하는 인프라 배관.

**Scope**: S-005 (dev-login), S-007 (auth model), S-029 (config)

**핵심 작업**:
1. `src/infra/state.rs` 생성 — `AppState { pool, config }`
2. `main.rs` 수정 — `create_pool()` 호출, `sqlx::migrate!()` 실행, AppState 구성, `.with_state()`
3. `http/router.rs` 수정 — `Router` → `Router<AppState>`, 모든 stub 핸들러 시그니처에 `State<AppState>` 추가
4. `authz/authn.rs` 수정 — `FromRequestParts<AppState>`, dev-auth (HS256) + OIDC (claim-only, 서명 TODO) 구현, DB user 조회 + active 확인
5. `identity/handlers.rs` — `POST /api/dev/login` 핸들러 구현 (S-005)
6. 도메인 모델 파일 생성 — `identity/models.rs`, `organization/models.rs`, `collaboration/models.rs`
7. `collaboration/handlers.rs` 분할 → 4개 서브모듈

**파일**: ~10개 생성/수정 | **코드량**: ~400줄 | **빌드**: `cargo build --features dev-auth`

---

### Step 2 — Identity + Organization Handlers

**목적**: 사용자 관리 + 부서 트리 CRUD. 권한 평가의 기반 데이터.

**Scope**: S-004, S-006, S-009, S-010, S-011, S-012

**핵심 작업**:
1. `auth_callback` — JWT sub/email/name 추출, users upsert, WhoamiResponse
2. `whoami` — user + departments + roles 조회
3. `patch_user` — 권한 체크 + active/roles 업데이트
4. `list_users` — keyset pagination (`WHERE (created_at, id) < ($1, $2) ORDER BY ... LIMIT $N+1`)
5. Department CRUD — ltree path 계산, depth 검증, ancestors (`@>`), descendants (`<@`), cascade
6. Department members — add, list, remove, patch role

**파일**: ~6개 수정 | **코드량**: ~500줄 | **빌드**: `cargo build`

---

### Step 3 — Board + Column CRUD + ETag/Version

**목적**: 핵심 도메인. 낙관적 락(S-003) 패턴의 첫 실제 적용.

**Scope**: S-003, S-013, S-014, S-015, S-016

**핵심 작업**:
1. `http/version.rs` — version_from_request() (428/400 분류)
2. Board CRUD — create(TX: boards+board_departments+board_members+activity), list, get+ETag, patch+version, delete(soft)
3. Board members — add, list, remove(+assignees 정리), patch role
4. Board departments — PUT(교체, 1..5), GET
5. Column CRUD — create(position=last+1024), list(비페이지네이션), patch+version, delete(move_to)

**파일**: ~8개 생성/수정 | **코드량**: ~600줄 | **빌드**: `cargo build`

---

### Step 4 — Task CRUD + Move + Sub-resources + Views

**목적**: 가장 큰 핸들러 집합. Task 생태계 전체.

**Scope**: S-017, S-018, S-019, S-020

**핵심 작업**:
1. Task CRUD — create, get(DTO 조립: labels+assignees+checklist_summary+comment_count), patch(column_id 거부), delete(soft)
2. Task move — SELECT FOR UPDATE, 이벤트 분류(moved_column/reordered/no-op), activity_log
3. Labels — board label create, task label add/remove + parent version bump
4. Assignees — add/remove + parent version bump
5. Checklists — create, add item, toggle + parent version bump
6. Board tasks view — by_column(paginated), table(sort/filter), calendar(overlap SQL + unscheduled + 500 상한)

**파일**: ~4개 수정 | **코드량**: ~700줄 | **빌드**: `cargo build`

---

### Step 5 — Comments + Activity + Templates

**목적**: 백엔드 완성. Template materialization 은 가장 복잡한 단일 TX.

**Scope**: S-021, S-024, S-022, S-023

**핵심 작업**:
1. Comments — create/list/patch/delete + parent version + activity + author 권한
2. Activity log — list(paginated DESC, actor_name JOIN)
3. Template CRUD — scope 검증, payload 검증, soft delete
4. Materialization — TX: 권한→payload 해석→boards+columns+labels+tasks→BoardAdmin→auto_enroll→origin→activity

**파일**: ~4개 수정 | **코드량**: ~500줄 | **빌드**: `cargo build`

---

### Step 6 — Frontend Golden Path

**목적**: dev-auth 로그인 → 보드 목록 → 칸반 뷰의 e2e 데모.

**Scope**: Frontend only

**핵심 작업**:
1. `api/client.ts` — auth header, ApiError 파싱, base URL
2. `api/auth.ts`, `api/boards.ts` — react-query hooks
3. `stores/authStore.ts` — login/logout/whoami
4. `components/AuthGuard.tsx` — 미인증 redirect
5. `pages/LoginPage.tsx` — dev-auth 이메일 폼
6. `pages/BoardListPage.tsx` — 보드 그리드 + 생성 버튼
7. `pages/BoardViewPage.tsx` — 탭 + 칸반 컬럼 + 카드

**파일**: ~10개 | **코드량**: ~400줄 | **빌드**: `pnpm run build`

---

## Priority

```
Step 1 (Foundation)    ■■■■■ MUST
Step 2 (Identity+Org)  ■■■■  MUST
Step 3 (Board+Column)  ■■■■  MUST
Step 4 (Task+Sub)      ■■■   HIGH
Step 5 (Comment+Tmpl)  ■■    MED
Step 6 (Frontend)      ■     LOW
```

**최소: Step 1~4** (~2200줄) | **이상: Step 1~6** (~3100줄)

## Risks

| 리스크 | 완화 |
|--------|------|
| AppState 전환 시 전 핸들러 시그니처 일괄 변경 | Step 1 에서 동시 갱신 |
| sqlx 런타임 쿼리 타입 불일치 | FromRow 구조체 ↔ SQL 컬럼명 엄밀 매칭 |
| collaboration/handlers.rs 비대화 | Step 1 에서 4개 서브모듈 사전 분할 |
| 서브에이전트 컨텍스트 격리 | Step 1 코드에 패턴 주석, 후속 프롬프트에 파일 경로 명시 |

## Verification

1. `cargo build` exit 0 (매 Step 종료 후)
2. `cargo build --features dev-auth` exit 0
3. `pnpm run build` exit 0 (Step 6 후)
4. `phase-4.done.json` 갱신 — priority_reached: 3 or 4
5. `DEVELOPMENT.md` V- 엔트리 갱신
