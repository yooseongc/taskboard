//! S-025: Authorization check helpers.
//!
//! Provides convenience functions to evaluate the permission matrix
//! and return 403 on Deny.

use std::collections::HashSet;

use sqlx::PgPool;
use uuid::Uuid;

use super::authn::{AuthnUser, GlobalRole};
use super::matrix::{evaluate, Action, BoardRole, Decision, ResourceType};
use super::resource_ref::ResourceRef;
use crate::http::error::AppError;

/// Load the set of department IDs that own a given board.
pub async fn load_owning_departments(
    pool: &PgPool,
    board_id: Uuid,
) -> Result<HashSet<Uuid>, AppError> {
    let rows: Vec<(Uuid,)> =
        sqlx::query_as("SELECT department_id FROM board_departments WHERE board_id = $1")
            .bind(board_id)
            .fetch_all(pool)
            .await?;
    Ok(rows.into_iter().map(|r| r.0).collect())
}

/// Load the user's role within a specific board (None if not a member).
pub async fn load_board_role(
    pool: &PgPool,
    user_id: Uuid,
    board_id: Uuid,
) -> Result<Option<BoardRole>, AppError> {
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT role_in_board FROM board_members WHERE user_id = $1 AND board_id = $2",
    )
    .bind(user_id)
    .bind(board_id)
    .fetch_optional(pool)
    .await?;
    Ok(row.and_then(|(r,)| BoardRole::from_str_opt(&r)))
}

/// S-025 step 2: Check if user is internal to owning departments.
///
/// A user is internal if any of their department memberships is an
/// ancestor-or-self of any owning department. This covers:
/// - Direct membership (user dept == owning dept)
/// - Ancestor relationship (user dept is parent/grandparent of owning dept)
///
/// Uses the ltree `path` column: `owning_dept.path <@ user_dept.path` means
/// user_dept's path is a prefix of (ancestor-or-self of) owning_dept's path.
pub async fn is_user_internal(
    pool: &PgPool,
    user_department_ids: &[Uuid],
    owning_depts: &HashSet<Uuid>,
) -> Result<bool, AppError> {
    if user_department_ids.is_empty() || owning_depts.is_empty() {
        return Ok(false);
    }

    // Fast path: direct membership
    if user_department_ids
        .iter()
        .any(|d| owning_depts.contains(d))
    {
        return Ok(true);
    }

    // Ancestor check via ltree path:
    // Find if any user department is an ancestor of any owning department.
    let user_ids: Vec<Uuid> = user_department_ids.to_vec();
    let owning_ids: Vec<Uuid> = owning_depts.iter().copied().collect();

    let row: Option<(i32,)> = sqlx::query_as(
        "SELECT 1 FROM departments ud, departments od \
         WHERE ud.id = ANY($1) AND od.id = ANY($2) \
         AND od.path <@ ud.path \
         LIMIT 1",
    )
    .bind(&user_ids)
    .bind(&owning_ids)
    .fetch_optional(pool)
    .await?;

    Ok(row.is_some())
}

/// Evaluate permission and return Err(PermissionDenied) on Deny.
///
/// Now async because it needs DB access for ancestor-or-self check (S-025 step 2).
pub async fn require_permission(
    pool: &PgPool,
    user: &AuthnUser,
    action: Action,
    resource_type: ResourceType,
    board_role: Option<BoardRole>,
    owning_depts: &HashSet<Uuid>,
) -> Result<(), AppError> {
    // SystemAdmin short-circuit: no need for is_internal check
    let is_internal = if user.global_roles.contains(&GlobalRole::SystemAdmin) {
        false // doesn't matter, evaluate returns Allow for SystemAdmin
    } else {
        is_user_internal(pool, &user.department_ids, owning_depts).await?
    };

    let resource_ref = match board_role {
        Some(role) => ResourceRef::new(resource_type).with_board_role(role),
        None => ResourceRef::new(resource_type),
    };
    let decision = evaluate(user, action, &resource_ref, is_internal);
    if decision == Decision::Deny {
        return Err(AppError::PermissionDenied {
            action: format!("{:?}", action),
            resource: format!("{:?}", resource_type),
        });
    }
    Ok(())
}

/// All-in-one: load board context and check permission.
pub async fn check_board_permission(
    pool: &PgPool,
    user: &AuthnUser,
    board_id: Uuid,
    action: Action,
    resource_type: ResourceType,
) -> Result<(), AppError> {
    let owning_depts = load_owning_departments(pool, board_id).await?;
    let board_role = load_board_role(pool, user.user_id, board_id).await?;
    require_permission(pool, user, action, resource_type, board_role, &owning_depts).await
}

/// Check permission against a set of department IDs (for board creation,
/// where the board doesn't exist yet).
pub async fn check_board_create_permission(
    pool: &PgPool,
    user: &AuthnUser,
    department_ids: &[Uuid],
) -> Result<(), AppError> {
    let owning_depts: HashSet<Uuid> = department_ids.iter().copied().collect();
    // No board role yet (board doesn't exist)
    require_permission(
        pool,
        user,
        Action::Create,
        ResourceType::Board,
        None,
        &owning_depts,
    )
    .await
}

/// Fetch the board_id of a task. Returns NotFound if task doesn't exist.
pub async fn fetch_task_board_id(pool: &PgPool, task_id: Uuid) -> Result<Uuid, AppError> {
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
