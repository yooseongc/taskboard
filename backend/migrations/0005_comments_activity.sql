-- S-026: Migration 0005 — Comments + Activity
CREATE TABLE comments (
    id          UUID PRIMARY KEY,
    task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_id   UUID NOT NULL REFERENCES users(id),
    body        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    edited_at   TIMESTAMPTZ,
    deleted_at  TIMESTAMPTZ
);
CREATE INDEX idx_comments_task ON comments(task_id, created_at ASC);

CREATE TABLE activity_logs (
    id          UUID PRIMARY KEY,
    board_id    UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    task_id     UUID REFERENCES tasks(id) ON DELETE SET NULL,
    actor_id    UUID NOT NULL REFERENCES users(id),
    action      TEXT NOT NULL CHECK (action IN (
        'task.created', 'task.updated', 'task.moved_column', 'task.reordered',
        'task.deleted', 'task.label_added', 'task.label_removed',
        'task.assignee_added', 'task.assignee_removed',
        'task.checklist_item_toggled', 'task.commented', 'task.comment_edited',
        'board.created', 'board.updated', 'board.member_added', 'board.member_removed',
        'column.created', 'column.updated', 'column.deleted', 'column.reordered',
        'template.created', 'template.updated', 'template.used',
        'dev.login_issued'
    )),
    payload     JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_board_time ON activity_logs(board_id, created_at DESC);
CREATE INDEX idx_activity_task ON activity_logs(task_id) WHERE task_id IS NOT NULL;
