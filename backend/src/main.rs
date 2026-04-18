mod authz;
mod collaboration;
mod config;
mod http;
mod identity;
mod infra;
mod organization;

use std::net::SocketAddr;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

use config::AppMode;
use infra::state::AppState;

#[tokio::main]
async fn main() {
    // Initialize tracing
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .json()
        .init();

    tracing::info!("Starting taskboard-backend");

    // Load config (S-029) -- panics on missing required env vars
    let config = config::AppConfig::from_env();
    tracing::info!(bind_addr = %config.bind_addr, mode = config.mode.as_str(), "Configuration loaded");

    // Create DB pool
    let pool = infra::db::create_pool(&config.database_url).await;

    // Run pending migrations at startup (S-026)
    let migrator = sqlx::migrate::Migrator::new(std::path::Path::new("./migrations"))
        .await
        .expect("Failed to load migrations");
    migrator
        .run(&pool)
        .await
        .expect("Failed to run migrations");
    tracing::info!("Database migrations applied");

    // SSO mode: build the JWKS cache. Personal mode: skip — no Keycloak.
    // Hitting a Keycloak URL during personal-mode boot would crash the
    // container in air-gapped/standalone deployments.
    let jwks_cache = match config.mode {
        AppMode::Sso => Some(std::sync::Arc::new(
            authz::jwks::JwksCache::new(config.effective_jwks_url(), config.jwks_cache_ttl_secs),
        )),
        AppMode::Personal => None,
    };

    // Personal mode: seed the singleton user/department on every boot
    // (idempotent) so the `AuthnUser` extractor has something to return.
    let personal_user = match config.mode {
        AppMode::Personal => Some(
            identity::personal::bootstrap_arc(&pool)
                .await
                .expect("Failed to bootstrap personal-mode user"),
        ),
        AppMode::Sso => None,
    };
    if personal_user.is_some() {
        tracing::info!("Personal mode: singleton user bootstrapped");
    }

    // Build ActiveCache (R-026, D-039)
    let active_cache = infra::active_cache::ActiveCache::new();

    // Deadline scanner — periodic task that turns due_date windows into
    // inbox rows for the assignees. Runs in every mode (personal included);
    // the scanner naturally no-ops when there are no assigned tasks.
    tokio::spawn(collaboration::notifications::deadline_scanner::run(pool.clone()));

    // Build AppState
    let state = AppState {
        pool,
        config: config.clone(),
        jwks_cache,
        active_cache,
        personal_user,
    };

    // CORS layer
    let origins: Vec<_> = config
        .cors_allowed_origins
        .iter()
        .filter_map(|o| o.parse().ok())
        .collect();
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(origins))
        .allow_methods(tower_http::cors::Any)
        .allow_headers(tower_http::cors::Any);

    // Build router
    // S-001: x-request-id on all responses.
    // Layer order (outermost first): SetRequestId -> Propagate -> Trace -> CORS -> Router
    let app = http::router::build_router(state)
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .layer(PropagateRequestIdLayer::x_request_id())
        .layer(SetRequestIdLayer::x_request_id(MakeRequestUuid));

    // Bind and serve
    let addr: SocketAddr = config.bind_addr;
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Failed to bind to address");

    tracing::info!(%addr, "Listening");
    axum::serve(listener, app)
        .await
        .expect("Server error");
}
