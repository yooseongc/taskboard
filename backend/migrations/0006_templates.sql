-- S-026: Migration 0006 — Templates
CREATE TABLE templates (
    id                  UUID PRIMARY KEY,
    kind                TEXT NOT NULL CHECK (kind IN ('board', 'card')),
    name                TEXT NOT NULL,
    description         TEXT,
    owner_id            UUID NOT NULL REFERENCES users(id),
    scope               TEXT NOT NULL CHECK (scope IN ('user', 'department', 'global')),
    scope_ref_id        UUID REFERENCES departments(id) ON DELETE RESTRICT,
    auto_enroll_members BOOLEAN NOT NULL DEFAULT FALSE,
    payload             JSONB NOT NULL,
    payload_version     SMALLINT NOT NULL DEFAULT 1,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    CHECK (
        (scope = 'department' AND scope_ref_id IS NOT NULL)
        OR (scope = 'user' AND scope_ref_id IS NULL)
        OR (scope = 'global' AND scope_ref_id IS NULL)
    )
);
CREATE INDEX idx_templates_scope ON templates(scope, scope_ref_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_templates_owner ON templates(owner_id);

-- Add deferred FK from boards to templates
ALTER TABLE boards
    ADD CONSTRAINT fk_boards_origin_template
    FOREIGN KEY (origin_template_id) REFERENCES templates(id) ON DELETE SET NULL;

CREATE INDEX idx_boards_origin_template ON boards(origin_template_id);
