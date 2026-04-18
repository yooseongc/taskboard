use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

/// Wire shape for the inbox list. Adds actor_name/board_title/task_title so
/// the UI can render a one-line summary without a second round-trip.
#[derive(Serialize, Debug)]
pub struct NotificationSummary {
    pub id: Uuid,
    pub kind: String,
    pub board_id: Option<Uuid>,
    pub board_title: Option<String>,
    pub task_id: Option<Uuid>,
    pub task_title: Option<String>,
    pub actor_id: Option<Uuid>,
    pub actor_name: Option<String>,
    pub action: Option<String>,
    pub payload: serde_json::Value,
    pub read_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}
