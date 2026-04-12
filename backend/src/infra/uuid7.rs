use uuid::Uuid;

/// Generate a new UUIDv7 (time-ordered).
/// All primary keys use application-level UUIDv7 generation (S-026).
pub fn now_v7() -> Uuid {
    Uuid::now_v7()
}
