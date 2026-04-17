use axum::extract::FromRequestParts;
use http::request::Parts;
#[cfg(feature = "dev-auth")]
use jsonwebtoken::Algorithm;
use jsonwebtoken::{DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::http::error::AppError;
use crate::identity::models::UserRow;
use crate::infra::state::AppState;
use crate::infra::uuid7;

/// S-007: AuthnUser -- extracted from JWT Bearer token.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthnUser {
    pub user_id: Uuid,
    pub external_id: String,
    pub name: String,
    pub email: String,
    pub global_roles: Vec<GlobalRole>,
    pub department_ids: Vec<Uuid>,
    pub active: bool,
}

/// Global roles per ROLES.md §1.
/// Viewer was removed — all users get at least Member.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum GlobalRole {
    SystemAdmin,
    DepartmentAdmin,
    Member,
}

impl GlobalRole {
    /// Privilege level for max() comparison in evaluate.
    pub fn privilege_level(self) -> u8 {
        match self {
            Self::SystemAdmin => 2,
            Self::DepartmentAdmin => 1,
            Self::Member => 0,
        }
    }

    /// Get the highest-privilege role from a list. Falls back to Member
    /// (the global default since Viewer was removed).
    pub fn highest(roles: &[GlobalRole]) -> Self {
        roles
            .iter()
            .copied()
            .max_by_key(|r| r.privilege_level())
            .unwrap_or(Self::Member)
    }

    /// Parse a role from its string form, returning `None` for unknown values.
    /// Production flow deserializes via serde; this helper is test-only.
    #[cfg(test)]
    pub fn from_str_opt(s: &str) -> Option<Self> {
        match s {
            "SystemAdmin" => Some(Self::SystemAdmin),
            "DepartmentAdmin" => Some(Self::DepartmentAdmin),
            "Member" => Some(Self::Member),
            _ => None,
        }
    }
}

impl std::fmt::Display for GlobalRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::SystemAdmin => write!(f, "SystemAdmin"),
            Self::DepartmentAdmin => write!(f, "DepartmentAdmin"),
            Self::Member => write!(f, "Member"),
        }
    }
}

/// Axum extractor for AuthnUser from JWT.
impl FromRequestParts<AppState> for AuthnUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        // 1. Parse Authorization: Bearer <token>
        let header = parts
            .headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .ok_or(AppError::InvalidToken(
                "Missing Authorization header".into(),
            ))?;
        let token = header
            .strip_prefix("Bearer ")
            .ok_or(AppError::InvalidToken("Invalid Bearer format".into()))?;

        // 2. Decode JWT without signature verification to inspect claims (iss)
        let mut peek_validation = Validation::default();
        peek_validation.insecure_disable_signature_validation();
        peek_validation.validate_exp = false;
        peek_validation.validate_aud = false;

        let token_data = jsonwebtoken::decode::<serde_json::Value>(
            token,
            &DecodingKey::from_secret(b"dummy"),
            &peek_validation,
        )
        .map_err(|e| AppError::InvalidToken(format!("JWT decode failed: {e}")))?;

        let claims = &token_data.claims;
        let iss = claims
            .get("iss")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        // 3. Branch on issuer
        if iss == "dev" {
            self::dev_auth_path(token, claims, state).await
        } else {
            self::oidc_path(token, state).await
        }
    }
}

/// Dev-auth token verification path.
#[cfg(feature = "dev-auth")]
async fn dev_auth_path(
    token: &str,
    _claims: &serde_json::Value,
    state: &AppState,
) -> Result<AuthnUser, AppError> {
    if !state.config.dev_auth_enabled {
        return Err(AppError::InvalidToken(
            "dev-auth disabled at runtime".into(),
        ));
    }
    let hmac_key = state
        .config
        .dev_auth_hmac_key
        .as_ref()
        .ok_or(AppError::Internal(
            "dev-auth HMAC key not configured".into(),
        ))?;

    let mut dev_validation = Validation::new(Algorithm::HS256);
    dev_validation.set_audience(&[&state.config.keycloak_audience]);
    let dev_data = jsonwebtoken::decode::<serde_json::Value>(
        token,
        &DecodingKey::from_secret(hmac_key.as_bytes()),
        &dev_validation,
    )
    .map_err(|e| AppError::InvalidToken(format!("Dev token verification failed: {e}")))?;

    let sub = dev_data
        .claims
        .get("sub")
        .and_then(|v| v.as_str())
        .ok_or(AppError::InvalidToken(
            "Missing sub in dev token".into(),
        ))?;

    let email = sub
        .strip_prefix("dev:")
        .map(|s| s.to_string())
        .unwrap_or_else(|| format!("{sub}@dev"));

    // DB: upsert user, get roles
    let user = upsert_user_from_claims(&state.pool, sub, sub, &email).await?;

    // OIDC group → department sync (ROLES.md §10).
    sync_user_departments_from_claims(
        &state.pool,
        user.id,
        &dev_data.claims,
        &state.config.oidc_dept_claim,
        state.config.oidc_dept_sync_enabled,
    )
    .await?;

    // Check active status via LRU cache (R-026, D-039)
    let is_active = state
        .active_cache
        .is_active(&state.pool, user.id)
        .await
        .map_err(|e| AppError::Internal(format!("ActiveCache lookup failed: {e}")))?;
    if !is_active {
        return Err(AppError::UserInactive);
    }

    let dept_ids = get_user_department_ids(&state.pool, user.id).await?;
    let roles = get_user_roles(&state.pool, user.id, &user.email, &state.config.system_admin_emails).await?;

    Ok(AuthnUser {
        user_id: user.id,
        external_id: user.external_id,
        name: user.name,
        email: user.email,
        global_roles: roles,
        department_ids: dept_ids,
        active: is_active,
    })
}

#[cfg(not(feature = "dev-auth"))]
async fn dev_auth_path(
    _token: &str,
    _claims: &serde_json::Value,
    _state: &AppState,
) -> Result<AuthnUser, AppError> {
    Err(AppError::InvalidToken(
        "dev-auth not available in this build".into(),
    ))
}

/// OIDC token verification path.
/// Verifies JWT signature via JWKS (RS256), then extracts claims.
async fn oidc_path(
    token: &str,
    state: &AppState,
) -> Result<AuthnUser, AppError> {
    // Verify signature and validate exp/aud via JWKS cache
    let claims = state
        .jwks_cache
        .verify_token(token, &state.config.keycloak_audience)
        .await?;

    let sub = claims
        .get("sub")
        .and_then(|v| v.as_str())
        .ok_or(AppError::InvalidToken("Missing sub claim".into()))?;
    let email = claims
        .get("email")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let name = claims
        .get("preferred_username")
        .or(claims.get("name"))
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown");

    // DB: upsert user, get roles
    let user = upsert_user_from_claims(&state.pool, sub, name, email).await?;

    // OIDC group → department sync (ROLES.md §10).
    sync_user_departments_from_claims(
        &state.pool,
        user.id,
        &claims,
        &state.config.oidc_dept_claim,
        state.config.oidc_dept_sync_enabled,
    )
    .await?;

    // Check active status via LRU cache (R-026, D-039)
    let is_active = state
        .active_cache
        .is_active(&state.pool, user.id)
        .await
        .map_err(|e| AppError::Internal(format!("ActiveCache lookup failed: {e}")))?;
    if !is_active {
        return Err(AppError::UserInactive);
    }

    let dept_ids = get_user_department_ids(&state.pool, user.id).await?;
    let roles = get_user_roles(&state.pool, user.id, &user.email, &state.config.system_admin_emails).await?;

    Ok(AuthnUser {
        user_id: user.id,
        external_id: user.external_id,
        name: user.name,
        email: user.email,
        global_roles: roles,
        department_ids: dept_ids,
        active: is_active,
    })
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/// ROLES.md §10: Sync the user's department memberships against an OIDC
/// `groups` claim. Group names are matched exactly to department slugs.
///
///   - groups present in DB but not in claim → user removed from that dept
///   - groups in claim that map to existing depts → user added (Member)
///   - unmatched group names are silently ignored
///
/// Disabled by setting `OIDC_DEPT_SYNC_ENABLED=false` (default true).
/// Custom claim name via `OIDC_DEPT_CLAIM` (default "groups").
///
/// DepartmentAdmin assignments are NOT touched — only Member rows are
/// inserted/removed. This avoids stripping admin status when an admin
/// is removed from the matching AD group.
pub async fn sync_user_departments_from_claims(
    pool: &PgPool,
    user_id: Uuid,
    claims: &serde_json::Value,
    claim_name: &str,
    sync_enabled: bool,
) -> Result<(), AppError> {
    if !sync_enabled {
        return Ok(());
    }
    let groups: Vec<String> = claims
        .get(claim_name)
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|g| g.as_str().map(String::from)).collect())
        .unwrap_or_default();
    if groups.is_empty() {
        return Ok(());
    }

    // Resolve the dept IDs for the matching slugs.
    let target_dept_ids: Vec<Uuid> = sqlx::query_as::<_, (Uuid,)>(
        "SELECT id FROM departments WHERE slug = ANY($1)",
    )
    .bind(&groups)
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|(id,)| id)
    .collect();

    // Current Member rows for this user.
    let current_member_dept_ids: Vec<Uuid> = sqlx::query_as::<_, (Uuid,)>(
        "SELECT department_id FROM department_members WHERE user_id = $1 AND role_in_department = 'Member'",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|(id,)| id)
    .collect();

    let target_set: std::collections::HashSet<Uuid> = target_dept_ids.iter().copied().collect();
    let current_set: std::collections::HashSet<Uuid> = current_member_dept_ids.iter().copied().collect();

    // Add missing memberships (Member role only).
    for dept_id in target_set.difference(&current_set) {
        sqlx::query(
            "INSERT INTO department_members (user_id, department_id, role_in_department) VALUES ($1, $2, 'Member') ON CONFLICT DO NOTHING",
        )
        .bind(user_id)
        .bind(dept_id)
        .execute(pool)
        .await?;
    }

    // Remove memberships not in the claim — but only Member rows.
    // DepartmentAdmin rows survive group changes.
    for dept_id in current_set.difference(&target_set) {
        sqlx::query(
            "DELETE FROM department_members WHERE user_id = $1 AND department_id = $2 AND role_in_department = 'Member'",
        )
        .bind(user_id)
        .bind(dept_id)
        .execute(pool)
        .await?;
    }

    Ok(())
}

/// Upsert a user from JWT claims. Creates on first login (JIT provisioning).
pub async fn upsert_user_from_claims(
    pool: &PgPool,
    external_id: &str,
    name: &str,
    email: &str,
) -> Result<UserRow, AppError> {
    let new_id = uuid7::now_v7();
    let row = sqlx::query_as::<_, UserRow>(
        r#"
        INSERT INTO users (id, external_id, name, email)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (external_id) DO UPDATE
            SET name = EXCLUDED.name,
                email = EXCLUDED.email,
                updated_at = now()
        RETURNING *
        "#,
    )
    .bind(new_id)
    .bind(external_id)
    .bind(name)
    .bind(email)
    .fetch_one(pool)
    .await?;

    Ok(row)
}

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // GlobalRole priority and highest() tests.
    // -----------------------------------------------------------------------

    #[test]
    fn global_role_highest_system_admin_wins() {
        let roles = vec![GlobalRole::Member, GlobalRole::SystemAdmin, GlobalRole::DepartmentAdmin];
        assert_eq!(GlobalRole::highest(&roles), GlobalRole::SystemAdmin);
    }

    #[test]
    fn global_role_highest_dept_admin_over_member() {
        let roles = vec![GlobalRole::Member, GlobalRole::DepartmentAdmin];
        assert_eq!(GlobalRole::highest(&roles), GlobalRole::DepartmentAdmin);
    }

    #[test]
    fn global_role_highest_empty_defaults_to_member() {
        // Viewer was removed; Member is the new floor.
        assert_eq!(GlobalRole::highest(&[]), GlobalRole::Member);
    }

    #[test]
    fn global_role_highest_single() {
        assert_eq!(GlobalRole::highest(&[GlobalRole::Member]), GlobalRole::Member);
    }

    #[test]
    fn global_role_from_str_opt_all_variants() {
        assert_eq!(GlobalRole::from_str_opt("SystemAdmin"), Some(GlobalRole::SystemAdmin));
        assert_eq!(GlobalRole::from_str_opt("DepartmentAdmin"), Some(GlobalRole::DepartmentAdmin));
        assert_eq!(GlobalRole::from_str_opt("Member"), Some(GlobalRole::Member));
        // Viewer no longer exists.
        assert_eq!(GlobalRole::from_str_opt("Viewer"), None);
        assert_eq!(GlobalRole::from_str_opt("InvalidRole"), None);
        assert_eq!(GlobalRole::from_str_opt(""), None);
    }

    #[test]
    fn global_role_privilege_ordering() {
        assert!(GlobalRole::SystemAdmin.privilege_level() > GlobalRole::DepartmentAdmin.privilege_level());
        assert!(GlobalRole::DepartmentAdmin.privilege_level() > GlobalRole::Member.privilege_level());
    }

    #[test]
    fn board_role_from_str_opt_lowercase() {
        use crate::authz::matrix::BoardRole;
        assert_eq!(BoardRole::from_str_opt("admin"), Some(BoardRole::Admin));
        assert_eq!(BoardRole::from_str_opt("editor"), Some(BoardRole::Editor));
        assert_eq!(BoardRole::from_str_opt("viewer"), Some(BoardRole::Viewer));
        assert_eq!(BoardRole::from_str_opt("Invalid"), None);
    }

    #[test]
    fn board_role_from_str_opt_legacy_capitalized() {
        // Backwards compat for any callers still passing the old form.
        use crate::authz::matrix::BoardRole;
        assert_eq!(BoardRole::from_str_opt("BoardAdmin"), Some(BoardRole::Admin));
        assert_eq!(BoardRole::from_str_opt("BoardMember"), Some(BoardRole::Editor));
        assert_eq!(BoardRole::from_str_opt("BoardViewer"), Some(BoardRole::Viewer));
    }
}

/// Get department IDs a user belongs to.
pub async fn get_user_department_ids(
    pool: &PgPool,
    user_id: Uuid,
) -> Result<Vec<Uuid>, AppError> {
    let rows: Vec<(Uuid,)> = sqlx::query_as(
        "SELECT department_id FROM department_members WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(|(id,)| id).collect())
}

/// Determine user's global roles.
///
/// Logic:
/// - If user's email is in `system_admin_emails` config -> SystemAdmin
/// - If user has `DepartmentAdmin` role in any department -> DepartmentAdmin
/// - If user has `Member` role in any department -> Member
/// - Otherwise -> Viewer
pub async fn get_user_roles(
    pool: &PgPool,
    user_id: Uuid,
    user_email: &str,
    system_admin_emails: &[String],
) -> Result<Vec<GlobalRole>, AppError> {
    let mut roles = Vec::new();

    // Check SystemAdmin via config
    if system_admin_emails
        .iter()
        .any(|e| e.eq_ignore_ascii_case(user_email))
    {
        roles.push(GlobalRole::SystemAdmin);
        return Ok(roles);
    }

    // Check department roles
    let dept_roles: Vec<(String,)> = sqlx::query_as(
        "SELECT role_in_department FROM department_members WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    let has_dept_admin = dept_roles.iter().any(|(r,)| r == "DepartmentAdmin");
    let has_member = dept_roles.iter().any(|(r,)| r == "Member");

    if has_dept_admin {
        roles.push(GlobalRole::DepartmentAdmin);
    }
    if has_member {
        roles.push(GlobalRole::Member);
    }

    // If no department roles at all, default to Member.
    // Viewer was removed — every authenticated user is at least Member,
    // so they can create personal boards and accept invitations.
    if roles.is_empty() {
        roles.push(GlobalRole::Member);
    }

    Ok(roles)
}
