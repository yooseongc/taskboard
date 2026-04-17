# DEVELOPMENT.md — 로컬 개발 가이드

이 문서는 Taskboard를 로컬에서 개발하기 위한 환경 구성과 흐름을 다룹니다.
운영 배포는 [DEPLOYMENT.md](./DEPLOYMENT.md), 인증 구성은 [AUTH.md](./AUTH.md) 참조.

---

## 전제 조건

| 도구 | 버전 |
|---|---|
| Docker Desktop | 4.x 이상 (compose v2 포함) |
| Rust | 1.93 (`rustup default stable` 이상) |
| Node.js | 22.x |
| pnpm | 10.32.1 (`corepack enable && corepack prepare pnpm@10.32.1 --activate`) |

> Rust와 Node는 네이티브로 개발할 때만 필요. Docker만 써도 기동은 가능하지만 핫 리로드·빠른 빌드를 위해 네이티브가 편합니다.

---

## 옵션 1 — Docker로 한 번에 기동 (권장)

```bash
cp .env.dev.example .env.dev
docker compose -f docker-compose.dev.yml --env-file .env.dev up -d --build
```

기동되는 서비스:

| 서비스 | URL | 비고 |
|---|---|---|
| frontend | http://localhost:5174 | nginx + 정적 빌드 (dev 이미지도 정적 빌드) |
| backend | http://localhost:8080 | `--features dev-auth` 컴파일 |
| keycloak | http://localhost:8180 | `admin` / `admin`, realm 자동 임포트 |
| ldap (glauth) | ldap://localhost:3893 | AD 대용 |
| postgres | localhost:5433 | `taskboard` / `taskboard` |

로그 확인:

```bash
docker compose -f docker-compose.dev.yml logs -f backend
docker compose -f docker-compose.dev.yml logs -f keycloak
```

정지 및 데이터 초기화:

```bash
docker compose -f docker-compose.dev.yml down             # 컨테이너만
docker compose -f docker-compose.dev.yml down -v          # + 볼륨 초기화
```

---

## 옵션 2 — 네이티브 개발 (핫 리로드)

DB / Keycloak / LDAP은 컨테이너로 두고 backend·frontend만 네이티브로 돌리는 방식이 가장 편합니다.

### 1. 의존 서비스만 compose로 기동

```bash
docker compose -f docker-compose.dev.yml up -d postgres keycloak ldap
```

### 2. Backend

```bash
cd backend
# 환경변수는 .env.dev 에 준비해두고 셸에서 export 하거나 dotenv 스크립트로 주입
export DATABASE_URL="postgres://taskboard:taskboard@localhost:5433/taskboard"
export KEYCLOAK_ISSUER="http://localhost:8180/realms/taskboard"
export KEYCLOAK_AUDIENCE="taskboard-backend"
export CORS_ALLOWED_ORIGINS="http://localhost:5173"
export SYSTEM_ADMIN_EMAILS="alice@example.com,admin@example.com"
export TASKBOARD_DEV_AUTH=1
export TASKBOARD_DEV_AUTH_HMAC_KEY="dev-hmac-key-at-least-32-bytes-long!!"
export SEED_ON_START=true

cargo run --features dev-auth
```

- 서버는 `0.0.0.0:8080`에 바인드. 기동 시 `backend/migrations/` 전체를 자동 적용.
- 빠른 타입 체크: `cargo check`.
- 릴리스 빌드: `cargo build --release`.

### 3. Frontend

```bash
cd frontend
pnpm install
pnpm dev     # http://localhost:5173 (Vite dev server)
```

- `vite.config.ts:10-14` 에서 `/api` 요청을 `http://localhost:8080`으로 프록시.
- 타입 체크 + 프로덕션 빌드: `pnpm build` (`tsc -b && vite build`).
- 번들 미리보기: `pnpm preview`.

---

## 테스트 계정

### GLAuth (AD 대용, in-repo LDAP)

비밀번호는 전부 `secret`. 전체 목록은 [infra/glauth/glauth.cfg](../infra/glauth/glauth.cfg).

| Username | Email | 소속 그룹(=부서 slug) |
|---|---|---|
| alice.kim | alice@example.com | eng-backend |
| bob.park | bob@example.com | eng-backend |
| charlie.lee | charlie@example.com | eng-frontend |
| david.shin | david@example.com | eng-frontend |
| emma.jang | emma@example.com | eng-backend |
| diana.choi | diana@example.com | design |
| eric.jung | eric@example.com | design-ux |
| fiona.ko | fiona@example.com | design-ux |
| frank.yoon | frank@example.com | management |
| grace.han | grace@example.com | management |
| iris.moon | iris@example.com | qa |
| jack.seo | jack@example.com | qa |
| kate.ryu | kate@example.com | qa |

`alice@example.com` / `admin@example.com` 은 dev 환경에서 `SYSTEM_ADMIN_EMAILS` 에 포함돼 첫 로그인 시 SystemAdmin을 받습니다.

### Keycloak Admin Console

- URL: http://localhost:8180/admin/
- Username: `admin` / Password: `admin`
- realm `taskboard` 는 compose 기동 시 [infra/keycloak/realm-export.json](../infra/keycloak/realm-export.json) 으로 자동 임포트.
- LDAP federation이 포함돼 있으므로 별도 설정 없이 glauth 사용자로 로그인 가능.

### dev-auth (Keycloak 우회 로컬 토큰)

`TASKBOARD_DEV_AUTH=1` 환경에서 백엔드가 HS256 토큰을 직접 발급합니다.

```bash
curl -X POST http://localhost:8080/api/dev/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com"}'
```

응답의 `token`을 프론트 localStorage `taskboard_token` 에 넣으면 그대로 로그인됩니다.
**프로덕션 이미지에는 `dev-auth` feature 가 컴파일되지 않습니다.**

---

## 마이그레이션

- 위치: `backend/migrations/0000_*.sql` ~ `0017_*.sql` (2026-04 기준).
- 실행: backend 기동 시 `sqlx::migrate!("./migrations")` 가 자동 적용. 별도 CLI 없음.
- 새 마이그레이션 추가 시: `NNNN_descriptive_name.sql` 형식, 번호 순차 증가. 되돌릴 수 없는 DDL은 피하거나 명시.

---

## 디버깅 팁

| 원하는 것 | 방법 |
|---|---|
| 사람 친화적 백엔드 로그 | `LOG_FORMAT=pretty cargo run --features dev-auth` |
| 특정 모듈만 디버그 로그 | `RUST_LOG=taskboard_backend::authz=debug,info cargo run …` |
| 시드 데이터 재생성 | `SEED_ON_START=true` 로 기동 (idempotent — 중복 시 스킵) |
| SQL 로깅 | `RUST_LOG=sqlx=debug` |
| CORS 문제 | 백엔드 `CORS_ALLOWED_ORIGINS` 가 정확한 프론트 오리진인지 확인 (쉼표 구분, 와일드카드 금지) |

---

## 자주 막히는 지점

- **Keycloak realm import 실패** — `infra/keycloak/realm-export.json` 변경 후에는 `docker compose … down -v` 로 Keycloak 데이터 볼륨까지 지워야 재임포트됨.
- **Backend 기동은 됐는데 401** — JWKS 캐시가 Keycloak 기동 전에 첫 요청을 탔을 수 있음. `JWKS_GRACE_TTL_SECS` 덕에 자동 회복되지만, 로그에 JWKS fetch 에러가 있으면 `keycloak` 컨테이너 상태 확인.
- **OIDC 로그인은 됐는데 부서가 비어 있음** — `groups` 클레임이 `departments.slug` 와 exact match 되는지 확인. `authz/authn.rs:sync_user_departments_from_claims`.
