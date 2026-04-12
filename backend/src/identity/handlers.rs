use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use uuid::Uuid;

use crate::authz::authn::{AuthnUser, GlobalRole};
use crate::http::error::AppError;
use crate::http::pagination::{decode_cursor, encode_cursor, PaginatedResponse};
use crate::identity::models::{
    PatchUserRequest, PatchUserResponse, UserRow, UserSummary, UsersQuery, WhoamiResponse,
};
use crate::infra::state::AppState;

// ---------------------------------------------------------------------------
// Helper: build WhoamiResponse from AuthnUser
// ---------------------------------------------------------------------------

fn build_whoami(user: &AuthnUser, row: &UserRow) -> WhoamiResponse {
    WhoamiResponse {
        id: row.id,
        external_id: row.external_id.clone(),
        name: row.name.clone(),
        email: row.email.clone(),
        email_verified: row.email_verified,
        department_ids: user.department_ids.clone(),
        roles: user.global_roles.iter().map(|r| r.to_string()).collect(),
        active: row.active,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

/// Fetch the full UserRow for an AuthnUser.
async fn fetch_user_row(pool: &sqlx::PgPool, user_id: Uuid) -> Result<UserRow, AppError> {
    let row = sqlx::query_as::<_, UserRow>("SELECT * FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::NotFound("User".into()))?;
    Ok(row)
}

// ---------------------------------------------------------------------------
// S-004: POST /api/auth/callback
// ---------------------------------------------------------------------------

/// AuthnUser extractor already performs JIT provisioning.
/// This handler simply returns the whoami response.
pub async fn auth_callback(
    State(state): State<AppState>,
    user: AuthnUser,
) -> Result<impl IntoResponse, AppError> {
    let row = fetch_user_row(&state.pool, user.user_id).await?;
    Ok(Json(build_whoami(&user, &row)))
}

// ---------------------------------------------------------------------------
// S-006 / S-008: GET /api/auth/whoami and GET /api/users/me
// ---------------------------------------------------------------------------

pub async fn whoami(
    State(state): State<AppState>,
    user: AuthnUser,
) -> Result<impl IntoResponse, AppError> {
    let row = fetch_user_row(&state.pool, user.user_id).await?;
    Ok(Json(build_whoami(&user, &row)))
}

// ---------------------------------------------------------------------------
// S-009: PATCH /api/users/:id
// ---------------------------------------------------------------------------

pub async fn patch_user(
    State(state): State<AppState>,
    user: AuthnUser,
    Path(id): Path<Uuid>,
    Json(body): Json<PatchUserRequest>,
) -> Result<impl IntoResponse, AppError> {
    // Permission check: SystemAdmin can patch anyone.
    // DepartmentAdmin can patch users in their departments only.
    let is_system_admin = user.global_roles.contains(&GlobalRole::SystemAdmin);
    let is_dept_admin = user.global_roles.contains(&GlobalRole::DepartmentAdmin);

    if !is_system_admin && !is_dept_admin {
        return Err(AppError::PermissionDenied {
            action: "update".into(),
            resource: format!("user:{id}"),
        });
    }

    // If DepartmentAdmin (not SystemAdmin), verify target user is in one of caller's departments.
    if !is_system_admin {
        let target_dept_ids: Vec<(Uuid,)> = sqlx::query_as(
            "SELECT department_id FROM department_members WHERE user_id = $1",
        )
        .bind(id)
        .fetch_all(&state.pool)
        .await?;

        let has_common_dept = target_dept_ids
            .iter()
            .any(|(d,)| user.department_ids.contains(d));

        if !has_common_dept {
            return Err(AppError::PermissionDenied {
                action: "update".into(),
                resource: format!("user:{id}"),
            });
        }
    }

    // TODO: roles field change is SystemAdmin-only. MVP: ignore roles field, only toggle active.

    // Update
    let row = sqlx::query_as::<_, UserRow>(
        r#"
        UPDATE users
        SET active = COALESCE($2, active),
            updated_at = now()
        WHERE id = $1
        RETURNING *
        "#,
    )
    .bind(id)
    .bind(body.active)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("User".into()))?;

    // Invalidate ActiveCache entry when active field is changed (R-026, D-039)
    if body.active.is_some() {
        state.active_cache.invalidate(id);
    }

    // Fetch department_ids and roles for the target user
    let dept_ids = crate::authz::authn::get_user_department_ids(&state.pool, row.id).await?;
    let roles = crate::authz::authn::get_user_roles(
        &state.pool,
        row.id,
        &row.email,
        &state.config.system_admin_emails,
    )
    .await?;

    Ok(Json(PatchUserResponse {
        id: row.id,
        name: row.name,
        email: row.email,
        active: row.active,
        department_ids: dept_ids,
        roles: roles.iter().map(|r| r.to_string()).collect(),
        updated_at: row.updated_at,
    }))
}

// ---------------------------------------------------------------------------
// S-010: GET /api/users
// ---------------------------------------------------------------------------

pub async fn list_users(
    State(state): State<AppState>,
    _user: AuthnUser,
    Query(query): Query<UsersQuery>,
) -> Result<impl IntoResponse, AppError> {
    // Validate limit
    if query.limit < 1 || query.limit > 100 {
        return Err(AppError::InvalidInput(
            "limit must be between 1 and 100".into(),
        ));
    }

    // Decode cursor if present: [created_at, id]
    let cursor_data = if let Some(ref c) = query.cursor {
        let val = decode_cursor(c)?;
        let ts = val
            .get(0)
            .and_then(|v| v.as_str())
            .ok_or_else(|| AppError::InvalidInput("invalid_cursor: missing timestamp".into()))?;
        let cursor_ts: chrono::DateTime<chrono::Utc> = ts
            .parse()
            .map_err(|_| AppError::InvalidInput("invalid_cursor: bad timestamp".into()))?;
        let cursor_id: Uuid = val
            .get(1)
            .and_then(|v| v.as_str())
            .ok_or_else(|| AppError::InvalidInput("invalid_cursor: missing id".into()))?
            .parse()
            .map_err(|_| AppError::InvalidInput("invalid_cursor: bad id".into()))?;
        Some((cursor_ts, cursor_id))
    } else {
        None
    };

    let fetch_limit = query.limit + 1;

    // Build dynamic query based on filters
    let rows: Vec<UserRow> = if let Some(dept_id) = query.department_id {
        // Filter by department
        match (cursor_data, query.active) {
            (Some((ts, cid)), Some(active)) => {
                sqlx::query_as::<_, UserRow>(
                    r#"
                    SELECT u.* FROM users u
                    JOIN department_members dm ON dm.user_id = u.id
                    WHERE dm.department_id = $1
                      AND u.active = $2
                      AND (u.created_at, u.id) < ($3, $4)
                    ORDER BY u.created_at DESC, u.id DESC
                    LIMIT $5
                    "#,
                )
                .bind(dept_id)
                .bind(active)
                .bind(ts)
                .bind(cid)
                .bind(fetch_limit)
                .fetch_all(&state.pool)
                .await?
            }
            (Some((ts, cid)), None) => {
                sqlx::query_as::<_, UserRow>(
                    r#"
                    SELECT u.* FROM users u
                    JOIN department_members dm ON dm.user_id = u.id
                    WHERE dm.department_id = $1
                      AND (u.created_at, u.id) < ($2, $3)
                    ORDER BY u.created_at DESC, u.id DESC
                    LIMIT $4
                    "#,
                )
                .bind(dept_id)
                .bind(ts)
                .bind(cid)
                .bind(fetch_limit)
                .fetch_all(&state.pool)
                .await?
            }
            (None, Some(active)) => {
                sqlx::query_as::<_, UserRow>(
                    r#"
                    SELECT u.* FROM users u
                    JOIN department_members dm ON dm.user_id = u.id
                    WHERE dm.department_id = $1
                      AND u.active = $2
                    ORDER BY u.created_at DESC, u.id DESC
                    LIMIT $3
                    "#,
                )
                .bind(dept_id)
                .bind(active)
                .bind(fetch_limit)
                .fetch_all(&state.pool)
                .await?
            }
            (None, None) => {
                sqlx::query_as::<_, UserRow>(
                    r#"
                    SELECT u.* FROM users u
                    JOIN department_members dm ON dm.user_id = u.id
                    WHERE dm.department_id = $1
                    ORDER BY u.created_at DESC, u.id DESC
                    LIMIT $2
                    "#,
                )
                .bind(dept_id)
                .bind(fetch_limit)
                .fetch_all(&state.pool)
                .await?
            }
        }
    } else {
        // No department filter
        match (cursor_data, query.active) {
            (Some((ts, cid)), Some(active)) => {
                sqlx::query_as::<_, UserRow>(
                    r#"
                    SELECT * FROM users
                    WHERE active = $1
                      AND (created_at, id) < ($2, $3)
                    ORDER BY created_at DESC, id DESC
                    LIMIT $4
                    "#,
                )
                .bind(active)
                .bind(ts)
                .bind(cid)
                .bind(fetch_limit)
                .fetch_all(&state.pool)
                .await?
            }
            (Some((ts, cid)), None) => {
                sqlx::query_as::<_, UserRow>(
                    r#"
                    SELECT * FROM users
                    WHERE (created_at, id) < ($1, $2)
                    ORDER BY created_at DESC, id DESC
                    LIMIT $3
                    "#,
                )
                .bind(ts)
                .bind(cid)
                .bind(fetch_limit)
                .fetch_all(&state.pool)
                .await?
            }
            (None, Some(active)) => {
                sqlx::query_as::<_, UserRow>(
                    r#"
                    SELECT * FROM users
                    WHERE active = $1
                    ORDER BY created_at DESC, id DESC
                    LIMIT $2
                    "#,
                )
                .bind(active)
                .bind(fetch_limit)
                .fetch_all(&state.pool)
                .await?
            }
            (None, None) => {
                sqlx::query_as::<_, UserRow>(
                    r#"
                    SELECT * FROM users
                    ORDER BY created_at DESC, id DESC
                    LIMIT $1
                    "#,
                )
                .bind(fetch_limit)
                .fetch_all(&state.pool)
                .await?
            }
        }
    };

    let mut rows = rows;
    let has_more = rows.len() > query.limit as usize;
    if has_more {
        rows.pop();
    }

    // Build summaries with department_ids and roles per user
    let mut items = Vec::with_capacity(rows.len());
    for row in &rows {
        let dept_ids =
            crate::authz::authn::get_user_department_ids(&state.pool, row.id).await?;
        let roles = crate::authz::authn::get_user_roles(
            &state.pool,
            row.id,
            &row.email,
            &state.config.system_admin_emails,
        )
        .await?;
        items.push(UserSummary {
            id: row.id,
            name: row.name.clone(),
            email: row.email.clone(),
            department_ids: dept_ids,
            roles: roles.iter().map(|r| r.to_string()).collect(),
            active: row.active,
            created_at: row.created_at,
        });
    }

    let next_cursor = if has_more {
        let last = rows.last().unwrap();
        Some(encode_cursor(&serde_json::json!([
            last.created_at.to_rfc3339(),
            last.id.to_string(),
        ])))
    } else {
        None
    };

    Ok(Json(PaginatedResponse::new(items, next_cursor)))
}

// ---------------------------------------------------------------------------
// Dev Login (S-005) — unchanged from Step 1
// ---------------------------------------------------------------------------

#[cfg(feature = "dev-auth")]
#[derive(Deserialize)]
pub struct DevLoginRequest {
    pub user_email: String,
}

#[cfg(feature = "dev-auth")]
pub async fn dev_login(
    State(state): State<AppState>,
    Json(body): Json<DevLoginRequest>,
) -> Result<impl IntoResponse, AppError> {
    use crate::authz::authn::upsert_user_from_claims;
    use jsonwebtoken::Algorithm;

    if !state.config.dev_auth_enabled {
        return Err(AppError::NotFound("dev-auth not enabled".into()));
    }
    let hmac_key = state
        .config
        .dev_auth_hmac_key
        .as_ref()
        .ok_or(AppError::Internal("HMAC key not configured".into()))?;

    // JIT provisioning
    let external_id = format!("dev:{}", body.user_email);
    let _user = upsert_user_from_claims(
        &state.pool,
        &external_id,
        &body.user_email,
        &body.user_email,
    )
    .await?;

    // JWT generation
    let now = chrono::Utc::now();
    let claims = serde_json::json!({
        "iss": "dev",
        "sub": external_id,
        "aud": state.config.keycloak_audience,
        "iat": now.timestamp(),
        "exp": (now + chrono::Duration::hours(1)).timestamp(),
    });
    let token = jsonwebtoken::encode(
        &jsonwebtoken::Header::new(Algorithm::HS256),
        &claims,
        &jsonwebtoken::EncodingKey::from_secret(hmac_key.as_bytes()),
    )
    .map_err(|e| AppError::Internal(format!("JWT encode failed: {e}")))?;

    // D-029: tracing::warn event on dev-auth login issuance.
    // TODO: activity_logs insert for dev.login_issued requires schema migration
    // to allow board_id = NULL (activity_logs.board_id is NOT NULL FK).
    tracing::warn!(
        event = "dev_auth.active",
        user_email = %body.user_email,
        "Dev-auth login issued"
    );

    Ok(Json(serde_json::json!({
        "token": token,
        "expires_in": 3600
    })))
}

// When dev-auth feature is off, the /api/dev/login route is not registered
// in the router (Finding 7), so no stub handler is needed.
