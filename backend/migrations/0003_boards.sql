-- S-026: Migration 0003 — Boards
-- NOTE: boards.origin_template_id FK references templates table created in 0006.
-- In production, this FK should be added via ALTER TABLE after 0006.
-- For development, we create without the FK and add it in 0006.

CREATE TABLE boards (
    id                  UUID PRIMARY KEY,
    title               TEXT NOT NULL,
    description         TEXT,
    owner_id            UUID NOT NULL REFERENCES users(id),
    origin_template_id  UUID,  -- FK added in 0006_templates.sql
    version             BIGINT NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ
);
CREATE INDEX idx_boards_owner ON boards(owner_id);
CREATE INDEX idx_boards_deleted ON boards(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE TABLE board_departments (
    board_id        UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    department_id   UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    PRIMARY KEY (board_id, department_id)
);
CREATE INDEX idx_board_depts_dept ON board_departments(department_id);

CREATE TABLE board_members (
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    board_id        UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    role_in_board   TEXT NOT NULL CHECK (role_in_board IN ('BoardAdmin', 'BoardMember', 'BoardViewer')),
    added_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, board_id)
);
CREATE INDEX idx_board_members_board ON board_members(board_id);

CREATE TABLE board_columns (
    id          UUID PRIMARY KEY,
    board_id    UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    position    DOUBLE PRECISION NOT NULL,
    version     BIGINT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_columns_board_position ON board_columns(board_id, position);
CREATE INDEX idx_columns_board ON board_columns(board_id);
