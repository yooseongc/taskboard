//! Personal-mode bootstrap (`TASKBOARD_MODE=personal`).
//!
//! Ensures a single pre-seeded user and root department exist in the DB so
//! the `AuthnUser` extractor can hand out the same identity on every request
//! without Keycloak, JWT parsing, or login UI.

use std::sync::Arc;

use sqlx::PgPool;
use uuid::Uuid;

use crate::authz::authn::{AuthnUser, GlobalRole};
use crate::infra::uuid7;

/// External ID used for the single personal user. Stable across restarts.
pub const PERSONAL_EXTERNAL_ID: &str = "personal";
/// Slug for the root department in personal mode.
pub const PERSONAL_DEPT_SLUG: &str = "personal";
/// Display name for the seeded user.
pub const PERSONAL_USER_NAME: &str = "Me";
/// Email fed through `upsert_user_from_claims`. Not used for delivery —
/// just a deterministic placeholder so the unique constraint on `email`
/// stays satisfied across re-runs.
pub const PERSONAL_USER_EMAIL: &str = "me@local";

/// Ensure the personal-mode singleton (department + user + membership) exists,
/// returning an `AuthnUser` ready to be cached in `AppState.personal_user`.
///
/// All operations are idempotent: safe to call on every startup.
pub async fn ensure_personal_bootstrap(pool: &PgPool) -> Result<AuthnUser, sqlx::Error> {
    let mut tx = pool.begin().await?;

    let dept_id = upsert_personal_department(&mut tx).await?;
    let user_id = upsert_personal_user(&mut tx).await?;
    ensure_personal_membership(&mut tx, user_id, dept_id).await?;

    tx.commit().await?;

    Ok(AuthnUser {
        user_id,
        external_id: PERSONAL_EXTERNAL_ID.to_string(),
        name: PERSONAL_USER_NAME.to_string(),
        email: PERSONAL_USER_EMAIL.to_string(),
        // Personal user is always SystemAdmin — every permission check short-
        // circuits to allow, so the rest of the matrix stays untouched.
        global_roles: vec![GlobalRole::SystemAdmin],
        department_ids: vec![dept_id],
        active: true,
    })
}

async fn upsert_personal_department(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
) -> Result<Uuid, sqlx::Error> {
    // Look up first — we can't use ON CONFLICT here because LTREE `path`
    // depends on the generated id.
    let existing: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM departments WHERE slug = $1 AND parent_id IS NULL",
    )
    .bind(PERSONAL_DEPT_SLUG)
    .fetch_optional(&mut **tx)
    .await?;
    if let Some((id,)) = existing {
        return Ok(id);
    }

    let new_id = uuid7::now_v7();
    sqlx::query(
        r#"
        INSERT INTO departments (id, name, slug, parent_id, path, depth)
        VALUES ($1, $2, $3, NULL, text2ltree($4), 0)
        "#,
    )
    .bind(new_id)
    .bind("Personal")
    .bind(PERSONAL_DEPT_SLUG)
    .bind(new_id.simple().to_string())
    .execute(&mut **tx)
    .await?;
    Ok(new_id)
}

async fn upsert_personal_user(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
) -> Result<Uuid, sqlx::Error> {
    let new_id = uuid7::now_v7();
    let row: (Uuid,) = sqlx::query_as(
        r#"
        INSERT INTO users (id, external_id, name, email, email_verified, active)
        VALUES ($1, $2, $3, $4, true, true)
        ON CONFLICT (external_id) DO UPDATE
            SET name = EXCLUDED.name,
                email = EXCLUDED.email,
                updated_at = now()
        RETURNING id
        "#,
    )
    .bind(new_id)
    .bind(PERSONAL_EXTERNAL_ID)
    .bind(PERSONAL_USER_NAME)
    .bind(PERSONAL_USER_EMAIL)
    .fetch_one(&mut **tx)
    .await?;
    Ok(row.0)
}

async fn ensure_personal_membership(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    user_id: Uuid,
    dept_id: Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO department_members (user_id, department_id, role_in_department)
        VALUES ($1, $2, 'Member')
        ON CONFLICT DO NOTHING
        "#,
    )
    .bind(user_id)
    .bind(dept_id)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

/// Convenience wrapper so `main.rs` can shove the result straight into
/// `AppState.personal_user` without doing the `Arc::new` dance itself.
pub async fn bootstrap_arc(pool: &PgPool) -> Result<Arc<AuthnUser>, sqlx::Error> {
    let user = ensure_personal_bootstrap(pool).await?;
    Ok(Arc::new(user))
}
