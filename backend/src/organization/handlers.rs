use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use uuid::Uuid;

use std::collections::HashSet;

use crate::authz::authn::{AuthnUser, GlobalRole};
use crate::authz::check::require_permission;
use crate::authz::matrix::{Action, ResourceType};
use crate::http::error::AppError;
use crate::http::pagination::{decode_cursor, encode_cursor, PaginatedResponse};
use crate::infra::state::AppState;
use crate::infra::uuid7;
use crate::organization::models::*;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Check if caller is SystemAdmin or DepartmentAdmin.
fn require_admin(user: &AuthnUser) -> Result<(), AppError> {
    let is_system_admin = user.global_roles.contains(&GlobalRole::SystemAdmin);
    let is_dept_admin = user.global_roles.contains(&GlobalRole::DepartmentAdmin);
    if !is_system_admin && !is_dept_admin {
        return Err(AppError::PermissionDenied {
            action: "manage".into(),
            resource: "department".into(),
        });
    }
    Ok(())
}

/// Check if caller is SystemAdmin or DepartmentAdmin of the specific department.
async fn require_dept_admin(
    user: &AuthnUser,
    pool: &sqlx::PgPool,
    dept_id: Uuid,
) -> Result<(), AppError> {
    if user.global_roles.contains(&GlobalRole::SystemAdmin) {
        return Ok(());
    }
    if !user.global_roles.contains(&GlobalRole::DepartmentAdmin) {
        return Err(AppError::PermissionDenied {
            action: "manage".into(),
            resource: format!("department:{dept_id}"),
        });
    }
    // Check if caller is DepartmentAdmin in the specific department
    let role: Option<(String,)> = sqlx::query_as(
        "SELECT role_in_department FROM department_members WHERE user_id = $1 AND department_id = $2",
    )
    .bind(user.user_id)
    .bind(dept_id)
    .fetch_optional(pool)
    .await?;

    match role {
        Some((r,)) if r == "DepartmentAdmin" => Ok(()),
        _ => Err(AppError::PermissionDenied {
            action: "manage".into(),
            resource: format!("department:{dept_id}"),
        }),
    }
}

fn validate_role(role: &str) -> Result<(), AppError> {
    if role != "DepartmentAdmin" && role != "Member" {
        return Err(AppError::InvalidInput(
            "role_in_department must be 'DepartmentAdmin' or 'Member'".into(),
        ));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// S-011: POST /api/departments
// ---------------------------------------------------------------------------

pub async fn create_department(
    State(state): State<AppState>,
    user: AuthnUser,
    Json(body): Json<CreateDepartmentRequest>,
) -> Result<impl IntoResponse, AppError> {
    require_admin(&user)?;
    // Authz: DeptManagement Create
    let owning_depts: HashSet<Uuid> = user.department_ids.iter().copied().collect();
    require_permission(&state.pool, &user, Action::Create, ResourceType::DeptManagement, None, &owning_depts).await?;

    let id = uuid7::now_v7();

    let (path, depth) = if let Some(parent_id) = body.parent_id {
        // Fetch parent
        let parent = sqlx::query_as::<_, DepartmentRow>(
            "SELECT * FROM departments WHERE id = $1",
        )
        .bind(parent_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| AppError::NotFound("Parent department".into()))?;

        let new_depth = parent.depth + 1;
        if new_depth > 5 {
            return Err(AppError::InvalidInput(
                "Department depth cannot exceed 5".into(),
            ));
        }
        let new_path = format!("{}.{}", parent.path, body.slug);
        (new_path, new_depth)
    } else {
        (body.slug.clone(), 0i16)
    };

    let row = sqlx::query_as::<_, DepartmentRow>(
        r#"
        INSERT INTO departments (id, name, slug, parent_id, path, depth)
        VALUES ($1, $2, $3, $4, $5::ltree, $6)
        RETURNING *
        "#,
    )
    .bind(id)
    .bind(&body.name)
    .bind(&body.slug)
    .bind(body.parent_id)
    .bind(&path)
    .bind(depth)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| {
        // Handle unique constraint violation on (parent_id, slug)
        if let sqlx::Error::Database(ref db_err) = e {
            if db_err.constraint() == Some("departments_parent_id_slug_key") {
                return AppError::DuplicateEntry(format!(
                    "Department with slug '{}' already exists under this parent",
                    body.slug
                ));
            }
        }
        AppError::from(e)
    })?;

    Ok((StatusCode::CREATED, Json(DepartmentResponse::from(row))))
}

// ---------------------------------------------------------------------------
// S-011: GET /api/departments
// ---------------------------------------------------------------------------

pub async fn list_departments(
    State(state): State<AppState>,
    _user: AuthnUser,
    Query(query): Query<ListDepartmentsQuery>,
) -> Result<impl IntoResponse, AppError> {
    if query.limit < 1 || query.limit > 100 {
        return Err(AppError::InvalidInput(
            "limit must be between 1 and 100".into(),
        ));
    }

    let cursor_data = if let Some(ref c) = query.cursor {
        let val = decode_cursor(c)?;
        let path_str = val
            .get(0)
            .and_then(|v| v.as_str())
            .ok_or_else(|| AppError::InvalidInput("invalid_cursor: missing path".into()))?
            .to_string();
        let cursor_id: Uuid = val
            .get(1)
            .and_then(|v| v.as_str())
            .ok_or_else(|| AppError::InvalidInput("invalid_cursor: missing id".into()))?
            .parse()
            .map_err(|_| AppError::InvalidInput("invalid_cursor: bad id".into()))?;
        Some((path_str, cursor_id))
    } else {
        None
    };

    let fetch_limit = query.limit + 1;

    let rows: Vec<DepartmentRow> = match (&query.parent_id, &cursor_data) {
        (Some(pid), Some((cp, cid))) if pid == "root" => {
            sqlx::query_as::<_, DepartmentRow>(
                r#"
                SELECT * FROM departments
                WHERE parent_id IS NULL
                  AND (path, id) > ($1::ltree, $2)
                ORDER BY path ASC, id ASC
                LIMIT $3
                "#,
            )
            .bind(cp)
            .bind(cid)
            .bind(fetch_limit)
            .fetch_all(&state.pool)
            .await?
        }
        (Some(pid), None) if pid == "root" => {
            sqlx::query_as::<_, DepartmentRow>(
                r#"
                SELECT * FROM departments
                WHERE parent_id IS NULL
                ORDER BY path ASC, id ASC
                LIMIT $1
                "#,
            )
            .bind(fetch_limit)
            .fetch_all(&state.pool)
            .await?
        }
        (Some(pid), Some((cp, cid))) => {
            let parent_uuid: Uuid = pid
                .parse()
                .map_err(|_| AppError::InvalidInput("parent_id must be 'root' or a valid UUID".into()))?;
            sqlx::query_as::<_, DepartmentRow>(
                r#"
                SELECT * FROM departments
                WHERE parent_id = $1
                  AND (path, id) > ($2::ltree, $3)
                ORDER BY path ASC, id ASC
                LIMIT $4
                "#,
            )
            .bind(parent_uuid)
            .bind(cp)
            .bind(cid)
            .bind(fetch_limit)
            .fetch_all(&state.pool)
            .await?
        }
        (Some(pid), None) => {
            let parent_uuid: Uuid = pid
                .parse()
                .map_err(|_| AppError::InvalidInput("parent_id must be 'root' or a valid UUID".into()))?;
            sqlx::query_as::<_, DepartmentRow>(
                r#"
                SELECT * FROM departments
                WHERE parent_id = $1
                ORDER BY path ASC, id ASC
                LIMIT $2
                "#,
            )
            .bind(parent_uuid)
            .bind(fetch_limit)
            .fetch_all(&state.pool)
            .await?
        }
        (None, Some((cp, cid))) => {
            sqlx::query_as::<_, DepartmentRow>(
                r#"
                SELECT * FROM departments
                WHERE (path, id) > ($1::ltree, $2)
                ORDER BY path ASC, id ASC
                LIMIT $3
                "#,
            )
            .bind(cp)
            .bind(cid)
            .bind(fetch_limit)
            .fetch_all(&state.pool)
            .await?
        }
        (None, None) => {
            sqlx::query_as::<_, DepartmentRow>(
                r#"
                SELECT * FROM departments
                ORDER BY path ASC, id ASC
                LIMIT $1
                "#,
            )
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
            last.path,
            last.id.to_string(),
        ])))
    } else {
        None
    };

    let items: Vec<DepartmentResponse> = rows.into_iter().map(DepartmentResponse::from).collect();
    Ok(Json(PaginatedResponse::new(items, next_cursor)))
}

// ---------------------------------------------------------------------------
// S-011: GET /api/departments/:id
// ---------------------------------------------------------------------------

pub async fn get_department(
    State(state): State<AppState>,
    _user: AuthnUser,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let row = sqlx::query_as::<_, DepartmentRow>(
        "SELECT * FROM departments WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Department".into()))?;

    Ok(Json(DepartmentResponse::from(row)))
}

// ---------------------------------------------------------------------------
// S-011: PATCH /api/departments/:id
// ---------------------------------------------------------------------------

pub async fn patch_department(
    State(state): State<AppState>,
    user: AuthnUser,
    Path(id): Path<Uuid>,
    Json(body): Json<PatchDepartmentRequest>,
) -> Result<impl IntoResponse, AppError> {
    require_dept_admin(&user, &state.pool, id).await?;
    // Authz: DeptManagement Update
    let owning_depts: HashSet<Uuid> = [id].into_iter().collect();
    require_permission(&state.pool, &user, Action::Update, ResourceType::DeptManagement, None, &owning_depts).await?;

    let row = sqlx::query_as::<_, DepartmentRow>(
        r#"
        UPDATE departments
        SET name = COALESCE($2, name),
            updated_at = now()
        WHERE id = $1
        RETURNING *
        "#,
    )
    .bind(id)
    .bind(body.name)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Department".into()))?;

    Ok(Json(DepartmentResponse::from(row)))
}

// ---------------------------------------------------------------------------
// S-011: DELETE /api/departments/:id
// ---------------------------------------------------------------------------

pub async fn delete_department(
    State(state): State<AppState>,
    user: AuthnUser,
    Path(id): Path<Uuid>,
    Query(query): Query<DeleteDepartmentQuery>,
) -> Result<impl IntoResponse, AppError> {
    require_dept_admin(&user, &state.pool, id).await?;
    // Authz: DeptManagement Delete
    let owning_depts: HashSet<Uuid> = [id].into_iter().collect();
    require_permission(&state.pool, &user, Action::Delete, ResourceType::DeptManagement, None, &owning_depts).await?;

    // Fetch target department for path
    let dept = sqlx::query_as::<_, DepartmentRow>(
        "SELECT * FROM departments WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Department".into()))?;

    // Check for descendants
    let has_children: Option<(i32,)> = sqlx::query_as(
        "SELECT 1 as v FROM departments WHERE parent_id = $1 LIMIT 1",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?;

    let cascade = query.cascade.unwrap_or(false);

    if has_children.is_some() && !cascade {
        return Err(AppError::DepartmentHasDescendants);
    }

    if cascade {
        // Cascade delete requires SystemAdmin
        if !user.global_roles.contains(&GlobalRole::SystemAdmin) {
            return Err(AppError::PermissionDenied {
                action: "cascade_delete".into(),
                resource: format!("department:{id}"),
            });
        }
        // Delete all descendants + self using ltree
        sqlx::query("DELETE FROM departments WHERE path <@ $1::ltree")
            .bind(&dept.path)
            .execute(&state.pool)
            .await?;
    } else {
        // No descendants, safe to delete
        sqlx::query("DELETE FROM departments WHERE id = $1")
            .bind(id)
            .execute(&state.pool)
            .await?;
    }

    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// S-011: GET /api/departments/:id/ancestors
// ---------------------------------------------------------------------------

pub async fn get_ancestors(
    State(state): State<AppState>,
    _user: AuthnUser,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    // Fetch target department to get its path
    let dept = sqlx::query_as::<_, DepartmentRow>(
        "SELECT * FROM departments WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Department".into()))?;

    // Find all ancestors (departments whose path is an ancestor-or-self of target)
    let rows = sqlx::query_as::<_, DepartmentRow>(
        r#"
        SELECT * FROM departments
        WHERE path @> $1::ltree
        ORDER BY depth ASC
        "#,
    )
    .bind(&dept.path)
    .fetch_all(&state.pool)
    .await?;

    let items: Vec<DepartmentSummary> = rows
        .into_iter()
        .map(|r| DepartmentSummary {
            id: r.id,
            name: r.name,
            depth: r.depth,
        })
        .collect();

    Ok(Json(serde_json::json!({ "items": items })))
}

// ---------------------------------------------------------------------------
// S-011: GET /api/departments/:id/descendants
// ---------------------------------------------------------------------------

pub async fn get_descendants(
    State(state): State<AppState>,
    _user: AuthnUser,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let dept = sqlx::query_as::<_, DepartmentRow>(
        "SELECT * FROM departments WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Department".into()))?;

    let rows = sqlx::query_as::<_, DepartmentRow>(
        r#"
        SELECT * FROM departments
        WHERE path <@ $1::ltree AND id != $2
        ORDER BY depth ASC, name ASC
        "#,
    )
    .bind(&dept.path)
    .bind(id)
    .fetch_all(&state.pool)
    .await?;

    let items: Vec<DepartmentSummary> = rows
        .into_iter()
        .map(|r| DepartmentSummary {
            id: r.id,
            name: r.name,
            depth: r.depth,
        })
        .collect();

    Ok(Json(serde_json::json!({ "items": items })))
}

// ---------------------------------------------------------------------------
// S-012: POST /api/departments/:id/members
// ---------------------------------------------------------------------------

pub async fn add_member(
    State(state): State<AppState>,
    user: AuthnUser,
    Path(dept_id): Path<Uuid>,
    Json(body): Json<AddMemberRequest>,
) -> Result<impl IntoResponse, AppError> {
    require_dept_admin(&user, &state.pool, dept_id).await?;
    // Authz: DeptManagement ManageMembers
    let owning_depts: HashSet<Uuid> = [dept_id].into_iter().collect();
    require_permission(&state.pool, &user, Action::ManageMembers, ResourceType::DeptManagement, None, &owning_depts).await?;
    validate_role(&body.role_in_department)?;

    // Verify department exists
    let _dept = sqlx::query_as::<_, DepartmentRow>(
        "SELECT * FROM departments WHERE id = $1",
    )
    .bind(dept_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Department".into()))?;

    // Verify user exists
    let _target_user = sqlx::query_as::<_, crate::identity::models::UserRow>(
        "SELECT * FROM users WHERE id = $1",
    )
    .bind(body.user_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("User".into()))?;

    let row = sqlx::query_as::<_, DepartmentMemberRow>(
        r#"
        INSERT INTO department_members (user_id, department_id, role_in_department)
        VALUES ($1, $2, $3)
        RETURNING *
        "#,
    )
    .bind(body.user_id)
    .bind(dept_id)
    .bind(&body.role_in_department)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| {
        if let sqlx::Error::Database(ref db_err) = e {
            if db_err.constraint() == Some("department_members_pkey") {
                return AppError::DuplicateEntry(
                    "User is already a member of this department".into(),
                );
            }
        }
        AppError::from(e)
    })?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({
            "user_id": row.user_id,
            "department_id": row.department_id,
            "role_in_department": row.role_in_department,
            "joined_at": row.joined_at,
        })),
    ))
}

// ---------------------------------------------------------------------------
// S-012: GET /api/departments/:id/members
// ---------------------------------------------------------------------------

pub async fn list_members(
    State(state): State<AppState>,
    _user: AuthnUser,
    Path(dept_id): Path<Uuid>,
    Query(query): Query<ListMembersQuery>,
) -> Result<impl IntoResponse, AppError> {
    if query.limit < 1 || query.limit > 100 {
        return Err(AppError::InvalidInput(
            "limit must be between 1 and 100".into(),
        ));
    }

    // Verify department exists
    let _dept = sqlx::query_as::<_, DepartmentRow>(
        "SELECT * FROM departments WHERE id = $1",
    )
    .bind(dept_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Department".into()))?;

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

    let rows: Vec<MemberWithUser> = match cursor_data {
        Some((ts, uid)) => {
            sqlx::query_as::<_, MemberWithUser>(
                r#"
                SELECT dm.user_id, dm.department_id, dm.role_in_department, dm.joined_at,
                       u.name AS user_name, u.email AS user_email
                FROM department_members dm
                JOIN users u ON u.id = dm.user_id
                WHERE dm.department_id = $1
                  AND (dm.joined_at, dm.user_id) > ($2, $3)
                ORDER BY dm.joined_at ASC, dm.user_id ASC
                LIMIT $4
                "#,
            )
            .bind(dept_id)
            .bind(ts)
            .bind(uid)
            .bind(fetch_limit)
            .fetch_all(&state.pool)
            .await?
        }
        None => {
            sqlx::query_as::<_, MemberWithUser>(
                r#"
                SELECT dm.user_id, dm.department_id, dm.role_in_department, dm.joined_at,
                       u.name AS user_name, u.email AS user_email
                FROM department_members dm
                JOIN users u ON u.id = dm.user_id
                WHERE dm.department_id = $1
                ORDER BY dm.joined_at ASC, dm.user_id ASC
                LIMIT $2
                "#,
            )
            .bind(dept_id)
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
            last.joined_at.to_rfc3339(),
            last.user_id.to_string(),
        ])))
    } else {
        None
    };

    Ok(Json(PaginatedResponse::new(rows, next_cursor)))
}

// ---------------------------------------------------------------------------
// S-012: DELETE /api/departments/:id/members/:user_id
// ---------------------------------------------------------------------------

pub async fn remove_member(
    State(state): State<AppState>,
    user: AuthnUser,
    Path((dept_id, target_user_id)): Path<(Uuid, Uuid)>,
) -> Result<impl IntoResponse, AppError> {
    require_dept_admin(&user, &state.pool, dept_id).await?;
    // Authz: DeptManagement ManageMembers
    let owning_depts: HashSet<Uuid> = [dept_id].into_iter().collect();
    require_permission(&state.pool, &user, Action::ManageMembers, ResourceType::DeptManagement, None, &owning_depts).await?;

    let result = sqlx::query(
        "DELETE FROM department_members WHERE department_id = $1 AND user_id = $2",
    )
    .bind(dept_id)
    .bind(target_user_id)
    .execute(&state.pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Department member".into()));
    }

    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// S-012: PATCH /api/departments/:id/members/:user_id
// ---------------------------------------------------------------------------

pub async fn patch_member_role(
    State(state): State<AppState>,
    user: AuthnUser,
    Path((dept_id, target_user_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<PatchMemberRoleRequest>,
) -> Result<impl IntoResponse, AppError> {
    require_dept_admin(&user, &state.pool, dept_id).await?;
    // Authz: DeptManagement ManageMembers
    let owning_depts: HashSet<Uuid> = [dept_id].into_iter().collect();
    require_permission(&state.pool, &user, Action::ManageMembers, ResourceType::DeptManagement, None, &owning_depts).await?;
    validate_role(&body.role_in_department)?;

    let row = sqlx::query_as::<_, DepartmentMemberRow>(
        r#"
        UPDATE department_members
        SET role_in_department = $3
        WHERE department_id = $1 AND user_id = $2
        RETURNING *
        "#,
    )
    .bind(dept_id)
    .bind(target_user_id)
    .bind(&body.role_in_department)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Department member".into()))?;

    Ok(Json(serde_json::json!({
        "user_id": row.user_id,
        "department_id": row.department_id,
        "role_in_department": row.role_in_department,
        "joined_at": row.joined_at,
    })))
}
