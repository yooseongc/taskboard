use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Row type for the `departments` table.
#[derive(sqlx::FromRow, Serialize, Debug, Clone)]
pub struct DepartmentRow {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub parent_id: Option<Uuid>,
    pub path: String,
    pub depth: i16,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Row type for the `department_members` table.
#[derive(sqlx::FromRow, Serialize, Debug, Clone)]
pub struct DepartmentMemberRow {
    pub user_id: Uuid,
    pub department_id: Uuid,
    pub role_in_department: String,
    pub joined_at: DateTime<Utc>,
}

/// Response DTO for department endpoints.
#[derive(Serialize, Debug)]
pub struct DepartmentResponse {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub parent_id: Option<Uuid>,
    pub path: String,
    pub depth: i16,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<DepartmentRow> for DepartmentResponse {
    fn from(row: DepartmentRow) -> Self {
        Self {
            id: row.id,
            name: row.name,
            slug: row.slug,
            parent_id: row.parent_id,
            path: row.path,
            depth: row.depth,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

/// Ancestor/descendant summary DTO.
#[derive(Serialize, Debug)]
pub struct DepartmentSummary {
    pub id: Uuid,
    pub name: String,
    pub depth: i16,
}

/// Member response with user info joined.
#[derive(sqlx::FromRow, Serialize, Debug)]
pub struct MemberWithUser {
    pub user_id: Uuid,
    pub department_id: Uuid,
    pub role_in_department: String,
    pub joined_at: DateTime<Utc>,
    pub user_name: String,
    pub user_email: String,
}

/// Request DTOs.
#[derive(Deserialize, Debug)]
pub struct CreateDepartmentRequest {
    pub name: String,
    pub slug: String,
    pub parent_id: Option<Uuid>,
}

#[derive(Deserialize, Debug)]
pub struct PatchDepartmentRequest {
    pub name: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct AddMemberRequest {
    pub user_id: Uuid,
    pub role_in_department: String,
}

#[derive(Deserialize, Debug)]
pub struct PatchMemberRoleRequest {
    pub role_in_department: String,
}

/// Query params for list_departments.
#[derive(Deserialize, Debug)]
pub struct ListDepartmentsQuery {
    pub parent_id: Option<String>,
    #[serde(default = "default_limit")]
    pub limit: i64,
    pub cursor: Option<String>,
}

/// Query params for delete_department.
#[derive(Deserialize, Debug)]
pub struct DeleteDepartmentQuery {
    pub cascade: Option<bool>,
}

/// Query params for list_members (pagination).
#[derive(Deserialize, Debug)]
pub struct ListMembersQuery {
    #[serde(default = "default_limit")]
    pub limit: i64,
    pub cursor: Option<String>,
}

fn default_limit() -> i64 {
    20
}
