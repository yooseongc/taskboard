-- 0018_task_icon.sql
-- Optional emoji glyph shown as a prefix on task cards, rows, and calendar
-- events. Unicode emojis are multi-byte; 16 bytes comfortably covers a
-- single family emoji with ZWJ joiners.
ALTER TABLE tasks
    ADD COLUMN icon TEXT NULL
        CHECK (icon IS NULL OR (length(icon) BETWEEN 1 AND 16));
COMMENT ON COLUMN tasks.icon IS 'Optional user-chosen emoji prefix (Unicode).';
