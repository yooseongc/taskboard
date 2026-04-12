use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Row type for the `users` table.
#[derive(sqlx::FromRow, Serialize, Debug, Clone)]
pub struct UserRow {
    pub id: Uuid,
    pub external_id: String,
    pub name: String,
    pub email: String,
    pub email_verified: bool,
    pub active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// S-006: WhoamiResponse — returned by auth/callback, whoami, and users/me.
#[derive(Serialize, Debug)]
pub struct WhoamiResponse {
    pub id: Uuid,
    pub external_id: String,
    pub name: String,
    pub email: String,
    pub email_verified: bool,
    pub department_ids: Vec<Uuid>,
    pub roles: Vec<String>,
    pub active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// S-010: UserSummary for list_users response.
#[derive(Serialize, Debug)]
pub struct UserSummary {
    pub id: Uuid,
    pub name: String,
    pub email: String,
    pub department_ids: Vec<Uuid>,
    pub roles: Vec<String>,
    pub active: bool,
    pub created_at: DateTime<Utc>,
}

/// S-009: PatchUserRequest.
#[derive(Deserialize, Debug)]
pub struct PatchUserRequest {
    pub active: Option<bool>,
    // TODO: roles field (SystemAdmin-only, MVP deferred)
}

/// S-009: PatchUserResponse.
#[derive(Serialize, Debug)]
pub struct PatchUserResponse {
    pub id: Uuid,
    pub name: String,
    pub email: String,
    pub active: bool,
    pub department_ids: Vec<Uuid>,
    pub roles: Vec<String>,
    pub updated_at: DateTime<Utc>,
}

/// S-010: UsersQuery params.
#[derive(Deserialize, Debug)]
pub struct UsersQuery {
    #[serde(default = "default_limit")]
    pub limit: i64,
    pub cursor: Option<String>,
    pub department_id: Option<Uuid>,
    pub active: Option<bool>,
}

fn default_limit() -> i64 {
    20
}
