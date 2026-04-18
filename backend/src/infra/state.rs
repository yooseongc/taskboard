use std::sync::Arc;

use sqlx::PgPool;

use crate::authz::authn::AuthnUser;
use crate::authz::jwks::JwksCache;
use crate::config::AppConfig;
use crate::infra::active_cache::ActiveCache;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: AppConfig,
    /// `None` in SSO mode — JWKS is only initialized when Keycloak is used.
    pub jwks_cache: Option<Arc<JwksCache>>,
    pub active_cache: ActiveCache,
    /// The pre-seeded single user for personal mode. `None` in SSO mode.
    /// When populated, the `AuthnUser` extractor returns a clone of this
    /// value on every request and never parses an `Authorization` header.
    pub personal_user: Option<Arc<AuthnUser>>,
}
