-- Round C — Saved Views
--
-- A "view" is a named bundle of view-type + client UI state (filters,
-- sort order, visible columns, group-by choice, calendar date field
-- selection). Stored server-side so users can save, share, and reuse
-- their board/table/calendar configurations Mattermost-Boards-style.
--
-- Design notes:
--   * `view_type` gates which keys in `config` are meaningful — board,
--     table, and calendar each have their own shape. We keep the
--     schema free-form (`JSONB`) so the frontend can evolve the shape
--     without a migration per UI tweak.
--   * `owner_id` is the user who created the view. When `shared` is
--     true, every member of the board sees it in their view dropdown;
--     when false, only the owner sees it.
--   * `position` sorts views in the dropdown; new views append.

CREATE TABLE board_views (
    id          UUID PRIMARY KEY,
    board_id    UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
    view_type   TEXT NOT NULL CHECK (view_type IN ('board', 'table', 'calendar')),
    config      JSONB NOT NULL DEFAULT '{}'::jsonb,
    owner_id    UUID NOT NULL REFERENCES users(id),
    shared      BOOLEAN NOT NULL DEFAULT FALSE,
    position    DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_board_views_board ON board_views(board_id);
CREATE INDEX idx_board_views_owner ON board_views(owner_id);
