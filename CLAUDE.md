# CLAUDE.md — Claude Code 작업 안내서

팀 협업용 Task Board. Rust(axum) + React(Vite) + PostgreSQL + Keycloak(OIDC) + AD(LDAP federation).
Mattermost Boards 유사 UX (Board/Table/Calendar/Activity View + Template + 역할 기반 권한).

## 문서 지도

- [README.md](./README.md) — 프로젝트 개요, Quick Start
- [doc/SPEC.md](./doc/SPEC.md) — 초기 요구사항 스펙 (베이스라인)
- [doc/PROCESS.md](./doc/PROCESS.md) — 구현 진행 현황과 완료 기능
- [doc/ROLES.md](./doc/ROLES.md) — 권한 매트릭스 (Global × Board 2-tier)
- [doc/STYLE_GUIDE.md](./doc/STYLE_GUIDE.md) — 프론트엔드 디자인 토큰
- [doc/API_CONTRACT.md](./doc/API_CONTRACT.md) — Backend ↔ Frontend 계약 (엔드포인트·타입·드리프트)
- [doc/DEVELOPMENT.md](./doc/DEVELOPMENT.md) — 로컬 개발 환경
- [doc/DEPLOYMENT.md](./doc/DEPLOYMENT.md) — 운영 배포
- [doc/AUTH.md](./doc/AUTH.md) — Keycloak + AD 연동 상세

## 주요 명령

| 용도 | 명령 |
|---|---|
| 개발 스택 전체 (권장) | `docker compose -f docker-compose.dev.yml --env-file .env.dev up -d --build` |
| 개발 스택 중지 | `docker compose -f docker-compose.dev.yml down` |
| 네이티브 backend | `cd backend && cargo run --features dev-auth` |
| 네이티브 frontend | `cd frontend && pnpm dev` (http://localhost:5173) |
| Backend 타입/린트 체크 | `cd backend && cargo check` |
| Frontend 타입/빌드 체크 | `cd frontend && pnpm build` |
| 운영 빌드 | `docker compose build` (`.env` 준비 필요) |

마이그레이션은 백엔드 기동 시 자동 실행 (`main.rs`에서 `sqlx::migrate!`). 수동 실행 불필요.

## 디렉터리 한눈에

```
backend/          Rust/axum. src/authz, identity, organization, collaboration, infra
frontend/         React/Vite. src/api, components, pages, stores, auth
docker/           backend.Dockerfile, backend.dev.Dockerfile, frontend.*.Dockerfile
infra/            nginx.conf, keycloak/realm-export.json, glauth/glauth.cfg
doc/              설계·운영·개발 문서
scripts/          시드/운영 스크립트
```

## 작업 시 주의사항

- **권한 체크는 서버에서만.** 프론트엔드 숨김/비활성은 UX일 뿐 보안 경계가 아님. 새 핸들러를 만들면 `backend/src/authz/check.rs` + `matrix.rs`의 액션·리소스 축을 반드시 경유.
- **`dev-auth` feature는 프로덕션 이미지에 포함 금지.** `docker/backend.Dockerfile`에는 `--features dev-auth`가 없어야 하고, 프론트의 `VITE_DEV_AUTH_ENABLED`는 빈 값으로 빌드해야 함.
- **Custom field 타입 추가** 시: backend allow-list (`custom_field_handlers.rs`)와 frontend 위젯 (`TaskDrawer.tsx`) 양쪽을 동시에 갱신해야 함. 누락하면 저장은 되나 렌더가 깨짐.
- **OIDC groups → 부서 자동 동기화** 는 `groups` 클레임 문자열을 `departments.slug`와 **exact match**로만 매칭 (`authz/authn.rs:sync_user_departments_from_claims`). AD 그룹을 `dc=...` 같이 DN으로 그대로 보내면 매칭 실패.
- **Board / Table / Calendar / Activity** 는 동일한 Task 모델을 공유한다. 각 View 전용 필드/테이블을 새로 만들지 말 것.
- **Template → Board materialize** 는 custom field 정의까지 복사한다 (`template_handlers.rs`). 템플릿 로직을 바꾸면 이 트랜잭션 범위를 확인할 것.

## 코딩 스타일

- 주석은 WHY가 비자명할 때만. WHAT은 코드가 설명한다.
- 한국어 UI 문자열은 frontend `i18n` 리소스로. 직접 하드코딩 지양.
- 로그는 `tracing::{info,warn,error}` + 구조화 필드. `println!` 금지.
- SQL은 `sqlx::query!` / `query_as!` 기반 compile-time 체크. 동적 쿼리는 꼭 필요할 때만.

## 환경변수 원칙

- 운영: `.env` (템플릿 `.env.example`) — 외부 Keycloak/AD 가정.
- 개발: `.env.dev` (템플릿 `.env.dev.example`) — in-repo Keycloak + glauth LDAP.
- **`.env` / `.env.dev` 은 커밋 금지**. 예시 파일만 추적.
