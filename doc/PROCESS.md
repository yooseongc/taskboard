# PROCESS.md — Task Board 구현 진행 현황

> 마지막 업데이트: 2026-04-18  
> 최신 커밋: 2da5b8c (관리 페이지 2-col + detail modal + NavBrand no-select)

---

## 개요

Mattermost Boards 유사 Task Board 시스템. Frontend(React/Vite) + Backend(Rust/axum) 분리 구조. PostgreSQL + Keycloak OIDC.

---

## 완료된 작업 (커밋 순)

### Sprint 1–3 (초기 구조)
- 전체 아키텍처 설계 및 DB 스키마 (migrations 0000–0006)
- Keycloak OIDC 인증 + 사용자/조직 관리 (`/api/auth`, `/api/users`, `/api/departments`)
- Board/Column/Task CRUD + 기본 Board View 렌더링
- Template 도메인 모델 초기 설계 (`templates` 테이블, materialize API)

### Sprint 4 (d703bef)
- Command Palette (`Cmd+K`) 전역 검색
- Bulk select + 일괄 이동/삭제 (Table View)
- 다크모드 전면 적용 (CSS custom properties)

### Sprint 4 추가 (cb7e596, 009385d, ddb39ef, 82d2a4b)
- i18n (en/ko), 글꼴 크기, Onboarding Tour, a11y 자동 검증
- 태그 팔레트, `summary` 필드, accent color 설정 (`0008_user_preferences.sql`, `0009_add_task_summary.sql`)
- Bug fix: Settings 재진입 시 accent color 초기화 문제

### Round A — Mattermost Boards 패리티 (032628b → 79fb632)
- **Card Drag-and-Drop**: `@hello-pangea/dnd`, `PATCH /api/tasks/:id/move` (optimistic update)
- **Vite Code-split**: react-vendor / query / dnd / state 청크 분리
- **Task Drawer**: 우측 패널 → 중앙 다이얼로그 (width 5xl, max-h 90vh)
  - 인라인 편집: title, description, priority, status, start_date, due_date
  - Custom field 위젯 (text, number, select, date, checkbox, url)
- **TableView**: 정렬/필터 + AND/OR 복합 조건 필터 빌더
- **Phase 2 (`0010_seed_status_priority_fields.sql`)**: Status/Priority를 custom field로 통합
  - TaskDrawer에서 하드코딩 위젯 제거, custom field로 렌더
  - `patch_task`에서 enum ↔ custom field 역방향 sync

### Round B–D (bdc6bfb)
| Sub-round | 내용 |
|---|---|
| **B.1** | Column header color (migration `0011_column_color.sql`, `PATCH /columns/:id` color 필드) |
| **B.2** | Custom field "Show on card" 토글 (migration `0012_field_show_on_card.sql`), BoardSettingsModal drag-reorder |
| **B.3** | Select 옵션 자유 hex color picker (BoardSettingsModal 옵션 ↑↓ 버튼 포함) |
| **C** | Saved Views (migration `0013_board_views.sql`, `view_handlers.rs`, `SavedViewBar` 컴포넌트) — Board/Table/Calendar별 필터·정렬·컬럼 가시성 퍼시스트 |
| **D.1** | 필드 타입 확장: `email`, `phone`, `person` — backend allow-list + frontend 위젯 (email input, tel input, user select) |
| **D.2** | Template → 보드 생성 시 custom field 정의 복사 (`template_handlers.rs` `materialize_from_template` TX 확장) |
| **D.3** | Calendar View date field 소스 선택 — `CalendarDateField` 인터페이스, `resolveDate` 헬퍼, BoardViewPage 드롭다운 UI |

### Round E–G
| 항목 | 내용 |
|---|---|
| **댓글 편집/삭제** | `usePatchComment` / `useDeleteComment` 훅 추가, TaskDrawer hover 시 ✏🗑 버튼, inline 편집, `(edited)` 표시 |
| **댓글 Markdown 렌더링** | TaskDrawer 댓글 본문에 react-markdown 적용 |
| **Activity 탭** | BoardViewPage 4번째 탭, `useBoardActivity` 연결, task 필터 드롭다운, task 제목 클릭 → 드로어 오픈 |
| **Table View SavedViewBar** | TableView에 `onStateChange` + `defaultConfig` prop 추가, BoardViewPage에서 상태 리프팅 + SavedViewBar 연결 |
| **Vite 청크 최적화** | `calendar` (191KB), `markdown` (117KB) 분리 → index 청크 700KB → 398KB |

### Phase 1–8 — 역할 모델 재구성 (a2f2e6b → 3e195e1)

| Phase | 커밋 | 내용 |
|---|---|---|
| **1** | a2f2e6b | DB 마이그레이션 `0017_role_redesign.sql`: `owner_type` (personal/department/team), 역할명 소문자 통일, 보드 핀(즐겨찾기), 감사 로그 테이블 |
| **2** | cc443cd | 백엔드 권한 모델 재구성 — `GlobalRole × BoardRole` 2-tier 매트릭스, `authz/matrix.rs` + `check.rs` 개편 |
| **3** | 999636a | 보드 분류(personal/department/team) + 즐겨찾기 API (`POST/DELETE /api/boards/:id/pin`) |
| **4** | 66ed78a | 보드 생성 플로우 — 개인/부서 owner_type 선택, 사이드바 4-bucket (Pinned / Personal / Department / Other) |
| **5** | 9d85a4f | 멤버 관리 페이지 한국어화 + 즐겨찾기 토글 UI |
| **6** | 01c4d39 | 통합 관리 페이지 (Directory → Management): 사용자·역할·부서를 한 곳에서 관리 |
| **7** | 91aad0f | OIDC `groups` 클레임 → 부서 자동 동기화 (`authz/authn.rs::sync_user_departments_from_claims`), `OIDC_DEPT_CLAIM` / `OIDC_DEPT_SYNC_ENABLED` |
| **8** | 3402e8b | 보드 소유권 이전(Transfer) + 감사 로그(`board_audit_log`) 기록 |
| 최신 | 3e195e1 | 멤버 모달 분리, 보드 메뉴 4-bucket 시각 개선, 관리 페이지 사용자 클릭 버그 수정 |

### 인프라 재편 (2026-04-17)

| 변경 | 내용 |
|---|---|
| **Compose 재배치** | `infra/docker-compose.yml` → `docker-compose.dev.yml` (루트), `infra/docker-compose.prod.yml` → `docker-compose.yml` (루트, 기본) |
| **Docker 빌드 파일** | `docker/` 디렉터리로 분리: `backend.Dockerfile` / `backend.dev.Dockerfile` / `frontend.Dockerfile` / `frontend.dev.Dockerfile` |
| **환경변수 템플릿** | `.env.example` (운영) + `.env.dev.example` (개발) 로 분리. 루트 배치. |
| **infra/ 유지** | `infra/nginx.conf`, `infra/keycloak/realm-export.json`, `infra/glauth/glauth.cfg` |
| **문서 재편** | `CLAUDE.md` → Claude Code 안내서로 재작성, 원본 스펙은 `doc/SPEC.md` 로 이전. `README.md` / `doc/DEVELOPMENT.md` / `doc/DEPLOYMENT.md` / `doc/AUTH.md` 신규 작성. |

### Mattermost Boards 참조 기능 (2026-04-18)

스크린샷으로 본 Focalboard 유사 UI 에서 도출한 6개 기능 반영.

| 항목 | 커밋 | 내용 |
|---|---|---|
| **열 집계 푸터** | `01ae5e6` | `lib/aggregation.ts` 신규. AggType 11종 (count / count_empty / sum / avg / min / max / …) × 타입별 supported 매트릭스. `<tfoot>` 에 AggregationFooterCell popover. `BoardView.config.aggregations` 로 퍼시스트. 13 unit tests |
| **그룹 헤더 `+`** | `01ae5e6` | `groupBy.type === 'column'` 일 때 각 그룹 행 헤더에 `+` — 해당 column 에 prefill 된 inline add row 오픈 |
| **툴바 Filter/Sort 승격** | `01ae5e6` | `ViewToolbar` 에 `filter`, `sort` props 1급화. Filter 는 active count 배지, Sort 는 정렬 가능 필드 + asc/desc 토글 popover |
| **Task 이모지 prefix** | `81476c5` | migration `0018_task_icon.sql` + `TaskRow.icon` / `TaskDto.icon`. emoji-mart 풀 피커 (`EmojiPickerButton`, lazy). TaskModal · Kanban card · Table title · Calendar event 에 prefix 렌더. `bundle 'emoji' chunk` 분리 |
| **담당자 부서 칩** | `81476c5` | `AssigneeInfo.department_names` JOIN + `UserRef.department_names` 전파. AvatarStack 칩에 첫 부서명, tooltip 에 전체 |
| **Sort custom field** | `0499553` | SortKey 를 string 으로 확장. 제네릭 comparator (숫자/불리언/문자열/빈값). custom field 전부 정렬 가능, assignees/info 만 제외 |

### Notion-inspired 스타일 개편 (2026-04-18)

| 항목 | 커밋 | 내용 |
|---|---|---|
| **Warm palette** | `5c2046e` | 서피스 `#f7f6f3`, 텍스트 `#37352f` (warm charcoal), 보더 `rgba(55,53,47,0.12)` 반투명 taupe. 다크 모드는 warm near-black `#191918/#252523` |
| **라이트 사이드바** | `5c2046e` | 기존 dark sidebar → light warm 으로 전환. 기존 Tailwind hardcode (`bg-blue-*`, `text-gray-*`) 모두 `var(--color-*)` 토큰 참조 |
| **Radius/Shadow** | `5c2046e` | 3/6/8/12px 타이트, shadow 는 soft low-contrast |
| **모바일 drawer + 반응형 패딩** | `cebc77b` | `px-4 md:px-6 py-6 md:py-8` 패턴. 사이드바 off-canvas (ESC · 라우트 변경 · backdrop 으로 close) |
| **i18n 플레이스홀더 수정** | `57be592` | `tableView.count` 에 항상 `{count}` 파라미터 전달 |
| **사이드바 가독성 자동** | `0499553` | `AccentColorSync` 가 저장된 `sidebarColor` 의 WCAG 상대 명도를 계산해 어두운 bg→밝은 text / 밝은 bg→warm charcoal text 로 토큰 오버라이드 |
| **테이블 페이지 레벨 스크롤** | `0499553` | 테이블 자체 `overflow-x-auto` 제거 + `<table>` 에 `min-w-[720px]`. `<main>` + Layout 메인 영역에 `min-w-0` 로 flex 축소 허용. sticky first column 제거 (toolbar 와 분리 스크롤 깨지는 문제) |
| **스크롤바 두께** | `f7a8ea1` | 6 → 10px, 썸 색 `color-mix(text-muted 45%)` 로 대비 강화 |
| **관리 페이지 2-col 재설계** | `2da5b8c` | `lg:grid-cols-[14rem_1fr]` 좌측 scope tree + 우측 사용자 테이블 (5컬럼). 행 클릭 → Modal 로 detail. 기존 3-pane 의 가운데 list 가 좁던 문제 해결 |
| **NavBrand no-select** | `2da5b8c` | 사이드바 앱 이름 드래그 선택 방지 |
| **STYLE_GUIDE 전면 개편** | `cebc77b` | Design ethos · Responsive breakpoints · Horizontal overflow 섹션 신규. Sidebar light 전환 반영. |

---

## 현재 파일 구조

### Frontend (`workspace/frontend/src/`)

```
api/
  auth.ts          — OIDC 로그인/로그아웃
  boards.ts        — Board CRUD + columns + members + board tasks + board activity
  client.ts        — apiFetch wrapper (JWT auto-attach)
  customFields.ts  — Board custom field CRUD + task field values
  departments.ts   — 부서/팀 API
  preferences.ts   — 사용자 설정 (테마, accent color)
  tasks.ts         — useTask / usePatchTask / useMoveTask / useDeleteTask
                     + comment hooks (create/patch/delete)
                     + checklist hooks (create/add-item/patch-item)
                     + label/assignee hooks
  templates.ts     — Template CRUD + materialize
  users.ts         — 사용자 목록
  views.ts         — Saved Views CRUD + TableViewConfig / BoardViewConfig 타입

components/
  BoardSettingsModal.tsx  — 필드 관리(drag-reorder, show_on_card, hex color) + 멤버 관리
  CalendarView.tsx        — react-big-calendar, CalendarDateField, resolveDate
  CommandPalette.tsx      — Cmd+K 전역 검색
  Layout.tsx              — 사이드바 (내 보드 목록, 팀 그룹핑)
  SavedViewBar.tsx        — 저장된 뷰 선택/저장 바 (Board + Table 탭 모두 연결)
  TableView.tsx           — 정렬/필터 빌더, bulk select, defaultConfig + onStateChange
  TaskDrawer.tsx          — 중앙 다이얼로그, custom field 위젯
                            체크리스트 UI (진행률 바, 인라인 아이템 추가)
                            댓글 UI (Markdown 렌더링, 편집/삭제)
                            라벨 UI (생성/추가/삭제)
                            담당자 UI (검색+추가+삭제)
  Toast.tsx               — 토스트 알림

pages/
  BoardViewPage.tsx    — Board/Table/Calendar/Activity 탭, DnD, 드로어, SavedViewBar
  BoardListPage.tsx    — 보드 목록
  TemplatesPage.tsx    — 템플릿 목록 + 생성(custom field 포함) + 미리보기
  AdminUsersPage.tsx   — 사용자/권한 관리
  DirectoryPage.tsx    — 조직 디렉터리
  OrgPage.tsx          — 조직 관리
  ProfilePage.tsx / SettingsPage.tsx / LoginPage.tsx / …
```

### Backend (`workspace/backend/src/`)

```
authz/
  check.rs           — check_board_permission (2-tier 권한 매트릭스)
  matrix.rs          — GlobalRole × BoardRole × Action × Resource 매트릭스

collaboration/
  mod.rs             — 모듈 등록
  models.rs          — DB 모델 (Task, Board, Column, CustomField, BoardView …)
  board_handlers.rs  — Board CRUD + 멤버 관리
  task_handlers.rs   — GET/POST/PATCH/DELETE tasks, move, field sync
                       + labels/assignees/checklists 핸들러
  comment_handlers.rs — Comments CRUD (create/list/patch/delete, soft delete)
  custom_field_handlers.rs — Board custom field CRUD (email/phone/person 타입 포함)
  template_handlers.rs     — Template CRUD + materialize (custom field 복사 포함)
  view_handlers.rs         — Saved Views CRUD
  activity.rs / activity_helper.rs — 활동 로그 기록 헬퍼
```

### DB Migrations (`workspace/backend/migrations/`)

| 파일 | 내용 |
|---|---|
| 0000–0006 | 기본 스키마 (users, org, boards, tasks, comments, activity_logs, templates) |
| 0007 | custom_fields, task_field_values |
| 0008 | user_preferences |
| 0009 | tasks.summary 컬럼 |
| 0010 | Status/Priority seed custom fields |
| 0011 | board_columns.color |
| 0012 | board_custom_fields.show_on_card |
| 0013 | board_views (Saved Views) |
| 0014 | custom field type check 확장 (email/phone/person) |
| 0015 | 기존 보드 default saved view backfill |
| 0016 | 템플릿 페이로드 보강 |
| 0017 | 역할 재설계 (owner_type, 소문자 역할, board pins, board_audit_log) |

### 인프라 (루트 + `workspace/infra/`)

```
taskboard/
├── docker-compose.yml         — 운영: postgres + backend + frontend (외부 Keycloak/AD 가정)
├── docker-compose.dev.yml     — 개발: postgres + ldap(GLAuth) + keycloak + backend + frontend
├── .env.example               — 운영 변수 템플릿
├── .env.dev.example           — 개발 변수 템플릿 (dev-auth 포함)
└── docker/
    ├── backend.Dockerfile        — prod (dev-auth feature 미포함)
    ├── backend.dev.Dockerfile    — dev (--features dev-auth)
    ├── frontend.Dockerfile       — prod (VITE_KEYCLOAK_URL ARG 주입)
    └── frontend.dev.Dockerfile   — dev (VITE_DEV_AUTH_ENABLED=1)

workspace/infra/
├── nginx.conf                 — SPA fallback + /api 프록시 (backend:8080)
├── keycloak/realm-export.json — Keycloak realm 자동 임포트 (LDAP federation 포함)
└── glauth/glauth.cfg          — 개발용 LDAP (13명, 7개 부서 그룹)
```

---

## 구현 완료 기능 전체 목록

| 기능 | 상태 |
|---|---|
| Board View (칸반 + DnD) | ✅ |
| Table View (정렬/필터/bulk) | ✅ |
| Calendar View (월/주, date field 선택) | ✅ |
| Activity View (탭, task 필터, 드로어 연동) | ✅ |
| Saved Views (Board + Table, 저장/로드/삭제) | ✅ |
| Task Drawer (인라인 편집, custom fields) | ✅ |
| 댓글 (작성/편집/삭제/Markdown) | ✅ |
| 체크리스트 (진행률 바, 아이템 토글) | ✅ |
| 라벨/태그 (생성/추가/삭제, 색상) | ✅ |
| 담당자 지정 (검색+추가+삭제) | ✅ |
| Custom Fields (10+ 타입) | ✅ |
| Column 색상 | ✅ |
| Template 기능 (custom field 복사 포함) | ✅ |
| Keycloak OIDC 인증 + AD(LDAP) federation | ✅ |
| OIDC groups → 부서 자동 동기화 (Phase 7) | ✅ |
| 조직/부서/팀 구조 + owner_type 기반 보드 분류 | ✅ |
| 권한 매트릭스 (GlobalRole × BoardRole 2-tier) | ✅ |
| 보드 소유권 이전 + 감사 로그 (Phase 8) | ✅ |
| Docker compose (dev/prod 분리, Keycloak 자동 임포트) | ✅ |
| i18n (한국어/영어) | ✅ |
| 다크모드 | ✅ |
| Command Palette (Cmd+K) | ✅ |
| 열 집계 푸터 (COUNT/SUM/AVG/%/Unique 등) | ✅ |
| 그룹 헤더 `+` (column 그룹 prefill add row) | ✅ |
| 툴바 Filter/Sort 1급화 + custom field 정렬 | ✅ |
| Task 이모지 prefix (emoji-mart 풀 피커) | ✅ |
| 담당자 부서 칩 표시 | ✅ |
| Notion-inspired warm palette (light sidebar) | ✅ |
| 모바일 off-canvas drawer + 반응형 패딩 | ✅ |
| 관리 페이지 2-col + detail modal | ✅ |

---

## 알려진 기술 부채

- emoji-mart 청크 510KB (gzip 110KB) — lazy import 로 분리됨. 더 가벼운 피커로 교체 여지
- index 청크 460KB 내외 (500KB 경고 임계 근처) — 추가 code-split 여지 있으나 우선순위 낮음
- `person` 필드가 kanban 카드에서 UUID 앞 8자리만 표시 (카드에는 users 목록이 없음) — 담당자 칩과 별개 경로
- `useUsers()` 호출이 TaskDrawer 내부에서 발생 — React Query 캐시로 중복 요청은 없으나 구조적 개선 여지
- BoardSettingsModal `MembersPanel` 의 사용자 검색이 클라이언트 필터링 (100명 이상 시 API 쿼리 필요)
- Activity 탭이 최신 50건만 표시 (pagination UI 없음)
- `PATCH /api/users/{id}` 는 `active` 만 수용, `PATCH /api/departments/{id}` 는 `name` 만 수용 — name/roles/slug 은 OIDC 클레임 기준이므로 의도적 제약. 프론트 훅 시그니처도 이에 맞춤
- 테이블 sticky first column 미구현 — 페이지 레벨 가로 스크롤로 대체 (toolbar 와 분리 스크롤되는 UX 문제 회피). 재도입 시 toolbar 도 sticky 처리 필요
