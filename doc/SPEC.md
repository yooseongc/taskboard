# SPEC.md — Taskboard 요구사항 스펙

> 최초 작성: 2026-02 (원본 CLAUDE.md)
> 이전: 2026-04-17 (CLAUDE.md → doc/SPEC.md)
>
> 이 문서는 프로젝트 초기에 합의된 **요구사항 스펙**입니다.
> 현재 구현 현황은 [PROCESS.md](./PROCESS.md), 권한 매트릭스는 [ROLES.md](./ROLES.md)를 참조하세요.
> 실제 구현과 본 스펙이 충돌할 경우, 별도 명시가 없으면 **코드가 진실의 원천**입니다.

---

## 목표

팀 협업용 Task Board 웹 서비스.
Mattermost Boards와 유사한 사용자 경험을 제공하되, 독자 구현으로 설계한다.

반드시 포함해야 하는 기능:

- Board View
- Table View
- Calendar View
- Template 기능

## 기술 스택

### Backend

- Rust 1.93
- Rust 웹 프레임워크는 실용적이고 안정적인 것을 선택
  - 우선 `axum` 기준으로 검토 → **선택**
- 비동기 런타임 사용
  - `tokio`
- DB 접근 계층 포함
  - `sqlx`
- PostgreSQL 사용
- Keycloak OIDC 연동 기반 인증

### Frontend

- React.js
- Client Side Rendering (CSR)
- Vite
- Tailwind CSS
- shadcn-ui

### Deployment

- Docker container 기반 배포
- `docker compose` 로 로컬 개발/테스트 가능해야 함

## 필수 요구사항

### 1. 인증 / 사용자 관리

- Keycloak OIDC 로그인 사용
- 자체 계정 비밀번호 로그인 구현하지 않음
- 로그인 후 사용자 프로필을 내부 시스템 사용자와 연동
- 사용자 정보 관리 항목 예시:
  - id
  - name
  - email
  - department
  - team
  - role
  - active 여부

### 2. 조직 구조

- Department(부서), Team(팀) 개념 필요
- Team은 Department 하위 개념
- 사용자는 하나 이상의 팀에 속할 수 있는 구조를 고려
- 보드와 작업은 부서/팀 단위 접근 제어가 가능해야 함

### 3. 권한 관리

최소 역할:

- System Admin
- Department Admin
- Team Admin
- Member
- Viewer

최소한 다음 리소스에 권한이 적용되어야 함:

- Board
- Task
- Template
- Comment
- Department / Team 관리 기능

권한 체크는 반드시 서버에서 수행해야 함.

### 4. 보드 기능

Mattermost Boards와 유사한 Task Board를 구현한다.

필수 기능:

- 보드 생성 / 수정 / 삭제
- 보드 설명
- 보드 멤버 관리
- 컬럼 생성 / 수정 / 삭제 / 순서 변경
- 카드(Task) 생성 / 수정 / 삭제
- 카드 드래그 앤 드롭 이동
- 라벨/태그
- 담당자 지정
- 우선순위
- 상태
- 마감일
- 체크리스트
- 댓글
- 활동 이력

### 5. View 기능

동일한 Task 데이터를 서로 다른 방식으로 표현해야 한다.

#### Board View

- 칸반 보드
- 컬럼 단위 카드 이동
- 드래그 앤 드롭 지원

#### Table View

- 작업 목록 테이블
- 정렬 / 필터링 지원
- 컬럼 표시 제어 가능

#### Calendar View

- 시작일/마감일 기반 일정 표시
- 월/주 단위 보기 고려
- 클릭 시 Task 상세 열람 가능

### 6. Template 기능

반드시 포함해야 함. 후순위 부착물이 아니라 초기 도메인 구조에 포함한다.

필수 기능:

- 보드 템플릿 생성
- 카드 템플릿 생성
- 템플릿으로 새 보드 생성
- 템플릿에 컬럼 구조, 기본 카드, 라벨, 체크리스트 등을 포함 가능
- 팀/부서 단위 템플릿 공유 지원

### 7. 배포

- Docker 기반 배포
- 최소한 다음 구성을 고려
  - frontend
  - backend
  - postgres
  - keycloak (개발용 compose에 포함)
- 운영에서는 Keycloak / AD는 외부 제공 자원으로 가정한다.
  자세한 내용은 [DEPLOYMENT.md](./DEPLOYMENT.md), [AUTH.md](./AUTH.md) 참조.

## 아키텍처 제약

- Frontend / Backend 분리
- Backend는 REST API 중심
- 동일한 Task 모델을 Board / Table / Calendar 에서 공통 사용
- Template 기능은 초기에 도메인 모델에 반영
- DB migration 구조 포함
- 환경변수 기반 설정
- 운영 확장 가능한 구조 유지

## 스키마 요구사항 (최소 테이블)

- users
- departments
- teams
- team_members
- roles (역할 매트릭스는 코드에서 관리; DB에는 할당 테이블만)
- boards
- board_members
- board_columns
- tasks
- labels
- task_labels
- task_assignees
- task_checklists
- task_checklist_items
- comments
- templates
- activity_logs

실제 스키마는 `backend/migrations/` 의 0000 ~ 최신 마이그레이션을 참조.

## API 범주 (최소)

- Auth / Session
- Users / Profile
- Departments / Teams
- Roles / Permissions
- Boards
- Board Columns
- Tasks
- Comments
- Labels
- Templates
- Activity Logs

실제 핸들러는 `backend/src/` 아래 각 모듈 (`collaboration/*_handlers.rs`, `identity/`, `organization/`) 참조.

## 권한 모델

- 역할별 가능한 작업 정의
- 리소스별 권한 매트릭스 제시
- 서버에서 강제 (`backend/src/authz/`)

상세 내용은 [ROLES.md](./ROLES.md) 참조.

## 프론트엔드 화면 요구사항 (최소)

- 로그인 진입
- 내 보드 목록
- 보드 상세 (Board / Table / Calendar / Activity 탭)
- 템플릿 관리
- 조직 관리
- 사용자 / 권한 관리
- 프로필

실제 페이지는 `frontend/src/pages/` 참조.

## 추가 지시 (설계 원칙)

- Mattermost Boards의 개념은 참고하되, 특정 구현을 복제하지 말 것
- 데모가 아니라 실제 업무용 확장 가능성을 고려할 것
- 인증/권한/조직 모델은 대충 넘기지 말고 초기에 제대로 설계할 것
- Board / Table / Calendar 가 서로 다른 데이터 모델이 되지 않게 할 것
- Template 기능은 후순위 부착물이 아니라 초기 도메인 구조에 포함할 것
