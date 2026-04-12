use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Row types (match DB schema)
// ---------------------------------------------------------------------------

/// Row type for the `boards` table.
#[derive(sqlx::FromRow, Serialize, Debug, Clone)]
pub struct BoardRow {
    pub id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub owner_id: Uuid,
    pub origin_template_id: Option<Uuid>,
    pub version: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}

/// Row type for the `board_columns` table.
#[derive(sqlx::FromRow, Serialize, Debug, Clone)]
pub struct BoardColumnRow {
    pub id: Uuid,
    pub board_id: Uuid,
    pub title: String,
    pub position: f64,
    pub version: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Row type for the `tasks` table.
#[derive(sqlx::FromRow, Serialize, Debug)]
pub struct TaskRow {
    pub id: Uuid,
    pub board_id: Uuid,
    pub column_id: Uuid,
    pub position: f64,
    pub title: String,
    pub description: Option<String>,
    pub priority: String,
    pub status: String,
    pub start_date: Option<DateTime<Utc>>,
    pub due_date: Option<DateTime<Utc>>,
    pub created_by: Uuid,
    pub version: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}

/// Row type for the `board_members` table.
#[derive(sqlx::FromRow, Serialize, Debug, Clone)]
pub struct BoardMemberRow {
    pub user_id: Uuid,
    pub board_id: Uuid,
    pub role_in_board: String,
    pub added_at: DateTime<Utc>,
}

/// Row type for the `board_departments` table.
#[derive(sqlx::FromRow, Serialize, Debug)]
pub struct BoardDepartmentRow {
    pub board_id: Uuid,
    pub department_id: Uuid,
}

/// Row type for the `labels` table.
#[derive(sqlx::FromRow, Serialize, Debug)]
pub struct BoardLabelRow {
    pub id: Uuid,
    pub board_id: Uuid,
    pub name: String,
    pub color: String,
}

/// Row type for the `task_labels` table.
#[derive(sqlx::FromRow, Serialize, Debug)]
pub struct TaskLabelRow {
    pub task_id: Uuid,
    pub label_id: Uuid,
}

/// Row type for the `task_assignees` table.
#[derive(sqlx::FromRow, Serialize, Debug)]
pub struct TaskAssigneeRow {
    pub task_id: Uuid,
    pub user_id: Uuid,
}

/// Row type for the `checklists` table.
#[derive(sqlx::FromRow, Serialize, Debug)]
pub struct ChecklistRow {
    pub id: Uuid,
    pub task_id: Uuid,
    pub title: String,
    pub created_at: DateTime<Utc>,
}

/// Row type for the `task_checklist_items` table.
#[derive(sqlx::FromRow, Serialize, Debug)]
pub struct ChecklistItemRow {
    pub id: Uuid,
    pub checklist_id: Uuid,
    pub text: String,
    pub checked: bool,
    pub position: f64,
    pub created_at: DateTime<Utc>,
}

/// Row type for the `comments` table.
#[derive(sqlx::FromRow, Serialize, Debug)]
pub struct CommentRow {
    pub id: Uuid,
    pub task_id: Uuid,
    pub author_id: Uuid,
    pub body: String,
    pub created_at: DateTime<Utc>,
    pub edited_at: Option<DateTime<Utc>>,
    pub deleted_at: Option<DateTime<Utc>>,
}

/// Row type for the `activity_logs` table.
#[derive(sqlx::FromRow, Serialize, Debug)]
pub struct ActivityLogRow {
    pub id: Uuid,
    pub board_id: Uuid,
    pub task_id: Option<Uuid>,
    pub actor_id: Uuid,
    pub action: String,
    pub payload: serde_json::Value,
    pub created_at: DateTime<Utc>,
}

/// Row type for the `templates` table.
#[derive(sqlx::FromRow, Serialize, Debug)]
pub struct TemplateRow {
    pub id: Uuid,
    pub kind: String,
    pub name: String,
    pub description: Option<String>,
    pub owner_id: Uuid,
    pub scope: String,
    pub scope_ref_id: Option<Uuid>,
    pub auto_enroll_members: bool,
    pub payload: serde_json::Value,
    pub payload_version: i16,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}

// ---------------------------------------------------------------------------
// Board DTOs (S-013)
// ---------------------------------------------------------------------------

/// S-013: Board creation request.
#[derive(Deserialize, Debug)]
pub struct CreateBoardRequest {
    pub title: String,
    pub description: Option<String>,
    pub department_ids: Vec<Uuid>,
}

/// S-013: Board patch request.
#[derive(Deserialize, Debug)]
pub struct PatchBoardRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub department_ids: Option<Vec<Uuid>>,
    pub version: Option<i64>,
}

/// S-013: Board creation response (also used for patch).
#[derive(Serialize, Debug)]
pub struct BoardResponse {
    pub id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub owner_id: Uuid,
    pub department_ids: Vec<Uuid>,
    pub version: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// S-013: Board summary for list responses.
#[derive(Serialize, Debug)]
pub struct BoardSummary {
    pub id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub owner_id: Uuid,
    pub version: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}

/// S-013: Board detail for get_board.
#[derive(Serialize, Debug)]
pub struct BoardDetail {
    pub id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub owner_id: Uuid,
    pub department_ids: Vec<Uuid>,
    pub member_count: i64,
    pub column_count: i64,
    pub version: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// S-013: Board list query params.
#[derive(Deserialize, Debug)]
pub struct BoardsQuery {
    #[serde(default = "default_limit")]
    pub limit: i64,
    pub cursor: Option<String>,
    #[serde(default)]
    pub include_deleted: bool,
}

/// Query for from_template param on board creation.
#[derive(Deserialize, Debug)]
pub struct CreateBoardQuery {
    pub from_template: Option<Uuid>,
}

// ---------------------------------------------------------------------------
// Board member DTOs (S-014)
// ---------------------------------------------------------------------------

/// S-014: Add board member request.
#[derive(Deserialize, Debug)]
pub struct AddBoardMemberRequest {
    pub user_id: Uuid,
    pub role_in_board: String,
}

/// S-014: Patch board member request.
#[derive(Deserialize, Debug)]
pub struct PatchBoardMemberRequest {
    pub role_in_board: String,
}

/// S-014: Board member response (with user info).
#[derive(sqlx::FromRow, Serialize, Debug)]
pub struct BoardMemberResponse {
    pub user_id: Uuid,
    pub board_id: Uuid,
    pub role_in_board: String,
    pub added_at: DateTime<Utc>,
    pub user_name: String,
    pub user_email: String,
}

/// S-014: Board member list query.
#[derive(Deserialize, Debug)]
pub struct BoardMembersQuery {
    #[serde(default = "default_limit")]
    pub limit: i64,
    pub cursor: Option<String>,
}

// ---------------------------------------------------------------------------
// Board departments DTOs (S-015)
// ---------------------------------------------------------------------------

/// S-015: Set board departments request.
#[derive(Deserialize, Debug)]
pub struct SetBoardDepartmentsRequest {
    pub department_ids: Vec<Uuid>,
    pub version: Option<i64>,
}

/// S-015: Board department response item.
#[derive(sqlx::FromRow, Serialize, Debug)]
pub struct BoardDepartmentResponse {
    pub department_id: Uuid,
    pub name: String,
}

// ---------------------------------------------------------------------------
// Column DTOs (S-016)
// ---------------------------------------------------------------------------

/// S-016: Create column request.
#[derive(Deserialize, Debug)]
pub struct CreateColumnRequest {
    pub title: String,
}

/// S-016: Patch column request.
#[derive(Deserialize, Debug)]
pub struct PatchColumnRequest {
    pub title: Option<String>,
    pub position: Option<f64>,
    pub version: Option<i64>,
}

/// S-016: Column response.
#[derive(Serialize, Debug)]
pub struct ColumnResponse {
    pub id: Uuid,
    pub board_id: Uuid,
    pub title: String,
    pub position: f64,
    pub version: i64,
    pub created_at: DateTime<Utc>,
}

/// S-016: Delete column query.
#[derive(Deserialize, Debug)]
pub struct DeleteColumnQuery {
    pub move_to: Option<Uuid>,
    pub version: Option<i64>,
}

fn default_limit() -> i64 {
    20
}

// ---------------------------------------------------------------------------
// Task DTOs (S-017)
// ---------------------------------------------------------------------------

/// S-017: Create task request.
#[derive(Deserialize, Debug)]
pub struct CreateTaskRequest {
    pub title: String,
    pub description: Option<String>,
    pub column_id: Uuid,
    pub priority: Option<String>,
    pub status: Option<String>,
    pub start_date: Option<DateTime<Utc>>,
    pub due_date: Option<DateTime<Utc>>,
}

/// S-017: Patch task request.
#[derive(Deserialize, Debug)]
pub struct PatchTaskRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub priority: Option<String>,
    pub status: Option<String>,
    pub start_date: Option<Option<DateTime<Utc>>>,
    pub due_date: Option<Option<DateTime<Utc>>>,
    pub column_id: Option<Uuid>,
    pub position: Option<f64>,
    pub version: Option<i64>,
}

/// S-018: Move task request.
#[derive(Deserialize, Debug)]
pub struct MoveTaskRequest {
    pub column_id: Uuid,
    pub position: f64,
    pub version: Option<i64>,
}

/// S-017: Task detail DTO (get_task response).
#[derive(Serialize, Debug)]
pub struct TaskDto {
    pub id: Uuid,
    pub board_id: Uuid,
    pub column_id: Uuid,
    pub position: f64,
    pub title: String,
    pub description: Option<String>,
    pub priority: String,
    pub status: String,
    pub start_date: Option<DateTime<Utc>>,
    pub due_date: Option<DateTime<Utc>>,
    pub created_by: Uuid,
    pub version: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub labels: Vec<LabelInfo>,
    pub assignees: Vec<AssigneeInfo>,
    pub checklist_summary: ChecklistSummary,
    pub comment_count: i64,
}

/// Label info for task detail.
#[derive(Serialize, Debug)]
pub struct LabelInfo {
    pub id: Uuid,
    pub name: String,
    pub color: String,
}

/// Assignee info for task detail.
#[derive(Serialize, Debug)]
pub struct AssigneeInfo {
    pub id: Uuid,
    pub name: String,
    pub email: String,
}

/// Checklist summary for task detail.
#[derive(Serialize, Debug)]
pub struct ChecklistSummary {
    pub total: i64,
    pub checked: i64,
}

// ---------------------------------------------------------------------------
// Sub-resource DTOs (S-019)
// ---------------------------------------------------------------------------

/// S-019: Create board label request.
#[derive(Deserialize, Debug)]
pub struct CreateBoardLabelRequest {
    pub name: String,
    pub color: String,
}

/// S-019: Add task label request.
#[derive(Deserialize, Debug)]
pub struct AddLabelRequest {
    pub label_id: Uuid,
}

/// S-019: Add task assignee request.
#[derive(Deserialize, Debug)]
pub struct AddAssigneeRequest {
    pub user_id: Uuid,
}

/// S-019: Create checklist request.
#[derive(Deserialize, Debug)]
pub struct CreateChecklistRequest {
    pub title: String,
}

/// S-019: Add checklist item request.
#[derive(Deserialize, Debug)]
pub struct AddChecklistItemRequest {
    pub text: String,
    pub checked: Option<bool>,
}

/// S-019: Patch checklist item request.
#[derive(Deserialize, Debug)]
pub struct PatchChecklistItemRequest {
    pub text: Option<String>,
    pub checked: Option<bool>,
}

// ---------------------------------------------------------------------------
// View DTOs (S-020)
// ---------------------------------------------------------------------------

/// S-020: Board tasks query parameters.
#[derive(Deserialize, Debug)]
pub struct BoardTasksQuery {
    pub group_by: Option<String>,
    pub sort: Option<String>,
    pub order: Option<String>,
    pub priority: Option<String>,
    pub status: Option<String>,
    pub assignee: Option<Uuid>,
    pub from: Option<DateTime<Utc>>,
    pub to: Option<DateTime<Utc>>,
    pub include_unscheduled: Option<bool>,
    #[serde(default = "default_limit")]
    pub limit: i64,
    pub cursor: Option<String>,
}

/// S-020: Calendar view response.
#[derive(Serialize, Debug)]
pub struct CalendarResponse {
    pub scheduled: Vec<TaskRow>,
    pub unscheduled: Vec<TaskRow>,
}

/// S-017: Delete task query (version via query string).
#[derive(Deserialize, Debug)]
pub struct DeleteTaskQuery {
    pub version: Option<i64>,
}

// ---------------------------------------------------------------------------
// Comment DTOs (S-021)
// ---------------------------------------------------------------------------

/// S-021: Create comment request.
#[derive(Deserialize, Debug)]
pub struct CreateCommentRequest {
    pub body: String,
}

/// S-021: Patch comment request.
#[derive(Deserialize, Debug)]
pub struct PatchCommentRequest {
    pub body: String,
}

/// S-021: Comment response.
#[derive(Serialize, Debug)]
pub struct CommentResponse {
    pub id: Uuid,
    pub task_id: Uuid,
    pub author_id: Uuid,
    pub author_name: String,
    pub body: String,
    pub created_at: DateTime<Utc>,
    pub edited_at: Option<DateTime<Utc>>,
}

// ---------------------------------------------------------------------------
// Activity Log DTO (S-024)
// ---------------------------------------------------------------------------

/// S-024: Activity log response.
#[derive(Serialize, Debug)]
pub struct ActivityLogResponse {
    pub id: Uuid,
    pub board_id: Uuid,
    pub task_id: Option<Uuid>,
    pub actor_id: Uuid,
    pub actor_name: String,
    pub action: String,
    pub payload: serde_json::Value,
    pub created_at: DateTime<Utc>,
}

/// S-024: Activity log row with joined actor_name.
#[derive(sqlx::FromRow, Debug)]
pub struct ActivityLogWithActor {
    pub id: Uuid,
    pub board_id: Uuid,
    pub task_id: Option<Uuid>,
    pub actor_id: Uuid,
    pub action: String,
    pub payload: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub actor_name: String,
}

// ---------------------------------------------------------------------------
// Template DTOs (S-022, S-023)
// ---------------------------------------------------------------------------

/// S-022: Create template request.
#[derive(Deserialize, Debug)]
pub struct CreateTemplateRequest {
    pub kind: String,
    pub name: String,
    pub description: Option<String>,
    pub scope: String,
    pub scope_ref_id: Option<Uuid>,
    pub auto_enroll_members: Option<bool>,
    pub payload: serde_json::Value,
}

/// S-022: Patch template request.
#[derive(Deserialize, Debug)]
pub struct PatchTemplateRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub payload: Option<serde_json::Value>,
    pub auto_enroll_members: Option<bool>,
}

/// S-022: Template response.
#[derive(Serialize, Debug)]
pub struct TemplateResponse {
    pub id: Uuid,
    pub kind: String,
    pub name: String,
    pub description: Option<String>,
    pub owner_id: Uuid,
    pub scope: String,
    pub scope_ref_id: Option<Uuid>,
    pub auto_enroll_members: bool,
    pub payload: serde_json::Value,
    pub payload_version: i16,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// S-022: Template list query params.
#[derive(Deserialize, Debug)]
pub struct TemplatesQuery {
    pub scope: Option<String>,
    pub scope_ref_id: Option<Uuid>,
    #[serde(default = "default_limit")]
    pub limit: i64,
    pub cursor: Option<String>,
}

/// Comment row with joined author_name.
#[derive(sqlx::FromRow, Debug)]
pub struct CommentWithAuthor {
    pub id: Uuid,
    pub task_id: Uuid,
    pub author_id: Uuid,
    pub body: String,
    pub created_at: DateTime<Utc>,
    pub edited_at: Option<DateTime<Utc>>,
    pub deleted_at: Option<DateTime<Utc>>,
    pub author_name: String,
}
