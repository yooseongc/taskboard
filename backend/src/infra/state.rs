use std::sync::Arc;

use sqlx::PgPool;

use crate::authz::jwks::JwksCache;
use crate::config::AppConfig;
use crate::infra::active_cache::ActiveCache;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: AppConfig,
    pub jwks_cache: Arc<JwksCache>,
    pub active_cache: ActiveCache,
}
