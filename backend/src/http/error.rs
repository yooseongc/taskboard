use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Serialize;
use uuid::Uuid;

/// ApiError — S-001 four-layer error model.
#[derive(Debug, Serialize)]
pub struct ApiError {
    pub error: String,
    pub message: String,
    pub request_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

/// Internal error kind used to map to HTTP status codes.
#[derive(Debug)]
pub enum AppError {
    // Auth errors (S-007)
    InvalidToken(String),
    UserInactive,
    PermissionDenied {
        action: String,
        resource: String,
    },

    // Validation errors
    InvalidInput(String),
    BoardRequiresDepartment,
    BoardDepartmentLimitExceeded,
    DescriptionTooLong,
    ColumnLimitExceeded,
    ColumnMovNotAllowed,
    InvalidScope,
    ResultTooLarge {
        count: usize,
        limit: usize,
    },

    // Client errors
    NotFound(String),
    VersionConflict {
        current_version: i64,
        current_resource: Option<serde_json::Value>,
    },
    MissingPrecondition,
    PreconditionMismatch,
    DuplicateEntry(String),
    DepartmentHasDescendants,
    ColumnHasTasks,

    // Server errors
    Internal(String),
    IdpUnavailable,
}

impl AppError {
    fn status_code(&self) -> StatusCode {
        match self {
            Self::InvalidToken(_) => StatusCode::UNAUTHORIZED,
            Self::UserInactive | Self::PermissionDenied { .. } => StatusCode::FORBIDDEN,
            Self::InvalidInput(_)
            | Self::BoardRequiresDepartment
            | Self::BoardDepartmentLimitExceeded
            | Self::DescriptionTooLong
            | Self::ColumnLimitExceeded
            | Self::ColumnMovNotAllowed
            | Self::InvalidScope
            | Self::ResultTooLarge { .. } => StatusCode::UNPROCESSABLE_ENTITY,
            Self::NotFound(_) => StatusCode::NOT_FOUND,
            Self::VersionConflict { .. }
            | Self::DuplicateEntry(_)
            | Self::DepartmentHasDescendants
            | Self::ColumnHasTasks => StatusCode::CONFLICT,
            Self::MissingPrecondition => StatusCode::PRECONDITION_REQUIRED,
            Self::PreconditionMismatch => StatusCode::BAD_REQUEST,
            Self::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
            Self::IdpUnavailable => StatusCode::SERVICE_UNAVAILABLE,
        }
    }

    fn error_code(&self) -> &str {
        match self {
            Self::InvalidToken(_) => "invalid_token",
            Self::UserInactive => "user_inactive",
            Self::PermissionDenied { .. } => "permission_denied",
            Self::InvalidInput(_) => "invalid_input",
            Self::BoardRequiresDepartment => "board_requires_department",
            Self::BoardDepartmentLimitExceeded => "board_department_limit_exceeded",
            Self::DescriptionTooLong => "description_too_long",
            Self::ColumnLimitExceeded => "column_limit_exceeded",
            Self::ColumnMovNotAllowed => "column_move_not_allowed",
            Self::InvalidScope => "invalid_scope_ref",
            Self::ResultTooLarge { .. } => "result_too_large",
            Self::NotFound(_) => "not_found",
            Self::VersionConflict { .. } => "version_conflict",
            Self::MissingPrecondition => "missing_precondition",
            Self::PreconditionMismatch => "precondition_mismatch",
            Self::DuplicateEntry(_) => "duplicate_entry",
            Self::DepartmentHasDescendants => "department_has_descendants",
            Self::ColumnHasTasks => "column_has_tasks",
            Self::Internal(_) => "internal_error",
            Self::IdpUnavailable => "idp_unavailable",
        }
    }

    fn message(&self) -> String {
        match self {
            Self::InvalidToken(msg) => msg.clone(),
            Self::UserInactive => "User account is deactivated.".to_string(),
            Self::PermissionDenied { action, resource } => {
                format!("Insufficient permissions for action '{action}' on resource '{resource}'.")
            }
            Self::InvalidInput(msg) => msg.clone(),
            Self::BoardRequiresDepartment => {
                "Board must be associated with at least one department.".to_string()
            }
            Self::BoardDepartmentLimitExceeded => {
                "Board cannot be associated with more than 5 departments.".to_string()
            }
            Self::DescriptionTooLong => "Description exceeds 8KB limit.".to_string(),
            Self::ColumnLimitExceeded => {
                "Board cannot have more than 50 columns.".to_string()
            }
            Self::ColumnMovNotAllowed => {
                "Use PATCH /api/tasks/:id/move to change column or position.".to_string()
            }
            Self::InvalidScope => "Scope and scope_ref_id mismatch.".to_string(),
            Self::ResultTooLarge { count, limit } => {
                format!(
                    "Calendar query returned too many items. Narrow the date range. ({count} > {limit})"
                )
            }
            Self::NotFound(resource) => format!("{resource} not found."),
            Self::VersionConflict { .. } => {
                "Resource was modified by another user.".to_string()
            }
            Self::MissingPrecondition => {
                "If-Match header or body version field is required.".to_string()
            }
            Self::PreconditionMismatch => {
                "If-Match header and body version field do not match.".to_string()
            }
            Self::DuplicateEntry(msg) => msg.clone(),
            Self::DepartmentHasDescendants => {
                "Department has descendants. Use ?cascade=true or delete descendants first."
                    .to_string()
            }
            Self::ColumnHasTasks => {
                "Column has tasks. Use ?move_to=<col_id> or move tasks first.".to_string()
            }
            Self::Internal(msg) => {
                // Do not expose internal details to client (S-001)
                tracing::error!("Internal error: {msg}");
                "An internal error occurred.".to_string()
            }
            Self::IdpUnavailable => {
                "Identity provider is temporarily unavailable. Please retry.".to_string()
            }
        }
    }

    fn details(&self) -> Option<serde_json::Value> {
        match self {
            Self::VersionConflict {
                current_version,
                current_resource,
            } => Some(serde_json::json!({
                "current_version": current_version,
                "current_resource": current_resource,
            })),
            Self::PermissionDenied { action, resource } => Some(serde_json::json!({
                "action": action,
                "resource": resource,
            })),
            Self::ResultTooLarge { count, limit } => Some(serde_json::json!({
                "count": count,
                "limit": limit,
            })),
            _ => None,
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let request_id = Uuid::new_v4().to_string();
        let status = self.status_code();
        let body = ApiError {
            error: self.error_code().to_string(),
            message: self.message(),
            request_id: request_id.clone(),
            details: self.details(),
        };

        let mut response = (status, axum::Json(body)).into_response();
        response.headers_mut().insert(
            "x-request-id",
            request_id.parse().unwrap(),
        );
        response
    }
}

// Allow using AppError with `?` in handler functions
impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        tracing::error!("Database error: {err}");
        Self::Internal(err.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::response::IntoResponse;

    // -----------------------------------------------------------------------
    // Regression guard for Finding #4: x-request-id on error responses.
    // Error responses always include x-request-id. Successful responses
    // get x-request-id from the tower-http middleware layer (main.rs).
    // -----------------------------------------------------------------------

    #[test]
    fn q004_error_response_includes_x_request_id() {
        // Finding #4: All error responses must include x-request-id.
        let err = AppError::NotFound("Test".into());
        let response = err.into_response();
        assert!(
            response.headers().contains_key("x-request-id"),
            "Error response must contain x-request-id header"
        );
        let req_id = response.headers().get("x-request-id").unwrap().to_str().unwrap();
        // Must be a valid UUID v4
        assert!(uuid::Uuid::parse_str(req_id).is_ok(), "x-request-id must be valid UUID");
    }

    #[test]
    fn q004_error_status_codes() {
        // S-001: HTTP status code mapping.
        assert_eq!(AppError::InvalidToken("x".into()).status_code(), StatusCode::UNAUTHORIZED);
        assert_eq!(AppError::UserInactive.status_code(), StatusCode::FORBIDDEN);
        assert_eq!(
            AppError::PermissionDenied { action: "Read".into(), resource: "Board".into() }.status_code(),
            StatusCode::FORBIDDEN
        );
        assert_eq!(AppError::NotFound("x".into()).status_code(), StatusCode::NOT_FOUND);
        assert_eq!(
            AppError::VersionConflict { current_version: 1, current_resource: None }.status_code(),
            StatusCode::CONFLICT
        );
        assert_eq!(AppError::MissingPrecondition.status_code(), StatusCode::PRECONDITION_REQUIRED);
        assert_eq!(AppError::PreconditionMismatch.status_code(), StatusCode::BAD_REQUEST);
        assert_eq!(AppError::Internal("x".into()).status_code(), StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(AppError::IdpUnavailable.status_code(), StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(
            AppError::ResultTooLarge { count: 600, limit: 500 }.status_code(),
            StatusCode::UNPROCESSABLE_ENTITY
        );
    }

    #[test]
    fn q004_version_conflict_details() {
        // S-003: VersionConflict response includes current_version and current_resource.
        let err = AppError::VersionConflict {
            current_version: 42,
            current_resource: Some(serde_json::json!({"id": "test"})),
        };
        let details = err.details().unwrap();
        assert_eq!(details["current_version"], 42);
        assert!(details["current_resource"].is_object());
    }

    #[test]
    fn q004_result_too_large_details() {
        let err = AppError::ResultTooLarge { count: 600, limit: 500 };
        let details = err.details().unwrap();
        assert_eq!(details["count"], 600);
        assert_eq!(details["limit"], 500);
    }

    #[test]
    fn q004_error_codes_match_spec() {
        // S-001 error codes
        assert_eq!(AppError::InvalidToken("x".into()).error_code(), "invalid_token");
        assert_eq!(AppError::MissingPrecondition.error_code(), "missing_precondition");
        assert_eq!(
            AppError::VersionConflict { current_version: 1, current_resource: None }.error_code(),
            "version_conflict"
        );
    }
}
