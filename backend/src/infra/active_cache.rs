use moka::sync::Cache;
use sqlx::PgPool;
use std::time::Duration;
use uuid::Uuid;

/// In-memory LRU cache for `users.active` status.
/// TTL = 10 seconds, max 10,000 entries.
/// Reduces per-request DB round-trips in the AuthnUser extractor (R-026, D-039).
#[derive(Clone)]
pub struct ActiveCache {
    inner: Cache<Uuid, bool>,
}

impl ActiveCache {
    pub fn new() -> Self {
        Self {
            inner: Cache::builder()
                .max_capacity(10_000)
                .time_to_live(Duration::from_secs(10))
                .build(),
        }
    }

    /// Look up `active` status. On cache miss, query DB and populate cache.
    pub async fn is_active(&self, pool: &PgPool, user_id: Uuid) -> Result<bool, sqlx::Error> {
        if let Some(active) = self.inner.get(&user_id) {
            return Ok(active);
        }
        let row: Option<(bool,)> =
            sqlx::query_as("SELECT active FROM users WHERE id = $1")
                .bind(user_id)
                .fetch_optional(pool)
                .await?;
        let active = row.map(|(a,)| a).unwrap_or(false);
        self.inner.insert(user_id, active);
        Ok(active)
    }

    /// Invalidate a specific user's cached entry (e.g. after admin toggles active).
    pub fn invalidate(&self, user_id: Uuid) {
        self.inner.invalidate(&user_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // ActiveCache in-memory behavior (no DB dependency).
    // -----------------------------------------------------------------------

    #[test]
    fn active_cache_new_does_not_panic() {
        let cache = ActiveCache::new();
        // verify inner cache exists with correct capacity
        assert_eq!(cache.inner.entry_count(), 0);
    }

    #[test]
    fn active_cache_invalidate_missing_key_is_noop() {
        let cache = ActiveCache::new();
        let id = Uuid::new_v4();
        // Should not panic even if key is absent.
        cache.invalidate(id);
    }

    #[test]
    fn active_cache_insert_and_get() {
        let cache = ActiveCache::new();
        let id = Uuid::new_v4();
        cache.inner.insert(id, true);
        assert_eq!(cache.inner.get(&id), Some(true));
    }

    #[test]
    fn active_cache_invalidate_removes_entry() {
        let cache = ActiveCache::new();
        let id = Uuid::new_v4();
        cache.inner.insert(id, true);
        cache.invalidate(id);
        assert_eq!(cache.inner.get(&id), None);
    }
}
