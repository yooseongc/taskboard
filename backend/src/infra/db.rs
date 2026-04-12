use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;

/// Create a connection pool from DATABASE_URL.
pub async fn create_pool(database_url: &str) -> PgPool {
    PgPoolOptions::new()
        .max_connections(20)
        .connect(database_url)
        .await
        .expect("Failed to create database pool")
}
