-- Migration 0010 — Generalize Status/Priority into custom select fields
--
-- Mattermost-Boards-style property model: every board gets a `Status` and a
-- `Priority` custom select field, and every existing task's enum value is
-- copied into task_field_values. The `tasks.status` / `tasks.priority`
-- columns are kept for now (data preservation + backwards compat); the UI
-- moves to reading from custom fields first, falling back only if the seeded
-- field is missing (shouldn't happen post-migration).
--
-- Idempotent via WHERE NOT EXISTS guards so re-running the migration (or
-- applying it on a partially-bootstrapped DB) is safe.

-- ---------------------------------------------------------------------------
-- 1. Seed Status select field on every board that doesn't already have one.
-- ---------------------------------------------------------------------------
-- The option `color` values intentionally match the frontend's 8-family
-- palette tokens (neutral/info/success/warning/orange/danger/critical/accent)
-- so `tagClass()` in theme/constants.ts can render the option directly.
INSERT INTO board_custom_fields (id, board_id, name, field_type, options, position, required)
SELECT
    uuid_generate_v4(),
    b.id,
    'Status',
    'select',
    '[
        {"label":"Open","color":"info"},
        {"label":"In Progress","color":"warning"},
        {"label":"Done","color":"success"},
        {"label":"Archived","color":"neutral"}
    ]'::jsonb,
    0,
    false
FROM boards b
WHERE b.deleted_at IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM board_custom_fields bcf
      WHERE bcf.board_id = b.id AND bcf.name = 'Status'
  );

-- ---------------------------------------------------------------------------
-- 2. Seed Priority select field on every board that doesn't already have one.
-- ---------------------------------------------------------------------------
INSERT INTO board_custom_fields (id, board_id, name, field_type, options, position, required)
SELECT
    uuid_generate_v4(),
    b.id,
    'Priority',
    'select',
    '[
        {"label":"Urgent","color":"critical"},
        {"label":"High","color":"orange"},
        {"label":"Medium","color":"warning"},
        {"label":"Low","color":"success"}
    ]'::jsonb,
    1,
    false
FROM boards b
WHERE b.deleted_at IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM board_custom_fields bcf
      WHERE bcf.board_id = b.id AND bcf.name = 'Priority'
  );

-- ---------------------------------------------------------------------------
-- 3. Copy tasks.status -> task_field_values using title-case labels that
--    match the option labels seeded above.
-- ---------------------------------------------------------------------------
INSERT INTO task_field_values (task_id, field_id, value, updated_at)
SELECT
    t.id,
    bcf.id,
    to_jsonb(CASE t.status
        WHEN 'open'        THEN 'Open'
        WHEN 'in_progress' THEN 'In Progress'
        WHEN 'done'        THEN 'Done'
        WHEN 'archived'    THEN 'Archived'
        ELSE t.status
    END),
    now()
FROM tasks t
JOIN board_custom_fields bcf
    ON bcf.board_id = t.board_id AND bcf.name = 'Status'
WHERE t.deleted_at IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM task_field_values tfv
      WHERE tfv.task_id = t.id AND tfv.field_id = bcf.id
  );

-- ---------------------------------------------------------------------------
-- 4. Copy tasks.priority -> task_field_values.
-- ---------------------------------------------------------------------------
INSERT INTO task_field_values (task_id, field_id, value, updated_at)
SELECT
    t.id,
    bcf.id,
    to_jsonb(CASE t.priority
        WHEN 'urgent' THEN 'Urgent'
        WHEN 'high'   THEN 'High'
        WHEN 'medium' THEN 'Medium'
        WHEN 'low'    THEN 'Low'
        ELSE t.priority
    END),
    now()
FROM tasks t
JOIN board_custom_fields bcf
    ON bcf.board_id = t.board_id AND bcf.name = 'Priority'
WHERE t.deleted_at IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM task_field_values tfv
      WHERE tfv.task_id = t.id AND tfv.field_id = bcf.id
  );
