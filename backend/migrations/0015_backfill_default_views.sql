-- Migration 0015 — Backfill default Kanban/Table/Calendar views for existing boards
--
-- The board-creation handler now auto-seeds three shared default views
-- (`Kanban` / `Table` / `Calendar`) so every new board shows up in the
-- sidebar with a pre-populated view list. Boards created before migration
-- 0013/seed_default_views won't have them — this migration back-seeds the
-- same trio for every existing board, guarded by `NOT EXISTS` so it's a
-- no-op for boards the user has already customized.
--
-- Owner is resolved from the board's current owner_id; position is
-- assigned per type (0 / 1024 / 2048) matching the seed helper.

INSERT INTO board_views (id, board_id, name, view_type, config, owner_id, shared, position)
SELECT
    gen_random_uuid(),
    b.id,
    t.name,
    t.view_type,
    '{}'::jsonb,
    b.owner_id,
    TRUE,
    t.position
FROM boards b
CROSS JOIN (
    VALUES
        ('Kanban', 'board',    0.0),
        ('Table', 'table',     1024.0),
        ('Calendar', 'calendar', 2048.0)
) AS t(name, view_type, position)
WHERE b.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM board_views bv
    WHERE bv.board_id = b.id AND bv.view_type = t.view_type
  );
