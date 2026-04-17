use std::env;
use std::net::SocketAddr;

/// Application configuration loaded from environment variables (S-029).
/// All 11 backend core keys + 2 dev-auth keys.
///
/// `log_level`, `log_format`, `jwks_grace_ttl_secs`, and `seed_on_start` are
/// parsed and validated from the environment for fail-fast startup, but are
/// not yet wired to their consumers (tracing subscriber, JWKS cache grace
/// window, seed-on-start runner). Keeping them on the struct means an
/// operator deploying a malformed value still crashes at boot rather than
/// silently ignoring it, and the consuming code can adopt them without a
/// config surface change.
#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct AppConfig {
    // Backend core (11 keys)
    pub database_url: String,
    pub keycloak_issuer: String,
    pub keycloak_jwks_url: Option<String>,
    pub keycloak_audience: String,
    pub cors_allowed_origins: Vec<String>,
    pub bind_addr: SocketAddr,
    pub log_level: String,
    pub log_format: String,
    pub jwks_cache_ttl_secs: u64,
    pub jwks_grace_ttl_secs: u64,
    pub seed_on_start: bool,

    // System admin emails (comma-separated env SYSTEM_ADMIN_EMAILS)
    pub system_admin_emails: Vec<String>,

    // ROLES.md §10: OIDC group → department auto-sync
    /// Claim name to read groups from (default: "groups").
    pub oidc_dept_claim: String,
    /// Whether to perform the sync at all (default: true).
    pub oidc_dept_sync_enabled: bool,

    // Dev-auth keys (2 keys, only compiled when feature = "dev-auth")
    #[cfg(feature = "dev-auth")]
    pub dev_auth_enabled: bool,
    #[cfg(feature = "dev-auth")]
    pub dev_auth_hmac_key: Option<String>,
}

impl AppConfig {
    /// Load configuration from environment variables.
    /// Panics on missing required keys or invalid values (S-029 failure_semantics).
    pub fn from_env() -> Self {
        let database_url = required_env("DATABASE_URL");
        let keycloak_issuer = required_env("KEYCLOAK_ISSUER");
        let keycloak_jwks_url = env::var("KEYCLOAK_JWKS_URL").ok();
        let keycloak_audience = required_env("KEYCLOAK_AUDIENCE");

        let cors_raw = required_env("CORS_ALLOWED_ORIGINS");
        if cors_raw.contains('*') {
            panic!("CORS_ALLOWED_ORIGINS must not contain '*'. Got: {cors_raw}");
        }
        let cors_allowed_origins: Vec<String> =
            cors_raw.split(',').map(|s| s.trim().to_string()).collect();

        let bind_addr: SocketAddr = env::var("BACKEND_BIND_ADDR")
            .unwrap_or_else(|_| "0.0.0.0:8080".to_string())
            .parse()
            .expect("BACKEND_BIND_ADDR must be a valid socket address");

        let log_level = env::var("LOG_LEVEL").unwrap_or_else(|_| "info".to_string());
        let log_format = env::var("LOG_FORMAT").unwrap_or_else(|_| "json".to_string());

        let jwks_cache_ttl_secs: u64 = env::var("JWKS_CACHE_TTL_SECS")
            .unwrap_or_else(|_| "600".to_string())
            .parse()
            .expect("JWKS_CACHE_TTL_SECS must be a valid u64");

        let jwks_grace_ttl_secs: u64 = env::var("JWKS_GRACE_TTL_SECS")
            .unwrap_or_else(|_| "600".to_string())
            .parse()
            .expect("JWKS_GRACE_TTL_SECS must be a valid u64");

        let seed_on_start: bool = env::var("SEED_ON_START")
            .unwrap_or_else(|_| "false".to_string())
            .parse()
            .expect("SEED_ON_START must be true or false");

        // System admin emails
        let system_admin_emails: Vec<String> = env::var("SYSTEM_ADMIN_EMAILS")
            .unwrap_or_default()
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        // ROLES.md §10: OIDC dept sync settings
        let oidc_dept_claim = env::var("OIDC_DEPT_CLAIM").unwrap_or_else(|_| "groups".to_string());
        let oidc_dept_sync_enabled = env::var("OIDC_DEPT_SYNC_ENABLED")
            .map(|v| v.to_lowercase() != "false" && v != "0")
            .unwrap_or(true);

        // Dev-auth keys (only read when feature = "dev-auth")
        #[cfg(feature = "dev-auth")]
        let dev_auth_enabled = env::var("TASKBOARD_DEV_AUTH")
            .map(|v| v == "1")
            .unwrap_or(false);

        #[cfg(feature = "dev-auth")]
        let dev_auth_hmac_key = env::var("TASKBOARD_DEV_AUTH_HMAC_KEY").ok();

        #[cfg(feature = "dev-auth")]
        if dev_auth_enabled && dev_auth_hmac_key.is_none() {
            panic!(
                "TASKBOARD_DEV_AUTH=1 but TASKBOARD_DEV_AUTH_HMAC_KEY is not set. \
                 Cannot start with dev-auth enabled without an HMAC key."
            );
        }

        Self {
            database_url,
            keycloak_issuer,
            keycloak_jwks_url,
            keycloak_audience,
            cors_allowed_origins,
            bind_addr,
            log_level,
            log_format,
            jwks_cache_ttl_secs,
            jwks_grace_ttl_secs,
            seed_on_start,
            system_admin_emails,
            oidc_dept_claim,
            oidc_dept_sync_enabled,
            #[cfg(feature = "dev-auth")]
            dev_auth_enabled,
            #[cfg(feature = "dev-auth")]
            dev_auth_hmac_key,
        }
    }

    /// Derive the JWKS URL from the issuer if not explicitly set.
    pub fn effective_jwks_url(&self) -> String {
        self.keycloak_jwks_url
            .clone()
            .unwrap_or_else(|| format!("{}/protocol/openid-connect/certs", self.keycloak_issuer))
    }
}

fn required_env(key: &str) -> String {
    env::var(key).unwrap_or_else(|_| panic!("Required environment variable {key} is not set"))
}

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // Regression guard: Findings #7 and #8.
    // #7: dev-login route is cfg-gated — verified via router.rs code review
    //     (the route is under #[cfg(feature = "dev-auth")]).
    // #8: dev_auth fields are cfg-gated — verified here structurally.
    //
    // These tests verify the config struct shape when dev-auth is NOT enabled.
    // -----------------------------------------------------------------------

    #[test]
    fn q007_effective_jwks_url_from_issuer() {
        // effective_jwks_url derives from keycloak_issuer if not set.
        let config = AppConfig {
            database_url: String::new(),
            keycloak_issuer: "https://keycloak.example.com/realms/test".into(),
            keycloak_jwks_url: None,
            keycloak_audience: "taskboard".into(),
            cors_allowed_origins: vec![],
            bind_addr: "0.0.0.0:8080".parse().unwrap(),
            log_level: "info".into(),
            log_format: "json".into(),
            jwks_cache_ttl_secs: 600,
            jwks_grace_ttl_secs: 600,
            seed_on_start: false,
            system_admin_emails: vec![],
            #[cfg(feature = "dev-auth")]
            dev_auth_enabled: false,
            #[cfg(feature = "dev-auth")]
            dev_auth_hmac_key: None,
        };
        assert_eq!(
            config.effective_jwks_url(),
            "https://keycloak.example.com/realms/test/protocol/openid-connect/certs"
        );
    }

    #[test]
    fn q007_effective_jwks_url_explicit() {
        let config = AppConfig {
            database_url: String::new(),
            keycloak_issuer: "https://keycloak.example.com/realms/test".into(),
            keycloak_jwks_url: Some("https://custom-jwks.example.com/keys".into()),
            keycloak_audience: "taskboard".into(),
            cors_allowed_origins: vec![],
            bind_addr: "0.0.0.0:8080".parse().unwrap(),
            log_level: "info".into(),
            log_format: "json".into(),
            jwks_cache_ttl_secs: 600,
            jwks_grace_ttl_secs: 600,
            seed_on_start: false,
            system_admin_emails: vec![],
            #[cfg(feature = "dev-auth")]
            dev_auth_enabled: false,
            #[cfg(feature = "dev-auth")]
            dev_auth_hmac_key: None,
        };
        assert_eq!(
            config.effective_jwks_url(),
            "https://custom-jwks.example.com/keys"
        );
    }
}
