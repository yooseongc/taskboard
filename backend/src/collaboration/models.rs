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
    /// Optional hex accent color (migration 0011). NULL renders as theme default.
    pub color: Option<String>,
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
    pub summary: Option<String>,
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

/// Row type for the `labels` table.
#[derive(sqlx::FromRow, Serialize, Debug)]
pub struct BoardLabelRow {
    pub id: Uuid,
    pub board_id: Uuid,
    pub name: String,
    pub color: String,
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
    /// Optional #rrggbb accent color. `None` leaves the DB default (NULL).
    pub color: Option<String>,
}

/// S-016: Patch column request.
#[derive(Deserialize, Debug)]
pub struct PatchColumnRequest {
    pub title: Option<String>,
    pub position: Option<f64>,
    pub version: Option<i64>,
    /// Three-way semantics via the `double_option` serde helper:
    /// missing field = `None` (leave alone); explicit JSON `null` =
    /// `Some(None)` (clear to DB NULL and revert to theme default);
    /// string value = `Some(Some("#rrggbb"))` (overwrite).
    #[serde(default, deserialize_with = "crate::http::serde_helpers::double_option::deserialize")]
    pub color: Option<Option<String>>,
}

/// S-016: Column response.
#[derive(Serialize, Debug)]
pub struct ColumnResponse {
    pub id: Uuid,
    pub board_id: Uuid,
    pub title: String,
    pub position: f64,
    pub version: i64,
    pub color: Option<String>,
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
    pub summary: Option<String>,
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
    pub summary: Option<String>,
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
    pub summary: Option<String>,
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
    pub title: String,
    pub checked: Option<bool>,
}

/// S-019: Patch checklist item request.
#[derive(Deserialize, Debug)]
pub struct PatchChecklistItemRequest {
    pub title: Option<String>,
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
///
/// `deleted_at` is materialized by `SELECT c.*` but not consumed — the list
/// query already filters `deleted_at IS NULL`, so downstream code never
/// inspects it. Kept on the struct so `sqlx::FromRow` can map every column
/// returned by `c.*` without requiring an explicit projection rewrite.
#[derive(sqlx::FromRow, Debug)]
pub struct CommentWithAuthor {
    pub id: Uuid,
    pub task_id: Uuid,
    pub author_id: Uuid,
    pub body: String,
    pub created_at: DateTime<Utc>,
    pub edited_at: Option<DateTime<Utc>>,
    #[allow(dead_code)]
    pub deleted_at: Option<DateTime<Utc>>,
    pub author_name: String,
}

// ---------------------------------------------------------------------------
// Custom Fields
// ---------------------------------------------------------------------------

#[derive(sqlx::FromRow, Serialize, Debug)]
pub struct CustomFieldRow {
    pub id: Uuid,
    pub board_id: Uuid,
    pub name: String,
    pub field_type: String,
    pub options: serde_json::Value,
    pub position: f64,
    pub required: bool,
    /// Whether this field's value renders on the kanban card itself
    /// (Round B.2, migration 0012). Defaults to false — boards keep the
    /// pre-existing compact card layout until the user opts specific
    /// fields in, Mattermost-style.
    pub show_on_card: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Deserialize, Debug)]
pub struct CreateCustomFieldRequest {
    pub name: String,
    pub field_type: String,
    pub options: Option<serde_json::Value>,
    pub required: Option<bool>,
    pub show_on_card: Option<bool>,
}

#[derive(Deserialize, Debug)]
pub struct PatchCustomFieldRequest {
    pub name: Option<String>,
    pub options: Option<serde_json::Value>,
    pub position: Option<f64>,
    pub required: Option<bool>,
    pub show_on_card: Option<bool>,
}

#[derive(sqlx::FromRow, Serialize, Debug)]
pub struct TaskFieldValueRow {
    pub task_id: Uuid,
    pub field_id: Uuid,
    pub value: serde_json::Value,
    pub updated_at: DateTime<Utc>,
}

#[derive(Deserialize, Debug)]
pub struct SetFieldValueRequest {
    pub value: serde_json::Value,
}

// ---------------------------------------------------------------------------
// Round C — Saved Views (migration 0013)
// ---------------------------------------------------------------------------

/// Row type for `board_views`. `config` is a free-form JSON blob whose
/// shape varies by `view_type` — the frontend owns the schema.
#[derive(sqlx::FromRow, Serialize, Debug, Clone)]
pub struct BoardViewRow {
    pub id: Uuid,
    pub board_id: Uuid,
    pub name: String,
    pub view_type: String,
    pub config: serde_json::Value,
    pub owner_id: Uuid,
    pub shared: bool,
    pub position: f64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Deserialize, Debug)]
pub struct CreateBoardViewRequest {
    pub name: String,
    pub view_type: String,
    pub config: Option<serde_json::Value>,
    pub shared: Option<bool>,
}

#[derive(Deserialize, Debug)]
pub struct PatchBoardViewRequest {
    pub name: Option<String>,
    pub config: Option<serde_json::Value>,
    pub shared: Option<bool>,
    pub position: Option<f64>,
}

// ---------------------------------------------------------------------------
// API contract tests
// ---------------------------------------------------------------------------
//
// These are pure `serde_json` round-trip checks to catch the class of bug
// where a request payload's field name silently drifts from the UI's wire
// contract — e.g. backend accepts `text` but the frontend sends `title`,
// and both sides compile fine while every checklist-item add 422s at
// runtime. Each test deserialises a JSON body modelled on the frontend's
// actual API call and asserts the backend accepts it. Renaming a field
// now forces both sides to move together.
#[cfg(test)]
mod contract_tests {
    use super::*;

    #[test]
    fn checklist_item_add_accepts_title_key() {
        let payload = serde_json::json!({ "title": "buy milk", "checked": false });
        let req: AddChecklistItemRequest = serde_json::from_value(payload)
            .expect("AddChecklistItemRequest must accept `title` (not `text`)");
        assert_eq!(req.title, "buy milk");
        assert_eq!(req.checked, Some(false));
    }

    #[test]
    fn checklist_item_patch_accepts_title_and_checked_partial() {
        let only_title = serde_json::json!({ "title": "renamed" });
        let r1: PatchChecklistItemRequest = serde_json::from_value(only_title)
            .expect("PatchChecklistItemRequest accepts title-only");
        assert_eq!(r1.title.as_deref(), Some("renamed"));
        assert_eq!(r1.checked, None);

        let only_checked = serde_json::json!({ "checked": true });
        let r2: PatchChecklistItemRequest = serde_json::from_value(only_checked)
            .expect("PatchChecklistItemRequest accepts checked-only");
        assert_eq!(r2.title, None);
        assert_eq!(r2.checked, Some(true));
    }

    #[test]
    fn create_checklist_accepts_title() {
        let payload = serde_json::json!({ "title": "Acceptance Criteria" });
        let req: CreateChecklistRequest =
            serde_json::from_value(payload).expect("CreateChecklistRequest accepts title");
        assert_eq!(req.title, "Acceptance Criteria");
    }

    #[test]
    fn custom_field_create_accepts_all_handler_whitelist_types() {
        // Mirrors the handler's `valid_types` array. If a new type is
        // added to the handler but the DB CHECK constraint isn't widened
        // (as happened with progress/email/phone/person pre-0014), this
        // test still passes at serde level — but it pins the on-the-wire
        // shape so the front-end and back-end can rely on it.
        for field_type in [
            "text",
            "number",
            "progress",
            "select",
            "multi_select",
            "date",
            "checkbox",
            "url",
            "email",
            "phone",
            "person",
        ] {
            let payload = serde_json::json!({
                "name": "My field",
                "field_type": field_type,
            });
            let req: CreateCustomFieldRequest = serde_json::from_value(payload)
                .unwrap_or_else(|e| panic!("CreateCustomFieldRequest rejected {field_type}: {e}"));
            assert_eq!(req.field_type, field_type);
        }
    }

    #[test]
    fn move_task_request_uses_flat_payload() {
        let payload = serde_json::json!({
            "column_id": "019d8226-9499-7ec3-8aa7-9186d5513929",
            "position": 512.5,
            "version": 43
        });
        let req: MoveTaskRequest = serde_json::from_value(payload)
            .expect("MoveTaskRequest accepts frontend payload");
        assert!((req.position - 512.5_f64).abs() < f64::EPSILON);
        assert_eq!(req.version, Some(43));
    }

    #[test]
    fn create_custom_field_optional_fields_default_sanely() {
        // Inline `+ Add a property` popover in TaskModal sends only
        // `name` + `field_type`. All other fields must default.
        let payload = serde_json::json!({
            "name": "Estimate",
            "field_type": "number"
        });
        let req: CreateCustomFieldRequest =
            serde_json::from_value(payload).expect("Optional fields must default");
        assert_eq!(req.name, "Estimate");
        assert_eq!(req.field_type, "number");
    }
}
