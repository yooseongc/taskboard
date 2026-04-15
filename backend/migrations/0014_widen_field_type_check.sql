-- Migration 0014 — Widen board_custom_fields.field_type CHECK
--
-- The original 0007 migration limited field_type to 7 kinds. The Rust
-- handler has since grown to accept 11 (added email/phone/person for
-- contact-style fields, progress for percent sliders). The handler-side
-- whitelist was the only thing matching the expanded set, so INSERTs of
-- email/phone/person/progress were silently rejected by the DB with
-- `board_custom_fields_field_type_check` violations — surfacing as a
-- vague 500 to the UI.
--
-- Widening the CHECK to match the handler's authoritative list. The
-- handler remains the one source of truth for what's accepted; the DB
-- constraint is kept as a defensive outer bound.

ALTER TABLE board_custom_fields
    DROP CONSTRAINT board_custom_fields_field_type_check;

ALTER TABLE board_custom_fields
    ADD CONSTRAINT board_custom_fields_field_type_check
    CHECK (field_type IN (
        'text',
        'number',
        'progress',
        'select',
        'multi_select',
        'date',
        'checkbox',
        'url',
        'email',
        'phone',
        'person'
    ));
