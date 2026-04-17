use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use uuid::Uuid;

use crate::authz::authn::AuthnUser;
use crate::authz::check::check_board_permission;
use crate::authz::matrix::{Action, ResourceType};
use crate::collaboration::activity_helper::insert_activity;
use crate::collaboration::models::*;
use crate::http::error::AppError;
use crate::http::pagination::{decode_cursor, encode_cursor, PaginatedResponse};
use crate::http::version::{etag_header, extract_version};
use crate::infra::state::AppState;
use crate::infra::uuid7;

// ---------------------------------------------------------------------------
// S-016: POST /api/boards/:board_id/columns
// ---------------------------------------------------------------------------

pub async fn create_column(
    State(state): State<AppState>,
    user: AuthnUser,
    Path(board_id): Path<Uuid>,
    Json(body): Json<CreateColumnRequest>,
) -> Result<impl IntoResponse, AppError> {
    // Authz: Board Update (column management is board-level update)
    check_board_permission(&state.pool, &user, board_id, Action::Update, ResourceType::Board).await?;

    // Verify board exists
    let _board = sqlx::query_as::<_, BoardRow>(
        "SELECT * FROM boards WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(board_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Board".into()))?;

    // Check column count limit (50)
    let (count,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM board_columns WHERE board_id = $1")
            .bind(board_id)
            .fetch_one(&state.pool)
            .await?;

    if count >= 50 {
        return Err(AppError::ColumnLimitExceeded);
    }

    // Calculate position
    let (max_pos,): (Option<f64>,) = sqlx::query_as(
        "SELECT MAX(position) FROM board_columns WHERE board_id = $1",
    )
    .bind(board_id)
    .fetch_one(&state.pool)
    .await?;

    let position = max_pos.unwrap_or(0.0) + 1024.0;

    let col_id = uuid7::now_v7();
    let mut tx = state.pool.begin().await?;

    let color = validate_column_color(body.color.as_deref())?;

    let row = sqlx::query_as::<_, BoardColumnRow>(
        r#"
        INSERT INTO board_columns (id, board_id, title, position, version, color)
        VALUES ($1, $2, $3, $4, 0, $5)
        RETURNING *
        "#,
    )
    .bind(col_id)
    .bind(board_id)
    .bind(&body.title)
    .bind(position)
    .bind(color.as_deref())
    .fetch_one(&mut *tx)
    .await?;

    // Activity log
    insert_activity(
        &mut tx,
        board_id,
        None,
        user.user_id,
        "column.created",
        serde_json::json!({ "column_id": col_id, "title": body.title }),
    )
    .await?;

    tx.commit().await?;

    let resp = ColumnResponse {
        id: row.id,
        board_id: row.board_id,
        title: row.title,
        position: row.position,
        version: row.version,
        color: row.color,
        created_at: row.created_at,
    };

    Ok((StatusCode::CREATED, Json(resp)))
}

/// Validate a user-supplied column accent color. We accept either `None`
/// (let DB default stand), or a 7-char `#rrggbb` hex. Reject anything
/// else with 400 so malformed values never reach the DB.
fn validate_column_color(color: Option<&str>) -> Result<Option<String>, AppError> {
    match color {
        None => Ok(None),
        Some(s) => {
            let s = s.trim();
            if s.len() != 7 || !s.starts_with('#') {
                return Err(AppError::InvalidInput("color must be #rrggbb".into()));
            }
            if !s[1..].chars().all(|c| c.is_ascii_hexdigit()) {
                return Err(AppError::InvalidInput("color must be #rrggbb".into()));
            }
            Ok(Some(s.to_ascii_lowercase()))
        }
    }
}

// ---------------------------------------------------------------------------
// S-016: GET /api/boards/:board_id/columns
// ---------------------------------------------------------------------------

pub async fn list_columns(
    State(state): State<AppState>,
    user: AuthnUser,
    Path(board_id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    // Authz: Board Read
    check_board_permission(&state.pool, &user, board_id, Action::Read, ResourceType::Board).await?;

    // Verify board exists
    let _board = sqlx::query_as::<_, BoardRow>(
        "SELECT * FROM boards WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(board_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Board".into()))?;

    let rows: Vec<BoardColumnRow> = sqlx::query_as::<_, BoardColumnRow>(
        "SELECT * FROM board_columns WHERE board_id = $1 ORDER BY position ASC",
    )
    .bind(board_id)
    .fetch_all(&state.pool)
    .await?;

    let items: Vec<ColumnResponse> = rows
        .into_iter()
        .map(|r| ColumnResponse {
            id: r.id,
            board_id: r.board_id,
            title: r.title,
            position: r.position,
            version: r.version,
            color: r.color,
            created_at: r.created_at,
        })
        .collect();

    Ok(Json(serde_json::json!({ "items": items })))
}

// ---------------------------------------------------------------------------
// S-016: PATCH /api/boards/:board_id/columns/:col_id
// ---------------------------------------------------------------------------

pub async fn patch_column(
    State(state): State<AppState>,
    user: AuthnUser,
    Path((board_id, col_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Json(body): Json<PatchColumnRequest>,
) -> Result<impl IntoResponse, AppError> {
    // Authz: Board Update (column management is board-level update)
    check_board_permission(&state.pool, &user, board_id, Action::Update, ResourceType::Board).await?;

    let expected_version = extract_version(&headers, body.version)?;

    // Resolve the color patch up-front so a malformed value fails cleanly
    // before we start a transaction. `color_update` encodes the three-way
    // semantics: None = leave alone, Some(None) = set to NULL, Some(Some)
    // = overwrite. We pass a (apply_flag, value) pair to the SQL UPDATE so
    // COALESCE-style "leave alone" behaves correctly for a nullable column.
    let color_update: Option<Option<String>> = match &body.color {
        None => None,
        Some(None) => Some(None),
        Some(Some(s)) => Some(validate_column_color(Some(s))?),
    };
    let apply_color = color_update.is_some();
    let color_value: Option<String> = color_update.flatten();

    let mut tx = state.pool.begin().await?;

    let updated = sqlx::query_as::<_, BoardColumnRow>(
        r#"
        UPDATE board_columns
        SET title = COALESCE($2, title),
            position = COALESCE($3, position),
            color = CASE WHEN $6 THEN $7 ELSE color END,
            version = version + 1,
            updated_at = now()
        WHERE id = $1 AND version = $4 AND board_id = $5
        RETURNING *
        "#,
    )
    .bind(col_id)
    .bind(&body.title)
    .bind(body.position)
    .bind(expected_version)
    .bind(board_id)
    .bind(apply_color)
    .bind(color_value.as_deref())
    .fetch_optional(&mut *tx)
    .await?;

    let row = match updated {
        Some(r) => r,
        None => {
            let current = sqlx::query_as::<_, BoardColumnRow>(
                "SELECT * FROM board_columns WHERE id = $1 AND board_id = $2",
            )
            .bind(col_id)
            .bind(board_id)
            .fetch_optional(&mut *tx)
            .await?;

            match current {
                None => return Err(AppError::NotFound("Column".into())),
                Some(c) => {
                    return Err(AppError::VersionConflict {
                        current_version: c.version,
                        current_resource: Some(serde_json::to_value(&c).unwrap_or_default()),
                    });
                }
            }
        }
    };

    // Position compaction: if position was changed, check for gap < 1e-9 with neighbours
    if body.position.is_some() {
        let new_position = row.position;
        let neighbors: Vec<(f64,)> = sqlx::query_as(
            "SELECT position FROM board_columns WHERE board_id = $1 AND id != $2 ORDER BY ABS(position - $3) ASC LIMIT 2",
        )
        .bind(board_id)
        .bind(col_id)
        .bind(new_position)
        .fetch_all(&mut *tx)
        .await?;

        let needs_compact = neighbors
            .iter()
            .any(|(p,)| crate::collaboration::position::needs_compaction(*p, new_position));
        if needs_compact {
            crate::collaboration::position::compact_board_column_positions(&mut tx, board_id)
                .await?;
        }
    }

    // Determine activity action
    let action = if body.position.is_some() && body.title.is_none() {
        "column.reordered"
    } else {
        "column.updated"
    };

    insert_activity(
        &mut tx,
        board_id,
        None,
        user.user_id,
        action,
        serde_json::json!({
            "column_id": col_id,
            "title": body.title,
            "position": body.position,
        }),
    )
    .await?;

    tx.commit().await?;

    let resp = ColumnResponse {
        id: row.id,
        board_id: row.board_id,
        title: row.title,
        position: row.position,
        version: row.version,
        color: row.color,
        created_at: row.created_at,
    };

    let (etag_name, etag_val) = etag_header(row.version);
    Ok(([(etag_name, etag_val)], Json(resp)))
}

// ---------------------------------------------------------------------------
// S-016: DELETE /api/boards/:board_id/columns/:col_id
// ---------------------------------------------------------------------------

pub async fn delete_column(
    State(state): State<AppState>,
    user: AuthnUser,
    Path((board_id, col_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Query(query): Query<DeleteColumnQuery>,
) -> Result<impl IntoResponse, AppError> {
    // Authz: Board Delete (column deletion)
    check_board_permission(&state.pool, &user, board_id, Action::Delete, ResourceType::Board).await?;

    let expected_version = extract_version(&headers, query.version)?;

    let mut tx = state.pool.begin().await?;

    // Verify column exists and version matches
    let col = sqlx::query_as::<_, BoardColumnRow>(
        "SELECT * FROM board_columns WHERE id = $1 AND board_id = $2",
    )
    .bind(col_id)
    .bind(board_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("Column".into()))?;

    if col.version != expected_version {
        return Err(AppError::VersionConflict {
            current_version: col.version,
            current_resource: Some(serde_json::to_value(&col).unwrap_or_default()),
        });
    }

    // Check for tasks in this column
    let (task_count,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM tasks WHERE column_id = $1 AND deleted_at IS NULL",
    )
    .bind(col_id)
    .fetch_one(&mut *tx)
    .await?;

    let mut moved_to: Option<Uuid> = None;

    if task_count > 0 {
        match query.move_to {
            None => return Err(AppError::ColumnHasTasks),
            Some(target_col_id) => {
                // Verify target column exists and belongs to same board
                let _target = sqlx::query_as::<_, BoardColumnRow>(
                    "SELECT * FROM board_columns WHERE id = $1 AND board_id = $2",
                )
                .bind(target_col_id)
                .bind(board_id)
                .fetch_optional(&mut *tx)
                .await?
                .ok_or_else(|| AppError::NotFound("Target column".into()))?;

                // Move tasks
                sqlx::query(
                    "UPDATE tasks SET column_id = $1 WHERE column_id = $2 AND deleted_at IS NULL",
                )
                .bind(target_col_id)
                .bind(col_id)
                .execute(&mut *tx)
                .await?;

                moved_to = Some(target_col_id);
            }
        }
    }

    // Delete column
    sqlx::query("DELETE FROM board_columns WHERE id = $1")
        .bind(col_id)
        .execute(&mut *tx)
        .await?;

    // Activity log
    insert_activity(
        &mut tx,
        board_id,
        None,
        user.user_id,
        "column.deleted",
        serde_json::json!({
            "column_id": col_id,
            "title": col.title,
            "moved_tasks_to": moved_to,
        }),
    )
    .await?;

    tx.commit().await?;

    Ok(StatusCode::NO_CONTENT)
}

// ===========================================================================
// S-017: Task CRUD
// ===========================================================================

// ---------------------------------------------------------------------------
// S-017: POST /api/boards/:board_id/tasks
// ---------------------------------------------------------------------------

pub async fn create_task(
    State(state): State<AppState>,
    user: AuthnUser,
    Path(board_id): Path<Uuid>,
    Json(body): Json<CreateTaskRequest>,
) -> Result<impl IntoResponse, AppError> {
    // Authz: Task Create
    check_board_permission(&state.pool, &user, board_id, Action::Create, ResourceType::Task).await?;

    // Validate title length
    if body.title.is_empty() || body.title.len() > 255 {
        return Err(AppError::InvalidInput(
            "title must be between 1 and 255 characters".into(),
        ));
    }

    // Validate description length
    if let Some(ref desc) = body.description {
        if desc.len() > 65536 {
            return Err(AppError::InvalidInput(
                "description must not exceed 64KB".into(),
            ));
        }
    }

    // Validate summary length — short one-liner shown on cards
    if let Some(ref s) = body.summary {
        if s.chars().count() > 256 {
            return Err(AppError::InvalidInput(
                "summary must not exceed 256 characters".into(),
            ));
        }
    }

    // Validate priority if provided
    if let Some(ref p) = body.priority {
        match p.as_str() {
            "low" | "medium" | "high" | "urgent" => {}
            _ => {
                return Err(AppError::InvalidInput(
                    "priority must be 'low', 'medium', 'high', or 'urgent'".into(),
                ));
            }
        }
    }

    // Validate status if provided
    if let Some(ref s) = body.status {
        match s.as_str() {
            "open" | "in_progress" | "done" | "archived" => {}
            _ => {
                return Err(AppError::InvalidInput(
                    "status must be 'open', 'in_progress', 'done', or 'archived'".into(),
                ));
            }
        }
    }

    // Verify board exists
    let _board = sqlx::query_as::<_, BoardRow>(
        "SELECT * FROM boards WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(board_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Board".into()))?;

    // Verify column exists and belongs to board
    let _col = sqlx::query_as::<_, BoardColumnRow>(
        "SELECT * FROM board_columns WHERE id = $1 AND board_id = $2",
    )
    .bind(body.column_id)
    .bind(board_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Column".into()))?;

    // Calculate position
    let (max_pos,): (Option<f64>,) = sqlx::query_as(
        "SELECT COALESCE(MAX(position), 0) FROM tasks WHERE column_id = $1 AND deleted_at IS NULL",
    )
    .bind(body.column_id)
    .fetch_one(&state.pool)
    .await?;

    let position = max_pos.unwrap_or(0.0) + 1024.0;

    let task_id = uuid7::now_v7();
    let priority = body.priority.as_deref().unwrap_or("medium");
    let status = body.status.as_deref().unwrap_or("open");

    let mut tx = state.pool.begin().await?;

    let row = sqlx::query_as::<_, TaskRow>(
        r#"
        INSERT INTO tasks (id, board_id, column_id, position, title, summary, description, priority, status, start_date, due_date, created_by, version, icon)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0, $13)
        RETURNING *
        "#,
    )
    .bind(task_id)
    .bind(board_id)
    .bind(body.column_id)
    .bind(position)
    .bind(&body.title)
    .bind(&body.summary)
    .bind(&body.description)
    .bind(priority)
    .bind(status)
    .bind(body.start_date)
    .bind(body.due_date)
    .bind(user.user_id)
    .bind(body.icon.as_deref())
    .fetch_one(&mut *tx)
    .await?;

    // Activity log
    insert_activity(
        &mut tx,
        board_id,
        Some(task_id),
        user.user_id,
        "task.created",
        serde_json::json!({ "task_id": task_id, "title": body.title }),
    )
    .await?;

    tx.commit().await?;

    let resp = serde_json::json!({
        "id": row.id,
        "board_id": row.board_id,
        "column_id": row.column_id,
        "position": row.position,
        "title": row.title,
        "summary": row.summary,
        "description": row.description,
        "priority": row.priority,
        "status": row.status,
        "start_date": row.start_date,
        "due_date": row.due_date,
        "icon": row.icon,
        "created_by": row.created_by,
        "version": row.version,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    });

    let (etag_name, etag_val) = etag_header(row.version);
    Ok((StatusCode::CREATED, [(etag_name, etag_val)], Json(resp)))
}

// ---------------------------------------------------------------------------
// S-017: GET /api/tasks/:id
// ---------------------------------------------------------------------------

pub async fn get_task(
    State(state): State<AppState>,
    user: AuthnUser,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let task = sqlx::query_as::<_, TaskRow>(
        "SELECT * FROM tasks WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Task".into()))?;

    // Authz: Task Read
    check_board_permission(&state.pool, &user, task.board_id, Action::Read, ResourceType::Task).await?;

    // Labels
    let labels: Vec<LabelInfo> = sqlx::query_as::<_, (Uuid, String, String)>(
        "SELECT l.id, l.name, l.color FROM labels l JOIN task_labels tl ON tl.label_id = l.id WHERE tl.task_id = $1",
    )
    .bind(id)
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|(lid, name, color)| LabelInfo { id: lid, name, color })
    .collect();

    // Assignees (with department names joined in)
    let assignees = fetch_assignees_for_task(&state.pool, id).await?;

    // Checklist summary
    let (cl_total, cl_checked): (i64, i64) = sqlx::query_as(
        r#"
        SELECT COALESCE(COUNT(*), 0), COALESCE(COUNT(*) FILTER (WHERE ci.checked = true), 0)
        FROM task_checklist_items ci
        JOIN task_checklists c ON c.id = ci.checklist_id
        WHERE c.task_id = $1
        "#,
    )
    .bind(id)
    .fetch_one(&state.pool)
    .await?;

    // Comment count
    let (comment_count,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM comments WHERE task_id = $1 AND deleted_at IS NULL",
    )
    .bind(id)
    .fetch_one(&state.pool)
    .await?;

    let dto = TaskDto {
        id: task.id,
        board_id: task.board_id,
        column_id: task.column_id,
        position: task.position,
        title: task.title,
        summary: task.summary,
        description: task.description,
        priority: task.priority,
        status: task.status,
        start_date: task.start_date,
        due_date: task.due_date,
        icon: task.icon,
        created_by: task.created_by,
        version: task.version,
        created_at: task.created_at,
        updated_at: task.updated_at,
        labels,
        assignees,
        checklist_summary: ChecklistSummary {
            total: cl_total,
            checked: cl_checked,
        },
        comment_count,
    };

    let (etag_name, etag_val) = etag_header(task.version);
    Ok(([(etag_name, etag_val)], Json(dto)))
}

// ---------------------------------------------------------------------------
// S-017: PATCH /api/tasks/:id
// ---------------------------------------------------------------------------

pub async fn patch_task(
    State(state): State<AppState>,
    user: AuthnUser,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Json(body): Json<PatchTaskRequest>,
) -> Result<impl IntoResponse, AppError> {
    // Authz: Task Update (fetch board_id first)
    let authz_board_id = crate::authz::check::fetch_task_board_id(&state.pool, id).await?;
    check_board_permission(&state.pool, &user, authz_board_id, Action::Update, ResourceType::Task).await?;

    let expected_version = extract_version(&headers, body.version)?;

    // Reject column_id or position in patch body
    if body.column_id.is_some() || body.position.is_some() {
        return Err(AppError::ColumnMovNotAllowed);
    }

    // Validate title if provided
    if let Some(ref t) = body.title {
        if t.is_empty() || t.len() > 255 {
            return Err(AppError::InvalidInput(
                "title must be between 1 and 255 characters".into(),
            ));
        }
    }

    // Validate description if provided
    if let Some(ref d) = body.description {
        if d.len() > 65536 {
            return Err(AppError::InvalidInput(
                "description must not exceed 64KB".into(),
            ));
        }
    }

    // Validate summary if provided
    if let Some(ref s) = body.summary {
        if s.chars().count() > 256 {
            return Err(AppError::InvalidInput(
                "summary must not exceed 256 characters".into(),
            ));
        }
    }

    // Validate priority if provided
    if let Some(ref p) = body.priority {
        match p.as_str() {
            "low" | "medium" | "high" | "urgent" => {}
            _ => {
                return Err(AppError::InvalidInput(
                    "priority must be 'low', 'medium', 'high', or 'urgent'".into(),
                ));
            }
        }
    }

    // Validate status if provided
    if let Some(ref s) = body.status {
        match s.as_str() {
            "open" | "in_progress" | "done" | "archived" => {}
            _ => {
                return Err(AppError::InvalidInput(
                    "status must be 'open', 'in_progress', 'done', or 'archived'".into(),
                ));
            }
        }
    }

    // Icon three-way resolution. Mirrors the column `color` pattern in
    // patch_column: an (apply_flag, value) pair lets the UPDATE `CASE WHEN`
    // clear, overwrite, or leave alone without a second query.
    if let Some(Some(ref s)) = body.icon {
        let len = s.len();
        if len == 0 || len > 16 {
            return Err(AppError::InvalidInput(
                "icon must be 1–16 bytes (a single emoji)".into(),
            ));
        }
    }
    let apply_icon = body.icon.is_some();
    let icon_value: Option<String> = body.icon.as_ref().and_then(|o| o.clone());

    let mut tx = state.pool.begin().await?;

    // Build changed_fields for activity log
    let mut changed_fields = Vec::new();
    if body.title.is_some() {
        changed_fields.push("title");
    }
    if body.summary.is_some() {
        changed_fields.push("summary");
    }
    if body.description.is_some() {
        changed_fields.push("description");
    }
    if body.priority.is_some() {
        changed_fields.push("priority");
    }
    if body.status.is_some() {
        changed_fields.push("status");
    }
    if body.start_date.is_some() {
        changed_fields.push("start_date");
    }
    if body.due_date.is_some() {
        changed_fields.push("due_date");
    }
    if apply_icon {
        changed_fields.push("icon");
    }

    // We need to handle Option<Option<DateTime>> for start_date and due_date.
    // If outer Option is None -> no change (COALESCE keeps current).
    // If outer Option is Some(None) -> set to NULL.
    // If outer Option is Some(Some(val)) -> set to val.
    //
    // We use a two-query approach: first update scalar fields with COALESCE,
    // then set nullable date fields explicitly if requested.

    let updated = sqlx::query_as::<_, TaskRow>(
        r#"
        UPDATE tasks
        SET title = COALESCE($2, title),
            summary = COALESCE($3, summary),
            description = COALESCE($4, description),
            priority = COALESCE($5, priority),
            status = COALESCE($6, status),
            icon = CASE WHEN $8 THEN $9 ELSE icon END,
            version = version + 1,
            updated_at = now()
        WHERE id = $1 AND version = $7 AND deleted_at IS NULL
        RETURNING *
        "#,
    )
    .bind(id)
    .bind(&body.title)
    .bind(&body.summary)
    .bind(&body.description)
    .bind(&body.priority)
    .bind(&body.status)
    .bind(expected_version)
    .bind(apply_icon)
    .bind(icon_value.as_deref())
    .fetch_optional(&mut *tx)
    .await?;

    let row = match updated {
        Some(r) => r,
        None => {
            let current = sqlx::query_as::<_, TaskRow>(
                "SELECT * FROM tasks WHERE id = $1 AND deleted_at IS NULL",
            )
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;

            match current {
                None => return Err(AppError::NotFound("Task".into())),
                Some(c) => {
                    return Err(AppError::VersionConflict {
                        current_version: c.version,
                        current_resource: None,
                    });
                }
            }
        }
    };

    // Handle date fields that may need to be set to NULL
    let row = if body.start_date.is_some() || body.due_date.is_some() {
        // Determine final values
        let start = match &body.start_date {
            Some(v) => v.as_ref().copied(),       // Some(None) -> None, Some(Some(dt)) -> Some(dt)
            None => row.start_date,                 // keep current
        };
        let due = match &body.due_date {
            Some(v) => v.as_ref().copied(),
            None => row.due_date,
        };

        sqlx::query_as::<_, TaskRow>(
            r#"
            UPDATE tasks SET start_date = $2, due_date = $3 WHERE id = $1
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(start)
        .bind(due)
        .fetch_one(&mut *tx)
        .await?
    } else {
        row
    };

    // Reverse-sync (enum → custom field). Mirrors set_task_field_value's
    // forward sync (custom → enum) so the two storage layers stay coherent
    // regardless of which API surface a caller uses. The frontend no longer
    // sends `status`/`priority` to PATCH /tasks/:id (it edits via Custom
    // Fields), but external API consumers may, and we want the property
    // panel to show the same value in either case.
    //
    // Looks up the seeded built-in field by name on the task's board. If a
    // user deleted or renamed the field, the lookup misses and we silently
    // skip — the enum write already succeeded so legacy surfaces still work.
    if let Some(ref new_status) = body.status {
        if let Some(label) = status_enum_to_label(new_status) {
            mirror_to_custom_field(&mut tx, row.board_id, id, "Status", label).await?;
        }
    }
    if let Some(ref new_priority) = body.priority {
        if let Some(label) = priority_enum_to_label(new_priority) {
            mirror_to_custom_field(&mut tx, row.board_id, id, "Priority", label).await?;
        }
    }

    // Activity log
    insert_activity(
        &mut tx,
        row.board_id,
        Some(id),
        user.user_id,
        "task.updated",
        serde_json::json!({ "changed_fields": changed_fields }),
    )
    .await?;

    tx.commit().await?;

    let resp = serde_json::json!({
        "id": row.id,
        "board_id": row.board_id,
        "column_id": row.column_id,
        "position": row.position,
        "title": row.title,
        "summary": row.summary,
        "description": row.description,
        "priority": row.priority,
        "status": row.status,
        "start_date": row.start_date,
        "due_date": row.due_date,
        "created_by": row.created_by,
        "version": row.version,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    });

    let (etag_name, etag_val) = etag_header(row.version);
    Ok(([(etag_name, etag_val)], Json(resp)))
}

// ---------------------------------------------------------------------------
// S-017: DELETE /api/tasks/:id
// ---------------------------------------------------------------------------

pub async fn delete_task(
    State(state): State<AppState>,
    user: AuthnUser,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Query(query): Query<DeleteTaskQuery>,
) -> Result<impl IntoResponse, AppError> {
    // Authz: Task Delete
    let authz_board_id = crate::authz::check::fetch_task_board_id(&state.pool, id).await?;
    check_board_permission(&state.pool, &user, authz_board_id, Action::Delete, ResourceType::Task).await?;

    let expected_version = extract_version(&headers, query.version)?;

    let mut tx = state.pool.begin().await?;

    let updated = sqlx::query_as::<_, TaskRow>(
        r#"
        UPDATE tasks
        SET deleted_at = now(), version = version + 1, updated_at = now()
        WHERE id = $1 AND version = $2 AND deleted_at IS NULL
        RETURNING *
        "#,
    )
    .bind(id)
    .bind(expected_version)
    .fetch_optional(&mut *tx)
    .await?;

    let row = match updated {
        Some(r) => r,
        None => {
            let current = sqlx::query_as::<_, TaskRow>(
                "SELECT * FROM tasks WHERE id = $1 AND deleted_at IS NULL",
            )
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;

            match current {
                None => return Err(AppError::NotFound("Task".into())),
                Some(c) => {
                    return Err(AppError::VersionConflict {
                        current_version: c.version,
                        current_resource: None,
                    });
                }
            }
        }
    };

    insert_activity(
        &mut tx,
        row.board_id,
        Some(id),
        user.user_id,
        "task.deleted",
        serde_json::json!({ "task_id": id, "title": row.title }),
    )
    .await?;

    tx.commit().await?;

    Ok(StatusCode::NO_CONTENT)
}

// ===========================================================================
// S-018: Task Move
// ===========================================================================

pub async fn move_task(
    State(state): State<AppState>,
    user: AuthnUser,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Json(body): Json<MoveTaskRequest>,
) -> Result<impl IntoResponse, AppError> {
    // Authz: Task Update (move is an update operation)
    let authz_board_id = crate::authz::check::fetch_task_board_id(&state.pool, id).await?;
    check_board_permission(&state.pool, &user, authz_board_id, Action::Update, ResourceType::Task).await?;

    let expected_version = extract_version(&headers, body.version)?;

    let mut tx = state.pool.begin().await?;

    // Fetch current task state
    let current = sqlx::query_as::<_, TaskRow>(
        "SELECT * FROM tasks WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("Task".into()))?;

    if current.version != expected_version {
        return Err(AppError::VersionConflict {
            current_version: current.version,
            current_resource: None,
        });
    }

    let column_changed = body.column_id != current.column_id;
    let position_changed = (body.position - current.position).abs() > f64::EPSILON;

    // No-op case
    if !column_changed && !position_changed {
        let resp = serde_json::json!({
            "id": current.id,
            "board_id": current.board_id,
            "column_id": current.column_id,
            "position": current.position,
            "title": current.title,
            "description": current.description,
            "priority": current.priority,
            "status": current.status,
            "start_date": current.start_date,
            "due_date": current.due_date,
            "created_by": current.created_by,
            "version": current.version,
            "created_at": current.created_at,
            "updated_at": current.updated_at,
        });
        let (etag_name, etag_val) = etag_header(current.version);
        return Ok(([(etag_name, etag_val)], Json(resp)));
    }

    // Verify target column exists and belongs to same board
    if column_changed {
        let _target = sqlx::query_as::<_, BoardColumnRow>(
            "SELECT * FROM board_columns WHERE id = $1 AND board_id = $2",
        )
        .bind(body.column_id)
        .bind(current.board_id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| AppError::NotFound("Column".into()))?;
    }

    let row = sqlx::query_as::<_, TaskRow>(
        r#"
        UPDATE tasks
        SET column_id = $2, position = $3, version = version + 1, updated_at = now()
        WHERE id = $1 AND version = $4 AND deleted_at IS NULL
        RETURNING *
        "#,
    )
    .bind(id)
    .bind(body.column_id)
    .bind(body.position)
    .bind(expected_version)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::VersionConflict {
        current_version: current.version,
        current_resource: None,
    })?;

    // Position compaction: check gap < 1e-9 with neighbours in target column
    {
        let new_position = row.position;
        let target_column_id = row.column_id;
        let neighbors: Vec<(f64,)> = sqlx::query_as(
            "SELECT position FROM tasks WHERE column_id = $1 AND deleted_at IS NULL AND id != $2 ORDER BY ABS(position - $3) ASC LIMIT 2",
        )
        .bind(target_column_id)
        .bind(id)
        .bind(new_position)
        .fetch_all(&mut *tx)
        .await?;

        let needs_compact = neighbors
            .iter()
            .any(|(p,)| crate::collaboration::position::needs_compaction(*p, new_position));
        if needs_compact {
            crate::collaboration::position::compact_column_positions(
                &mut tx,
                row.board_id,
                target_column_id,
            )
            .await?;
        }
    }

    // Activity log
    let (action, payload) = if column_changed {
        (
            "task.moved_column",
            serde_json::json!({
                "from_column_id": current.column_id,
                "to_column_id": body.column_id,
                "from_position": current.position,
                "to_position": body.position,
            }),
        )
    } else {
        (
            "task.reordered",
            serde_json::json!({
                "column_id": current.column_id,
                "from_position": current.position,
                "to_position": body.position,
            }),
        )
    };

    insert_activity(
        &mut tx,
        row.board_id,
        Some(id),
        user.user_id,
        action,
        payload,
    )
    .await?;

    tx.commit().await?;

    let resp = serde_json::json!({
        "id": row.id,
        "board_id": row.board_id,
        "column_id": row.column_id,
        "position": row.position,
        "title": row.title,
        "summary": row.summary,
        "description": row.description,
        "priority": row.priority,
        "status": row.status,
        "start_date": row.start_date,
        "due_date": row.due_date,
        "created_by": row.created_by,
        "version": row.version,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    });

    let (etag_name, etag_val) = etag_header(row.version);
    Ok(([(etag_name, etag_val)], Json(resp)))
}

// ===========================================================================
// S-019: Sub-resources
// ===========================================================================

// ---------------------------------------------------------------------------
// S-019: POST /api/boards/:board_id/labels
// ---------------------------------------------------------------------------

pub async fn create_board_label(
    State(state): State<AppState>,
    user: AuthnUser,
    Path(board_id): Path<Uuid>,
    Json(body): Json<CreateBoardLabelRequest>,
) -> Result<impl IntoResponse, AppError> {
    // Authz: Board Update (label management is board-level)
    check_board_permission(&state.pool, &user, board_id, Action::Update, ResourceType::Board).await?;

    // Verify board exists
    let _board = sqlx::query_as::<_, BoardRow>(
        "SELECT * FROM boards WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(board_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Board".into()))?;

    let label_id = uuid7::now_v7();

    let mut tx = state.pool.begin().await?;

    let row = sqlx::query_as::<_, BoardLabelRow>(
        r#"
        INSERT INTO labels (id, board_id, name, color)
        VALUES ($1, $2, $3, $4)
        RETURNING *
        "#,
    )
    .bind(label_id)
    .bind(board_id)
    .bind(&body.name)
    .bind(&body.color)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| {
        if let sqlx::Error::Database(ref db_err) = e {
            if db_err.is_unique_violation() {
                return AppError::DuplicateEntry(
                    "Label with this name already exists on this board".into(),
                );
            }
        }
        AppError::from(e)
    })?;

    // Bump board version
    sqlx::query("UPDATE boards SET version = version + 1, updated_at = now() WHERE id = $1")
        .bind(board_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({
            "id": row.id,
            "board_id": row.board_id,
            "name": row.name,
            "color": row.color,
        })),
    ))
}

// ---------------------------------------------------------------------------
// S-019: GET /api/boards/:board_id/labels
// ---------------------------------------------------------------------------

pub async fn list_board_labels(
    State(state): State<AppState>,
    user: AuthnUser,
    Path(board_id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    // Authz: Board Read — anyone who can view the board can see its labels.
    check_board_permission(&state.pool, &user, board_id, Action::Read, ResourceType::Board).await?;

    let rows = sqlx::query_as::<_, BoardLabelRow>(
        "SELECT id, board_id, name, color FROM labels WHERE board_id = $1 ORDER BY name",
    )
    .bind(board_id)
    .fetch_all(&state.pool)
    .await?;

    let items: Vec<serde_json::Value> = rows
        .into_iter()
        .map(|r| {
            serde_json::json!({
                "id": r.id,
                "board_id": r.board_id,
                "name": r.name,
                "color": r.color,
            })
        })
        .collect();

    Ok(Json(serde_json::json!({ "items": items })))
}

// ---------------------------------------------------------------------------
// S-019: POST /api/tasks/:task_id/labels
// ---------------------------------------------------------------------------

pub async fn add_task_label(
    State(state): State<AppState>,
    user: AuthnUser,
    Path(task_id): Path<Uuid>,
    Json(body): Json<AddLabelRequest>,
) -> Result<impl IntoResponse, AppError> {
    // Authz: Task Update (adding label is task update)
    let authz_board_id = crate::authz::check::fetch_task_board_id(&state.pool, task_id).await?;
    check_board_permission(&state.pool, &user, authz_board_id, Action::Update, ResourceType::Task).await?;

    let mut tx = state.pool.begin().await?;

    // Fetch task (verify exists)
    let task = sqlx::query_as::<_, TaskRow>(
        "SELECT * FROM tasks WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(task_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("Task".into()))?;

    // Insert task_label
    sqlx::query("INSERT INTO task_labels (task_id, label_id) VALUES ($1, $2)")
        .bind(task_id)
        .bind(body.label_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            if let sqlx::Error::Database(ref db_err) = e {
                if db_err.is_unique_violation() {
                    return AppError::DuplicateEntry("duplicate_label".into());
                }
                if db_err.is_foreign_key_violation() {
                    return AppError::NotFound("Label".into());
                }
            }
            AppError::from(e)
        })?;

    // Bump task version
    sqlx::query("UPDATE tasks SET version = version + 1, updated_at = now() WHERE id = $1")
        .bind(task_id)
        .execute(&mut *tx)
        .await?;

    // Activity log
    insert_activity(
        &mut tx,
        task.board_id,
        Some(task_id),
        user.user_id,
        "task.label_added",
        serde_json::json!({ "label_id": body.label_id }),
    )
    .await?;

    tx.commit().await?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({ "task_id": task_id, "label_id": body.label_id })),
    ))
}

// ---------------------------------------------------------------------------
// S-019: DELETE /api/tasks/:task_id/labels/:label_id
// ---------------------------------------------------------------------------

pub async fn remove_task_label(
    State(state): State<AppState>,
    user: AuthnUser,
    Path((task_id, label_id)): Path<(Uuid, Uuid)>,
) -> Result<impl IntoResponse, AppError> {
    // Authz: Task Update (removing label is task update)
    let authz_board_id = crate::authz::check::fetch_task_board_id(&state.pool, task_id).await?;
    check_board_permission(&state.pool, &user, authz_board_id, Action::Update, ResourceType::Task).await?;

    let mut tx = state.pool.begin().await?;

    let task = sqlx::query_as::<_, TaskRow>(
        "SELECT * FROM tasks WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(task_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("Task".into()))?;

    let result = sqlx::query("DELETE FROM task_labels WHERE task_id = $1 AND label_id = $2")
        .bind(task_id)
        .bind(label_id)
        .execute(&mut *tx)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Task label".into()));
    }

    // Bump task version
    sqlx::query("UPDATE tasks SET version = version + 1, updated_at = now() WHERE id = $1")
        .bind(task_id)
        .execute(&mut *tx)
        .await?;

    insert_activity(
        &mut tx,
        task.board_id,
        Some(task_id),
        user.user_id,
        "task.label_removed",
        serde_json::json!({ "label_id": label_id }),
    )
    .await?;

    tx.commit().await?;

    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// S-019: POST /api/tasks/:task_id/assignees
// ---------------------------------------------------------------------------

pub async fn add_task_assignee(
    State(state): State<AppState>,
    user: AuthnUser,
    Path(task_id): Path<Uuid>,
    Json(body): Json<AddAssigneeRequest>,
) -> Result<impl IntoResponse, AppError> {
    // Authz: Task Update (assignee management)
    let authz_board_id = crate::authz::check::fetch_task_board_id(&state.pool, task_id).await?;
    check_board_permission(&state.pool, &user, authz_board_id, Action::Update, ResourceType::Task).await?;

    let mut tx = state.pool.begin().await?;

    let task = sqlx::query_as::<_, TaskRow>(
        "SELECT * FROM tasks WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(task_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("Task".into()))?;

    sqlx::query("INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2)")
        .bind(task_id)
        .bind(body.user_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            if let sqlx::Error::Database(ref db_err) = e {
                if db_err.is_unique_violation() {
                    return AppError::DuplicateEntry("duplicate_assignee".into());
                }
                if db_err.is_foreign_key_violation() {
                    return AppError::NotFound("User".into());
                }
            }
            AppError::from(e)
        })?;

    // Bump task version
    sqlx::query("UPDATE tasks SET version = version + 1, updated_at = now() WHERE id = $1")
        .bind(task_id)
        .execute(&mut *tx)
        .await?;

    insert_activity(
        &mut tx,
        task.board_id,
        Some(task_id),
        user.user_id,
        "task.assignee_added",
        serde_json::json!({ "user_id": body.user_id }),
    )
    .await?;

    tx.commit().await?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({ "task_id": task_id, "user_id": body.user_id })),
    ))
}

// ---------------------------------------------------------------------------
// S-019: DELETE /api/tasks/:task_id/assignees/:user_id
// ---------------------------------------------------------------------------

pub async fn remove_task_assignee(
    State(state): State<AppState>,
    user: AuthnUser,
    Path((task_id, target_user_id)): Path<(Uuid, Uuid)>,
) -> Result<impl IntoResponse, AppError> {
    // Authz: Task Update (assignee management)
    let authz_board_id = crate::authz::check::fetch_task_board_id(&state.pool, task_id).await?;
    check_board_permission(&state.pool, &user, authz_board_id, Action::Update, ResourceType::Task).await?;

    let mut tx = state.pool.begin().await?;

    let task = sqlx::query_as::<_, TaskRow>(
        "SELECT * FROM tasks WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(task_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("Task".into()))?;

    let result = sqlx::query("DELETE FROM task_assignees WHERE task_id = $1 AND user_id = $2")
        .bind(task_id)
        .bind(target_user_id)
        .execute(&mut *tx)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Task assignee".into()));
    }

    sqlx::query("UPDATE tasks SET version = version + 1, updated_at = now() WHERE id = $1")
        .bind(task_id)
        .execute(&mut *tx)
        .await?;

    insert_activity(
        &mut tx,
        task.board_id,
        Some(task_id),
        user.user_id,
        "task.assignee_removed",
        serde_json::json!({ "user_id": target_user_id }),
    )
    .await?;

    tx.commit().await?;

    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// GET /api/tasks/:task_id/checklists — list checklists with items
// ---------------------------------------------------------------------------

pub async fn list_checklists(
    State(state): State<AppState>,
    _user: AuthnUser,
    Path(task_id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    // Fetch checklists
    let checklists = sqlx::query_as::<_, ChecklistRow>(
        "SELECT * FROM task_checklists WHERE task_id = $1 ORDER BY created_at ASC",
    )
    .bind(task_id)
    .fetch_all(&state.pool)
    .await?;

    // Fetch all items for these checklists in one query
    let cl_ids: Vec<Uuid> = checklists.iter().map(|c| c.id).collect();
    let items = if !cl_ids.is_empty() {
        sqlx::query_as::<_, ChecklistItemRow>(
            "SELECT * FROM task_checklist_items WHERE checklist_id = ANY($1) ORDER BY position ASC, created_at ASC",
        )
        .bind(&cl_ids)
        .fetch_all(&state.pool)
        .await?
    } else {
        vec![]
    };

    // Group items by checklist
    let mut items_map: std::collections::HashMap<Uuid, Vec<&ChecklistItemRow>> = std::collections::HashMap::new();
    for item in &items {
        items_map.entry(item.checklist_id).or_default().push(item);
    }

    let result: Vec<serde_json::Value> = checklists
        .iter()
        .map(|cl| {
            let cl_items = items_map.get(&cl.id).cloned().unwrap_or_default();
            serde_json::json!({
                "id": cl.id,
                "task_id": cl.task_id,
                "title": cl.title,
                "created_at": cl.created_at,
                "items": cl_items.iter().map(|i| serde_json::json!({
                    "id": i.id,
                    "checklist_id": i.checklist_id,
                    "title": i.text,
                    "checked": i.checked,
                    "position": i.position,
                    "created_at": i.created_at,
                })).collect::<Vec<_>>(),
            })
        })
        .collect();

    Ok(Json(serde_json::json!({ "items": result })))
}

// ---------------------------------------------------------------------------
// S-019: POST /api/tasks/:task_id/checklists
// ---------------------------------------------------------------------------

pub async fn create_checklist(
    State(state): State<AppState>,
    user: AuthnUser,
    Path(task_id): Path<Uuid>,
    Json(body): Json<CreateChecklistRequest>,
) -> Result<impl IntoResponse, AppError> {
    // Authz: Task Update (checklist management)
    let authz_board_id = crate::authz::check::fetch_task_board_id(&state.pool, task_id).await?;
    check_board_permission(&state.pool, &user, authz_board_id, Action::Update, ResourceType::Task).await?;

    let mut tx = state.pool.begin().await?;

    // Verify task exists
    let _task = sqlx::query_as::<_, TaskRow>(
        "SELECT * FROM tasks WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(task_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("Task".into()))?;

    let cl_id = uuid7::now_v7();

    let row = sqlx::query_as::<_, ChecklistRow>(
        r#"
        INSERT INTO task_checklists (id, task_id, title)
        VALUES ($1, $2, $3)
        RETURNING *
        "#,
    )
    .bind(cl_id)
    .bind(task_id)
    .bind(&body.title)
    .fetch_one(&mut *tx)
    .await?;

    // Bump task version
    sqlx::query("UPDATE tasks SET version = version + 1, updated_at = now() WHERE id = $1")
        .bind(task_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({
            "id": row.id,
            "task_id": row.task_id,
            "title": row.title,
            "items": [],
        })),
    ))
}

// ---------------------------------------------------------------------------
// S-019: POST /api/tasks/:task_id/checklists/:cl_id/items
// ---------------------------------------------------------------------------

pub async fn add_checklist_item(
    State(state): State<AppState>,
    user: AuthnUser,
    Path((task_id, cl_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<AddChecklistItemRequest>,
) -> Result<impl IntoResponse, AppError> {
    // Authz: Task Update (checklist item management)
    let authz_board_id = crate::authz::check::fetch_task_board_id(&state.pool, task_id).await?;
    check_board_permission(&state.pool, &user, authz_board_id, Action::Update, ResourceType::Task).await?;

    let mut tx = state.pool.begin().await?;

    // Verify task exists
    let _task = sqlx::query_as::<_, TaskRow>(
        "SELECT * FROM tasks WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(task_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("Task".into()))?;

    // Verify checklist exists and belongs to task
    let _cl = sqlx::query_as::<_, ChecklistRow>(
        "SELECT * FROM task_checklists WHERE id = $1 AND task_id = $2",
    )
    .bind(cl_id)
    .bind(task_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("Checklist".into()))?;

    // Calculate position
    let (max_pos,): (Option<f64>,) = sqlx::query_as(
        "SELECT COALESCE(MAX(position), 0) FROM task_checklist_items WHERE checklist_id = $1",
    )
    .bind(cl_id)
    .fetch_one(&mut *tx)
    .await?;

    let position = max_pos.unwrap_or(0.0) + 1024.0;

    let item_id = uuid7::now_v7();
    let checked = body.checked.unwrap_or(false);

    let row = sqlx::query_as::<_, ChecklistItemRow>(
        r#"
        INSERT INTO task_checklist_items (id, checklist_id, text, checked, position)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        "#,
    )
    .bind(item_id)
    .bind(cl_id)
    .bind(&body.title)
    .bind(checked)
    .bind(position)
    .fetch_one(&mut *tx)
    .await?;

    // Bump task version
    sqlx::query("UPDATE tasks SET version = version + 1, updated_at = now() WHERE id = $1")
        .bind(task_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({
            "id": row.id,
            "checklist_id": row.checklist_id,
            "title": row.text,
            "checked": row.checked,
            "position": row.position,
            "created_at": row.created_at,
        })),
    ))
}

// ---------------------------------------------------------------------------
// S-019: PATCH /api/tasks/:task_id/checklists/:cl_id/items/:item_id
// ---------------------------------------------------------------------------

pub async fn patch_checklist_item(
    State(state): State<AppState>,
    user: AuthnUser,
    Path((task_id, cl_id, item_id)): Path<(Uuid, Uuid, Uuid)>,
    Json(body): Json<PatchChecklistItemRequest>,
) -> Result<impl IntoResponse, AppError> {
    // Authz: Task Update (checklist item update)
    let authz_board_id = crate::authz::check::fetch_task_board_id(&state.pool, task_id).await?;
    check_board_permission(&state.pool, &user, authz_board_id, Action::Update, ResourceType::Task).await?;

    let mut tx = state.pool.begin().await?;

    // Verify task
    let task = sqlx::query_as::<_, TaskRow>(
        "SELECT * FROM tasks WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(task_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("Task".into()))?;

    // Verify checklist belongs to task
    let _cl = sqlx::query_as::<_, ChecklistRow>(
        "SELECT * FROM task_checklists WHERE id = $1 AND task_id = $2",
    )
    .bind(cl_id)
    .bind(task_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("Checklist".into()))?;

    // Fetch current item to detect checked change
    let current_item = sqlx::query_as::<_, ChecklistItemRow>(
        "SELECT * FROM task_checklist_items WHERE id = $1 AND checklist_id = $2",
    )
    .bind(item_id)
    .bind(cl_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("Checklist item".into()))?;

    let row = sqlx::query_as::<_, ChecklistItemRow>(
        r#"
        UPDATE task_checklist_items
        SET text = COALESCE($2, text),
            checked = COALESCE($3, checked)
        WHERE id = $1 AND checklist_id = $4
        RETURNING *
        "#,
    )
    .bind(item_id)
    .bind(&body.title)
    .bind(body.checked)
    .bind(cl_id)
    .fetch_one(&mut *tx)
    .await?;

    // Bump task version
    sqlx::query("UPDATE tasks SET version = version + 1, updated_at = now() WHERE id = $1")
        .bind(task_id)
        .execute(&mut *tx)
        .await?;

    // Activity log if checked changed
    if let Some(new_checked) = body.checked {
        if new_checked != current_item.checked {
            insert_activity(
                &mut tx,
                task.board_id,
                Some(task_id),
                user.user_id,
                "task.checklist_item_toggled",
                serde_json::json!({
                    "checklist_id": cl_id,
                    "item_id": item_id,
                    "checked": new_checked,
                }),
            )
            .await?;
        }
    }

    tx.commit().await?;

    Ok(Json(serde_json::json!({
        "id": row.id,
        "checklist_id": row.checklist_id,
        "title": row.text,
        "checked": row.checked,
        "position": row.position,
        "created_at": row.created_at,
    })))
}

// ===========================================================================
// S-020: Board Tasks Views
// ===========================================================================

pub async fn list_board_tasks(
    State(state): State<AppState>,
    user: AuthnUser,
    Path(board_id): Path<Uuid>,
    Query(query): Query<BoardTasksQuery>,
) -> Result<impl IntoResponse, AppError> {
    // Authz: Board Read
    check_board_permission(&state.pool, &user, board_id, Action::Read, ResourceType::Board).await?;

    // Verify board exists
    let _board = sqlx::query_as::<_, BoardRow>(
        "SELECT * FROM boards WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(board_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Board".into()))?;

    // Determine view type
    if query.from.is_some() && query.to.is_some() {
        // Calendar View
        let resp = calendar_view(&state, board_id, &query).await?;
        return Ok(Json(resp));
    }

    if query.group_by.as_deref() == Some("column") {
        // Board View (by_column)
        let resp = board_view(&state, board_id, &query).await?;
        return Ok(Json(resp));
    }

    // Table View (default)
    let resp = table_view(&state, board_id, &query).await?;
    Ok(Json(resp))
}

// ---------------------------------------------------------------------------
// Board View (group_by=column)
// ---------------------------------------------------------------------------

async fn board_view(
    state: &AppState,
    board_id: Uuid,
    query: &BoardTasksQuery,
) -> Result<serde_json::Value, AppError> {
    let limit = query.limit.clamp(1, 100);
    let fetch_limit = limit + 1;

    let cursor_data = if let Some(ref c) = query.cursor {
        let val = decode_cursor(c)?;
        let col_id: Uuid = val
            .get(0)
            .and_then(|v| v.as_str())
            .ok_or_else(|| AppError::InvalidInput("invalid_cursor".into()))?
            .parse()
            .map_err(|_| AppError::InvalidInput("invalid_cursor".into()))?;
        let pos: f64 = val
            .get(1)
            .and_then(|v| v.as_f64())
            .ok_or_else(|| AppError::InvalidInput("invalid_cursor".into()))?;
        let tid: Uuid = val
            .get(2)
            .and_then(|v| v.as_str())
            .ok_or_else(|| AppError::InvalidInput("invalid_cursor".into()))?
            .parse()
            .map_err(|_| AppError::InvalidInput("invalid_cursor".into()))?;
        Some((col_id, pos, tid))
    } else {
        None
    };

    let rows: Vec<TaskRow> = match cursor_data {
        Some((col_id, pos, tid)) => {
            sqlx::query_as::<_, TaskRow>(
                r#"
                SELECT * FROM tasks
                WHERE board_id = $1 AND deleted_at IS NULL
                  AND (column_id, position, id) > ($2, $3, $4)
                ORDER BY column_id ASC, position ASC, id ASC
                LIMIT $5
                "#,
            )
            .bind(board_id)
            .bind(col_id)
            .bind(pos)
            .bind(tid)
            .bind(fetch_limit)
            .fetch_all(&state.pool)
            .await?
        }
        None => {
            sqlx::query_as::<_, TaskRow>(
                r#"
                SELECT * FROM tasks
                WHERE board_id = $1 AND deleted_at IS NULL
                ORDER BY column_id ASC, position ASC, id ASC
                LIMIT $2
                "#,
            )
            .bind(board_id)
            .bind(fetch_limit)
            .fetch_all(&state.pool)
            .await?
        }
    };

    let mut rows = rows;
    let has_more = rows.len() > limit as usize;
    if has_more {
        rows.pop();
    }

    let next_cursor = if has_more {
        let last = rows.last().unwrap();
        Some(encode_cursor(&serde_json::json!([
            last.column_id.to_string(),
            last.position,
            last.id.to_string(),
        ])))
    } else {
        None
    };

    let dtos = enrich_tasks(&state.pool, rows).await?;
    Ok(serde_json::to_value(PaginatedResponse::new(dtos, next_cursor)).unwrap())
}

// ---------------------------------------------------------------------------
// Table View (default)
// ---------------------------------------------------------------------------

async fn table_view(
    state: &AppState,
    board_id: Uuid,
    query: &BoardTasksQuery,
) -> Result<serde_json::Value, AppError> {
    let limit = query.limit.clamp(1, 100);
    let fetch_limit = limit + 1;

    let sort_col = match query.sort.as_deref() {
        Some("updated_at") => "updated_at",
        Some("priority") => "priority",
        Some("due_date") => "due_date",
        Some("title") => "title",
        _ => "created_at", // default
    };

    let order = match query.order.as_deref() {
        Some("asc") => "ASC",
        _ => "DESC", // default
    };

    // Build dynamic SQL for table view with filters
    // We use a parameterized approach with optional filters.
    let mut sql = String::from(
        "SELECT * FROM tasks WHERE board_id = $1 AND deleted_at IS NULL",
    );

    let mut param_idx = 2u32;

    // We'll collect bind values as we go. Due to sqlx's strong typing,
    // we build the query dynamically and bind parameters.
    let priority_filter = query.priority.as_deref();
    let status_filter = query.status.as_deref();
    let assignee_filter = query.assignee;

    if priority_filter.is_some() {
        sql.push_str(&format!(" AND priority = ${param_idx}"));
        param_idx += 1;
    }

    if status_filter.is_some() {
        sql.push_str(&format!(" AND status = ${param_idx}"));
        param_idx += 1;
    }

    if assignee_filter.is_some() {
        sql.push_str(&format!(
            " AND id IN (SELECT task_id FROM task_assignees WHERE user_id = ${param_idx})"
        ));
        param_idx += 1;
    }

    // Cursor-based pagination for table view
    // For simplicity, use (sort_col, id) composite cursor
    let cursor_data = if let Some(ref c) = query.cursor {
        let val = decode_cursor(c)?;
        let cursor_sort = val
            .get(0)
            .and_then(|v| v.as_str())
            .ok_or_else(|| AppError::InvalidInput("invalid_cursor".into()))?
            .to_string();
        let cursor_id: Uuid = val
            .get(1)
            .and_then(|v| v.as_str())
            .ok_or_else(|| AppError::InvalidInput("invalid_cursor".into()))?
            .parse()
            .map_err(|_| AppError::InvalidInput("invalid_cursor".into()))?;
        Some((cursor_sort, cursor_id))
    } else {
        None
    };

    if let Some(ref _cd) = cursor_data {
        let cmp = if order == "ASC" { ">" } else { "<" };
        sql.push_str(&format!(
            " AND ({sort_col}, id) {cmp} (${param_idx}, ${})",
            param_idx + 1
        ));
        param_idx += 2;
    }

    sql.push_str(&format!(" ORDER BY {sort_col} {order}, id {order}"));
    sql.push_str(&format!(" LIMIT ${param_idx}"));

    // Build the query with dynamic bindings
    let mut q = sqlx::query_as::<_, TaskRow>(&sql).bind(board_id);

    if let Some(p) = priority_filter {
        q = q.bind(p.to_string());
    }
    if let Some(s) = status_filter {
        q = q.bind(s.to_string());
    }
    if let Some(a) = assignee_filter {
        q = q.bind(a);
    }
    if let Some(ref cd) = cursor_data {
        q = q.bind(&cd.0);
        q = q.bind(cd.1);
    }
    q = q.bind(fetch_limit);

    let mut rows: Vec<TaskRow> = q.fetch_all(&state.pool).await?;

    let has_more = rows.len() > limit as usize;
    if has_more {
        rows.pop();
    }

    let next_cursor = if has_more {
        let last = rows.last().unwrap();
        let sort_value = match sort_col {
            "updated_at" => last.updated_at.to_rfc3339(),
            "priority" => last.priority.clone(),
            "due_date" => last
                .due_date
                .map(|d| d.to_rfc3339())
                .unwrap_or_default(),
            "title" => last.title.clone(),
            _ => last.created_at.to_rfc3339(), // created_at
        };
        Some(encode_cursor(&serde_json::json!([
            sort_value,
            last.id.to_string(),
        ])))
    } else {
        None
    };

    let dtos = enrich_tasks(&state.pool, rows).await?;
    Ok(serde_json::to_value(PaginatedResponse::new(dtos, next_cursor)).unwrap())
}

// ---------------------------------------------------------------------------
// Calendar View (from + to)
// ---------------------------------------------------------------------------

async fn calendar_view(
    state: &AppState,
    board_id: Uuid,
    query: &BoardTasksQuery,
) -> Result<serde_json::Value, AppError> {
    let from = query.from.unwrap();
    let to = query.to.unwrap();
    let include_unscheduled = query.include_unscheduled.unwrap_or(false);

    let rows: Vec<TaskRow> = sqlx::query_as::<_, TaskRow>(
        r#"
        SELECT * FROM tasks
        WHERE board_id = $1 AND deleted_at IS NULL
          AND (
              (start_date IS NOT NULL AND start_date <= $3
                 AND (due_date >= $2 OR due_date IS NULL))
           OR (start_date IS NULL AND due_date IS NOT NULL
                 AND due_date BETWEEN $2 AND $3)
           OR ($4 AND start_date IS NULL AND due_date IS NULL)
          )
        ORDER BY COALESCE(start_date, due_date, created_at) ASC
        "#,
    )
    .bind(board_id)
    .bind(from)
    .bind(to)
    .bind(include_unscheduled)
    .fetch_all(&state.pool)
    .await?;

    if rows.len() > 500 {
        return Err(AppError::ResultTooLarge {
            count: rows.len(),
            limit: 500,
        });
    }

    let mut scheduled = Vec::new();
    let mut unscheduled = Vec::new();

    for row in rows {
        if row.start_date.is_none() && row.due_date.is_none() {
            unscheduled.push(row);
        } else {
            scheduled.push(row);
        }
    }

    Ok(serde_json::to_value(CalendarResponse {
        scheduled,
        unscheduled,
    }).unwrap())
}

// ---------------------------------------------------------------------------
// Enrich TaskRow → TaskDto (batch labels, assignees, checklist, comments)
// ---------------------------------------------------------------------------

async fn enrich_tasks(
    pool: &sqlx::PgPool,
    rows: Vec<TaskRow>,
) -> Result<Vec<TaskDto>, AppError> {
    if rows.is_empty() {
        return Ok(vec![]);
    }

    let task_ids: Vec<Uuid> = rows.iter().map(|r| r.id).collect();

    // Batch-fetch labels
    let label_rows: Vec<(Uuid, Uuid, String, String)> = sqlx::query_as(
        "SELECT tl.task_id, l.id, l.name, l.color FROM labels l JOIN task_labels tl ON tl.label_id = l.id WHERE tl.task_id = ANY($1)",
    )
    .bind(&task_ids)
    .fetch_all(pool)
    .await?;

    let mut labels_map: std::collections::HashMap<Uuid, Vec<LabelInfo>> = std::collections::HashMap::new();
    for (task_id, lid, name, color) in label_rows {
        labels_map.entry(task_id).or_default().push(LabelInfo { id: lid, name, color });
    }

    // Batch-fetch assignees with department names (LEFT JOIN + ARRAY_AGG).
    // `FILTER (WHERE d.id IS NOT NULL)` keeps the array empty instead of
    // {NULL} when a user has no department memberships.
    let assignee_rows: Vec<(Uuid, Uuid, String, String, Vec<String>)> = sqlx::query_as(
        r#"
        SELECT ta.task_id, u.id, u.name, u.email,
               COALESCE(
                   ARRAY_AGG(d.name ORDER BY d.name) FILTER (WHERE d.id IS NOT NULL),
                   ARRAY[]::TEXT[]
               ) AS department_names
        FROM users u
        JOIN task_assignees ta ON ta.user_id = u.id
        LEFT JOIN department_members dm ON dm.user_id = u.id
        LEFT JOIN departments d ON d.id = dm.department_id
        WHERE ta.task_id = ANY($1)
        GROUP BY ta.task_id, u.id, u.name, u.email
        "#,
    )
    .bind(&task_ids)
    .fetch_all(pool)
    .await?;

    let mut assignees_map: std::collections::HashMap<Uuid, Vec<AssigneeInfo>> = std::collections::HashMap::new();
    for (task_id, uid, name, email, department_names) in assignee_rows {
        assignees_map.entry(task_id).or_default().push(AssigneeInfo {
            id: uid,
            name,
            email,
            department_names,
        });
    }

    // Batch-fetch checklist summaries
    let cl_rows: Vec<(Uuid, i64, i64)> = sqlx::query_as(
        r#"
        SELECT c.task_id, COUNT(ci.id), COUNT(ci.id) FILTER (WHERE ci.checked = true)
        FROM task_checklists c
        JOIN task_checklist_items ci ON ci.checklist_id = c.id
        WHERE c.task_id = ANY($1)
        GROUP BY c.task_id
        "#,
    )
    .bind(&task_ids)
    .fetch_all(pool)
    .await?;

    let mut cl_map: std::collections::HashMap<Uuid, (i64, i64)> = std::collections::HashMap::new();
    for (task_id, total, checked) in cl_rows {
        cl_map.insert(task_id, (total, checked));
    }

    // Batch-fetch comment counts
    let comment_rows: Vec<(Uuid, i64)> = sqlx::query_as(
        "SELECT task_id, COUNT(*) FROM comments WHERE task_id = ANY($1) AND deleted_at IS NULL GROUP BY task_id",
    )
    .bind(&task_ids)
    .fetch_all(pool)
    .await?;

    let mut comment_map: std::collections::HashMap<Uuid, i64> = std::collections::HashMap::new();
    for (task_id, count) in comment_rows {
        comment_map.insert(task_id, count);
    }

    let dtos = rows
        .into_iter()
        .map(|task| {
            let labels = labels_map.remove(&task.id).unwrap_or_default();
            let assignees = assignees_map.remove(&task.id).unwrap_or_default();
            let (cl_total, cl_checked) = cl_map.get(&task.id).copied().unwrap_or((0, 0));
            let comment_count = comment_map.get(&task.id).copied().unwrap_or(0);
            TaskDto {
                id: task.id,
                board_id: task.board_id,
                column_id: task.column_id,
                position: task.position,
                title: task.title,
                summary: task.summary,
                description: task.description,
                priority: task.priority,
                status: task.status,
                start_date: task.start_date,
                due_date: task.due_date,
                icon: task.icon,
                created_by: task.created_by,
                version: task.version,
                created_at: task.created_at,
                updated_at: task.updated_at,
                labels,
                assignees,
                checklist_summary: ChecklistSummary {
                    total: cl_total,
                    checked: cl_checked,
                },
                comment_count,
            }
        })
        .collect();

    Ok(dtos)
}

/// Fetch all assignees for a single task, including their department names.
/// Used by `get_task` for the single-task DTO; `enrich_tasks` uses an
/// ANY($1) batched equivalent.
async fn fetch_assignees_for_task(
    pool: &sqlx::PgPool,
    task_id: Uuid,
) -> Result<Vec<AssigneeInfo>, AppError> {
    let rows: Vec<(Uuid, String, String, Vec<String>)> = sqlx::query_as(
        r#"
        SELECT u.id, u.name, u.email,
               COALESCE(
                   ARRAY_AGG(d.name ORDER BY d.name) FILTER (WHERE d.id IS NOT NULL),
                   ARRAY[]::TEXT[]
               ) AS department_names
        FROM users u
        JOIN task_assignees ta ON ta.user_id = u.id
        LEFT JOIN department_members dm ON dm.user_id = u.id
        LEFT JOIN departments d ON d.id = dm.department_id
        WHERE ta.task_id = $1
        GROUP BY u.id, u.name, u.email
        ORDER BY u.name
        "#,
    )
    .bind(task_id)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(id, name, email, department_names)| AssigneeInfo {
            id,
            name,
            email,
            department_names,
        })
        .collect())
}

// ---------------------------------------------------------------------------
// Reverse sync (enum → custom field) — companion to set_task_field_value's
// forward sync. Used by patch_task to keep the seeded built-in Status /
// Priority custom fields in step with the legacy enum columns.
// ---------------------------------------------------------------------------

/// Map the canonical lower-case status enum value back to the human label
/// used in the seeded "Status" custom field's options. Returns None for
/// unknown values (e.g. caller-supplied junk that somehow passed validation),
/// causing the mirror to silently skip rather than poison the field with an
/// orphan label.
fn status_enum_to_label(value: &str) -> Option<&'static str> {
    match value {
        "open" => Some("Open"),
        "in_progress" => Some("In Progress"),
        "done" => Some("Done"),
        "archived" => Some("Archived"),
        _ => None,
    }
}

/// Same shape as `status_enum_to_label`, for priority.
fn priority_enum_to_label(value: &str) -> Option<&'static str> {
    match value {
        "urgent" => Some("Urgent"),
        "high" => Some("High"),
        "medium" => Some("Medium"),
        "low" => Some("Low"),
        _ => None,
    }
}

/// UPSERT a label into the task's `task_field_values` row for the named
/// built-in field on its board. No-op if the board no longer has that
/// field (user deleted it via BoardSettingsModal, or it was never seeded
/// for this board).
async fn mirror_to_custom_field(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    board_id: Uuid,
    task_id: Uuid,
    field_name: &str,
    label: &str,
) -> Result<(), AppError> {
    let row: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM board_custom_fields WHERE board_id = $1 AND name = $2",
    )
    .bind(board_id)
    .bind(field_name)
    .fetch_optional(&mut **tx)
    .await?;

    if let Some((field_id,)) = row {
        sqlx::query(
            r#"
            INSERT INTO task_field_values (task_id, field_id, value)
            VALUES ($1, $2, $3)
            ON CONFLICT (task_id, field_id) DO UPDATE
                SET value = EXCLUDED.value,
                    updated_at = now()
            "#,
        )
        .bind(task_id)
        .bind(field_id)
        .bind(serde_json::Value::String(label.to_string()))
        .execute(&mut **tx)
        .await?;
    }

    Ok(())
}
