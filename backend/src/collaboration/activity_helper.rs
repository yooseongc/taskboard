use uuid::Uuid;

use crate::http::error::AppError;
use crate::infra::uuid7;

/// Insert an activity log entry within a transaction.
pub async fn insert_activity(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    board_id: Uuid,
    task_id: Option<Uuid>,
    actor_id: Uuid,
    action: &str,
    payload: serde_json::Value,
) -> Result<(), AppError> {
    sqlx::query(
        "INSERT INTO activity_logs (id, board_id, task_id, actor_id, action, payload, created_at) \
         VALUES ($1, $2, $3, $4, $5, $6, now())",
    )
    .bind(uuid7::now_v7())
    .bind(board_id)
    .bind(task_id)
    .bind(actor_id)
    .bind(action)
    .bind(payload)
    .execute(&mut **tx)
    .await?;
    Ok(())
}
