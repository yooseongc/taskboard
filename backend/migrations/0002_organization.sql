-- S-026: Migration 0002 — Organization
CREATE TABLE departments (
    id          UUID PRIMARY KEY,
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL,
    parent_id   UUID REFERENCES departments(id) ON DELETE RESTRICT,
    path        LTREE NOT NULL,
    depth       SMALLINT NOT NULL CHECK (depth <= 5),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (parent_id, slug)
);
CREATE INDEX idx_departments_path ON departments USING GIST (path);
CREATE INDEX idx_departments_parent ON departments(parent_id);

CREATE TABLE department_members (
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    department_id       UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    role_in_department  TEXT NOT NULL CHECK (role_in_department IN ('DepartmentAdmin', 'Member')),
    joined_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, department_id)
);
CREATE INDEX idx_dept_members_dept ON department_members(department_id);
