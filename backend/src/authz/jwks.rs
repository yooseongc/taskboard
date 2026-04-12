//! S-007 / D-023: JWKS cache for OIDC JWT RS256 signature verification.
//!
//! Fetches Keycloak JWKS endpoint, caches keys with TTL, and verifies
//! JWT tokens using RS256 algorithm.

use std::sync::Arc;
use std::time::Instant;
use tokio::sync::RwLock;

use jsonwebtoken::{Algorithm, DecodingKey, Validation};

use crate::http::error::AppError;

/// A single JWK key parsed from the JWKS response.
#[derive(Clone)]
struct JwkKey {
    kid: String,
    /// RSA modulus (base64url-encoded)
    n: String,
    /// RSA exponent (base64url-encoded)
    e: String,
}

impl JwkKey {
    fn decoding_key(&self) -> Result<DecodingKey, AppError> {
        DecodingKey::from_rsa_components(&self.n, &self.e)
            .map_err(|e| AppError::Internal(format!("Failed to build RSA key: {e}")))
    }
}

struct CachedKeys {
    keys: Vec<JwkKey>,
    fetched_at: Instant,
}

/// JWKS cache that fetches and caches Keycloak public keys.
pub struct JwksCache {
    cached: Arc<RwLock<Option<CachedKeys>>>,
    jwks_url: String,
    ttl_secs: u64,
    client: reqwest::Client,
}

impl JwksCache {
    pub fn new(jwks_url: String, ttl_secs: u64) -> Self {
        Self {
            cached: Arc::new(RwLock::new(None)),
            jwks_url,
            ttl_secs,
            client: reqwest::Client::new(),
        }
    }

    /// Get cached keys if still valid, otherwise refresh.
    async fn get_keys(&self) -> Result<Vec<JwkKey>, AppError> {
        {
            let guard = self.cached.read().await;
            if let Some(ref cached) = *guard {
                if cached.fetched_at.elapsed().as_secs() < self.ttl_secs && !cached.keys.is_empty()
                {
                    return Ok(cached.keys.clone());
                }
            }
        }
        self.refresh().await
    }

    /// Fetch JWKS from the endpoint and update cache.
    async fn refresh(&self) -> Result<Vec<JwkKey>, AppError> {
        let resp = self
            .client
            .get(&self.jwks_url)
            .send()
            .await
            .map_err(|e| {
                tracing::error!("JWKS fetch failed: {e}");
                AppError::IdpUnavailable
            })?;

        if !resp.status().is_success() {
            tracing::error!("JWKS fetch returned status {}", resp.status());
            return Err(AppError::IdpUnavailable);
        }

        let jwks: serde_json::Value = resp.json().await.map_err(|e| {
            tracing::error!("JWKS response parse failed: {e}");
            AppError::IdpUnavailable
        })?;

        let keys_arr = jwks["keys"]
            .as_array()
            .ok_or_else(|| {
                tracing::error!("JWKS response missing 'keys' array");
                AppError::IdpUnavailable
            })?;

        let mut parsed = Vec::new();
        for key in keys_arr {
            // Only process RSA keys used for signing
            let kty = key["kty"].as_str().unwrap_or("");
            let use_val = key["use"].as_str().unwrap_or("sig");
            if kty != "RSA" || use_val != "sig" {
                continue;
            }

            if let (Some(kid), Some(n), Some(e)) = (
                key["kid"].as_str(),
                key["n"].as_str(),
                key["e"].as_str(),
            ) {
                parsed.push(JwkKey {
                    kid: kid.to_string(),
                    n: n.to_string(),
                    e: e.to_string(),
                });
            }
        }

        let mut guard = self.cached.write().await;
        *guard = Some(CachedKeys {
            keys: parsed.clone(),
            fetched_at: Instant::now(),
        });

        Ok(parsed)
    }

    /// Verify a JWT token using JWKS keys.
    /// Returns the validated claims on success.
    pub async fn verify_token(
        &self,
        token: &str,
        audience: &str,
    ) -> Result<serde_json::Value, AppError> {
        // 1. Decode header to get kid
        let header = jsonwebtoken::decode_header(token)
            .map_err(|e| AppError::InvalidToken(format!("Invalid JWT header: {e}")))?;
        let kid = header.kid.as_deref().unwrap_or("");

        // 2. Try cached keys first
        let keys = self.get_keys().await?;
        if let Some(claims) = self.try_verify_with_keys(token, audience, kid, &keys)? {
            return Ok(claims);
        }

        // 3. kid miss -> force refresh and retry
        let refreshed = self.refresh().await?;
        if let Some(claims) = self.try_verify_with_keys(token, audience, kid, &refreshed)? {
            return Ok(claims);
        }

        Err(AppError::InvalidToken(format!(
            "No matching key found for kid: {kid}"
        )))
    }

    /// Try to verify the token with a specific set of keys.
    fn try_verify_with_keys(
        &self,
        token: &str,
        audience: &str,
        kid: &str,
        keys: &[JwkKey],
    ) -> Result<Option<serde_json::Value>, AppError> {
        let matching_key = keys.iter().find(|k| k.kid == kid);

        let key = match matching_key {
            Some(k) => k,
            None => return Ok(None),
        };

        let decoding_key = key.decoding_key()?;

        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_audience(&[audience]);

        let data = jsonwebtoken::decode::<serde_json::Value>(token, &decoding_key, &validation)
            .map_err(|e| AppError::InvalidToken(format!("JWT verification failed: {e}")))?;

        Ok(Some(data.claims))
    }
}
