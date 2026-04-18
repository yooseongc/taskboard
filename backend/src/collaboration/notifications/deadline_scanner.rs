//! Periodic task that turns task deadlines into inbox rows.
//!
//! One `tokio::interval` per process. Runs every `SCAN_INTERVAL`, looks at
//! two windows:
//!
//! * `deadline_soon`    — due within the next 24h, not yet past
//! * `deadline_overdue` — due in the past, task still open/in_progress
//!
//! Both inserts use `INSERT ... ON CONFLICT DO NOTHING` against the
//! partial unique index `idx_notif_dedup`, so re-scanning the same task
//! is a no-op.
//!
//! We cap windows to tasks whose `status` is still active so completed
//! tasks stop pinging after close. The task table has no "deleted" row
//! — it uses `deleted_at IS NULL` soft-delete instead.

use std::time::Duration;

use sqlx::PgPool;

/// 15 min default — short enough to surface an approaching deadline
/// the same workday, long enough that the ON CONFLICT deduplication
/// doesn't dominate DB load.
const SCAN_INTERVAL: Duration = Duration::from_secs(15 * 60);

/// Entry point — call once from `main.rs` wrapped in `tokio::spawn`.
/// Swallows DB errors (logs them) so a transient Postgres blip doesn't
/// kill the task.
pub async fn run(pool: PgPool) {
    // Small leading delay lets migrations finish and the first request
    // warm the pool before we take our first scan.
    tokio::time::sleep(Duration::from_secs(30)).await;

    let mut ticker = tokio::time::interval(SCAN_INTERVAL);
    // Skip-missed: if the process stalls, resume on the next tick rather
    // than firing a burst of catch-up scans.
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    loop {
        ticker.tick().await;
        if let Err(e) = scan_once(&pool).await {
            tracing::warn!(error = %e, "deadline_scanner: scan failed");
        }
    }
}

async fn scan_once(pool: &PgPool) -> Result<(), sqlx::Error> {
    // `deadline_soon`: due in (now, now+24h], status in (open, in_progress).
    // dedup_key encodes the due_date so a user re-notifications if the
    // deadline moves.
    let inserted_soon = sqlx::query_scalar::<_, i64>(
        r#"
        WITH ins AS (
            INSERT INTO notifications
                (id, user_id, kind, board_id, task_id, actor_id, action, payload, dedup_key)
            SELECT
                uuid_generate_v4(),
                ta.user_id,
                'deadline_soon',
                t.board_id,
                t.id,
                NULL,
                'deadline.soon',
                jsonb_build_object('due_date', t.due_date),
                'soon:' || t.id::text || ':' || t.due_date::text
            FROM tasks t
            JOIN task_assignees ta ON ta.task_id = t.id
            WHERE t.deleted_at IS NULL
              AND t.status IN ('open', 'in_progress')
              AND t.due_date IS NOT NULL
              AND t.due_date > now()
              AND t.due_date <= now() + interval '24 hours'
            ON CONFLICT DO NOTHING
            RETURNING 1
        )
        SELECT COALESCE(count(*), 0) FROM ins
        "#,
    )
    .fetch_one(pool)
    .await?;

    let inserted_overdue = sqlx::query_scalar::<_, i64>(
        r#"
        WITH ins AS (
            INSERT INTO notifications
                (id, user_id, kind, board_id, task_id, actor_id, action, payload, dedup_key)
            SELECT
                uuid_generate_v4(),
                ta.user_id,
                'deadline_overdue',
                t.board_id,
                t.id,
                NULL,
                'deadline.overdue',
                jsonb_build_object('due_date', t.due_date),
                'overdue:' || t.id::text || ':' || t.due_date::text
            FROM tasks t
            JOIN task_assignees ta ON ta.task_id = t.id
            WHERE t.deleted_at IS NULL
              AND t.status IN ('open', 'in_progress')
              AND t.due_date IS NOT NULL
              AND t.due_date < now()
            ON CONFLICT DO NOTHING
            RETURNING 1
        )
        SELECT COALESCE(count(*), 0) FROM ins
        "#,
    )
    .fetch_one(pool)
    .await?;

    if inserted_soon > 0 || inserted_overdue > 0 {
        tracing::info!(
            soon = inserted_soon,
            overdue = inserted_overdue,
            "deadline_scanner: inserted notifications"
        );
    }
    Ok(())
}
