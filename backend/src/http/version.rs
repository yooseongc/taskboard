use axum::http::{header, HeaderMap, HeaderName, HeaderValue};

use crate::http::error::AppError;

/// S-003 ETag/If-Match/version negotiation.
/// Checks both If-Match header and body version field, returning the validated version.
/// Both absent -> 428 MissingPrecondition.
/// Both present but mismatched -> 400 PreconditionMismatch.
pub fn extract_version(
    headers: &HeaderMap,
    body_version: Option<i64>,
) -> Result<i64, AppError> {
    let header_version = headers
        .get("if-match")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| {
            // Parse W/"5" or "5"
            let s = s.strip_prefix("W/").unwrap_or(s);
            let s = s.trim_matches('"');
            s.parse::<i64>().ok()
        });

    match (header_version, body_version) {
        (None, None) => Err(AppError::MissingPrecondition),
        (Some(h), None) => Ok(h),
        (None, Some(b)) => Ok(b),
        (Some(h), Some(b)) if h == b => Ok(h),
        (Some(_), Some(_)) => Err(AppError::PreconditionMismatch),
    }
}

/// Build an ETag response header from a version number.
pub fn etag_header(version: i64) -> (HeaderName, HeaderValue) {
    (
        header::ETAG,
        HeaderValue::from_str(&format!("W/\"{}\"", version)).unwrap(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderMap;

    // -----------------------------------------------------------------------
    // Q-002: Optimistic lock 5-case version negotiation (S-003).
    // -----------------------------------------------------------------------

    #[test]
    fn q002_both_absent_returns_428() {
        // S-003: If-Match and body version both absent -> 428 MissingPrecondition.
        let headers = HeaderMap::new();
        let result = extract_version(&headers, None);
        assert!(matches!(result, Err(AppError::MissingPrecondition)));
    }

    #[test]
    fn q002_if_match_only() {
        // S-003: If-Match present, body version absent -> use header version.
        let mut headers = HeaderMap::new();
        headers.insert("if-match", "W/\"5\"".parse().unwrap());
        let result = extract_version(&headers, None);
        assert_eq!(result.unwrap(), 5);
    }

    #[test]
    fn q002_body_version_only() {
        // S-003: If-Match absent, body version present -> use body version.
        let headers = HeaderMap::new();
        let result = extract_version(&headers, Some(7));
        assert_eq!(result.unwrap(), 7);
    }

    #[test]
    fn q002_both_match() {
        // S-003: Both present and equal -> OK.
        let mut headers = HeaderMap::new();
        headers.insert("if-match", "W/\"10\"".parse().unwrap());
        let result = extract_version(&headers, Some(10));
        assert_eq!(result.unwrap(), 10);
    }

    #[test]
    fn q002_both_mismatch_returns_400() {
        // S-003: Both present but different -> 400 PreconditionMismatch.
        let mut headers = HeaderMap::new();
        headers.insert("if-match", "W/\"3\"".parse().unwrap());
        let result = extract_version(&headers, Some(5));
        assert!(matches!(result, Err(AppError::PreconditionMismatch)));
    }

    #[test]
    fn q002_plain_etag_without_weak_prefix() {
        // S-003: If-Match without W/ prefix should also parse.
        let mut headers = HeaderMap::new();
        headers.insert("if-match", "\"42\"".parse().unwrap());
        let result = extract_version(&headers, None);
        assert_eq!(result.unwrap(), 42);
    }

    #[test]
    fn q002_non_numeric_etag_falls_through() {
        // Edge case: If-Match with non-numeric value -> treated as absent.
        let mut headers = HeaderMap::new();
        headers.insert("if-match", "W/\"abc\"".parse().unwrap());
        let result = extract_version(&headers, Some(1));
        // header_version = None (parse fails), body_version = Some(1) => Ok(1)
        assert_eq!(result.unwrap(), 1);
    }

    #[test]
    fn q002_etag_header_roundtrip() {
        // etag_header produces W/"<version>" format.
        let (name, value) = etag_header(99);
        assert_eq!(name, header::ETAG);
        assert_eq!(value.to_str().unwrap(), "W/\"99\"");
    }

    #[test]
    fn q002_zero_version() {
        // Edge case: version 0 is a valid version.
        let mut headers = HeaderMap::new();
        headers.insert("if-match", "W/\"0\"".parse().unwrap());
        let result = extract_version(&headers, Some(0));
        assert_eq!(result.unwrap(), 0);
    }

    #[test]
    fn q002_large_version() {
        // Edge case: very large version number.
        let mut headers = HeaderMap::new();
        headers.insert("if-match", "W/\"9999999999\"".parse().unwrap());
        let result = extract_version(&headers, Some(9999999999));
        assert_eq!(result.unwrap(), 9999999999);
    }
}
