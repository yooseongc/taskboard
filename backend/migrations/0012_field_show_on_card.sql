-- Round B.2 — Custom field "Show on card" toggle
--
-- When true, the field value renders as a small pill on the kanban card
-- in Board View. Defaults to FALSE so existing boards keep their current
-- card layout — only fields the user explicitly opts in show up.
ALTER TABLE board_custom_fields
    ADD COLUMN show_on_card BOOLEAN NOT NULL DEFAULT FALSE;
