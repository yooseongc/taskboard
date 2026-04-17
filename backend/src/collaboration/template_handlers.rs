use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use uuid::Uuid;

use std::collections::HashSet;

use crate::authz::authn::{AuthnUser, GlobalRole};
use crate::authz::check::{check_board_permission, require_permission};
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

fn is_system_admin(user: &AuthnUser) -> bool {
    user.global_roles.contains(&GlobalRole::SystemAdmin)
}

fn is_admin(user: &AuthnUser) -> bool {
    user.global_roles.iter().any(|r| matches!(r,
        GlobalRole::SystemAdmin | GlobalRole::DepartmentAdmin
    ))
}

fn template_response(row: &TemplateRow) -> TemplateResponse {
    TemplateResponse {
        id: row.id,
        kind: row.kind.clone(),
        name: row.name.clone(),
        description: row.description.clone(),
        owner_id: row.owner_id,
        scope: row.scope.clone(),
        scope_ref_id: row.scope_ref_id,
        auto_enroll_members: row.auto_enroll_members,
        payload: row.payload.clone(),
        payload_version: row.payload_version,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

/// Validate template payload against S-028 JSON Schema rules.
/// Checks columns (required, 1..50, each with title 1..255), labels (optional,
/// max 100, name + #RRGGBB color), and default_tasks (optional, max 200,
/// title 1..255 + valid column_index).
fn validate_payload(payload: &serde_json::Value) -> Result<(), AppError> {
    let obj = payload
        .as_object()
        .ok_or_else(|| AppError::InvalidInput("payload must be an object".into()))?;

    // columns: required, array, 1..50
    let columns = obj
        .get("columns")
        .and_then(|v| v.as_array())
        .ok_or_else(|| {
            AppError::InvalidInput("payload.columns is required and must be an array".into())
        })?;
    if columns.is_empty() || columns.len() > 50 {
        return Err(AppError::InvalidInput(
            "payload.columns must have 1..50 items".into(),
        ));
    }
    for (i, col) in columns.iter().enumerate() {
        let title = col
            .get("title")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                AppError::InvalidInput(format!(
                    "payload.columns[{i}].title is required and must be a string"
                ))
            })?;
        if title.is_empty() || title.len() > 255 {
            return Err(AppError::InvalidInput(format!(
                "payload.columns[{i}].title must be 1..255 chars"
            )));
        }
    }

    // labels: optional, array, max 100
    if let Some(labels_val) = obj.get("labels") {
        let labels = labels_val.as_array().ok_or_else(|| {
            AppError::InvalidInput("payload.labels must be an array".into())
        })?;
        if labels.len() > 100 {
            return Err(AppError::InvalidInput(
                "payload.labels max 100 items".into(),
            ));
        }
        for (i, label) in labels.iter().enumerate() {
            label
                .get("name")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .ok_or_else(|| {
                    AppError::InvalidInput(format!("payload.labels[{i}].name is required"))
                })?;
            let color = label
                .get("color")
                .and_then(|v| v.as_str())
                .ok_or_else(|| {
                    AppError::InvalidInput(format!("payload.labels[{i}].color is required"))
                })?;
            // #RRGGBB format
            if !color.starts_with('#')
                || color.len() != 7
                || !color[1..].chars().all(|c| c.is_ascii_hexdigit())
            {
                return Err(AppError::InvalidInput(format!(
                    "payload.labels[{i}].color must be #RRGGBB format"
                )));
            }
        }
    }

    // default_tasks: optional, array, max 200
    if let Some(tasks_val) = obj.get("default_tasks") {
        let tasks = tasks_val.as_array().ok_or_else(|| {
            AppError::InvalidInput("payload.default_tasks must be an array".into())
        })?;
        if tasks.len() > 200 {
            return Err(AppError::InvalidInput(
                "payload.default_tasks max 200 items".into(),
            ));
        }
        let col_count = columns.len();
        for (i, task) in tasks.iter().enumerate() {
            let title = task
                .get("title")
                .and_then(|v| v.as_str())
                .ok_or_else(|| {
                    AppError::InvalidInput(format!(
                        "payload.default_tasks[{i}].title is required and must be a string"
                    ))
                })?;
            if title.is_empty() || title.len() > 255 {
                return Err(AppError::InvalidInput(format!(
                    "payload.default_tasks[{i}].title must be 1..255 chars"
                )));
            }
            let col_idx = task
                .get("column_index")
                .and_then(|v| v.as_u64())
                .ok_or_else(|| {
                    AppError::InvalidInput(format!(
                        "payload.default_tasks[{i}].column_index is required"
                    ))
                })?;
            if col_idx as usize >= col_count {
                return Err(AppError::InvalidInput(format!(
                    "payload.default_tasks[{i}].column_index ({col_idx}) out of range (0..{col_count})"
                )));
            }
        }
    }

    // custom_fields: optional, array, max 100
    if let Some(cf_val) = obj.get("custom_fields") {
        let cfs = cf_val.as_array().ok_or_else(|| {
            AppError::InvalidInput("payload.custom_fields must be an array".into())
        })?;
        if cfs.len() > 100 {
            return Err(AppError::InvalidInput(
                "payload.custom_fields max 100 items".into(),
            ));
        }
        let valid_types = ["text", "number", "select", "multi_select", "date", "checkbox", "url", "email", "phone", "person"];
        for (i, cf) in cfs.iter().enumerate() {
            cf.get("name")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .ok_or_else(|| {
                    AppError::InvalidInput(format!(
                        "payload.custom_fields[{i}].name is required"
                    ))
                })?;
            let ft = cf
                .get("field_type")
                .and_then(|v| v.as_str())
                .unwrap_or("text");
            if !valid_types.contains(&ft) {
                return Err(AppError::InvalidInput(format!(
                    "payload.custom_fields[{i}].field_type '{ft}' is not valid"
                )));
            }
        }
    }

    Ok(())
}

/// Check template permission based on scope.
/// Templates are not board-scoped, so we construct owning_depts from scope context.
async fn check_template_permission(
    pool: &sqlx::PgPool,
    user: &AuthnUser,
    action: Action,
    scope: &str,
    scope_ref_id: Option<Uuid>,
) -> Result<(), AppError> {
    let owning_depts: HashSet<Uuid> = match scope {
        "department" => {
            if let Some(ref_id) = scope_ref_id {
                [ref_id].into_iter().collect()
            } else {
                HashSet::new()
            }
        }
        "user" => {
            // User-scoped: use user's own departments as context
            user.department_ids.iter().copied().collect()
        }
        "global" => {
            // Global scope: empty owning_depts. Only SystemAdmin can write.
            HashSet::new()
        }
        _ => HashSet::new(),
    };
    require_permission(pool, user, action, ResourceType::Template, None, &owning_depts).await
}

// ---------------------------------------------------------------------------
// S-022: POST /api/templates
// ---------------------------------------------------------------------------

pub async fn create_template(
    State(state): State<AppState>,
    user: AuthnUser,
    Json(body): Json<CreateTemplateRequest>,
) -> Result<impl IntoResponse, AppError> {
    // Validate kind
    match body.kind.as_str() {
        "board" | "card" => {}
        _ => {
            return Err(AppError::InvalidInput(
                "kind must be 'board' or 'card'".into(),
            ));
        }
    }

    // Validate scope + scope_ref_id
    match body.scope.as_str() {
        "department" => {
            if body.scope_ref_id.is_none() {
                return Err(AppError::InvalidScope);
            }
        }
        "user" | "global" => {
            if body.scope_ref_id.is_some() {
                return Err(AppError::InvalidScope);
            }
        }
        _ => {
            return Err(AppError::InvalidInput(
                "scope must be 'user', 'department', or 'global'".into(),
            ));
        }
    }

    // Authz: Template Create
    check_template_permission(&state.pool, &user, Action::Create, &body.scope, body.scope_ref_id).await?;

    // scope="global" + auto_enroll_members=true -> SystemAdmin only
    let mut auto_enroll = body.auto_enroll_members.unwrap_or(false);
    if body.scope == "global" && auto_enroll && !is_system_admin(&user) {
        return Err(AppError::PermissionDenied {
            action: "create_global_auto_enroll_template".into(),
            resource: "templates".into(),
        });
    }

    // scope="user" + auto_enroll_members=true -> silently force false
    if body.scope == "user" && auto_enroll {
        auto_enroll = false;
    }

    // Validate payload
    validate_payload(&body.payload)?;

    let template_id = uuid7::now_v7();

    // We need a board_id for the activity log. Templates are not board-scoped,
    // so we use a nil UUID as placeholder. The activity_logs table has a FK
    // on board_id, so we cannot insert a nil UUID. Instead, skip activity log
    // for template creation (no board context).
    // Actually, looking at the activity_logs FK constraint, we cannot insert
    // a template.created activity without a valid board_id.
    // The spec says insert_activity("template.created", {}), but there's no
    // board context. We'll skip the activity log for template CRUD since
    // there is no associated board_id.

    let row = sqlx::query_as::<_, TemplateRow>(
        r#"
        INSERT INTO templates (id, kind, name, description, owner_id, scope, scope_ref_id, auto_enroll_members, payload, payload_version)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1)
        RETURNING *
        "#,
    )
    .bind(template_id)
    .bind(&body.kind)
    .bind(&body.name)
    .bind(&body.description)
    .bind(user.user_id)
    .bind(&body.scope)
    .bind(body.scope_ref_id)
    .bind(auto_enroll)
    .bind(&body.payload)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| {
        if let sqlx::Error::Database(ref db_err) = e {
            if db_err.is_foreign_key_violation() {
                return AppError::NotFound("Department (scope_ref_id)".into());
            }
        }
        AppError::from(e)
    })?;

    Ok((StatusCode::CREATED, Json(template_response(&row))))
}

// ---------------------------------------------------------------------------
// S-022: GET /api/templates
// ---------------------------------------------------------------------------

pub async fn list_templates(
    State(state): State<AppState>,
    user: AuthnUser,
    Query(query): Query<TemplatesQuery>,
) -> Result<impl IntoResponse, AppError> {
    if query.limit < 1 || query.limit > 100 {
        return Err(AppError::InvalidInput(
            "limit must be between 1 and 100".into(),
        ));
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

    // Build dynamic query based on scope filter.
    // MVP simplification: scope filter only; department access check is simplified.
    let rows: Vec<TemplateRow> = match (&query.scope, cursor_data) {
        (Some(scope), Some((ts, cid))) => {
            match scope.as_str() {
                "user" => {
                    sqlx::query_as::<_, TemplateRow>(
                        r#"
                        SELECT * FROM templates
                        WHERE scope = 'user' AND owner_id = $1 AND deleted_at IS NULL
                          AND (created_at, id) < ($2, $3)
                        ORDER BY created_at DESC, id DESC
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
                "department" => {
                    // Filter by scope_ref_id if provided, else show all dept templates user can access
                    match query.scope_ref_id {
                        Some(ref_id) => {
                            // Verify user belongs to this department
                            if !user.department_ids.contains(&ref_id) && !is_admin(&user) {
                                return Err(AppError::PermissionDenied {
                                    action: "list_department_templates".into(),
                                    resource: "templates".into(),
                                });
                            }
                            sqlx::query_as::<_, TemplateRow>(
                                r#"
                                SELECT * FROM templates
                                WHERE scope = 'department' AND scope_ref_id = $1 AND deleted_at IS NULL
                                  AND (created_at, id) < ($2, $3)
                                ORDER BY created_at DESC, id DESC
                                LIMIT $4
                                "#,
                            )
                            .bind(ref_id)
                            .bind(ts)
                            .bind(cid)
                            .bind(fetch_limit)
                            .fetch_all(&state.pool)
                            .await?
                        }
                        None => {
                            // All department templates the user can access
                            sqlx::query_as::<_, TemplateRow>(
                                r#"
                                SELECT * FROM templates
                                WHERE scope = 'department' AND scope_ref_id = ANY($1) AND deleted_at IS NULL
                                  AND (created_at, id) < ($2, $3)
                                ORDER BY created_at DESC, id DESC
                                LIMIT $4
                                "#,
                            )
                            .bind(&user.department_ids)
                            .bind(ts)
                            .bind(cid)
                            .bind(fetch_limit)
                            .fetch_all(&state.pool)
                            .await?
                        }
                    }
                }
                "global" => {
                    sqlx::query_as::<_, TemplateRow>(
                        r#"
                        SELECT * FROM templates
                        WHERE scope = 'global' AND deleted_at IS NULL
                          AND (created_at, id) < ($1, $2)
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
                _ => {
                    return Err(AppError::InvalidInput(
                        "scope must be 'user', 'department', or 'global'".into(),
                    ));
                }
            }
        }
        (Some(scope), None) => {
            match scope.as_str() {
                "user" => {
                    sqlx::query_as::<_, TemplateRow>(
                        r#"
                        SELECT * FROM templates
                        WHERE scope = 'user' AND owner_id = $1 AND deleted_at IS NULL
                        ORDER BY created_at DESC, id DESC
                        LIMIT $2
                        "#,
                    )
                    .bind(user.user_id)
                    .bind(fetch_limit)
                    .fetch_all(&state.pool)
                    .await?
                }
                "department" => {
                    match query.scope_ref_id {
                        Some(ref_id) => {
                            if !user.department_ids.contains(&ref_id) && !is_admin(&user) {
                                return Err(AppError::PermissionDenied {
                                    action: "list_department_templates".into(),
                                    resource: "templates".into(),
                                });
                            }
                            sqlx::query_as::<_, TemplateRow>(
                                r#"
                                SELECT * FROM templates
                                WHERE scope = 'department' AND scope_ref_id = $1 AND deleted_at IS NULL
                                ORDER BY created_at DESC, id DESC
                                LIMIT $2
                                "#,
                            )
                            .bind(ref_id)
                            .bind(fetch_limit)
                            .fetch_all(&state.pool)
                            .await?
                        }
                        None => {
                            sqlx::query_as::<_, TemplateRow>(
                                r#"
                                SELECT * FROM templates
                                WHERE scope = 'department' AND scope_ref_id = ANY($1) AND deleted_at IS NULL
                                ORDER BY created_at DESC, id DESC
                                LIMIT $2
                                "#,
                            )
                            .bind(&user.department_ids)
                            .bind(fetch_limit)
                            .fetch_all(&state.pool)
                            .await?
                        }
                    }
                }
                "global" => {
                    sqlx::query_as::<_, TemplateRow>(
                        r#"
                        SELECT * FROM templates
                        WHERE scope = 'global' AND deleted_at IS NULL
                        ORDER BY created_at DESC, id DESC
                        LIMIT $1
                        "#,
                    )
                    .bind(fetch_limit)
                    .fetch_all(&state.pool)
                    .await?
                }
                _ => {
                    return Err(AppError::InvalidInput(
                        "scope must be 'user', 'department', or 'global'".into(),
                    ));
                }
            }
        }
        (None, Some((ts, cid))) => {
            // No scope filter: return all accessible templates
            sqlx::query_as::<_, TemplateRow>(
                r#"
                SELECT * FROM templates
                WHERE deleted_at IS NULL
                  AND (
                    (scope = 'global')
                    OR (scope = 'user' AND owner_id = $1)
                    OR (scope = 'department' AND scope_ref_id = ANY($2))
                  )
                  AND (created_at, id) < ($3, $4)
                ORDER BY created_at DESC, id DESC
                LIMIT $5
                "#,
            )
            .bind(user.user_id)
            .bind(&user.department_ids)
            .bind(ts)
            .bind(cid)
            .bind(fetch_limit)
            .fetch_all(&state.pool)
            .await?
        }
        (None, None) => {
            sqlx::query_as::<_, TemplateRow>(
                r#"
                SELECT * FROM templates
                WHERE deleted_at IS NULL
                  AND (
                    (scope = 'global')
                    OR (scope = 'user' AND owner_id = $1)
                    OR (scope = 'department' AND scope_ref_id = ANY($2))
                  )
                ORDER BY created_at DESC, id DESC
                LIMIT $3
                "#,
            )
            .bind(user.user_id)
            .bind(&user.department_ids)
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

    let items: Vec<TemplateResponse> = rows.iter().map(|r| template_response(r)).collect();

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
// S-022: GET /api/templates/:id
// ---------------------------------------------------------------------------

pub async fn get_template(
    State(state): State<AppState>,
    user: AuthnUser,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let row = sqlx::query_as::<_, TemplateRow>(
        "SELECT * FROM templates WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Template".into()))?;

    // Authz: Template Read
    check_template_permission(&state.pool, &user, Action::Read, &row.scope, row.scope_ref_id).await?;

    Ok(Json(template_response(&row)))
}

// ---------------------------------------------------------------------------
// S-022: PATCH /api/templates/:id
// ---------------------------------------------------------------------------

pub async fn patch_template(
    State(state): State<AppState>,
    user: AuthnUser,
    Path(id): Path<Uuid>,
    Json(body): Json<PatchTemplateRequest>,
) -> Result<impl IntoResponse, AppError> {
    // Fetch existing template
    let existing = sqlx::query_as::<_, TemplateRow>(
        "SELECT * FROM templates WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Template".into()))?;

    // Authz: Template Update (matrix check replaces ad-hoc owner/admin check)
    check_template_permission(&state.pool, &user, Action::Update, &existing.scope, existing.scope_ref_id).await?;

    // Additional owner check for non-admin users
    if existing.owner_id != user.user_id && !is_admin(&user) {
        return Err(AppError::PermissionDenied {
            action: "update_template".into(),
            resource: "templates".into(),
        });
    }

    // Validate payload if provided
    if let Some(ref p) = body.payload {
        validate_payload(p)?;
    }

    // Build changed_fields for activity log
    let mut changed_fields = Vec::new();
    if body.name.is_some() {
        changed_fields.push("name");
    }
    if body.description.is_some() {
        changed_fields.push("description");
    }
    if body.payload.is_some() {
        changed_fields.push("payload");
    }
    if body.auto_enroll_members.is_some() {
        changed_fields.push("auto_enroll_members");
    }

    let row = sqlx::query_as::<_, TemplateRow>(
        r#"
        UPDATE templates
        SET name = COALESCE($2, name),
            description = COALESCE($3, description),
            payload = COALESCE($4, payload),
            auto_enroll_members = COALESCE($5, auto_enroll_members),
            updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING *
        "#,
    )
    .bind(id)
    .bind(&body.name)
    .bind(&body.description)
    .bind(&body.payload)
    .bind(body.auto_enroll_members)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(template_response(&row)))
}

// ---------------------------------------------------------------------------
// S-022: DELETE /api/templates/:id
// ---------------------------------------------------------------------------

pub async fn delete_template(
    State(state): State<AppState>,
    user: AuthnUser,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    // Fetch existing to check ownership
    let existing = sqlx::query_as::<_, TemplateRow>(
        "SELECT * FROM templates WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Template".into()))?;

    // Authz: Template Delete (matrix check replaces ad-hoc owner/admin check)
    check_template_permission(&state.pool, &user, Action::Delete, &existing.scope, existing.scope_ref_id).await?;

    // Additional owner check for non-admin users
    if existing.owner_id != user.user_id && !is_admin(&user) {
        return Err(AppError::PermissionDenied {
            action: "delete_template".into(),
            resource: "templates".into(),
        });
    }

    let result = sqlx::query(
        "UPDATE templates SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(id)
    .execute(&state.pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Template".into()));
    }

    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// S-024: GET /api/boards/:id/activity
// ---------------------------------------------------------------------------

pub async fn list_activity(
    State(state): State<AppState>,
    user: AuthnUser,
    Path(board_id): Path<Uuid>,
    Query(query): Query<PaginationQuery>,
) -> Result<impl IntoResponse, AppError> {
    // Authz: Board Read
    check_board_permission(&state.pool, &user, board_id, Action::Read, ResourceType::Board).await?;

    query.validate()?;

    // Verify board exists
    let _board = sqlx::query_as::<_, BoardRow>(
        "SELECT * FROM boards WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(board_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Board".into()))?;

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

    // Keyset pagination: created_at DESC, id DESC
    let rows: Vec<ActivityLogWithActor> = match cursor_data {
        Some((ts, cid)) => {
            sqlx::query_as::<_, ActivityLogWithActor>(
                r#"
                SELECT al.*, u.name AS actor_name
                FROM activity_logs al
                JOIN users u ON al.actor_id = u.id
                WHERE al.board_id = $1
                  AND (al.created_at, al.id) < ($2, $3)
                ORDER BY al.created_at DESC, al.id DESC
                LIMIT $4
                "#,
            )
            .bind(board_id)
            .bind(ts)
            .bind(cid)
            .bind(fetch_limit)
            .fetch_all(&state.pool)
            .await?
        }
        None => {
            sqlx::query_as::<_, ActivityLogWithActor>(
                r#"
                SELECT al.*, u.name AS actor_name
                FROM activity_logs al
                JOIN users u ON al.actor_id = u.id
                WHERE al.board_id = $1
                ORDER BY al.created_at DESC, al.id DESC
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

    let items: Vec<ActivityLogResponse> = rows
        .iter()
        .map(|r| ActivityLogResponse {
            id: r.id,
            board_id: r.board_id,
            task_id: r.task_id,
            actor_id: r.actor_id,
            actor_name: r.actor_name.clone(),
            action: r.action.clone(),
            payload: r.payload.clone(),
            created_at: r.created_at,
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
// S-023: Template Materialization
// ---------------------------------------------------------------------------

/// Materialize a board from a template. Called from board_handlers::create_board
/// when `from_template` query param is provided.
pub async fn materialize_from_template(
    state: &AppState,
    user: &AuthnUser,
    template_id: Uuid,
    override_title: Option<&str>,
    department_ids: &[Uuid],
) -> Result<BoardResponse, AppError> {
    // 1. Fetch template
    let template = sqlx::query_as::<_, TemplateRow>(
        "SELECT * FROM templates WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(template_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Template".into()))?;

    // 2. Scope-based access check (simplified)
    match template.scope.as_str() {
        "department" => {
            if let Some(ref_id) = template.scope_ref_id {
                if !user.department_ids.contains(&ref_id) && !is_admin(user) {
                    return Err(AppError::PermissionDenied {
                        action: "use_template".into(),
                        resource: "templates".into(),
                    });
                }
            }
        }
        "user" => {
            if template.owner_id != user.user_id && !is_admin(user) {
                return Err(AppError::PermissionDenied {
                    action: "use_template".into(),
                    resource: "templates".into(),
                });
            }
        }
        "global" => { /* accessible to all */ }
        _ => {}
    }

    // 3. auto_enroll_members=true && scope="global" && !SystemAdmin -> 403
    if template.auto_enroll_members && template.scope == "global" && !is_system_admin(user) {
        return Err(AppError::PermissionDenied {
            action: "use_global_auto_enroll_template".into(),
            resource: "templates".into(),
        });
    }

    // 4. TX
    let board_id = uuid7::now_v7();
    let board_title = override_title.unwrap_or(&template.name);
    let mut tx = state.pool.begin().await?;

    // 4a. INSERT board
    let board_row = sqlx::query_as::<_, BoardRow>(
        r#"
        INSERT INTO boards (id, title, description, owner_id, origin_template_id, version)
        VALUES ($1, $2, $3, $4, $5, 0)
        RETURNING *
        "#,
    )
    .bind(board_id)
    .bind(board_title)
    .bind(&template.description)
    .bind(user.user_id)
    .bind(template_id)
    .fetch_one(&mut *tx)
    .await?;

    // 4b. INSERT board_departments
    for dept_id in department_ids {
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

    // 4c. Extract columns from payload
    let payload_columns = template
        .payload
        .get("columns")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut column_ids: Vec<Uuid> = Vec::new();
    for (idx, col_def) in payload_columns.iter().enumerate() {
        let col_id = uuid7::now_v7();
        let col_title = col_def
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("Untitled");
        let position = (idx as f64) * 1024.0;

        sqlx::query(
            r#"
            INSERT INTO board_columns (id, board_id, title, position, version)
            VALUES ($1, $2, $3, $4, 0)
            "#,
        )
        .bind(col_id)
        .bind(board_id)
        .bind(col_title)
        .bind(position)
        .execute(&mut *tx)
        .await?;

        column_ids.push(col_id);
    }

    // 4d. Extract labels from payload
    let payload_labels = template
        .payload
        .get("labels")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    for label_def in &payload_labels {
        let label_id = uuid7::now_v7();
        let label_name = label_def
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("Unlabeled");
        let label_color = label_def
            .get("color")
            .and_then(|v| v.as_str())
            .unwrap_or("#808080");

        sqlx::query(
            "INSERT INTO labels (id, board_id, name, color) VALUES ($1, $2, $3, $4)",
        )
        .bind(label_id)
        .bind(board_id)
        .bind(label_name)
        .bind(label_color)
        .execute(&mut *tx)
        .await?;
    }

    // 4e. Extract default_tasks from payload
    let payload_tasks = template
        .payload
        .get("default_tasks")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    for (idx, task_def) in payload_tasks.iter().enumerate() {
        let task_id = uuid7::now_v7();
        let task_title = task_def
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("Untitled Task");
        let col_index = task_def
            .get("column_index")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as usize;
        let target_col_id = column_ids.get(col_index).copied().unwrap_or_else(|| {
            column_ids.first().copied().unwrap_or(board_id) // fallback
        });
        let position = (idx as f64) * 1024.0;

        sqlx::query(
            r#"
            INSERT INTO tasks (id, board_id, column_id, position, title, priority, status, created_by, version)
            VALUES ($1, $2, $3, $4, $5, 'medium', 'open', $6, 0)
            "#,
        )
        .bind(task_id)
        .bind(board_id)
        .bind(target_col_id)
        .bind(position)
        .bind(task_title)
        .bind(user.user_id)
        .execute(&mut *tx)
        .await?;
    }

    // 4f. Copy custom_fields from template payload (if present)
    let payload_fields = template
        .payload
        .get("custom_fields")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    for (idx, field_def) in payload_fields.iter().enumerate() {
        let Some(name) = field_def.get("name").and_then(|v| v.as_str()) else {
            continue;
        };
        let field_type = field_def
            .get("field_type")
            .and_then(|v| v.as_str())
            .unwrap_or("text");
        let options = field_def
            .get("options")
            .cloned()
            .unwrap_or(serde_json::Value::Array(vec![]));
        let required = field_def
            .get("required")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let show_on_card = field_def
            .get("show_on_card")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let position = (idx as f64) * 1024.0;
        let field_id = uuid7::now_v7();

        sqlx::query(
            r#"
            INSERT INTO board_custom_fields (id, board_id, name, field_type, options, required, show_on_card, position)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT DO NOTHING
            "#,
        )
        .bind(field_id)
        .bind(board_id)
        .bind(name)
        .bind(field_type)
        .bind(&options)
        .bind(required)
        .bind(show_on_card)
        .bind(position)
        .execute(&mut *tx)
        .await?;
    }

    // 4g. Insert creator as admin
    sqlx::query(
        "INSERT INTO board_members (user_id, board_id, role_in_board) VALUES ($1, $2, 'admin')",
    )
    .bind(user.user_id)
    .bind(board_id)
    .execute(&mut *tx)
    .await?;

    // 4g. Auto-enroll members if applicable
    let mut auto_enrolled_count: i64 = 0;
    if template.auto_enroll_members && template.scope == "department" {
        if let Some(scope_ref_id) = template.scope_ref_id {
            let dept_members: Vec<(Uuid,)> = sqlx::query_as(
                "SELECT user_id FROM department_members WHERE department_id = $1",
            )
            .bind(scope_ref_id)
            .fetch_all(&mut *tx)
            .await?;

            for (member_id,) in &dept_members {
                // Skip the creator (already added as admin)
                if *member_id == user.user_id {
                    continue;
                }
                sqlx::query(
                    "INSERT INTO board_members (user_id, board_id, role_in_board) VALUES ($1, $2, 'editor') ON CONFLICT DO NOTHING",
                )
                .bind(member_id)
                .bind(board_id)
                .execute(&mut *tx)
                .await?;
                auto_enrolled_count += 1;
            }
        }
    }

    // 4h. Activity log
    insert_activity(
        &mut tx,
        board_id,
        None,
        user.user_id,
        "template.used",
        serde_json::json!({
            "template_id": template_id,
            "board_id": board_id,
            "auto_enrolled_count": auto_enrolled_count,
        }),
    )
    .await?;

    // 4i. Seed Status/Priority custom fields if template didn't include them
    let has_status = payload_fields.iter().any(|f| {
        f.get("name").and_then(|v| v.as_str()) == Some("Status")
    });
    let has_priority = payload_fields.iter().any(|f| {
        f.get("name").and_then(|v| v.as_str()) == Some("Priority")
    });
    if !has_status || !has_priority {
        crate::collaboration::board_handlers::seed_status_priority_fields(&mut tx, board_id).await?;
    }

    // 4j. Seed default views (Kanban/Table/Calendar)
    crate::collaboration::board_handlers::seed_default_views(&mut tx, board_id, user.user_id).await?;

    // 5. TX commit
    tx.commit().await?;

    // 6. Build response
    Ok(BoardResponse {
        id: board_row.id,
        title: board_row.title,
        description: board_row.description,
        owner_id: board_row.owner_id,
        owner_type: board_row.owner_type,
        department_ids: department_ids.to_vec(),
        version: board_row.version,
        created_at: board_row.created_at,
        updated_at: board_row.updated_at,
    })
}
