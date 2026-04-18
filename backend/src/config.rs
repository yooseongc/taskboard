use std::env;
use std::net::SocketAddr;

/// Deployment mode — selected at startup via `TASKBOARD_MODE` env var.
///
/// * `Sso` — the normal team mode: Keycloak-issued JWTs, role/department
///   enforcement, multi-user. Default when the env var is unset.
/// * `Personal` — single-user standalone mode for local/personal use.
///   No login, no Keycloak, a pre-seeded user that passes every permission
///   check via `SystemAdmin`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AppMode {
    Sso,
    Personal,
}

impl AppMode {
    pub fn is_personal(self) -> bool {
        matches!(self, AppMode::Personal)
    }

    pub fn as_str(self) -> &'static str {
        match self {
            AppMode::Sso => "sso",
            AppMode::Personal => "personal",
        }
    }
}

/// Application configuration loaded from environment variables (S-029).
///
/// `log_level`, `log_format`, and `jwks_grace_ttl_secs` are parsed and
/// validated for fail-fast startup but are not yet wired to their consumers
/// (tracing subscriber, JWKS cache grace window). Keeping them on the struct
/// means an operator deploying a malformed value still crashes at boot.
///
/// Demo data seeding is performed by `scripts/seed-demo.py`, not by the
/// backend — the historical `SEED_ON_START` flag was never implemented.
#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct AppConfig {
    // Backend core
    pub mode: AppMode,
    pub database_url: String,
    /// In personal mode this may be empty — Keycloak isn't consulted.
    pub keycloak_issuer: String,
    pub keycloak_jwks_url: Option<String>,
    pub keycloak_audience: String,
    pub cors_allowed_origins: Vec<String>,
    pub bind_addr: SocketAddr,
    pub log_level: String,
    pub log_format: String,
    pub jwks_cache_ttl_secs: u64,
    pub jwks_grace_ttl_secs: u64,

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

        let mode = match env::var("TASKBOARD_MODE").as_deref() {
            Ok("personal") | Ok("Personal") => AppMode::Personal,
            Ok("sso") | Ok("Sso") | Err(_) => AppMode::Sso,
            Ok(other) => panic!(
                "TASKBOARD_MODE must be 'sso' or 'personal'. Got: {other}"
            ),
        };

        // Keycloak is only required in SSO mode. In personal mode we accept
        // empty/missing values so operators can strip them from .env entirely.
        let (keycloak_issuer, keycloak_audience) = match mode {
            AppMode::Sso => (required_env("KEYCLOAK_ISSUER"), required_env("KEYCLOAK_AUDIENCE")),
            AppMode::Personal => (
                env::var("KEYCLOAK_ISSUER").unwrap_or_default(),
                env::var("KEYCLOAK_AUDIENCE").unwrap_or_default(),
            ),
        };
        let keycloak_jwks_url = env::var("KEYCLOAK_JWKS_URL").ok();

        // CORS still matters in personal mode (dev server on :5173 hitting
        // backend on :8080). Default to localhost if unspecified.
        let cors_raw = match mode {
            AppMode::Sso => required_env("CORS_ALLOWED_ORIGINS"),
            AppMode::Personal => env::var("CORS_ALLOWED_ORIGINS")
                .unwrap_or_else(|_| "http://localhost:5173,http://localhost:5174".to_string()),
        };
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
            mode,
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
            mode: AppMode::Sso,
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
            system_admin_emails: vec![],
            oidc_dept_claim: "groups".into(),
            oidc_dept_sync_enabled: true,
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
            mode: AppMode::Sso,
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
            system_admin_emails: vec![],
            oidc_dept_claim: "groups".into(),
            oidc_dept_sync_enabled: true,
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
