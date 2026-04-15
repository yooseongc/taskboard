// Collaboration bounded context (D-030)
// Handles boards, columns, tasks, comments, activity, templates.

pub mod activity;
pub mod activity_helper;
pub mod board_handlers;
pub mod comment_handlers;
pub mod custom_field_handlers;
pub mod models;
pub mod position;
pub mod task_handlers;
pub mod template_handlers;
pub mod view_handlers;

/// Re-export all handlers under `handlers` namespace for backward compatibility
/// with router imports (`use crate::collaboration::handlers as collab`).
pub mod handlers {
    pub use super::board_handlers::*;
    pub use super::comment_handlers::*;
    pub use super::custom_field_handlers::*;
    pub use super::task_handlers::*;
    pub use super::template_handlers::*;
    pub use super::view_handlers::*;
}
