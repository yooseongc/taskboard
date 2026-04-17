# DEPLOYMENT.md — 운영 배포 가이드

이 문서는 Taskboard의 운영 배포 절차를 다룹니다.
**운영 환경은 Keycloak과 AD(LDAP)가 이미 별도로 제공된다고 가정**합니다. 로컬 개발은 [DEVELOPMENT.md](./DEVELOPMENT.md), Keycloak/AD 연동 상세는 [AUTH.md](./AUTH.md) 참조.

---

## 전제 조건

- Docker Engine 24 이상, compose v2 (`docker compose` 서브커맨드)
- 외부 **Keycloak** (이미 프로비저닝된 realm + client)
- 외부 **AD** 또는 LDAP (Keycloak의 User Federation 으로 연결됨)
- HTTPS 종단은 외부 reverse proxy(Nginx/Traefik/ALB)에서 처리 권장 — 이 compose는 내부망 HTTP만 노출합니다.
- PostgreSQL 는 compose에 포함되지만, 조직 정책에 따라 외부 관리형 DB 로 교체 가능 (아래 "외부 DB 전환" 참조).

---

## 요구 환경변수

`.env.example` 을 `.env` 로 복사해 채웁니다.

### 필수 (미지정 시 compose가 기동을 거부)

| 변수 | 예시 | 설명 |
|---|---|---|
| `POSTGRES_PASSWORD` | `…` | 강한 비밀번호. 절대 커밋 금지 |
| `KEYCLOAK_ISSUER` | `https://auth.example.com/realms/taskboard` | Keycloak issuer URL |
| `CORS_ALLOWED_ORIGINS` | `https://taskboard.example.com` | 와일드카드 `*` 금지, 쉼표 구분 |
| `VITE_KEYCLOAK_URL` | `https://auth.example.com` | 브라우저에서 접근 가능한 Keycloak 공개 URL (빌드 타임에 번들에 고정됨) |

### 선택 (기본값 있음)

| 변수 | 기본값 | 설명 |
|---|---|---|
| `POSTGRES_USER` | `taskboard` | |
| `KEYCLOAK_AUDIENCE` | `taskboard-backend` | Keycloak client ID (audience) |
| `VITE_KEYCLOAK_REALM` | `taskboard` | |
| `VITE_KEYCLOAK_CLIENT_ID` | `taskboard-frontend` | public client + PKCE |
| `SYSTEM_ADMIN_EMAILS` | `admin@example.com` | 첫 로그인 시 SystemAdmin 부여 (쉼표 구분) |
| `OIDC_DEPT_CLAIM` | `groups` | OIDC 토큰에서 부서명이 들어있는 클레임 |
| `OIDC_DEPT_SYNC_ENABLED` | `true` | `false` 면 OIDC 기반 부서 자동 동기화 비활성 |
| `BACKEND_PORT` | `8080` | 호스트 노출 포트 |
| `FRONTEND_PORT` | `80` | 호스트 노출 포트 |
| `LOG_LEVEL` | `warn` | `trace/debug/info/warn/error` |
| `LOG_FORMAT` | `json` | `json` 또는 `pretty` |

> **주의**: `VITE_*` 값은 프론트엔드 **빌드 타임** 에 번들에 삽입됩니다. 변경하려면 이미지 재빌드가 필요합니다.

---

## 기본 배포 절차

```bash
git clone <repo>
cd taskboard

cp .env.example .env
$EDITOR .env

docker compose pull                     # base 이미지 업데이트 (선택)
docker compose build --pull             # backend/frontend 빌드
docker compose up -d
docker compose ps                       # healthy 대기
```

확인:

```bash
curl -fsS http://localhost:${FRONTEND_PORT:-80}/api/health     # 프론트 nginx 경유 (권장)
curl -fsS http://localhost:${BACKEND_PORT:-8080}/api/health    # 백엔드 직접 (내부망)
curl -fsS http://localhost:${FRONTEND_PORT:-80}/               # SPA 엔트리
```

> 참고: `/api/health` 는 공개 엔드포인트(인증 없음, `200 OK`, `ok`). 외부 reverse proxy 에서 노출하지 않으려면 L7 레벨에서 차단하세요.

---

## 업그레이드 (무중단은 아님)

```bash
git pull
docker compose build --pull             # 새 이미지 빌드
docker compose up -d                    # 변경된 컨테이너만 교체
docker compose logs -f backend          # 마이그레이션 로그 확인
```

마이그레이션은 backend 기동 시 자동 적용됩니다. 롤백하려면:

1. **DB 롤백이 불가능한 마이그레이션이 있는지 확인**. 열거형 값 추가, NOT NULL 컬럼 추가 등은 단순 되돌리기 어려움.
2. 직전 이미지 태그로 `backend` 서비스만 내리고 복구.
3. 필요 시 DB 스냅샷에서 복원.

> **권장**: 배포 전 `pg_dump` 스냅샷. 장애 시 backend 롤백 + DB 복원.

---

## 외부 DB 전환

관리형 PostgreSQL 을 쓰고 싶다면:

1. `docker-compose.yml` 에서 `postgres` 서비스와 `backend.depends_on.postgres` 블록, `pgdata` 볼륨 삭제.
2. `backend.environment.DATABASE_URL` 을 외부 DB 의 연결 문자열로 교체 (SSL 권장: `?sslmode=require`).
3. DB 계정은 마이그레이션(스키마 변경) 권한을 가진 계정을 사용해야 합니다.

---

## TLS 종단 (권장: 외부 프록시)

이 compose 는 HTTPS 를 직접 종단하지 않습니다. 다음 패턴을 권장합니다.

```
Client ─── HTTPS ───▶ 외부 reverse proxy (Nginx / Traefik / ALB)
                         │
                         ├─▶ frontend:80   (정적 서빙)
                         └─▶ backend:8080  (/api 경로)
```

내부 compose 프론트엔드(nginx) 가 `/api` 프록시도 제공하지만, 외부에서는 프록시 경로를 직접 라우팅하는 편이 캐시·관측·WAF 면에서 유리합니다.

---

## 운영 체크리스트

- [ ] `.env` 가 git 에 커밋되지 않았는가
- [ ] `POSTGRES_PASSWORD` 가 강한 랜덤 값인가
- [ ] `CORS_ALLOWED_ORIGINS` 에 실제 프론트 도메인만 들어가는가 (와일드카드/개발 오리진 제거)
- [ ] Keycloak client `taskboard-frontend` 의 **Valid Redirect URIs**, **Web Origins** 에 운영 도메인이 등록됐는가
- [ ] Keycloak client `taskboard-backend` 의 audience 가 `KEYCLOAK_AUDIENCE` 와 일치하는가
- [ ] AD 그룹명이 `departments.slug` 와 매칭되는 형태(소문자 slug)인가 — 필요 시 Keycloak mapper 로 정규화
- [ ] `SYSTEM_ADMIN_EMAILS` 에 초기 관리자 이메일이 들어가 있는가
- [ ] HTTPS 종단은 외부 reverse proxy 에서 처리되는가
- [ ] DB 백업/스냅샷 정책이 설정됐는가
- [ ] 로그 수집(`docker logs` → 집계 시스템) 이 설정됐는가
- [ ] `dev-auth` feature가 빠진 `docker/backend.Dockerfile` 이 쓰였는가 (이 compose가 참조하는 기본 Dockerfile 이므로 자동으로 충족)

---

## 관련 문서

- [AUTH.md](./AUTH.md) — Keycloak realm/client 요구사항과 AD federation 설정
- [ROLES.md](./ROLES.md) — 역할 매트릭스 (운영 권한 감사용)
