-- S-026: Migration 0001 — Identity
CREATE TABLE users (
    id              UUID PRIMARY KEY,
    external_id     TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    email           TEXT NOT NULL,
    email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_external_id ON users(external_id);
CREATE INDEX idx_users_email ON users(email);
