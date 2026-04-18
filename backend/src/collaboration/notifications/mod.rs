//! Per-user notification system.
//!
//! Layout:
//! * [`models`] — row and response types
//! * [`handlers`] — HTTP endpoints mounted at `/api/users/me/notifications/*`
//! * [`fanout`] — activity → notification fan-out, called from
//!   `activity_helper::insert_activity`
//! * [`deadline_scanner`] — periodic `tokio::interval` task that inserts
//!   `deadline_soon` / `deadline_overdue` rows

pub mod deadline_scanner;
pub mod fanout;
pub mod handlers;
pub mod models;
