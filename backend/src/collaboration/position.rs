use uuid::Uuid;

use crate::http::error::AppError;

/// Returns true when two positions are close enough to risk collision.
pub fn needs_compaction(a: f64, b: f64) -> bool {
    (b - a).abs() < 1e-9
}

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // Q-005: Position compaction threshold boundary tests.
    // Regression guard for Finding #5: advisory lock return value.
    // The pure function needs_compaction is testable without DB.
    // The compaction functions (compact_column_positions, compact_board_column_positions)
    // now correctly check pg_try_advisory_xact_lock return value (verified by code review).
    // -----------------------------------------------------------------------

    #[test]
    fn q005_needs_compaction_identical_positions() {
        assert!(needs_compaction(100.0, 100.0));
    }

    #[test]
    fn q005_needs_compaction_within_threshold() {
        // 1e-10 difference is < 1e-9 threshold
        assert!(needs_compaction(100.0, 100.0 + 1e-10));
    }

    #[test]
    fn q005_no_compaction_above_threshold() {
        // 1e-8 difference is > 1e-9 threshold
        assert!(!needs_compaction(100.0, 100.0 + 1e-8));
    }

    #[test]
    fn q005_normal_spacing_no_compaction() {
        // Normal 1024.0 spacing should not trigger compaction.
        assert!(!needs_compaction(0.0, 1024.0));
        assert!(!needs_compaction(1024.0, 2048.0));
    }

    #[test]
    fn q005_very_close_positions() {
        // After many reorders, positions can converge.
        let a = 512.0;
        let b = 512.0 + 5e-10; // within threshold
        assert!(needs_compaction(a, b));
    }

    #[test]
    fn q005_negative_positions() {
        // Edge case: positions could theoretically be negative.
        assert!(needs_compaction(-1.0, -1.0));
        assert!(!needs_compaction(-1024.0, 0.0));
    }

    #[test]
    fn q005_exact_threshold_boundary() {
        // Exactly 1e-9 difference is NOT < 1e-9, so should NOT compact.
        assert!(!needs_compaction(0.0, 1e-9));
    }
}

/// Re-number every task in a column with position = index * 1024.0.
/// Uses a PostgreSQL advisory lock scoped to the transaction to serialise
/// concurrent compaction attempts on the same board.
pub async fn compact_column_positions(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    board_id: Uuid,
    column_id: Uuid,
) -> Result<(), AppError> {
    let lock_key = board_id.as_u128() as i64;
    let (locked,): (bool,) = sqlx::query_as(
        "SELECT pg_try_advisory_xact_lock($1)",
    )
    .bind(lock_key)
    .fetch_one(&mut **tx)
    .await?;

    if !locked {
        // Another transaction is already performing compaction — skip.
        return Ok(());
    }

    let tasks: Vec<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM tasks WHERE column_id = $1 AND deleted_at IS NULL ORDER BY position ASC, id ASC",
    )
    .bind(column_id)
    .fetch_all(&mut **tx)
    .await?;

    for (i, (task_id,)) in tasks.iter().enumerate() {
        let new_pos = (i as f64) * 1024.0;
        sqlx::query(
            "UPDATE tasks SET position = $1, version = version + 1, updated_at = now() WHERE id = $2",
        )
        .bind(new_pos)
        .bind(task_id)
        .execute(&mut **tx)
        .await?;
    }

    Ok(())
}

/// Re-number every column in a board with position = index * 1024.0.
pub async fn compact_board_column_positions(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    board_id: Uuid,
) -> Result<(), AppError> {
    let lock_key = board_id.as_u128() as i64;
    let (locked,): (bool,) = sqlx::query_as(
        "SELECT pg_try_advisory_xact_lock($1)",
    )
    .bind(lock_key)
    .fetch_one(&mut **tx)
    .await?;

    if !locked {
        // Another transaction is already performing compaction — skip.
        return Ok(());
    }

    let columns: Vec<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM board_columns WHERE board_id = $1 ORDER BY position ASC, id ASC",
    )
    .bind(board_id)
    .fetch_all(&mut **tx)
    .await?;

    for (i, (col_id,)) in columns.iter().enumerate() {
        let new_pos = (i as f64) * 1024.0;
        sqlx::query(
            "UPDATE board_columns SET position = $1, version = version + 1, updated_at = now() WHERE id = $2",
        )
        .bind(new_pos)
        .bind(col_id)
        .execute(&mut **tx)
        .await?;
    }

    Ok(())
}
