//! Round C — Saved Views handlers.
//!
//! A "view" lets a user persist their current filter/sort/column
//! configuration under a name and reuse it later. Views are scoped to
//! a board; when `shared = true` every board member sees the view in
//! their dropdown, otherwise only the creator does.
//!
//! Authorization model:
//!   * Board Read lets you list + get views on the board.
//!   * Board Update lets you create views.
//!   * Updating or deleting a view requires either Board Update (board
//!     admin) or being the view's owner.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use uuid::Uuid;

use crate::authz::authn::AuthnUser;
use crate::authz::check::check_board_permission;
use crate::authz::matrix::{Action, ResourceType};
use crate::collaboration::models::{
    BoardViewRow, CreateBoardViewRequest, PatchBoardViewRequest,
};
use crate::http::error::AppError;
use crate::infra::state::AppState;
use crate::infra::uuid7;

/// GET /api/boards/:board_id/views
pub async fn list_board_views(
    State(state): State<AppState>,
    user: AuthnUser,
    Path(board_id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    check_board_permission(&state.pool, &user, board_id, Action::Read, ResourceType::Board)
        .await?;

    // Visibility: either shared views or the caller's own private views.
    let rows = sqlx::query_as::<_, BoardViewRow>(
        r#"
        SELECT * FROM board_views
        WHERE board_id = $1 AND (shared = TRUE OR owner_id = $2)
        ORDER BY position ASC, created_at ASC
        "#,
    )
    .bind(board_id)
    .bind(user.user_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({ "items": rows })))
}

/// POST /api/boards/:board_id/views
pub async fn create_board_view(
    State(state): State<AppState>,
    user: AuthnUser,
    Path(board_id): Path<Uuid>,
    Json(body): Json<CreateBoardViewRequest>,
) -> Result<impl IntoResponse, AppError> {
    check_board_permission(&state.pool, &user, board_id, Action::Update, ResourceType::Board)
        .await?;

    if !matches!(body.view_type.as_str(), "board" | "table" | "calendar") {
        return Err(AppError::InvalidInput(
            "view_type must be board|table|calendar".into(),
        ));
    }
    if body.name.trim().is_empty() {
        return Err(AppError::InvalidInput("name must be non-empty".into()));
    }

    // New views append to the end of the dropdown by default.
    let (max_pos,): (Option<f64>,) = sqlx::query_as(
        "SELECT MAX(position) FROM board_views WHERE board_id = $1",
    )
    .bind(board_id)
    .fetch_one(&state.pool)
    .await?;
    let position = max_pos.unwrap_or(0.0) + 1024.0;

    let id = uuid7::now_v7();
    let row = sqlx::query_as::<_, BoardViewRow>(
        r#"
        INSERT INTO board_views (id, board_id, name, view_type, config, owner_id, shared, position)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
        "#,
    )
    .bind(id)
    .bind(board_id)
    .bind(body.name.trim())
    .bind(&body.view_type)
    .bind(body.config.unwrap_or(serde_json::json!({})))
    .bind(user.user_id)
    .bind(body.shared.unwrap_or(false))
    .bind(position)
    .fetch_one(&state.pool)
    .await?;

    Ok((StatusCode::CREATED, Json(row)))
}

/// PATCH /api/boards/:board_id/views/:view_id
///
/// Only the owner or a board admin (Board Update) can edit a view. We
/// check ownership with a single fetch-then-update pattern so the
/// permission error maps cleanly to 403.
pub async fn patch_board_view(
    State(state): State<AppState>,
    user: AuthnUser,
    Path((board_id, view_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<PatchBoardViewRequest>,
) -> Result<impl IntoResponse, AppError> {
    let existing = sqlx::query_as::<_, BoardViewRow>(
        "SELECT * FROM board_views WHERE id = $1 AND board_id = $2",
    )
    .bind(view_id)
    .bind(board_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Board view".into()))?;

    if existing.owner_id != user.user_id {
        check_board_permission(&state.pool, &user, board_id, Action::Update, ResourceType::Board)
            .await?;
    } else {
        // Owner still needs Read to see the board at all.
        check_board_permission(&state.pool, &user, board_id, Action::Read, ResourceType::Board)
            .await?;
    }

    if let Some(ref t) = body.view_type {
        if !matches!(t.as_str(), "board" | "table" | "calendar") {
            return Err(AppError::InvalidInput(
                "view_type must be board|table|calendar".into(),
            ));
        }
    }

    let row = sqlx::query_as::<_, BoardViewRow>(
        r#"
        UPDATE board_views
        SET name      = COALESCE($3, name),
            config    = COALESCE($4, config),
            shared    = COALESCE($5, shared),
            position  = COALESCE($6, position),
            view_type = COALESCE($7, view_type),
            updated_at = now()
        WHERE id = $1 AND board_id = $2
        RETURNING *
        "#,
    )
    .bind(view_id)
    .bind(board_id)
    .bind(body.name.as_deref())
    .bind(body.config)
    .bind(body.shared)
    .bind(body.position)
    .bind(body.view_type.as_deref())
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(row))
}

/// DELETE /api/boards/:board_id/views/:view_id
pub async fn delete_board_view(
    State(state): State<AppState>,
    user: AuthnUser,
    Path((board_id, view_id)): Path<(Uuid, Uuid)>,
) -> Result<impl IntoResponse, AppError> {
    let existing = sqlx::query_as::<_, BoardViewRow>(
        "SELECT * FROM board_views WHERE id = $1 AND board_id = $2",
    )
    .bind(view_id)
    .bind(board_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Board view".into()))?;

    if existing.owner_id != user.user_id {
        check_board_permission(&state.pool, &user, board_id, Action::Update, ResourceType::Board)
            .await?;
    } else {
        check_board_permission(&state.pool, &user, board_id, Action::Read, ResourceType::Board)
            .await?;
    }

    sqlx::query("DELETE FROM board_views WHERE id = $1 AND board_id = $2")
        .bind(view_id)
        .bind(board_id)
        .execute(&state.pool)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}
