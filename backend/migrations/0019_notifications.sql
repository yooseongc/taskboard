-- Per-user notification inbox.
--
-- Two producers:
--   1. activity_helper::insert_activity → fan-out to board_members ∪
--      task_assignees (minus the actor) with kind='board_activity'.
--   2. deadline_scanner (tokio task) → 'deadline_soon' / 'deadline_overdue'
--      rows for task assignees whose due_date falls in a scanning window.
--
-- `dedup_key` is only set by the scanner so repeated scans of the same
-- task+due_date collapse to a single row. The partial unique index
-- covers this while leaving activity rows (which should always accumulate)
-- untouched.

CREATE TABLE notifications (
    id          UUID PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL CHECK (kind IN (
        'deadline_soon',
        'deadline_overdue',
        'board_activity',
        'mentioned',
        'assigned'
    )),
    board_id    UUID REFERENCES boards(id) ON DELETE CASCADE,
    task_id     UUID REFERENCES tasks(id) ON DELETE CASCADE,
    actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    action      TEXT,
    payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
    read_at     TIMESTAMPTZ,
    dedup_key   TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Inbox listing: most-recent-first, paged by (created_at, id).
CREATE INDEX idx_notif_user_created
    ON notifications (user_id, created_at DESC, id DESC);

-- Unread-count probe: tight partial index so the badge query is cheap
-- even for users with long activity history.
CREATE INDEX idx_notif_user_unread
    ON notifications (user_id)
    WHERE read_at IS NULL;

-- Deadline dedup: prevents the scanner from re-inserting the same
-- (user, deadline-event, task, timestamp) row on every tick. NULL
-- dedup_key (activity fan-out rows) is exempt by design — partial index.
CREATE UNIQUE INDEX idx_notif_dedup
    ON notifications (user_id, dedup_key)
    WHERE dedup_key IS NOT NULL;
