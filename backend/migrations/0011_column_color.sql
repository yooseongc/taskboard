-- Round B.1 — Column color
--
-- Adds an optional accent color to kanban columns. Stored as a 7-char
-- string to hold a leading-# hex triple (e.g. "#6366f1"). NULL means
-- "use theme default", which keeps all pre-existing boards looking
-- identical until the user opts in.
ALTER TABLE board_columns ADD COLUMN color VARCHAR(7);
