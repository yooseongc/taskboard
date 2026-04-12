-- S-026: Migration 0004 — Tasks
CREATE TABLE tasks (
    id          UUID PRIMARY KEY,
    board_id    UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    column_id   UUID NOT NULL REFERENCES board_columns(id) ON DELETE RESTRICT,
    position    DOUBLE PRECISION NOT NULL,
    title       TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 255),
    description TEXT,
    priority    TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
    status      TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'done', 'archived')) DEFAULT 'open',
    start_date  TIMESTAMPTZ,
    due_date    TIMESTAMPTZ,
    created_by  UUID NOT NULL REFERENCES users(id),
    version     BIGINT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ
);
CREATE INDEX idx_tasks_board_col_pos ON tasks(board_id, column_id, position);
CREATE INDEX idx_tasks_board_dates ON tasks(board_id, start_date, due_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_board ON tasks(board_id) WHERE deleted_at IS NULL;

CREATE TABLE labels (
    id          UUID PRIMARY KEY,
    board_id    UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    color       TEXT NOT NULL,
    UNIQUE (board_id, name)
);

CREATE TABLE task_labels (
    task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    label_id    UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, label_id)
);

CREATE TABLE task_assignees (
    task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, user_id)
);
CREATE INDEX idx_task_assignees_user ON task_assignees(user_id);

CREATE TABLE task_checklists (
    id          UUID PRIMARY KEY,
    task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_checklists_task ON task_checklists(task_id);

CREATE TABLE task_checklist_items (
    id              UUID PRIMARY KEY,
    checklist_id    UUID NOT NULL REFERENCES task_checklists(id) ON DELETE CASCADE,
    text            TEXT NOT NULL,
    checked         BOOLEAN NOT NULL DEFAULT FALSE,
    position        DOUBLE PRECISION NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_checklist_items_cl ON task_checklist_items(checklist_id);
