use axum::routing::{delete, get, patch, post, put};
use axum::Router;

use crate::collaboration::handlers as collab;
use crate::identity::handlers as identity;
use crate::identity::preference_handlers as prefs;
use crate::infra::state::AppState;
use crate::organization::handlers as org;

/// Build the application router with all API routes.
pub fn build_router(state: AppState) -> Router {
    let auth_routes = Router::new()
        .route("/api/auth/callback", post(identity::auth_callback))
        .route("/api/auth/whoami", get(identity::whoami));

    #[cfg(feature = "dev-auth")]
    let auth_routes = auth_routes.route("/api/dev/login", post(identity::dev_login));

    let user_routes = Router::new()
        .route("/api/users", get(identity::list_users))
        .route("/api/users/me", get(identity::whoami))
        .route("/api/users/{id}", patch(identity::patch_user))
        .route(
            "/api/users/me/preferences",
            get(prefs::get_preferences).patch(prefs::patch_preferences),
        );

    let dept_routes = Router::new()
        .route("/api/departments", post(org::create_department))
        .route("/api/departments", get(org::list_departments))
        .route("/api/departments/{id}", get(org::get_department))
        .route("/api/departments/{id}", patch(org::patch_department))
        .route("/api/departments/{id}", delete(org::delete_department))
        .route(
            "/api/departments/{id}/ancestors",
            get(org::get_ancestors),
        )
        .route(
            "/api/departments/{id}/descendants",
            get(org::get_descendants),
        )
        .route(
            "/api/departments/{id}/members",
            post(org::add_member),
        )
        .route(
            "/api/departments/{id}/members",
            get(org::list_members),
        )
        .route(
            "/api/departments/{id}/members/{user_id}",
            delete(org::remove_member),
        )
        .route(
            "/api/departments/{id}/members/{user_id}",
            patch(org::patch_member_role),
        );

    let board_routes = Router::new()
        .route("/api/boards", post(collab::create_board))
        .route("/api/boards", get(collab::list_boards))
        // ROLES.md §5: bucketed board listing for the current user
        .route("/api/users/me/boards", get(collab::list_my_boards))
        // ROLES.md §8: pin/unpin a board
        .route("/api/users/me/pins/{board_id}", put(collab::toggle_board_pin))
        // ROLES.md §6: management views — boards per user / per department
        .route("/api/users/{user_id}/boards", get(collab::list_user_boards))
        .route("/api/departments/{dept_id}/boards", get(collab::list_department_boards))
        // ROLES.md §7: board ownership transfer
        .route("/api/boards/{id}/transfer", patch(collab::transfer_board))
        // ROLES.md §9: audit log (SystemAdmin only)
        .route("/api/audit-logs", get(collab::list_audit_logs))
        .route("/api/boards/{id}", get(collab::get_board))
        .route("/api/boards/{id}", patch(collab::patch_board))
        .route("/api/boards/{id}", delete(collab::delete_board))
        // Board members (S-014)
        .route(
            "/api/boards/{id}/members",
            post(collab::add_board_member),
        )
        .route(
            "/api/boards/{id}/members",
            get(collab::list_board_members),
        )
        .route(
            "/api/boards/{id}/members/{user_id}",
            delete(collab::remove_board_member),
        )
        .route(
            "/api/boards/{id}/members/{user_id}",
            patch(collab::patch_board_member),
        )
        // Board departments (S-015)
        .route(
            "/api/boards/{id}/departments",
            put(collab::set_board_departments),
        )
        .route(
            "/api/boards/{id}/departments",
            get(collab::list_board_departments),
        )
        // Columns (S-016)
        .route(
            "/api/boards/{id}/columns",
            post(collab::create_column),
        )
        .route(
            "/api/boards/{id}/columns",
            get(collab::list_columns),
        )
        .route(
            "/api/boards/{id}/columns/{col_id}",
            patch(collab::patch_column),
        )
        .route(
            "/api/boards/{id}/columns/{col_id}",
            delete(collab::delete_column),
        )
        // Tasks (S-017, S-020)
        .route(
            "/api/boards/{id}/tasks",
            get(collab::list_board_tasks).post(collab::create_task),
        )
        // Board labels (S-019)
        .route(
            "/api/boards/{id}/labels",
            get(collab::list_board_labels).post(collab::create_board_label),
        )
        // Activity (S-024)
        .route(
            "/api/boards/{id}/activity",
            get(collab::list_activity),
        )
        // Custom fields
        .route(
            "/api/boards/{id}/fields",
            get(collab::list_custom_fields).post(collab::create_custom_field),
        )
        .route(
            "/api/boards/{id}/fields/{field_id}",
            patch(collab::patch_custom_field).delete(collab::delete_custom_field),
        )
        .route(
            "/api/boards/{id}/field-values",
            get(collab::list_board_field_values),
        )
        // Saved views (Round C)
        .route(
            "/api/boards/{id}/views",
            get(collab::list_board_views).post(collab::create_board_view),
        )
        .route(
            "/api/boards/{id}/views/{view_id}",
            patch(collab::patch_board_view).delete(collab::delete_board_view),
        );

    let task_routes = Router::new()
        .route("/api/tasks/{id}", get(collab::get_task))
        .route("/api/tasks/{id}", patch(collab::patch_task))
        .route("/api/tasks/{id}", delete(collab::delete_task))
        .route("/api/tasks/{id}/move", patch(collab::move_task))
        // Task sub-resources (S-019)
        .route(
            "/api/tasks/{task_id}/labels",
            post(collab::add_task_label),
        )
        .route(
            "/api/tasks/{task_id}/labels/{label_id}",
            delete(collab::remove_task_label),
        )
        .route(
            "/api/tasks/{task_id}/assignees",
            post(collab::add_task_assignee),
        )
        .route(
            "/api/tasks/{task_id}/assignees/{user_id}",
            delete(collab::remove_task_assignee),
        )
        .route(
            "/api/tasks/{task_id}/checklists",
            get(collab::list_checklists).post(collab::create_checklist),
        )
        .route(
            "/api/tasks/{task_id}/checklists/{cl_id}/items",
            post(collab::add_checklist_item),
        )
        .route(
            "/api/tasks/{task_id}/checklists/{cl_id}/items/{item_id}",
            patch(collab::patch_checklist_item),
        )
        // Comments (S-021)
        .route(
            "/api/tasks/{task_id}/comments",
            post(collab::create_comment),
        )
        .route(
            "/api/tasks/{task_id}/comments",
            get(collab::list_comments),
        )
        .route(
            "/api/tasks/{task_id}/comments/{comment_id}",
            patch(collab::patch_comment),
        )
        .route(
            "/api/tasks/{task_id}/comments/{comment_id}",
            delete(collab::delete_comment),
        )
        // Task custom field values
        .route(
            "/api/tasks/{task_id}/fields",
            get(collab::get_task_field_values),
        )
        .route(
            "/api/tasks/{task_id}/fields/{field_id}",
            put(collab::set_task_field_value),
        );

    let template_routes = Router::new()
        .route("/api/templates", post(collab::create_template))
        .route("/api/templates", get(collab::list_templates))
        .route("/api/templates/{id}", get(collab::get_template))
        .route("/api/templates/{id}", patch(collab::patch_template))
        .route("/api/templates/{id}", delete(collab::delete_template));

    // Health check (not in spec but standard practice -- no auth required)
    let health = Router::new().route("/health", get(health_check));

    Router::new()
        .merge(health)
        .merge(auth_routes)
        .merge(user_routes)
        .merge(dept_routes)
        .merge(board_routes)
        .merge(task_routes)
        .merge(template_routes)
        .with_state(state)
}

async fn health_check() -> &'static str {
    "ok"
}
