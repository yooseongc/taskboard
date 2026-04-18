# AUTH.md — Keycloak + AD 연동 가이드

Taskboard 는 자체 로그인 폼을 제공하지 않습니다. 모든 인증은 **Keycloak OIDC Authorization Code + PKCE** 로 이루어지며, 사용자·그룹 정보는 **Keycloak 의 User Federation 을 통해 AD(LDAP)** 에서 가져옵니다.

이 문서는 다음을 다룹니다.

1. 인증/권한 흐름 전체 그림
2. Keycloak 에서 만들어야 할 realm·client·매핑
3. AD(LDAP) User Federation 설정 포인트
4. OIDC `groups` 클레임 → 부서 자동 동기화 규칙
5. 개발용 glauth 구성 참고와 실제 AD 매핑 가이드
6. `dev-auth` 우회 경로

---

## 1. 전체 흐름

```
┌──────────┐     1. /login 진입       ┌──────────┐
│  Browser │ ───────────────────────▶ │ Frontend │
│          │ ◀─── redirect (302) ──── │ (Vite)   │
└──────────┘                          └──────────┘
      │                                     │
      │  2. OIDC auth-code + PKCE           │
      ▼                                     │
┌──────────┐                                │
│ Keycloak │                                │
│          │ ── 3. LDAP bind/search ──▶ ┌──────┐
│          │ ◀──── user + groups ────── │  AD  │
└──────────┘                            └──────┘
      │
      │  4. id_token + access_token (aud=taskboard-backend)
      ▼
┌──────────┐      5. Authorization: Bearer <access_token>
│  Browser │ ──────────────────────────────▶ ┌─────────┐
└──────────┘                                 │ Backend │
                                             │ (axum)  │
                                             │         │
                                             │ 6. JWKS │
                                             │  검증    │─▶ Keycloak
                                             │         │
                                             │ 7. JIT  │─▶ PostgreSQL
                                             │  upsert │   (users/
                                             │ + group │    department_members)
                                             │  sync   │
                                             └─────────┘
```

1. 프론트가 `/login` 클릭 시 Keycloak authorize endpoint 로 리다이렉트 (PKCE `code_verifier` 는 sessionStorage 에 임시 보관).
2. Keycloak 이 로그인 폼을 띄움. 사용자는 AD 계정으로 입력.
3. Keycloak 이 LDAP bind + search 로 사용자/그룹을 조회, 로컬 사용자 레코드로 JIT 동기화.
4. 인증 성공 후 Keycloak 이 authorization code → access/id token 발급. access token 의 `aud` 에 `taskboard-backend` 가 포함되도록 audience mapper 를 둔다.
5. 프론트가 백엔드 호출 시 `Authorization: Bearer <token>` 헤더를 첨부.
6. 백엔드는 JWKS (`${KEYCLOAK_ISSUER}/protocol/openid-connect/certs`) 로 서명 검증, `iss` / `aud` / `exp` 검사. 결과는 moka 로 짧게 캐싱.
7. 사용자 레코드가 없으면 생성(JIT), `groups` 클레임 기반으로 `department_members` 를 동기화.

관련 코드:

- [frontend/src/auth/oidc.ts](../frontend/src/auth/oidc.ts) — PKCE 플로우, 토큰 교환
- [backend/src/authz/authn.rs](../backend/src/authz/authn.rs) — JWT 추출 · 검증 · JIT upsert · 부서 sync
- [backend/src/authz/jwks.rs](../backend/src/authz/jwks.rs) — JWKS 캐시
- [backend/src/authz/check.rs](../backend/src/authz/check.rs) — 리소스별 권한 체크

---

## 2. Keycloak realm / client 요구사항

### Realm

- 이름: `taskboard` (또는 `KEYCLOAK_ISSUER` 와 일치하는 임의 이름)

### Client 1: `taskboard-frontend` (브라우저)

| 항목 | 값 |
|---|---|
| Client ID | `taskboard-frontend` |
| Client type | OpenID Connect |
| Access Type | **Public** (브라우저 SPA) |
| Standard Flow | ✅ Enabled |
| Direct Access Grants | 비활성 권장 (운영) |
| PKCE | S256 (`Advanced` 탭) |
| Valid Redirect URIs | `https://taskboard.example.com/*` |
| Web Origins | `https://taskboard.example.com` |

#### Audience Mapper (필수)

access token 에 `taskboard-backend` 를 `aud` 로 추가해야 백엔드 검증이 통과합니다.

| 항목 | 값 |
|---|---|
| Mapper Type | Audience |
| Included Custom Audience | `taskboard-backend` |
| Add to access token | ✅ |
| Add to ID token | ❌ |

#### Groups Mapper (필수 — 부서 동기화용)

| 항목 | 값 |
|---|---|
| Mapper Type | Group Membership |
| Token Claim Name | `groups` |
| Full group path | ❌ (slug 단일 문자열) |
| Add to access token | ✅ |
| Add to userinfo | ✅ |

### Client 2: `taskboard-backend` (audience 전용)

실제로는 토큰을 받기만 하므로 사용자 로그인 용도로는 쓰이지 않습니다. Audience 가 `taskboard-backend` 인 access token 을 받아 검증만 합니다. 별도 client 를 만들지 않고 audience mapper 만으로 해결해도 되지만, audience 자체가 명시적으로 존재하도록 **Bearer-only** 또는 **Confidential + service account only** 형태의 client 를 두는 편을 권장합니다.

---

## 3. AD User Federation 설정 포인트

Keycloak 관리 콘솔 → `taskboard` realm → **User Federation** → **Add provider: ldap**.

핵심 설정값 (조직 AD에 맞게 치환):

| 항목 | 예시 (실제 AD) | 개발 (glauth) |
|---|---|---|
| Vendor | `Active Directory` | `Other` |
| Connection URL | `ldaps://ad.corp.example.com:636` | `ldap://ldap:3893` |
| Bind DN | `CN=svc-taskboard,OU=Services,DC=corp,DC=example,DC=com` | `cn=serviceaccount,dc=taskboard,dc=local` |
| Bind Credential | (Vault 등에서 관리) | `glauth-admin` |
| Users DN | `OU=Users,DC=corp,DC=example,DC=com` | `dc=taskboard,dc=local` |
| Username LDAP attribute | `sAMAccountName` | `cn` |
| UUID LDAP attribute | `objectGUID` | `uidNumber` |
| User Object Classes | `person, organizationalPerson, user` | `posixAccount` |
| Edit Mode | **READ_ONLY** | READ_ONLY |

### Group LDAP Mapper

User Federation 의 **Mappers** 탭에서 `group-ldap-mapper` 추가:

| 항목 | 값 |
|---|---|
| Groups DN | `OU=Groups,DC=corp,DC=example,DC=com` |
| Group Name LDAP Attribute | `cn` |
| Group Object Classes | `group` (AD) / `posixGroup` (OpenLDAP/glauth) |
| Membership LDAP Attribute | `member` (AD) / `memberUid` (OpenLDAP) |
| Mode | READ_ONLY |
| User Groups Retrieve Strategy | `LOAD_GROUPS_BY_MEMBER_ATTRIBUTE` (AD) / `GET_GROUPS_FROM_USER_MEMBEROF_ATTRIBUTE` (OpenLDAP) |

> **중요**: Keycloak 에 임포트된 그룹 이름이 Taskboard DB의 `departments.slug` 와 **정확히** 일치해야 합니다. AD 그룹명이 대문자·공백·특수문자를 포함한다면, Groups Mapper 위에 **Hardcoded Attribute Mapper** 또는 Keycloak의 토큰 Script Mapper 로 소문자 slug 형태로 정규화하세요.

---

## 4. OIDC `groups` → 부서 자동 동기화

구현: [backend/src/authz/authn.rs:296-364](../backend/src/authz/authn.rs) `sync_user_departments_from_claims`.

### 규칙

- 클레임: access token의 `groups` (기본). 환경변수 `OIDC_DEPT_CLAIM` 으로 변경 가능.
- 매칭: 클레임 값(문자열)을 `departments.slug` 와 **exact match** (대소문자 구분).
- 추가: 매칭되는 부서에 `role_in_department = 'Member'` 로 INSERT (ON CONFLICT DO NOTHING).
- 제거: DB 에 있으나 클레임에 없는 부서에서 **Member 행만** DELETE. `DepartmentAdmin` 행은 보존(AD 그룹에서 빠져도 관리자 권한이 즉시 사라지지 않음).
- 매칭 실패: 알 수 없는 그룹명은 조용히 무시.
- 비활성화: `OIDC_DEPT_SYNC_ENABLED=false`.

### 실패 케이스 체크리스트

| 증상 | 원인 | 해결 |
|---|---|---|
| 로그인은 되는데 부서가 비어있음 | `groups` 클레임이 토큰에 포함 안 됨 | Keycloak Groups Mapper 의 **Add to access token** 활성화 |
| `groups` 는 오는데 DB 가 비어있음 | 그룹명이 `departments.slug` 와 불일치 | slug 를 AD 그룹명으로 바꾸거나 Keycloak에서 정규화 |
| 클레임이 `["/engineering", "/design"]` 같이 경로 | Groups Mapper 의 **Full group path** 가 ON | OFF 로 변경 |
| 클레임명이 `groups` 가 아님 | 커스텀 클레임명 사용 | `OIDC_DEPT_CLAIM` 환경변수로 지정 |
| DepartmentAdmin 권한이 안 없어짐 | 의도된 동작 | AD 에서 빼더라도 수동으로 DepartmentAdmin 해제 필요 |

---

## 5. 개발용 glauth 매핑 예시

`infra/glauth/glauth.cfg` 의 그룹 → Taskboard 부서 매핑:

| glauth 그룹 | gidnumber | departments.slug |
|---|---|---|
| engineering | 5001 | engineering |
| eng-backend | 5011 | eng-backend |
| eng-frontend | 5012 | eng-frontend |
| design | 5002 | design |
| design-ux | 5021 | design-ux |
| management | 5003 | management |
| qa | 5004 | qa |

부서 슬러그는 `scripts/seed-demo.py` 로 생성하거나 최초 관리자가 수동으로 만듭니다. glauth 그룹을 추가·수정할 경우:

1. `infra/glauth/glauth.cfg` 수정
2. `docker compose -f docker-compose.dev.yml restart ldap`
3. 필요 시 Keycloak admin 콘솔에서 User Federation **Sync all users** 트리거

---

## 6. Personal 모드 (단독 사용)

팀 SSO 없이 한 명이 로컬에서 사용하는 standalone 모드.

### 켜는 법

```
TASKBOARD_MODE=personal
```

- SSO 모드일 때와 동일한 바이너리/이미지. 기동 시 env 로 분기됨.
- `KEYCLOAK_ISSUER` / `KEYCLOAK_AUDIENCE` 는 설정돼 있어도 **무시**되며, 비워둬도 됨.
- 기동 시 단일 사용자(`external_id='personal'`, name=`Me`, SystemAdmin) 와 루트 부서(slug=`personal`)가 idempotent 하게 시드됨.
- `docker-compose.personal.yml` 프로필 사용 시 Keycloak/glauth 가 아예 올라오지 않음.

### 동작

- `AuthnUser` extractor 가 Authorization 헤더를 **무시**하고 시드 사용자를 반환. JWT 파싱 경로는 실행되지 않음.
- 프론트엔드는 부팅 직후 `GET /api/config` 를 호출해 `mode` 확인. `personal` 이면:
  - `/login` 진입은 즉시 `/` 로 리다이렉트
  - 로그아웃 버튼, `/directory`(부서 관리), 부서 보드·초대 보드 bucket 을 UI 에서 숨김
- 권한 매트릭스 자체는 그대로 — 시드 사용자가 SystemAdmin 이라 모든 체크를 통과함.

### 전환 / 마이그레이션

SSO 모드로 다시 바꾸고 싶으면 `TASKBOARD_MODE=sso` 로만 바꿔 재기동. 이미 생성된 `personal` 사용자/부서는 그대로 남아 있으므로 필요 시 수동 삭제.

---

## 7. dev-auth (개발 전용 우회)

`TASKBOARD_DEV_AUTH=1` 환경에서만 컴파일·활성화되는 개발 편의 경로입니다.

- 엔드포인트: `POST /api/dev/login` (body: `{"email": "..."}`)
- HS256 HMAC 으로 자체 토큰을 서명. 시크릿은 `TASKBOARD_DEV_AUTH_HMAC_KEY` (32바이트 이상).
- 검증 경로는 `iss == "dev"` 분기로 JWKS 우회.

**프로덕션 이미지(`docker/backend.Dockerfile`) 에는 `--features dev-auth` 가 없으므로 이 경로 자체가 존재하지 않습니다.** 혹시 직접 Dockerfile 을 수정해 feature 를 켜지 마세요.

---

## 관련 문서

- [DEPLOYMENT.md](./DEPLOYMENT.md) — 운영 환경 체크리스트
- [ROLES.md](./ROLES.md) — 역할 매트릭스 (DB 내부 역할, AD 그룹과 별개)
- [SPEC.md](./SPEC.md) — 최초 요구사항 스펙
