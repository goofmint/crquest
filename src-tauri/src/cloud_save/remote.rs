//! The two Supabase (PostgREST) calls of the cloud save, behind a trait so
//! that the service can be tested without a network. Errors carry no URL, body
//! or token.

use std::future::Future;
use std::time::Duration;

use serde::Deserialize;
use serde_json::Value;

use crate::auth::config::AuthConfig;

/// The largest save the server accepts (the `cloud_saves_data_size` check).
pub const MAX_DATA_BYTES: usize = 2 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RemoteError {
    /// No connection or timeout.
    Network,
    /// 5xx, 429 or 408: worth retrying.
    Server,
    /// 401 / 403: the token was not accepted.
    Unauthorized,
    /// Any other refusal (a constraint, a malformed answer).
    Rejected,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct RemoteRow {
    pub data: Value,
    pub schema_version: i32,
    pub revision: i64,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct RemoteAccepted {
    pub revision: i64,
    pub updated_at: String,
}

pub trait CloudRemote: Send + Sync + 'static {
    /// The caller's own row (row level security decides what is visible).
    fn fetch(
        &self,
        token: &str,
    ) -> impl Future<Output = Result<Option<RemoteRow>, RemoteError>> + Send;
    /// `upsert_cloud_save`: the server assigns the revision.
    fn upsert(
        &self,
        token: &str,
        data: &Value,
        schema_version: i32,
    ) -> impl Future<Output = Result<RemoteAccepted, RemoteError>> + Send;
}

pub struct HttpRemote {
    config: Option<AuthConfig>,
    http: reqwest::Client,
}

impl HttpRemote {
    pub fn new(config: Option<AuthConfig>) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .connect_timeout(Duration::from_secs(8))
            .build()
            .expect("the HTTP client builds");
        HttpRemote { config, http }
    }

    fn config(&self) -> Result<&AuthConfig, RemoteError> {
        self.config.as_ref().ok_or(RemoteError::Rejected)
    }
}

pub fn classify(status: u16) -> RemoteError {
    match status {
        401 | 403 => RemoteError::Unauthorized,
        408 | 429 | 500..=599 => RemoteError::Server,
        _ => RemoteError::Rejected,
    }
}

pub fn parse_rows(bytes: &[u8]) -> Result<Option<RemoteRow>, RemoteError> {
    let rows: Vec<RemoteRow> = serde_json::from_slice(bytes).map_err(|_| RemoteError::Rejected)?;
    Ok(rows.into_iter().next())
}

/// A `RETURNS TABLE` function answers with an array of one row; accept a bare
/// object too.
pub fn parse_accepted(bytes: &[u8]) -> Result<RemoteAccepted, RemoteError> {
    let value: Value = serde_json::from_slice(bytes).map_err(|_| RemoteError::Rejected)?;
    let row = match value {
        Value::Array(mut rows) if !rows.is_empty() => rows.remove(0),
        other => other,
    };
    serde_json::from_value(row).map_err(|_| RemoteError::Rejected)
}

impl CloudRemote for HttpRemote {
    async fn fetch(&self, token: &str) -> Result<Option<RemoteRow>, RemoteError> {
        let config = self.config()?;
        let response = self
            .http
            .get(format!(
                "{}/rest/v1/cloud_saves?select=data,schema_version,revision,updated_at&limit=1",
                config.url
            ))
            .header("apikey", &config.publishable_key)
            .bearer_auth(token)
            .send()
            .await
            .map_err(|_| RemoteError::Network)?;
        if !response.status().is_success() {
            return Err(classify(response.status().as_u16()));
        }
        let bytes = response.bytes().await.map_err(|_| RemoteError::Network)?;
        parse_rows(&bytes)
    }

    async fn upsert(
        &self,
        token: &str,
        data: &Value,
        schema_version: i32,
    ) -> Result<RemoteAccepted, RemoteError> {
        let config = self.config()?;
        let response = self
            .http
            .post(format!("{}/rest/v1/rpc/upsert_cloud_save", config.url))
            .header("apikey", &config.publishable_key)
            .bearer_auth(token)
            .json(&serde_json::json!({ "p_data": data, "p_schema_version": schema_version }))
            .send()
            .await
            .map_err(|_| RemoteError::Network)?;
        if !response.status().is_success() {
            return Err(classify(response.status().as_u16()));
        }
        let bytes = response.bytes().await.map_err(|_| RemoteError::Network)?;
        parse_accepted(&bytes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn statuses_are_classified() {
        assert_eq!(classify(401), RemoteError::Unauthorized);
        assert_eq!(classify(403), RemoteError::Unauthorized);
        assert_eq!(classify(429), RemoteError::Server);
        assert_eq!(classify(503), RemoteError::Server);
        assert_eq!(classify(400), RemoteError::Rejected);
        assert_eq!(classify(404), RemoteError::Rejected);
    }

    #[test]
    fn rows_are_parsed_and_no_row_is_none() {
        assert_eq!(parse_rows(b"[]").unwrap(), None);
        let row = parse_rows(
            br#"[{"data":{"xp":3},"schema_version":1,"revision":7,"updated_at":"2026-01-01T00:00:00+00:00"}]"#,
        )
        .unwrap()
        .unwrap();
        assert_eq!(row.revision, 7);
        assert_eq!(row.data["xp"], 3);
        assert_eq!(parse_rows(b"not json").unwrap_err(), RemoteError::Rejected);
    }

    #[test]
    fn the_accepted_revision_is_read_from_an_array_or_an_object() {
        let array = parse_accepted(br#"[{"revision":2,"updated_at":"t"}]"#).unwrap();
        let object = parse_accepted(br#"{"revision":2,"updated_at":"t"}"#).unwrap();
        assert_eq!(array, object);
        assert_eq!(parse_accepted(b"[]").unwrap_err(), RemoteError::Rejected);
    }
}
