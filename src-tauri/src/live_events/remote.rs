//! The Supabase RPC calls of the live events, behind a trait so that the
//! service can be tested without a network. Errors carry no URL, body or token:
//! a business refusal is reduced to a code from a fixed list.

use std::future::Future;
use std::time::Duration;

use serde_json::Value;

use crate::auth::config::AuthConfig;

/// Refusals that the SQL functions raise (SQLSTATE P0001, message = code).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EventCode {
    EventNotFound,
    EventClosed,
    NotEligible,
    InvalidDisplayName,
    AlreadyParticipant,
    NotParticipant,
}

impl EventCode {
    /// Only these exact messages are recognised; anything else stays `Rejected`.
    pub fn from_message(message: &str) -> Option<EventCode> {
        Some(match message {
            "event_not_found" => EventCode::EventNotFound,
            "event_closed" => EventCode::EventClosed,
            "not_eligible" => EventCode::NotEligible,
            "invalid_display_name" => EventCode::InvalidDisplayName,
            "already_participant" => EventCode::AlreadyParticipant,
            "not_participant" => EventCode::NotParticipant,
            _ => return None,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RemoteError {
    /// No connection or timeout.
    Network,
    /// 5xx, 429 or 408: worth retrying.
    Server,
    /// 401 / 403: the token was not accepted (or is required).
    Unauthorized,
    /// A refusal the server explained with a known code.
    Event(EventCode),
    /// Any other refusal (a constraint, a malformed answer, not configured).
    Rejected,
}

pub trait LiveRemote: Send + Sync + 'static {
    /// Calls `rpc/<name>`. `token: None` calls as the public (anon) role with the
    /// publishable key only; `Some` adds the user's access token.
    fn rpc(
        &self,
        name: &'static str,
        token: Option<&str>,
        args: &Value,
    ) -> impl Future<Output = Result<Value, RemoteError>> + Send;
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
}

/// Maps a failed response. A 400 carries the SQL message; only the known codes
/// are kept, the body is never shown.
pub fn classify_failure(status: u16, body: &[u8]) -> RemoteError {
    match status {
        401 | 403 => RemoteError::Unauthorized,
        408 | 429 | 500..=599 => RemoteError::Server,
        400 => serde_json::from_slice::<Value>(body)
            .ok()
            .and_then(|v| {
                v.get("message")
                    .and_then(Value::as_str)
                    .and_then(EventCode::from_message)
            })
            .map_or(RemoteError::Rejected, RemoteError::Event),
        _ => RemoteError::Rejected,
    }
}

impl LiveRemote for HttpRemote {
    async fn rpc(
        &self,
        name: &'static str,
        token: Option<&str>,
        args: &Value,
    ) -> Result<Value, RemoteError> {
        let config = self.config.as_ref().ok_or(RemoteError::Rejected)?;
        let mut request = self
            .http
            .post(format!("{}/rest/v1/rpc/{name}", config.url))
            .header("apikey", &config.publishable_key)
            .json(args);
        if let Some(token) = token {
            request = request.bearer_auth(token);
        }
        let response = request.send().await.map_err(|_| RemoteError::Network)?;
        let status = response.status();
        if !status.is_success() {
            let body = response.bytes().await.unwrap_or_default();
            return Err(classify_failure(status.as_u16(), &body));
        }
        let bytes = response.bytes().await.map_err(|_| RemoteError::Network)?;
        serde_json::from_slice(&bytes).map_err(|_| RemoteError::Rejected)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn statuses_are_classified() {
        assert_eq!(classify_failure(401, b""), RemoteError::Unauthorized);
        assert_eq!(classify_failure(403, b""), RemoteError::Unauthorized);
        assert_eq!(classify_failure(429, b""), RemoteError::Server);
        assert_eq!(classify_failure(503, b""), RemoteError::Server);
        assert_eq!(classify_failure(404, b""), RemoteError::Rejected);
        assert_eq!(classify_failure(400, b"not json"), RemoteError::Rejected);
    }

    #[test]
    fn only_known_business_codes_are_kept() {
        let body = br#"{"code":"P0001","message":"event_closed","details":null}"#;
        assert_eq!(
            classify_failure(400, body),
            RemoteError::Event(EventCode::EventClosed)
        );
        for (message, code) in [
            ("event_not_found", EventCode::EventNotFound),
            ("not_eligible", EventCode::NotEligible),
            ("invalid_display_name", EventCode::InvalidDisplayName),
            ("already_participant", EventCode::AlreadyParticipant),
            ("not_participant", EventCode::NotParticipant),
        ] {
            let body = format!(r#"{{"code":"P0001","message":"{message}"}}"#);
            assert_eq!(
                classify_failure(400, body.as_bytes()),
                RemoteError::Event(code)
            );
        }
        // Free text (a database message, a token) never becomes a code.
        assert_eq!(
            classify_failure(400, br#"{"message":"secret token abc"}"#),
            RemoteError::Rejected
        );
        assert_eq!(
            classify_failure(500, br#"{"message":"event_closed"}"#),
            RemoteError::Server
        );
    }
}
