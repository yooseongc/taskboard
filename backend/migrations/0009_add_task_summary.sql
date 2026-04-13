-- Migration 0009 — Task summary field
--
-- Adds a short one-line summary to tasks, rendered on kanban cards and table
-- rows. `description` remains the long-form Markdown body shown only in the
-- task drawer. Nullable so existing rows stay valid without backfill.

ALTER TABLE tasks
    ADD COLUMN summary TEXT
        CHECK (summary IS NULL OR char_length(summary) <= 256);
