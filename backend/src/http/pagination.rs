use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde::{Deserialize, Serialize};

use crate::http::error::AppError;

/// S-002: PaginationQuery — shared across all list endpoints.
#[derive(Debug, Deserialize)]
pub struct PaginationQuery {
    #[serde(default = "default_limit")]
    pub limit: i64,
    pub cursor: Option<String>,
}

fn default_limit() -> i64 {
    20
}

/// S-002: PaginatedResponse<T>
#[derive(Debug, Serialize)]
pub struct PaginatedResponse<T: Serialize> {
    pub items: Vec<T>,
    pub next_cursor: Option<String>,
    pub has_more: bool,
}

impl PaginationQuery {
    /// Validate limit (1..100) per S-002.
    pub fn validate(&self) -> Result<(), AppError> {
        if self.limit < 1 || self.limit > 100 {
            return Err(AppError::InvalidInput(
                "limit must be between 1 and 100".to_string(),
            ));
        }
        Ok(())
    }
}

/// Encode cursor from a JSON value (sort key tuple).
pub fn encode_cursor(value: &serde_json::Value) -> String {
    let json = serde_json::to_string(value).expect("cursor serialization should not fail");
    URL_SAFE_NO_PAD.encode(json.as_bytes())
}

/// Decode cursor to a JSON value.
pub fn decode_cursor(cursor: &str) -> Result<serde_json::Value, AppError> {
    let bytes = URL_SAFE_NO_PAD
        .decode(cursor)
        .map_err(|_| AppError::InvalidInput("invalid_cursor: failed to decode".to_string()))?;
    let json_str = String::from_utf8(bytes)
        .map_err(|_| AppError::InvalidInput("invalid_cursor: not valid UTF-8".to_string()))?;
    serde_json::from_str(&json_str)
        .map_err(|_| AppError::InvalidInput("invalid_cursor: not valid JSON".to_string()))
}

impl<T: Serialize> PaginatedResponse<T> {
    pub fn new(items: Vec<T>, next_cursor: Option<String>) -> Self {
        let has_more = next_cursor.is_some();
        Self {
            items,
            next_cursor,
            has_more,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // Pagination cursor encode/decode round-trip and boundary tests.
    // -----------------------------------------------------------------------

    #[test]
    fn cursor_encode_decode_roundtrip() {
        let value = serde_json::json!(["2025-01-01T00:00:00Z", "abc-123"]);
        let encoded = encode_cursor(&value);
        let decoded = decode_cursor(&encoded).unwrap();
        assert_eq!(value, decoded);
    }

    #[test]
    fn cursor_decode_invalid_base64() {
        let result = decode_cursor("!!!invalid!!!");
        assert!(result.is_err());
    }

    #[test]
    fn cursor_decode_valid_base64_invalid_json() {
        // base64 of "not json"
        let encoded = URL_SAFE_NO_PAD.encode(b"not json");
        let result = decode_cursor(&encoded);
        assert!(result.is_err());
    }

    #[test]
    fn cursor_decode_valid_base64_invalid_utf8() {
        // Encode raw bytes that are not valid UTF-8
        let encoded = URL_SAFE_NO_PAD.encode(&[0xFF, 0xFE, 0xFD]);
        let result = decode_cursor(&encoded);
        assert!(result.is_err());
    }

    #[test]
    fn pagination_limit_validation_lower_bound() {
        let q = PaginationQuery { limit: 0, cursor: None };
        assert!(q.validate().is_err());
    }

    #[test]
    fn pagination_limit_validation_upper_bound() {
        let q = PaginationQuery { limit: 101, cursor: None };
        assert!(q.validate().is_err());
    }

    #[test]
    fn pagination_limit_validation_boundary_ok() {
        let q1 = PaginationQuery { limit: 1, cursor: None };
        assert!(q1.validate().is_ok());
        let q100 = PaginationQuery { limit: 100, cursor: None };
        assert!(q100.validate().is_ok());
    }

    #[test]
    fn paginated_response_has_more_true() {
        let resp: PaginatedResponse<i32> =
            PaginatedResponse::new(vec![1, 2], Some("cursor".into()));
        assert!(resp.has_more);
    }

    #[test]
    fn paginated_response_has_more_false() {
        let resp: PaginatedResponse<i32> = PaginatedResponse::new(vec![1], None);
        assert!(!resp.has_more);
    }

    #[test]
    fn cursor_empty_json_value() {
        let value = serde_json::json!({});
        let encoded = encode_cursor(&value);
        let decoded = decode_cursor(&encoded).unwrap();
        assert_eq!(value, decoded);
    }
}
