# Taskboard

Mattermost Boards 유사 팀 협업 Task Board. **Rust(axum)** 백엔드 + **React(Vite)** 프론트엔드, PostgreSQL 저장소, **Keycloak(OIDC) + AD(LDAP)** 인증을 기본으로 합니다.

## 핵심 기능

- **4가지 View**: Board(칸반/DnD) · Table(정렬·필터·bulk) · Calendar(월/주, date field 선택) · Activity(감사 로그)
- **Custom Fields**: text, number, select, date, checkbox, url, email, phone, person 등 10+ 타입
- **Template**: 컬럼·라벨·체크리스트·custom field 정의까지 복사하는 보드 템플릿
- **Saved Views**: Board/Table 별 필터·정렬·컬럼 가시성 퍼시스트
- **2-tier 권한**: Global Role (SystemAdmin / DeptAdmin / TeamAdmin / Member / Viewer) × Board Role
- **조직 자동 동기화**: OIDC `groups` 클레임 → 부서 멤버십 자동 반영
- **i18n** 한국어/영어, 다크모드, Cmd+K 커맨드 팔레트

## 기술 스택

| 레이어 | 기술 |
|---|---|
| Backend | Rust 1.93, axum 0.8, tokio, sqlx(PostgreSQL), jsonwebtoken, tracing |
| Frontend | React 19, Vite 6, TypeScript 5.8, Tailwind 4, TanStack Query, Zustand, i18next |
| DB / Auth | PostgreSQL 16, Keycloak 24, AD/LDAP (운영) / GLAuth (개발) |
| Infra | Docker, docker compose, nginx |

## Quick Start (개발)

```bash
cp .env.dev.example .env.dev
docker compose -f docker-compose.dev.yml --env-file .env.dev up -d --build
```

| 서비스 | URL / Port |
|---|---|
| Frontend | http://localhost:5174 |
| Backend API | http://localhost:8080 |
| Keycloak | http://localhost:8180 (admin / admin) |
| Postgres | localhost:5433 (taskboard / taskboard) |
| LDAP (GLAuth) | ldap://localhost:3893 |

테스트 계정: `alice.kim` / `bob.park` / `charlie.lee` / … (비밀번호 모두 `secret`) — 전체 명단은 [infra/glauth/glauth.cfg](infra/glauth/glauth.cfg).

상세한 네이티브 개발(쿠버스 핫리로드, cargo watch 등)은 [doc/DEVELOPMENT.md](doc/DEVELOPMENT.md).

## 운영 배포

```bash
cp .env.example .env            # 필수 변수 채우기
docker compose up -d --build
```

운영 환경은 **Keycloak + AD가 외부에 이미 제공된다고 가정**합니다.
realm/client 요구사항과 AD federation 설정은 [doc/AUTH.md](doc/AUTH.md), 전체 배포 절차는 [doc/DEPLOYMENT.md](doc/DEPLOYMENT.md) 참조.

## 디렉터리 구조

```
taskboard/
├── backend/              Rust axum 서버 (src/, migrations/)
├── frontend/             React + Vite SPA (src/)
├── docker/               프로덕션 + 개발용 Dockerfile
├── infra/                nginx.conf, keycloak/realm-export.json, glauth/glauth.cfg
├── doc/                  설계·운영·개발 문서
├── docker-compose.yml        운영 (외부 Keycloak/AD 가정)
├── docker-compose.dev.yml    개발 (in-repo Keycloak + GLAuth)
├── .env.example / .env.dev.example
└── CLAUDE.md             Claude Code 작업 안내서
```

## 문서

| 문서 | 내용 |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Claude Code 세션에서 참고할 요약·명령·주의사항 |
| [doc/SPEC.md](doc/SPEC.md) | 초기 요구사항 스펙 (베이스라인) |
| [doc/PROCESS.md](doc/PROCESS.md) | 구현 진행 현황 |
| [doc/ROLES.md](doc/ROLES.md) | 권한 매트릭스 |
| [doc/API_CONTRACT.md](doc/API_CONTRACT.md) | Backend ↔ Frontend API 계약 |
| [doc/DEVELOPMENT.md](doc/DEVELOPMENT.md) | 로컬 개발 환경 세팅 |
| [doc/DEPLOYMENT.md](doc/DEPLOYMENT.md) | 운영 배포 절차 |
| [doc/AUTH.md](doc/AUTH.md) | Keycloak + AD 연동 상세 |
| [doc/STYLE_GUIDE.md](doc/STYLE_GUIDE.md) | 디자인 토큰/타이포그래피 |

## 라이선스

사내 프로젝트 — 별도 라이선스 미지정.
