-- Migration 0007 — Board custom fields and task field values

-- Board-level field definitions
CREATE TABLE board_custom_fields (
    id          UUID PRIMARY KEY,
    board_id    UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
    field_type  TEXT NOT NULL CHECK (field_type IN ('text', 'number', 'select', 'multi_select', 'date', 'checkbox', 'url')),
    options     JSONB NOT NULL DEFAULT '[]',   -- for select/multi_select: [{"label":"...", "color":"..."}]
    position    DOUBLE PRECISION NOT NULL DEFAULT 0,
    required    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (board_id, name)
);
CREATE INDEX idx_board_custom_fields_board ON board_custom_fields(board_id);

-- Task-level field values
CREATE TABLE task_field_values (
    task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    field_id    UUID NOT NULL REFERENCES board_custom_fields(id) ON DELETE CASCADE,
    value       JSONB NOT NULL,    -- actual value (string, number, array, bool depending on type)
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (task_id, field_id)
);
