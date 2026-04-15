//! Small serde helpers shared across HTTP DTOs.
//!
//! # Why `double_option` exists
//!
//! Serde's default behaviour for `Option<Option<T>>` on a PATCH-style
//! request body cannot distinguish "field absent" from "field present
//! and null". Both deserialise to `None` (outer). That collapses the
//! three-way intent we need for nullable PATCH columns:
//!
//! * missing   → leave column alone
//! * `null`    → clear column to SQL NULL
//! * value     → overwrite column with value
//!
//! Combining `#[serde(default)]` on the field with
//! `deserialize_with = "double_option::deserialize"` gives the
//! distinction: the field default remains `None`, but any value that
//! was explicitly present (including JSON `null`) is wrapped in an
//! outer `Some`.

pub mod double_option {
    use serde::{Deserialize, Deserializer};

    pub fn deserialize<'de, T, D>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
    where
        T: Deserialize<'de>,
        D: Deserializer<'de>,
    {
        // Any explicit JSON value (including null) -> outer Some.
        // A missing field never reaches this function because
        // `#[serde(default)]` on the struct field short-circuits to None.
        Option::<T>::deserialize(deserializer).map(Some)
    }
}
