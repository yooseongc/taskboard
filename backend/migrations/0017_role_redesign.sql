-- Role/Org Redesign — Phase 1: Schema migration
-- See ROLES.md for the full specification.

-- ===========================================================================
-- 1. boards.owner_type: 'department' | 'personal'
-- ===========================================================================

ALTER TABLE boards ADD COLUMN owner_type TEXT NOT NULL DEFAULT 'personal'
    CHECK (owner_type IN ('department', 'personal'));

-- Backfill: existing boards with department mappings → 'department',
-- the rest stay as 'personal' (default).
UPDATE boards
SET owner_type = 'department'
WHERE id IN (SELECT DISTINCT board_id FROM board_departments);

CREATE INDEX idx_boards_owner_type ON boards(owner_type);
CREATE INDEX idx_boards_owner_id ON boards(owner_id) WHERE owner_type = 'personal';

-- ===========================================================================
-- 2. board_members.role_in_board: lowercase ('admin' | 'editor' | 'viewer')
-- ===========================================================================

-- Drop old CHECK constraint, migrate values, re-add new constraint.
ALTER TABLE board_members DROP CONSTRAINT IF EXISTS board_members_role_in_board_check;

UPDATE board_members SET role_in_board = CASE role_in_board
    WHEN 'BoardAdmin' THEN 'admin'
    WHEN 'BoardMember' THEN 'editor'
    WHEN 'BoardViewer' THEN 'viewer'
    ELSE 'viewer'
END;

ALTER TABLE board_members ADD CONSTRAINT board_members_role_in_board_check
    CHECK (role_in_board IN ('admin', 'editor', 'viewer'));

-- ===========================================================================
-- 3. board_pins: user's favorited boards
-- ===========================================================================

CREATE TABLE board_pins (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    pinned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, board_id)
);

CREATE INDEX idx_board_pins_user ON board_pins(user_id);

-- ===========================================================================
-- 4. auth_audit_log: permission/role change history
-- ===========================================================================

CREATE TABLE auth_audit_log (
    id UUID PRIMARY KEY,
    actor_id UUID NOT NULL REFERENCES users(id),
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id UUID,
    before JSONB,
    after JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_actor ON auth_audit_log(actor_id, created_at DESC);
CREATE INDEX idx_audit_log_target ON auth_audit_log(target_type, target_id, created_at DESC);
CREATE INDEX idx_audit_log_action ON auth_audit_log(action, created_at DESC);

-- ===========================================================================
-- 5. Personal boards: owner is automatically an admin in board_members
-- ===========================================================================
-- For all existing personal boards (owner_type='personal'), ensure the owner
-- is in board_members with role 'admin'. This invariant is also enforced in
-- create_board() going forward.

INSERT INTO board_members (user_id, board_id, role_in_board, added_at)
SELECT b.owner_id, b.id, 'admin', b.created_at
FROM boards b
WHERE b.owner_type = 'personal'
  AND b.deleted_at IS NULL
ON CONFLICT (user_id, board_id) DO UPDATE SET role_in_board = 'admin';
