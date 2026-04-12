-- Migration 0008 — User preferences (theme, locale, etc.)

CREATE TABLE user_preferences (
    user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    theme       TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
    locale      TEXT NOT NULL DEFAULT 'ko',
    preferences JSONB NOT NULL DEFAULT '{}',   -- extensible key-value store
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
