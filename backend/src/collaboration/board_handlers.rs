use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use uuid::Uuid;

use crate::authz::authn::{AuthnUser, GlobalRole};
use crate::authz::check::{check_board_create_permission, check_board_permission};
use crate::authz::matrix::{Action, ResourceType};
use crate::collaboration::activity_helper::insert_activity;
use crate::collaboration::models::*;
use crate::http::error::AppError;
use crate::http::pagination::{decode_cursor, encode_cursor, PaginatedResponse};
use crate::http::version::{etag_header, extract_version};
use crate::infra::state::AppState;
use crate::infra::uuid7;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn validate_board_role(role: &str) -> Result<(), AppError> {
    match role {
        "BoardAdmin" | "BoardMember" | "BoardViewer" => Ok(()),
        _ => Err(AppError::InvalidInput(
            "role_in_board must be 'BoardAdmin', 'BoardMember', or 'BoardViewer'".into(),
        )),
    }
}

fn validate_department_ids(ids: &[Uuid]) -> Result<(), AppError> {
    if ids.is_empty() {
        return Err(AppError::BoardRequiresDepartment);
    }
    if ids.len() > 5 {
        return Err(AppError::BoardDepartmentLimitExceeded);
    }
    Ok(())
}

fn validate_description(desc: &Option<String>) -> Result<(), AppError> {
    if let Some(d) = desc {
        if d.len() > 8192 {
            return Err(AppError::DescriptionTooLong);
        }
    }
    Ok(())
}

/// Fetch department_ids for a board.
async fn fetch_board_department_ids(
    pool: &sqlx::PgPool,
    board_id: Uuid,
) -> Result<Vec<Uuid>, AppError> {
    let rows: Vec<(Uuid,)> =
        sqlx::query_as("SELECT department_id FROM board_departments WHERE board_id = $1")
            .bind(board_id)
            .fetch_all(pool)
            .await?;
    Ok(rows.into_iter().map(|(id,)| id).collect())
}

/// Fetch a non-deleted board or return 404.
async fn fetch_board(pool: &sqlx::PgPool, id: Uuid) -> Result<BoardRow, AppError> {
    sqlx::query_as::<_, BoardRow>(
        "SELECT * FROM boards WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Board".into()))
}

// ---------------------------------------------------------------------------
// S-013: POST /api/boards
// ---------------------------------------------------------------------------

pub async fn create_board(
    State(state): State<AppState>,
    user: AuthnUser,
    Query(query): Query<CreateBoardQuery>,
    Json(body): Json<CreateBoardRequest>,
) -> Result<impl IntoResponse, AppError> {
    // Authz: Board Create permission against the requested departments
    check_board_create_permission(&state.pool, &user, &body.department_ids).await?;

    // from_template -> materialize from template (S-023)
    if let Some(template_id) = query.from_template {
        validate_department_ids(&body.department_ids)?;
        let resp = crate::collaboration::template_handlers::materialize_from_template(
            &state,
            &user,
            template_id,
            Some(&body.title),
            &body.department_ids,
        )
        .await?;
        let (etag_name, etag_val) = etag_header(resp.version);
        return Ok((StatusCode::CREATED, [(etag_name, etag_val)], Json(resp)));
    }

    validate_department_ids(&body.department_ids)?;
    validate_description(&body.description)?;

    let board_id = uuid7::now_v7();
    let mut tx = state.pool.begin().await?;

    // Insert board
    let row = sqlx::query_as::<_, BoardRow>(
        r#"
        INSERT INTO boards (id, title, description, owner_id, version)
        VALUES ($1, $2, $3, $4, 0)
        RETURNING *
        "#,
    )
    .bind(board_id)
    .bind(&body.title)
    .bind(&body.description)
    .bind(user.user_id)
    .fetch_one(&mut *tx)
    .await?;

    // Insert board_departments
    for dept_id in &body.department_ids {
        sqlx::query(
            "INSERT INTO board_departments (board_id, department_id) VALUES ($1, $2)",
        )
        .bind(board_id)
        .bind(dept_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            if let sqlx::Error::Database(ref db_err) = e {
                if db_err.is_foreign_key_violation() {
                    return AppError::NotFound(format!("Department {dept_id}"));
                }
            }
            AppError::from(e)
        })?;
    }

    // Insert creator as BoardAdmin
    sqlx::query(
        "INSERT INTO board_members (user_id, board_id, role_in_board) VALUES ($1, $2, 'BoardAdmin')",
    )
    .bind(user.user_id)
    .bind(board_id)
    .execute(&mut *tx)
    .await?;

    // Activity log
    insert_activity(
        &mut tx,
        board_id,
        None,
        user.user_id,
        "board.created",
        serde_json::json!({ "title": body.title }),
    )
    .await?;

    tx.commit().await?;

    let resp = BoardResponse {
        id: row.id,
        title: row.title,
        description: row.description,
        owner_id: row.owner_id,
        department_ids: body.department_ids,
        version: row.version,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };

    let (etag_name, etag_val) = etag_header(row.version);
    Ok((StatusCode::CREATED, [(etag_name, etag_val)], Json(resp)))
}

// ---------------------------------------------------------------------------
// S-013: GET /api/boards
// ---------------------------------------------------------------------------

pub async fn list_boards(
    State(state): State<AppState>,
    user: AuthnUser,
    Query(query): Query<BoardsQuery>,
) -> Result<impl IntoResponse, AppError> {
    if query.limit < 1 || query.limit > 100 {
        return Err(AppError::InvalidInput(
            "limit must be between 1 and 100".into(),
        ));
    }

    // include_deleted is SystemAdmin only
    if query.include_deleted && !user.global_roles.contains(&GlobalRole::SystemAdmin) {
        return Err(AppError::PermissionDenied {
            action: "list_deleted_boards".into(),
            resource: "boards".into(),
        });
    }

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

    // Build query based on include_deleted and cursor
    let rows: Vec<BoardRow> = match (query.include_deleted, cursor_data) {
        (true, Some((ts, cid))) => {
            sqlx::query_as::<_, BoardRow>(
                r#"
                SELECT b.* FROM boards b
                WHERE (
                    b.id IN (SELECT board_id FROM board_members WHERE user_id = $1)
                    OR b.id IN (
                        SELECT bd.board_id FROM board_departments bd
                        JOIN department_members dm ON bd.department_id = dm.department_id
                        WHERE dm.user_id = $1
                    )
                )
                AND (b.created_at, b.id) < ($2, $3)
                ORDER BY b.created_at DESC, b.id DESC
                LIMIT $4
                "#,
            )
            .bind(user.user_id)
            .bind(ts)
            .bind(cid)
            .bind(fetch_limit)
            .fetch_all(&state.pool)
            .await?
        }
        (true, None) => {
            sqlx::query_as::<_, BoardRow>(
                r#"
                SELECT b.* FROM boards b
                WHERE (
                    b.id IN (SELECT board_id FROM board_members WHERE user_id = $1)
                    OR b.id IN (
                        SELECT bd.board_id FROM board_departments bd
                        JOIN department_members dm ON bd.department_id = dm.department_id
                        WHERE dm.user_id = $1
                    )
                )
                ORDER BY b.created_at DESC, b.id DESC
                LIMIT $2
                "#,
            )
            .bind(user.user_id)
            .bind(fetch_limit)
            .fetch_all(&state.pool)
            .await?
        }
        (false, Some((ts, cid))) => {
            sqlx::query_as::<_, BoardRow>(
                r#"
                SELECT b.* FROM boards b
                WHERE b.deleted_at IS NULL
                AND (
                    b.id IN (SELECT board_id FROM board_members WHERE user_id = $1)
                    OR b.id IN (
                        SELECT bd.board_id FROM board_departments bd
                        JOIN department_members dm ON bd.department_id = dm.department_id
                        WHERE dm.user_id = $1
                    )
                )
                AND (b.created_at, b.id) < ($2, $3)
                ORDER BY b.created_at DESC, b.id DESC
                LIMIT $4
                "#,
            )
            .bind(user.user_id)
            .bind(ts)
            .bind(cid)
            .bind(fetch_limit)
            .fetch_all(&state.pool)
            .await?
        }
        (false, None) => {
            sqlx::query_as::<_, BoardRow>(
                r#"
                SELECT b.* FROM boards b
                WHERE b.deleted_at IS NULL
                AND (
                    b.id IN (SELECT board_id FROM board_members WHERE user_id = $1)
                    OR b.id IN (
                        SELECT bd.board_id FROM board_departments bd
                        JOIN department_members dm ON bd.department_id = dm.department_id
                        WHERE dm.user_id = $1
                    )
                )
                ORDER BY b.created_at DESC, b.id DESC
                LIMIT $2
                "#,
            )
            .bind(user.user_id)
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

    let items: Vec<BoardSummary> = rows
        .iter()
        .map(|r| BoardSummary {
            id: r.id,
            title: r.title.clone(),
            description: r.description.clone(),
            owner_id: r.owner_id,
            version: r.version,
            created_at: r.created_at,
            updated_at: r.updated_at,
            deleted_at: r.deleted_at,
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
// S-013: GET /api/boards/:id
// ---------------------------------------------------------------------------

pub async fn get_board(
    State(state): State<AppState>,
    user: AuthnUser,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    // Authz: Board Read
    check_board_permission(&state.pool, &user, id, Action::Read, ResourceType::Board).await?;

    let board = fetch_board(&state.pool, id).await?;

    let dept_ids = fetch_board_department_ids(&state.pool, id).await?;

    let (member_count,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM board_members WHERE board_id = $1")
            .bind(id)
            .fetch_one(&state.pool)
            .await?;

    let (column_count,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM board_columns WHERE board_id = $1")
            .bind(id)
            .fetch_one(&state.pool)
            .await?;

    let detail = BoardDetail {
        id: board.id,
        title: board.title,
        description: board.description,
        owner_id: board.owner_id,
        department_ids: dept_ids,
        member_count,
        column_count,
        version: board.version,
        created_at: board.created_at,
        updated_at: board.updated_at,
    };

    let (etag_name, etag_val) = etag_header(board.version);
    Ok(([(etag_name, etag_val)], Json(detail)))
}

// ---------------------------------------------------------------------------
// S-013: PATCH /api/boards/:id
// ---------------------------------------------------------------------------

pub async fn patch_board(
    State(state): State<AppState>,
    user: AuthnUser,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    Json(body): Json<PatchBoardRequest>,
) -> Result<impl IntoResponse, AppError> {
    // Authz: Board Update
    check_board_permission(&state.pool, &user, id, Action::Update, ResourceType::Board).await?;

    let expected_version = extract_version(&headers, body.version)?;

    validate_description(&body.description)?;

    // Validate department_ids if provided
    if let Some(ref dept_ids) = body.department_ids {
        validate_department_ids(dept_ids)?;
    }

    let mut tx = state.pool.begin().await?;

    // Optimistic lock update
    let updated = sqlx::query_as::<_, BoardRow>(
        r#"
        UPDATE boards
        SET title = COALESCE($2, title),
            description = COALESCE($3, description),
            version = version + 1,
            updated_at = now()
        WHERE id = $1 AND version = $4 AND deleted_at IS NULL
        RETURNING *
        "#,
    )
    .bind(id)
    .bind(&body.title)
    .bind(&body.description)
    .bind(expected_version)
    .fetch_optional(&mut *tx)
    .await?;

    let row = match updated {
        Some(r) => r,
        None => {
            // Check if board exists to distinguish 404 vs 409
            let current = sqlx::query_as::<_, BoardRow>(
                "SELECT * FROM boards WHERE id = $1 AND deleted_at IS NULL",
            )
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;

            match current {
                None => return Err(AppError::NotFound("Board".into())),
                Some(c) => {
                    return Err(AppError::VersionConflict {
                        current_version: c.version,
                        current_resource: Some(serde_json::to_value(&c).unwrap_or_default()),
                    });
                }
            }
        }
    };

    // Update department_ids if provided
    if let Some(ref dept_ids) = body.department_ids {
        sqlx::query("DELETE FROM board_departments WHERE board_id = $1")
            .bind(id)
            .execute(&mut *tx)
            .await?;

        for dept_id in dept_ids {
            sqlx::query(
                "INSERT INTO board_departments (board_id, department_id) VALUES ($1, $2)",
            )
            .bind(id)
            .bind(dept_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                if let sqlx::Error::Database(ref db_err) = e {
                    if db_err.is_foreign_key_violation() {
                        return AppError::NotFound(format!("Department {dept_id}"));
                    }
                }
                AppError::from(e)
            })?;
        }
    }

    // Activity log
    insert_activity(
        &mut tx,
        id,
        None,
        user.user_id,
        "board.updated",
        serde_json::json!({
            "title": body.title,
            "description_changed": body.description.is_some(),
            "department_ids_changed": body.department_ids.is_some(),
        }),
    )
    .await?;

    tx.commit().await?;

    let dept_ids = fetch_board_department_ids(&state.pool, id).await?;

    let resp = BoardResponse {
        id: row.id,
        title: row.title,
        description: row.description,
        owner_id: row.owner_id,
        department_ids: dept_ids,
        version: row.version,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };

    let (etag_name, etag_val) = etag_header(row.version);
    Ok(([(etag_name, etag_val)], Json(resp)))
}

// ---------------------------------------------------------------------------
// S-013: DELETE /api/boards/:id
// ---------------------------------------------------------------------------

pub async fn delete_board(
    State(state): State<AppState>,
    user: AuthnUser,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    // Authz: Board Delete
    check_board_permission(&state.pool, &user, id, Action::Delete, ResourceType::Board).await?;

    let expected_version = extract_version(&headers, None)?;

    let result = sqlx::query(
        r#"
        UPDATE boards
        SET deleted_at = now(), version = version + 1, updated_at = now()
        WHERE id = $1 AND version = $2 AND deleted_at IS NULL
        "#,
    )
    .bind(id)
    .bind(expected_version)
    .execute(&state.pool)
    .await?;

    if result.rows_affected() == 0 {
        // Distinguish 404 vs 409
        let current = sqlx::query_as::<_, BoardRow>(
            "SELECT * FROM boards WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(id)
        .fetch_optional(&state.pool)
        .await?;

        match current {
            None => return Err(AppError::NotFound("Board".into())),
            Some(c) => {
                return Err(AppError::VersionConflict {
                    current_version: c.version,
                    current_resource: Some(serde_json::to_value(&c).unwrap_or_default()),
                });
            }
        }
    }

    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// S-014: POST /api/boards/:id/members
// ---------------------------------------------------------------------------

pub async fn add_board_member(
    State(state): State<AppState>,
    user: AuthnUser,
    Path(board_id): Path<Uuid>,
    Json(body): Json<AddBoardMemberRequest>,
) -> Result<impl IntoResponse, AppError> {
    // Authz: Board ManageMembers
    check_board_permission(&state.pool, &user, board_id, Action::ManageMembers, ResourceType::Board).await?;

    validate_board_role(&body.role_in_board)?;

    // Verify board exists
    let _board = fetch_board(&state.pool, board_id).await?;

    let mut tx = state.pool.begin().await?;

    let row = sqlx::query_as::<_, BoardMemberRow>(
        r#"
        INSERT INTO board_members (user_id, board_id, role_in_board)
        VALUES ($1, $2, $3)
        RETURNING *
        "#,
    )
    .bind(body.user_id)
    .bind(board_id)
    .bind(&body.role_in_board)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| {
        if let sqlx::Error::Database(ref db_err) = e {
            if db_err.is_unique_violation() {
                return AppError::DuplicateEntry(
                    "User is already a member of this board".into(),
                );
            }
            if db_err.is_foreign_key_violation() {
                return AppError::NotFound("User".into());
            }
        }
        AppError::from(e)
    })?;

    // Activity log
    insert_activity(
        &mut tx,
        board_id,
        None,
        user.user_id,
        "board.member_added",
        serde_json::json!({
            "added_user_id": body.user_id,
            "role_in_board": body.role_in_board,
        }),
    )
    .await?;

    tx.commit().await?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({
            "user_id": row.user_id,
            "board_id": row.board_id,
            "role_in_board": row.role_in_board,
            "added_at": row.added_at,
        })),
    ))
}

// ---------------------------------------------------------------------------
// S-014: GET /api/boards/:id/members
// ---------------------------------------------------------------------------

pub async fn list_board_members(
    State(state): State<AppState>,
    user: AuthnUser,
    Path(board_id): Path<Uuid>,
    Query(query): Query<BoardMembersQuery>,
) -> Result<impl IntoResponse, AppError> {
    // Authz: Board Read
    check_board_permission(&state.pool, &user, board_id, Action::Read, ResourceType::Board).await?;

    if query.limit < 1 || query.limit > 100 {
        return Err(AppError::InvalidInput(
            "limit must be between 1 and 100".into(),
        ));
    }

    // Verify board exists
    let _board = fetch_board(&state.pool, board_id).await?;

    let cursor_data = if let Some(ref c) = query.cursor {
        let val = decode_cursor(c)?;
        let ts = val
            .get(0)
            .and_then(|v| v.as_str())
            .ok_or_else(|| AppError::InvalidInput("invalid_cursor: missing timestamp".into()))?;
        let cursor_ts: chrono::DateTime<chrono::Utc> = ts
            .parse()
            .map_err(|_| AppError::InvalidInput("invalid_cursor: bad timestamp".into()))?;
        let cursor_uid: Uuid = val
            .get(1)
            .and_then(|v| v.as_str())
            .ok_or_else(|| AppError::InvalidInput("invalid_cursor: missing user_id".into()))?
            .parse()
            .map_err(|_| AppError::InvalidInput("invalid_cursor: bad user_id".into()))?;
        Some((cursor_ts, cursor_uid))
    } else {
        None
    };

    let fetch_limit = query.limit + 1;

    let rows: Vec<BoardMemberResponse> = match cursor_data {
        Some((ts, uid)) => {
            sqlx::query_as::<_, BoardMemberResponse>(
                r#"
                SELECT bm.user_id, bm.board_id, bm.role_in_board, bm.added_at,
                       u.name AS user_name, u.email AS user_email
                FROM board_members bm
                JOIN users u ON u.id = bm.user_id
                WHERE bm.board_id = $1
                  AND (bm.added_at, bm.user_id) > ($2, $3)
                ORDER BY bm.added_at ASC, bm.user_id ASC
                LIMIT $4
                "#,
            )
            .bind(board_id)
            .bind(ts)
            .bind(uid)
            .bind(fetch_limit)
            .fetch_all(&state.pool)
            .await?
        }
        None => {
            sqlx::query_as::<_, BoardMemberResponse>(
                r#"
                SELECT bm.user_id, bm.board_id, bm.role_in_board, bm.added_at,
                       u.name AS user_name, u.email AS user_email
                FROM board_members bm
                JOIN users u ON u.id = bm.user_id
                WHERE bm.board_id = $1
                ORDER BY bm.added_at ASC, bm.user_id ASC
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
    let has_more = rows.len() > query.limit as usize;
    if has_more {
        rows.pop();
    }

    let next_cursor = if has_more {
        let last = rows.last().unwrap();
        Some(encode_cursor(&serde_json::json!([
            last.added_at.to_rfc3339(),
            last.user_id.to_string(),
        ])))
    } else {
        None
    };

    Ok(Json(PaginatedResponse::new(rows, next_cursor)))
}

// ---------------------------------------------------------------------------
// S-014: DELETE /api/boards/:id/members/:user_id
// ---------------------------------------------------------------------------

pub async fn remove_board_member(
    State(state): State<AppState>,
    user: AuthnUser,
    Path((board_id, target_user_id)): Path<(Uuid, Uuid)>,
) -> Result<impl IntoResponse, AppError> {
    // Authz: Board ManageMembers
    check_board_permission(&state.pool, &user, board_id, Action::ManageMembers, ResourceType::Board).await?;

    let mut tx = state.pool.begin().await?;

    // Remove task_assignees for this user on this board
    sqlx::query(
        r#"
        DELETE FROM task_assignees
        WHERE user_id = $1
          AND task_id IN (SELECT id FROM tasks WHERE board_id = $2)
        "#,
    )
    .bind(target_user_id)
    .bind(board_id)
    .execute(&mut *tx)
    .await?;

    // Remove board membership
    let result = sqlx::query(
        "DELETE FROM board_members WHERE board_id = $1 AND user_id = $2",
    )
    .bind(board_id)
    .bind(target_user_id)
    .execute(&mut *tx)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Board member".into()));
    }

    // Activity log
    insert_activity(
        &mut tx,
        board_id,
        None,
        user.user_id,
        "board.member_removed",
        serde_json::json!({ "removed_user_id": target_user_id }),
    )
    .await?;

    tx.commit().await?;

    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// S-014: PATCH /api/boards/:id/members/:user_id
// ---------------------------------------------------------------------------

pub async fn patch_board_member(
    State(state): State<AppState>,
    user: AuthnUser,
    Path((board_id, target_user_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<PatchBoardMemberRequest>,
) -> Result<impl IntoResponse, AppError> {
    // Authz: Board ManageMembers
    check_board_permission(&state.pool, &user, board_id, Action::ManageMembers, ResourceType::Board).await?;

    validate_board_role(&body.role_in_board)?;

    let row = sqlx::query_as::<_, BoardMemberRow>(
        r#"
        UPDATE board_members
        SET role_in_board = $3
        WHERE board_id = $1 AND user_id = $2
        RETURNING *
        "#,
    )
    .bind(board_id)
    .bind(target_user_id)
    .bind(&body.role_in_board)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Board member".into()))?;

    Ok(Json(serde_json::json!({
        "user_id": row.user_id,
        "board_id": row.board_id,
        "role_in_board": row.role_in_board,
        "added_at": row.added_at,
    })))
}

// ---------------------------------------------------------------------------
// S-015: PUT /api/boards/:id/departments
// ---------------------------------------------------------------------------

pub async fn set_board_departments(
    State(state): State<AppState>,
    user: AuthnUser,
    Path(board_id): Path<Uuid>,
    headers: HeaderMap,
    Json(body): Json<SetBoardDepartmentsRequest>,
) -> Result<impl IntoResponse, AppError> {
    // Authz: Board Update (changing departments is an update operation)
    check_board_permission(&state.pool, &user, board_id, Action::Update, ResourceType::Board).await?;

    let expected_version = extract_version(&headers, body.version)?;
    validate_department_ids(&body.department_ids)?;

    let mut tx = state.pool.begin().await?;

    // Delete existing
    sqlx::query("DELETE FROM board_departments WHERE board_id = $1")
        .bind(board_id)
        .execute(&mut *tx)
        .await?;

    // Insert new
    for dept_id in &body.department_ids {
        sqlx::query(
            "INSERT INTO board_departments (board_id, department_id) VALUES ($1, $2)",
        )
        .bind(board_id)
        .bind(dept_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            if let sqlx::Error::Database(ref db_err) = e {
                if db_err.is_foreign_key_violation() {
                    return AppError::NotFound(format!("Department {dept_id}"));
                }
            }
            AppError::from(e)
        })?;
    }

    // Bump board version
    let updated = sqlx::query_as::<_, BoardRow>(
        r#"
        UPDATE boards
        SET version = version + 1, updated_at = now()
        WHERE id = $1 AND version = $2 AND deleted_at IS NULL
        RETURNING *
        "#,
    )
    .bind(board_id)
    .bind(expected_version)
    .fetch_optional(&mut *tx)
    .await?;

    let row = match updated {
        Some(r) => r,
        None => {
            let current = sqlx::query_as::<_, BoardRow>(
                "SELECT * FROM boards WHERE id = $1 AND deleted_at IS NULL",
            )
            .bind(board_id)
            .fetch_optional(&mut *tx)
            .await?;

            match current {
                None => return Err(AppError::NotFound("Board".into())),
                Some(c) => {
                    return Err(AppError::VersionConflict {
                        current_version: c.version,
                        current_resource: Some(serde_json::to_value(&c).unwrap_or_default()),
                    });
                }
            }
        }
    };

    tx.commit().await?;

    let (etag_name, etag_val) = etag_header(row.version);
    Ok((
        [(etag_name, etag_val)],
        Json(serde_json::json!({
            "board_id": board_id,
            "department_ids": body.department_ids,
            "version": row.version,
        })),
    ))
}

// ---------------------------------------------------------------------------
// S-015: GET /api/boards/:id/departments
// ---------------------------------------------------------------------------

pub async fn list_board_departments(
    State(state): State<AppState>,
    user: AuthnUser,
    Path(board_id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    // Authz: Board Read
    check_board_permission(&state.pool, &user, board_id, Action::Read, ResourceType::Board).await?;

    // Verify board exists
    let _board = fetch_board(&state.pool, board_id).await?;

    let items: Vec<BoardDepartmentResponse> = sqlx::query_as::<_, BoardDepartmentResponse>(
        r#"
        SELECT bd.department_id, d.name
        FROM board_departments bd
        JOIN departments d ON d.id = bd.department_id
        WHERE bd.board_id = $1
        "#,
    )
    .bind(board_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({ "items": items })))
}
