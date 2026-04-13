use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use uuid::Uuid;

use crate::authz::authn::{AuthnUser, GlobalRole};
use crate::authz::check::check_board_permission;
use crate::authz::matrix::{Action, ResourceType};
use crate::collaboration::activity_helper::insert_activity;
use crate::collaboration::models::*;
use crate::http::error::AppError;
use crate::http::pagination::{decode_cursor, encode_cursor, PaginatedResponse, PaginationQuery};
use crate::infra::state::AppState;
use crate::infra::uuid7;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Returns true if the user has any admin-level global role.
fn is_admin(user: &AuthnUser) -> bool {
    user.global_roles.iter().any(|r| matches!(r,
        GlobalRole::SystemAdmin | GlobalRole::DepartmentAdmin
    ))
}

/// Verify task exists (non-deleted) and return its board_id.
async fn verify_task(pool: &sqlx::PgPool, task_id: Uuid) -> Result<Uuid, AppError> {
    let row: Option<(Uuid,)> = sqlx::query_as(
        "SELECT board_id FROM tasks WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(task_id)
    .fetch_optional(pool)
    .await?;
    match row {
        Some((board_id,)) => Ok(board_id),
        None => Err(AppError::NotFound("Task".into())),
    }
}

// ---------------------------------------------------------------------------
// S-021: POST /api/tasks/:task_id/comments
// ---------------------------------------------------------------------------

pub async fn create_comment(
    State(state): State<AppState>,
    user: AuthnUser,
    Path(task_id): Path<Uuid>,
    Json(body): Json<CreateCommentRequest>,
) -> Result<impl IntoResponse, AppError> {
    // Validate body
    if body.body.trim().is_empty() {
        return Err(AppError::InvalidInput("Comment body must not be empty".into()));
    }

    let board_id = verify_task(&state.pool, task_id).await?;

    // Authz: Comment Create (replaces old is_viewer_only check)
    check_board_permission(&state.pool, &user, board_id, Action::Create, ResourceType::Comment).await?;

    let comment_id = uuid7::now_v7();
    let mut tx = state.pool.begin().await?;

    // INSERT comment
    let row = sqlx::query_as::<_, CommentRow>(
        r#"
        INSERT INTO comments (id, task_id, author_id, body)
        VALUES ($1, $2, $3, $4)
        RETURNING *
        "#,
    )
    .bind(comment_id)
    .bind(task_id)
    .bind(user.user_id)
    .bind(&body.body)
    .fetch_one(&mut *tx)
    .await?;

    // Bump task version
    sqlx::query(
        "UPDATE tasks SET version = version + 1, updated_at = now() WHERE id = $1",
    )
    .bind(task_id)
    .execute(&mut *tx)
    .await?;

    // Activity log
    insert_activity(
        &mut tx,
        board_id,
        Some(task_id),
        user.user_id,
        "task.commented",
        serde_json::json!({ "comment_id": comment_id }),
    )
    .await?;

    tx.commit().await?;

    let resp = CommentResponse {
        id: row.id,
        task_id: row.task_id,
        author_id: row.author_id,
        author_name: user.name.clone(),
        body: row.body,
        created_at: row.created_at,
        edited_at: row.edited_at,
    };

    Ok((StatusCode::CREATED, Json(resp)))
}

// ---------------------------------------------------------------------------
// S-021: GET /api/tasks/:task_id/comments
// ---------------------------------------------------------------------------

pub async fn list_comments(
    State(state): State<AppState>,
    user: AuthnUser,
    Path(task_id): Path<Uuid>,
    Query(query): Query<PaginationQuery>,
) -> Result<impl IntoResponse, AppError> {
    query.validate()?;

    // Verify task exists and get board_id for authz
    let board_id = verify_task(&state.pool, task_id).await?;

    // Authz: Board Read
    check_board_permission(&state.pool, &user, board_id, Action::Read, ResourceType::Board).await?;

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

    // Keyset pagination: created_at ASC, id ASC
    let rows: Vec<CommentWithAuthor> = match cursor_data {
        Some((ts, cid)) => {
            sqlx::query_as::<_, CommentWithAuthor>(
                r#"
                SELECT c.*, u.name AS author_name
                FROM comments c
                JOIN users u ON u.id = c.author_id
                WHERE c.task_id = $1 AND c.deleted_at IS NULL
                  AND (c.created_at, c.id) > ($2, $3)
                ORDER BY c.created_at ASC, c.id ASC
                LIMIT $4
                "#,
            )
            .bind(task_id)
            .bind(ts)
            .bind(cid)
            .bind(fetch_limit)
            .fetch_all(&state.pool)
            .await?
        }
        None => {
            sqlx::query_as::<_, CommentWithAuthor>(
                r#"
                SELECT c.*, u.name AS author_name
                FROM comments c
                JOIN users u ON u.id = c.author_id
                WHERE c.task_id = $1 AND c.deleted_at IS NULL
                ORDER BY c.created_at ASC, c.id ASC
                LIMIT $2
                "#,
            )
            .bind(task_id)
            .bind(fetch_limit)
            .fetch_all(&state.pool)
            .await?
        }
    };

    let mut rows = rows;
    let has_more = rows.len() > query.limit as usize;
    if has_more {
        rows.pop();
    }

    let items: Vec<CommentResponse> = rows
        .iter()
        .map(|r| CommentResponse {
            id: r.id,
            task_id: r.task_id,
            author_id: r.author_id,
            author_name: r.author_name.clone(),
            body: r.body.clone(),
            created_at: r.created_at,
            edited_at: r.edited_at,
        })
        .collect();

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
// S-021: PATCH /api/tasks/:task_id/comments/:comment_id
// ---------------------------------------------------------------------------

pub async fn patch_comment(
    State(state): State<AppState>,
    user: AuthnUser,
    Path((task_id, comment_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<PatchCommentRequest>,
) -> Result<impl IntoResponse, AppError> {
    // Validate body
    if body.body.trim().is_empty() {
        return Err(AppError::InvalidInput("Comment body must not be empty".into()));
    }

    let board_id = verify_task(&state.pool, task_id).await?;

    // Authz: Comment Update
    check_board_permission(&state.pool, &user, board_id, Action::Update, ResourceType::Comment).await?;

    // Fetch existing comment to check ownership
    let existing = sqlx::query_as::<_, CommentRow>(
        "SELECT * FROM comments WHERE id = $1 AND task_id = $2 AND deleted_at IS NULL",
    )
    .bind(comment_id)
    .bind(task_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Comment".into()))?;

    // Authorization: author OR admin
    if existing.author_id != user.user_id && !is_admin(&user) {
        return Err(AppError::PermissionDenied {
            action: "edit_comment".into(),
            resource: "comments".into(),
        });
    }

    let mut tx = state.pool.begin().await?;

    let updated = sqlx::query_as::<_, CommentRow>(
        r#"
        UPDATE comments
        SET body = $1, edited_at = now()
        WHERE id = $2 AND deleted_at IS NULL
        RETURNING *
        "#,
    )
    .bind(&body.body)
    .bind(comment_id)
    .fetch_one(&mut *tx)
    .await?;

    // Bump task version
    sqlx::query(
        "UPDATE tasks SET version = version + 1, updated_at = now() WHERE id = $1",
    )
    .bind(task_id)
    .execute(&mut *tx)
    .await?;

    // Activity log
    insert_activity(
        &mut tx,
        board_id,
        Some(task_id),
        user.user_id,
        "task.comment_edited",
        serde_json::json!({ "comment_id": comment_id }),
    )
    .await?;

    tx.commit().await?;

    // Fetch author name
    let (author_name,): (String,) = sqlx::query_as(
        "SELECT name FROM users WHERE id = $1",
    )
    .bind(updated.author_id)
    .fetch_one(&state.pool)
    .await?;

    let resp = CommentResponse {
        id: updated.id,
        task_id: updated.task_id,
        author_id: updated.author_id,
        author_name,
        body: updated.body,
        created_at: updated.created_at,
        edited_at: updated.edited_at,
    };

    Ok(Json(resp))
}

// ---------------------------------------------------------------------------
// S-021: DELETE /api/tasks/:task_id/comments/:comment_id
// ---------------------------------------------------------------------------

pub async fn delete_comment(
    State(state): State<AppState>,
    user: AuthnUser,
    Path((task_id, comment_id)): Path<(Uuid, Uuid)>,
) -> Result<impl IntoResponse, AppError> {
    let _board_id = verify_task(&state.pool, task_id).await?;

    // Authz: Comment Delete
    check_board_permission(&state.pool, &user, _board_id, Action::Delete, ResourceType::Comment).await?;

    // Fetch existing comment to check ownership
    let existing = sqlx::query_as::<_, CommentRow>(
        "SELECT * FROM comments WHERE id = $1 AND task_id = $2 AND deleted_at IS NULL",
    )
    .bind(comment_id)
    .bind(task_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Comment".into()))?;

    // Authorization: author OR admin
    if existing.author_id != user.user_id && !is_admin(&user) {
        return Err(AppError::PermissionDenied {
            action: "delete_comment".into(),
            resource: "comments".into(),
        });
    }

    let mut tx = state.pool.begin().await?;

    // Soft delete
    let result = sqlx::query(
        "UPDATE comments SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(comment_id)
    .execute(&mut *tx)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Comment".into()));
    }

    // Bump task version
    sqlx::query(
        "UPDATE tasks SET version = version + 1, updated_at = now() WHERE id = $1",
    )
    .bind(task_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(StatusCode::NO_CONTENT)
}
