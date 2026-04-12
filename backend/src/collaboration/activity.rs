use serde::{Deserialize, Serialize};

/// S-027: ActivityAction enum — 23 actions (+ 1 dev-auth conditional).
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum ActivityAction {
    // Task actions (12)
    #[serde(rename = "task.created")]
    TaskCreated,
    #[serde(rename = "task.updated")]
    TaskUpdated,
    #[serde(rename = "task.moved_column")]
    TaskMovedColumn,
    #[serde(rename = "task.reordered")]
    TaskReordered,
    #[serde(rename = "task.deleted")]
    TaskDeleted,
    #[serde(rename = "task.label_added")]
    TaskLabelAdded,
    #[serde(rename = "task.label_removed")]
    TaskLabelRemoved,
    #[serde(rename = "task.assignee_added")]
    TaskAssigneeAdded,
    #[serde(rename = "task.assignee_removed")]
    TaskAssigneeRemoved,
    #[serde(rename = "task.checklist_item_toggled")]
    TaskChecklistItemToggled,
    #[serde(rename = "task.commented")]
    TaskCommented,
    #[serde(rename = "task.comment_edited")]
    TaskCommentEdited,

    // Board actions (4)
    #[serde(rename = "board.created")]
    BoardCreated,
    #[serde(rename = "board.updated")]
    BoardUpdated,
    #[serde(rename = "board.member_added")]
    BoardMemberAdded,
    #[serde(rename = "board.member_removed")]
    BoardMemberRemoved,

    // Column actions (4)
    #[serde(rename = "column.created")]
    ColumnCreated,
    #[serde(rename = "column.updated")]
    ColumnUpdated,
    #[serde(rename = "column.deleted")]
    ColumnDeleted,
    #[serde(rename = "column.reordered")]
    ColumnReordered,

    // Template actions (3)
    #[serde(rename = "template.created")]
    TemplateCreated,
    #[serde(rename = "template.updated")]
    TemplateUpdated,
    #[serde(rename = "template.used")]
    TemplateUsed,

    // Dev-only (conditional compilation)
    #[cfg(feature = "dev-auth")]
    #[serde(rename = "dev.login_issued")]
    DevLoginIssued,
}
