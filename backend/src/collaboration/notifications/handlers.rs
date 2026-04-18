use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use uuid::Uuid;

use super::models::NotificationSummary;
use crate::authz::authn::AuthnUser;
use crate::http::error::AppError;
use crate::http::pagination::{decode_cursor, encode_cursor, PaginatedResponse};
use crate::infra::state::AppState;

#[derive(Deserialize, Debug)]
pub struct ListQuery {
    /// `true` → only unread (read_at IS NULL). Default `false` → all.
    #[serde(default)]
    pub unread: bool,
    #[serde(default = "default_limit")]
    pub limit: i64,
    pub cursor: Option<String>,
}

fn default_limit() -> i64 {
    50
}

/// GET /api/users/me/notifications?unread=&limit=&cursor=
pub async fn list_notifications(
    State(state): State<AppState>,
    user: AuthnUser,
    Query(q): Query<ListQuery>,
) -> Result<impl IntoResponse, AppError> {
    if q.limit < 1 || q.limit > 100 {
        return Err(AppError::InvalidInput(
            "limit must be between 1 and 100".into(),
        ));
    }

    // Decode cursor [created_at, id] — same shape as list_users.
    let cursor_data = if let Some(ref c) = q.cursor {
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

    let fetch_limit = q.limit + 1;

    // Join actor/board/task so the UI can render a one-line summary
    // without a second round-trip. All joins are LEFT because the row
    // may have NULL pointers (e.g., deadline rows have no actor).
    let rows: Vec<NotificationJoinedRow> = match (cursor_data, q.unread) {
        (Some((ts, cid)), true) => sqlx::query_as::<_, NotificationJoinedRow>(
            NOTIF_QUERY_UNREAD_CURSOR,
        )
        .bind(user.user_id)
        .bind(ts)
        .bind(cid)
        .bind(fetch_limit)
        .fetch_all(&state.pool)
        .await?,
        (Some((ts, cid)), false) => sqlx::query_as::<_, NotificationJoinedRow>(
            NOTIF_QUERY_ALL_CURSOR,
        )
        .bind(user.user_id)
        .bind(ts)
        .bind(cid)
        .bind(fetch_limit)
        .fetch_all(&state.pool)
        .await?,
        (None, true) => sqlx::query_as::<_, NotificationJoinedRow>(NOTIF_QUERY_UNREAD)
            .bind(user.user_id)
            .bind(fetch_limit)
            .fetch_all(&state.pool)
            .await?,
        (None, false) => sqlx::query_as::<_, NotificationJoinedRow>(NOTIF_QUERY_ALL)
            .bind(user.user_id)
            .bind(fetch_limit)
            .fetch_all(&state.pool)
            .await?,
    };

    let mut rows = rows;
    let has_more = rows.len() > q.limit as usize;
    if has_more {
        rows.pop();
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

    let items: Vec<NotificationSummary> = rows.into_iter().map(Into::into).collect();
    Ok(Json(PaginatedResponse::new(items, next_cursor)))
}

/// GET /api/users/me/notifications/count → `{ unread: i64 }`
pub async fn unread_count(
    State(state): State<AppState>,
    user: AuthnUser,
) -> Result<impl IntoResponse, AppError> {
    let (count,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*)::bigint FROM notifications WHERE user_id = $1 AND read_at IS NULL",
    )
    .bind(user.user_id)
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(serde_json::json!({ "unread": count })))
}

#[derive(Deserialize, Debug)]
pub struct MarkReadRequest {
    /// `true` → mark read (set read_at=now()), `false` → mark unread.
    pub read: bool,
}

/// PATCH /api/users/me/notifications/{id}  { read: true|false }
pub async fn mark_read(
    State(state): State<AppState>,
    user: AuthnUser,
    Path(id): Path<Uuid>,
    Json(body): Json<MarkReadRequest>,
) -> Result<impl IntoResponse, AppError> {
    let rows = sqlx::query(
        r#"
        UPDATE notifications
        SET read_at = CASE WHEN $3 THEN now() ELSE NULL END
        WHERE id = $1 AND user_id = $2
        "#,
    )
    .bind(id)
    .bind(user.user_id)
    .bind(body.read)
    .execute(&state.pool)
    .await?;
    if rows.rows_affected() == 0 {
        return Err(AppError::NotFound("Notification".into()));
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

/// POST /api/users/me/notifications/read-all
pub async fn mark_all_read(
    State(state): State<AppState>,
    user: AuthnUser,
) -> Result<impl IntoResponse, AppError> {
    let rows = sqlx::query(
        "UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL",
    )
    .bind(user.user_id)
    .execute(&state.pool)
    .await?;
    Ok(Json(serde_json::json!({ "marked": rows.rows_affected() })))
}

// ---------------------------------------------------------------------------
// Joined row + SQL constants
// ---------------------------------------------------------------------------

#[derive(sqlx::FromRow, Debug)]
struct NotificationJoinedRow {
    id: Uuid,
    kind: String,
    board_id: Option<Uuid>,
    board_title: Option<String>,
    task_id: Option<Uuid>,
    task_title: Option<String>,
    actor_id: Option<Uuid>,
    actor_name: Option<String>,
    action: Option<String>,
    payload: serde_json::Value,
    read_at: Option<chrono::DateTime<chrono::Utc>>,
    created_at: chrono::DateTime<chrono::Utc>,
}

impl From<NotificationJoinedRow> for NotificationSummary {
    fn from(r: NotificationJoinedRow) -> Self {
        NotificationSummary {
            id: r.id,
            kind: r.kind,
            board_id: r.board_id,
            board_title: r.board_title,
            task_id: r.task_id,
            task_title: r.task_title,
            actor_id: r.actor_id,
            actor_name: r.actor_name,
            action: r.action,
            payload: r.payload,
            read_at: r.read_at,
            created_at: r.created_at,
        }
    }
}

const NOTIF_QUERY_ALL: &str = r#"
    SELECT n.id, n.kind, n.board_id, b.title AS board_title,
           n.task_id, t.title AS task_title,
           n.actor_id, u.name AS actor_name,
           n.action, n.payload, n.read_at, n.created_at
    FROM notifications n
    LEFT JOIN boards b ON b.id = n.board_id
    LEFT JOIN tasks  t ON t.id = n.task_id
    LEFT JOIN users  u ON u.id = n.actor_id
    WHERE n.user_id = $1
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT $2
"#;

const NOTIF_QUERY_UNREAD: &str = r#"
    SELECT n.id, n.kind, n.board_id, b.title AS board_title,
           n.task_id, t.title AS task_title,
           n.actor_id, u.name AS actor_name,
           n.action, n.payload, n.read_at, n.created_at
    FROM notifications n
    LEFT JOIN boards b ON b.id = n.board_id
    LEFT JOIN tasks  t ON t.id = n.task_id
    LEFT JOIN users  u ON u.id = n.actor_id
    WHERE n.user_id = $1 AND n.read_at IS NULL
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT $2
"#;

const NOTIF_QUERY_ALL_CURSOR: &str = r#"
    SELECT n.id, n.kind, n.board_id, b.title AS board_title,
           n.task_id, t.title AS task_title,
           n.actor_id, u.name AS actor_name,
           n.action, n.payload, n.read_at, n.created_at
    FROM notifications n
    LEFT JOIN boards b ON b.id = n.board_id
    LEFT JOIN tasks  t ON t.id = n.task_id
    LEFT JOIN users  u ON u.id = n.actor_id
    WHERE n.user_id = $1 AND (n.created_at, n.id) < ($2, $3)
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT $4
"#;

const NOTIF_QUERY_UNREAD_CURSOR: &str = r#"
    SELECT n.id, n.kind, n.board_id, b.title AS board_title,
           n.task_id, t.title AS task_title,
           n.actor_id, u.name AS actor_name,
           n.action, n.payload, n.read_at, n.created_at
    FROM notifications n
    LEFT JOIN boards b ON b.id = n.board_id
    LEFT JOIN tasks  t ON t.id = n.task_id
    LEFT JOIN users  u ON u.id = n.actor_id
    WHERE n.user_id = $1 AND n.read_at IS NULL
      AND (n.created_at, n.id) < ($2, $3)
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT $4
"#;
