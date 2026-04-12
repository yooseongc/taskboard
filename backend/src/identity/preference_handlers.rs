use axum::extract::State;
use axum::response::IntoResponse;
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::authz::authn::AuthnUser;
use crate::http::error::AppError;
use crate::infra::state::AppState;

#[derive(sqlx::FromRow, Serialize, Debug)]
pub struct UserPreferenceRow {
    pub user_id: uuid::Uuid,
    pub theme: String,
    pub locale: String,
    pub preferences: serde_json::Value,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Deserialize, Debug)]
pub struct PatchPreferencesRequest {
    pub theme: Option<String>,
    pub locale: Option<String>,
    pub preferences: Option<serde_json::Value>,
}

// ---------------------------------------------------------------------------
// GET /api/users/me/preferences
// ---------------------------------------------------------------------------

pub async fn get_preferences(
    State(state): State<AppState>,
    user: AuthnUser,
) -> Result<impl IntoResponse, AppError> {
    let row = sqlx::query_as::<_, UserPreferenceRow>(
        "SELECT * FROM user_preferences WHERE user_id = $1",
    )
    .bind(user.user_id)
    .fetch_optional(&state.pool)
    .await?;

    match row {
        Some(r) => Ok(Json(serde_json::json!({
            "theme": r.theme,
            "locale": r.locale,
            "preferences": r.preferences,
        }))),
        None => Ok(Json(serde_json::json!({
            "theme": "system",
            "locale": "ko",
            "preferences": {},
        }))),
    }
}

// ---------------------------------------------------------------------------
// PATCH /api/users/me/preferences
// ---------------------------------------------------------------------------

pub async fn patch_preferences(
    State(state): State<AppState>,
    user: AuthnUser,
    Json(body): Json<PatchPreferencesRequest>,
) -> Result<impl IntoResponse, AppError> {
    if let Some(ref theme) = body.theme {
        if !["light", "dark", "system"].contains(&theme.as_str()) {
            return Err(AppError::InvalidInput(
                "theme must be 'light', 'dark', or 'system'".into(),
            ));
        }
    }

    let row = sqlx::query_as::<_, UserPreferenceRow>(
        r#"
        INSERT INTO user_preferences (user_id, theme, locale, preferences)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id) DO UPDATE
            SET theme = COALESCE($2, user_preferences.theme),
                locale = COALESCE($3, user_preferences.locale),
                preferences = COALESCE($4, user_preferences.preferences),
                updated_at = now()
        RETURNING *
        "#,
    )
    .bind(user.user_id)
    .bind(body.theme.as_deref().unwrap_or("system"))
    .bind(body.locale.as_deref().unwrap_or("ko"))
    .bind(body.preferences.as_ref().unwrap_or(&serde_json::json!({})))
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({
        "theme": row.theme,
        "locale": row.locale,
        "preferences": row.preferences,
    })))
}
