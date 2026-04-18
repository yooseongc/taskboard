//! Activity → notification fan-out.
//!
//! Called from `activity_helper::insert_activity` inside the same
//! transaction that wrote the activity row. Recipient set is:
//!
//!   board_members(board_id)  ∪  task_assignees(task_id)   \  {actor_id}
//!
//! Every recipient gets one `board_activity` notification row. We use
//! anti-join SQL so the fan-out is a single round-trip regardless of how
//! many members the board has.

use uuid::Uuid;

/// Insert one `board_activity` notification per recipient, in the same
/// transaction as the caller. Never errors on an empty recipient set —
/// the WHERE clauses just produce zero rows. Row IDs come from
/// `uuid_generate_v4()` (uuid-ossp, enabled in 0000_extensions.sql) so
/// the fan-out stays single-shot regardless of member count; the
/// inbox ordering index drives listing, not UUID monotonicity.
pub async fn fan_out_activity(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    board_id: Uuid,
    task_id: Option<Uuid>,
    actor_id: Uuid,
    action: &str,
    payload: &serde_json::Value,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO notifications
            (id, user_id, kind, board_id, task_id, actor_id, action, payload, dedup_key)
        SELECT
            uuid_generate_v4(),
            r.user_id,
            'board_activity',
            $1,
            $2,
            $3,
            $4,
            $5,
            NULL
        FROM (
            SELECT user_id FROM board_members WHERE board_id = $1
            UNION
            SELECT user_id FROM task_assignees WHERE task_id = $2
        ) AS r
        WHERE r.user_id <> $3
        "#,
    )
    .bind(board_id)
    .bind(task_id)
    .bind(actor_id)
    .bind(action)
    .bind(payload)
    .execute(&mut **tx)
    .await?;

    Ok(())
}
