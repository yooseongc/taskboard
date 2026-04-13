use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use uuid::Uuid;

use crate::authz::authn::AuthnUser;
use crate::authz::check::check_board_permission;
use crate::authz::matrix::{Action, ResourceType};
use crate::collaboration::models::*;
use crate::http::error::AppError;
use crate::infra::state::AppState;
use crate::infra::uuid7;

// ---------------------------------------------------------------------------
// GET /api/boards/:board_id/fields — list custom fields
// ---------------------------------------------------------------------------

pub async fn list_custom_fields(
    State(state): State<AppState>,
    _user: AuthnUser,
    Path(board_id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let rows = sqlx::query_as::<_, CustomFieldRow>(
        "SELECT * FROM board_custom_fields WHERE board_id = $1 ORDER BY position ASC, created_at ASC",
    )
    .bind(board_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({ "items": rows })))
}

// ---------------------------------------------------------------------------
// POST /api/boards/:board_id/fields — create custom field
// ---------------------------------------------------------------------------

pub async fn create_custom_field(
    State(state): State<AppState>,
    user: AuthnUser,
    Path(board_id): Path<Uuid>,
    Json(body): Json<CreateCustomFieldRequest>,
) -> Result<impl IntoResponse, AppError> {
    check_board_permission(&state.pool, &user, board_id, Action::Update, ResourceType::Board).await?;

    let valid_types = ["text", "number", "select", "multi_select", "date", "checkbox", "url"];
    if !valid_types.contains(&body.field_type.as_str()) {
        return Err(AppError::InvalidInput(format!(
            "field_type must be one of: {}",
            valid_types.join(", ")
        )));
    }

    let id = uuid7::now_v7();
    let row = sqlx::query_as::<_, CustomFieldRow>(
        r#"
        INSERT INTO board_custom_fields (id, board_id, name, field_type, options, required)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
        "#,
    )
    .bind(id)
    .bind(board_id)
    .bind(&body.name)
    .bind(&body.field_type)
    .bind(body.options.as_ref().unwrap_or(&serde_json::json!([])))
    .bind(body.required.unwrap_or(false))
    .fetch_one(&state.pool)
    .await
    .map_err(|e| {
        if let sqlx::Error::Database(ref db_err) = e {
            if db_err.constraint() == Some("board_custom_fields_board_id_name_key") {
                return AppError::DuplicateEntry(format!("Field '{}' already exists", body.name));
            }
        }
        AppError::from(e)
    })?;

    Ok((StatusCode::CREATED, Json(row)))
}

// ---------------------------------------------------------------------------
// PATCH /api/boards/:board_id/fields/:field_id
// ---------------------------------------------------------------------------

pub async fn patch_custom_field(
    State(state): State<AppState>,
    user: AuthnUser,
    Path((board_id, field_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<PatchCustomFieldRequest>,
) -> Result<impl IntoResponse, AppError> {
    check_board_permission(&state.pool, &user, board_id, Action::Update, ResourceType::Board).await?;

    let row = sqlx::query_as::<_, CustomFieldRow>(
        r#"
        UPDATE board_custom_fields
        SET name = COALESCE($3, name),
            options = COALESCE($4, options),
            position = COALESCE($5, position),
            required = COALESCE($6, required)
        WHERE id = $1 AND board_id = $2
        RETURNING *
        "#,
    )
    .bind(field_id)
    .bind(board_id)
    .bind(body.name)
    .bind(body.options)
    .bind(body.position)
    .bind(body.required)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Custom field".into()))?;

    Ok(Json(row))
}

// ---------------------------------------------------------------------------
// DELETE /api/boards/:board_id/fields/:field_id
// ---------------------------------------------------------------------------

pub async fn delete_custom_field(
    State(state): State<AppState>,
    user: AuthnUser,
    Path((board_id, field_id)): Path<(Uuid, Uuid)>,
) -> Result<impl IntoResponse, AppError> {
    check_board_permission(&state.pool, &user, board_id, Action::Update, ResourceType::Board).await?;

    let result = sqlx::query("DELETE FROM board_custom_fields WHERE id = $1 AND board_id = $2")
        .bind(field_id)
        .bind(board_id)
        .execute(&state.pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Custom field".into()));
    }

    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// GET /api/boards/:board_id/field-values — bulk read of every task's
// custom-field values for an entire board.
// ---------------------------------------------------------------------------
//
// Used by TableView's filter builder to evaluate filters client-side without
// firing one request per task. Authorized by Board Read; the result already
// includes only tasks the user can see (joins through `tasks` which itself
// honors deletion/board scoping).

pub async fn list_board_field_values(
    State(state): State<AppState>,
    user: AuthnUser,
    Path(board_id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    check_board_permission(&state.pool, &user, board_id, Action::Read, ResourceType::Board).await?;

    let rows = sqlx::query_as::<_, TaskFieldValueRow>(
        r#"
        SELECT tfv.*
        FROM task_field_values tfv
        JOIN tasks t ON t.id = tfv.task_id
        WHERE t.board_id = $1 AND t.deleted_at IS NULL
        "#,
    )
    .bind(board_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({ "items": rows })))
}

// ---------------------------------------------------------------------------
// GET /api/tasks/:task_id/fields — get all field values for a task
// ---------------------------------------------------------------------------

pub async fn get_task_field_values(
    State(state): State<AppState>,
    _user: AuthnUser,
    Path(task_id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let rows = sqlx::query_as::<_, TaskFieldValueRow>(
        "SELECT * FROM task_field_values WHERE task_id = $1",
    )
    .bind(task_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({ "items": rows })))
}

// ---------------------------------------------------------------------------
// PUT /api/tasks/:task_id/fields/:field_id — set field value
// ---------------------------------------------------------------------------

pub async fn set_task_field_value(
    State(state): State<AppState>,
    user: AuthnUser,
    Path((task_id, field_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<SetFieldValueRequest>,
) -> Result<impl IntoResponse, AppError> {
    let authz_board_id = crate::authz::check::fetch_task_board_id(&state.pool, task_id).await?;
    check_board_permission(&state.pool, &user, authz_board_id, Action::Update, ResourceType::Task).await?;

    let mut tx = state.pool.begin().await?;

    let row = sqlx::query_as::<_, TaskFieldValueRow>(
        r#"
        INSERT INTO task_field_values (task_id, field_id, value)
        VALUES ($1, $2, $3)
        ON CONFLICT (task_id, field_id) DO UPDATE
            SET value = EXCLUDED.value,
                updated_at = now()
        RETURNING *
        "#,
    )
    .bind(task_id)
    .bind(field_id)
    .bind(&body.value)
    .fetch_one(&mut *tx)
    .await?;

    // Compatibility shim: when the field being written is the seeded built-in
    // "Status" or "Priority" custom field, mirror the value back into the
    // legacy `tasks.status` / `tasks.priority` enum columns. Cards, table-view
    // sort, and saved board search still consume the enum columns; without
    // this sync those surfaces would render stale data after the user edits
    // the property via Custom Fields UI. The sync is a one-way write
    // (custom → enum). Unrecognized labels (e.g. user-renamed options) are
    // silently skipped, leaving the enum at its last known value rather than
    // poisoning it with NULL or rejected values.
    let field_name: Option<(String,)> = sqlx::query_as(
        "SELECT name FROM board_custom_fields WHERE id = $1 AND board_id = $2",
    )
    .bind(field_id)
    .bind(authz_board_id)
    .fetch_optional(&mut *tx)
    .await?;

    if let Some((name,)) = field_name {
        let label = body.value.as_str();
        match (name.as_str(), label) {
            ("Status", Some("Open")) => sync_status(&mut tx, task_id, "open").await?,
            ("Status", Some("In Progress")) => sync_status(&mut tx, task_id, "in_progress").await?,
            ("Status", Some("Done")) => sync_status(&mut tx, task_id, "done").await?,
            ("Status", Some("Archived")) => sync_status(&mut tx, task_id, "archived").await?,
            ("Priority", Some("Urgent")) => sync_priority(&mut tx, task_id, "urgent").await?,
            ("Priority", Some("High")) => sync_priority(&mut tx, task_id, "high").await?,
            ("Priority", Some("Medium")) => sync_priority(&mut tx, task_id, "medium").await?,
            ("Priority", Some("Low")) => sync_priority(&mut tx, task_id, "low").await?,
            _ => { /* not a tracked built-in or option label changed — skip */ }
        }
    }

    tx.commit().await?;

    Ok(Json(row))
}

/// Mirror a Status custom-field write onto the legacy `tasks.status` enum.
async fn sync_status(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    task_id: Uuid,
    enum_value: &str,
) -> Result<(), AppError> {
    sqlx::query("UPDATE tasks SET status = $1, updated_at = now() WHERE id = $2 AND deleted_at IS NULL")
        .bind(enum_value)
        .bind(task_id)
        .execute(&mut **tx)
        .await?;
    Ok(())
}

/// Mirror a Priority custom-field write onto the legacy `tasks.priority` enum.
async fn sync_priority(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    task_id: Uuid,
    enum_value: &str,
) -> Result<(), AppError> {
    sqlx::query("UPDATE tasks SET priority = $1, updated_at = now() WHERE id = $2 AND deleted_at IS NULL")
        .bind(enum_value)
        .bind(task_id)
        .execute(&mut **tx)
        .await?;
    Ok(())
}
