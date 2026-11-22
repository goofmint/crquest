//! The two Supabase RPC calls of the team / operation membership, behind a
//! trait so that the service can be tested without a network. Errors carry no
//! URL, body, join code or token: a business refusal is reduced to a code from
//! a fixed list.

use std::future::Future;
use std::time::Duration;

use serde::Deserialize;
use serde_json::{json, Value};

use crate::auth::config::AuthConfig;

/// Refusals that the SQL functions raise (SQLSTATE P0001, message = code).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GroupCode {
    InvalidJoinCode,
    AlreadyMember,
    NotMember,
}

impl GroupCode {
    /// Only these exact messages are recognised; anything else stays `Rejected`.
    pub fn from_message(message: &str) -> Option<GroupCode> {
        Some(match message {
            "invalid_join_code" => GroupCode::InvalidJoinCode,
            "already_member" => GroupCode::AlreadyMember,
            "not_member" => GroupCode::NotMember,
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
    /// 401 / 403: the token was not accepted.
    Unauthorized,
    /// A refusal the server explained with a known code.
    Group(GroupCode),
    /// Any other refusal (a constraint, a malformed answer, not configured).
    Rejected,
}

/// One row of `join_group`.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct RemoteGroup {
    pub group_id: String,
    pub display_name: String,
    pub join_code: String,
}

pub trait GroupsRemote: Send + Sync + 'static {
    /// `join_group(p_kind, p_join_code)` for the token's user.
    fn join(
        &self,
        token: &str,
        kind: &str,
        join_code: &str,
    ) -> impl Future<Output = Result<RemoteGroup, RemoteError>> + Send;
    /// `list_my_groups(p_kind)`: the active memberships of the token's user.
    fn list(
        &self,
        token: &str,
        kind: &str,
    ) -> impl Future<Output = Result<Vec<RemoteGroup>, RemoteError>> + Send;
    /// `leave_group(p_group_id)` for the token's user.
    fn leave(
        &self,
        token: &str,
        group_id: &str,
    ) -> impl Future<Output = Result<(), RemoteError>> + Send;
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

    async fn rpc(&self, name: &str, token: &str, args: Value) -> Result<Vec<u8>, RemoteError> {
        let config = self.config.as_ref().ok_or(RemoteError::Rejected)?;
        let response = self
            .http
            .post(format!("{}/rest/v1/rpc/{name}", config.url))
            .header("apikey", &config.publishable_key)
            .bearer_auth(token)
            .json(&args)
            .send()
            .await
            .map_err(|_| RemoteError::Network)?;
        let status = response.status();
        if !status.is_success() {
            let body = response.bytes().await.unwrap_or_default();
            return Err(classify_failure(status.as_u16(), &body));
        }
        response
            .bytes()
            .await
            .map(|b| b.to_vec())
            .map_err(|_| RemoteError::Network)
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
                    .and_then(GroupCode::from_message)
            })
            .map_or(RemoteError::Rejected, RemoteError::Group),
        _ => RemoteError::Rejected,
    }
}

pub fn parse_groups(bytes: &[u8]) -> Result<Vec<RemoteGroup>, RemoteError> {
    let groups: Vec<RemoteGroup> =
        serde_json::from_slice(bytes).map_err(|_| RemoteError::Rejected)?;
    if groups
        .iter()
        .any(|g| g.group_id.is_empty() || g.display_name.is_empty())
    {
        return Err(RemoteError::Rejected);
    }
    Ok(groups)
}

/// `RETURNS TABLE` answers with an array of one row; accept a bare object too.
pub fn parse_group(bytes: &[u8]) -> Result<RemoteGroup, RemoteError> {
    let value: Value = serde_json::from_slice(bytes).map_err(|_| RemoteError::Rejected)?;
    let row = match value {
        Value::Array(mut rows) if !rows.is_empty() => rows.remove(0),
        other => other,
    };
    let group: RemoteGroup = serde_json::from_value(row).map_err(|_| RemoteError::Rejected)?;
    if group.group_id.is_empty() || group.display_name.is_empty() {
        return Err(RemoteError::Rejected);
    }
    Ok(group)
}

impl GroupsRemote for HttpRemote {
    async fn join(
        &self,
        token: &str,
        kind: &str,
        join_code: &str,
    ) -> Result<RemoteGroup, RemoteError> {
        let bytes = self
            .rpc(
                "join_group",
                token,
                json!({ "p_kind": kind, "p_join_code": join_code }),
            )
            .await?;
        parse_group(&bytes)
    }

    async fn list(&self, token: &str, kind: &str) -> Result<Vec<RemoteGroup>, RemoteError> {
        let bytes = self
            .rpc("list_my_groups", token, json!({ "p_kind": kind }))
            .await?;
        parse_groups(&bytes)
    }

    async fn leave(&self, token: &str, group_id: &str) -> Result<(), RemoteError> {
        self.rpc("leave_group", token, json!({ "p_group_id": group_id }))
            .await
            .map(|_| ())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn statuses_and_known_codes_are_classified() {
        assert_eq!(classify_failure(401, b""), RemoteError::Unauthorized);
        assert_eq!(classify_failure(503, b""), RemoteError::Server);
        assert_eq!(classify_failure(404, b""), RemoteError::Rejected);
        for (message, code) in [
            ("invalid_join_code", GroupCode::InvalidJoinCode),
            ("already_member", GroupCode::AlreadyMember),
            ("not_member", GroupCode::NotMember),
        ] {
            let body = format!(r#"{{"code":"P0001","message":"{message}"}}"#);
            assert_eq!(
                classify_failure(400, body.as_bytes()),
                RemoteError::Group(code)
            );
        }
        assert_eq!(
            classify_failure(400, br#"{"message":"secret token abc"}"#),
            RemoteError::Rejected
        );
        assert_eq!(
            classify_failure(500, br#"{"message":"not_member"}"#),
            RemoteError::Server
        );
    }

    #[test]
    fn a_group_row_is_parsed() {
        let row = br#"[{"group_id":"g1","kind":"team","display_name":"Owls","join_code":"OWL123","joined_at":"t"}]"#;
        let group = parse_group(row).unwrap();
        assert_eq!(
            (group.group_id.as_str(), group.display_name.as_str()),
            ("g1", "Owls")
        );
        assert_eq!(parse_group(b"[]").unwrap_err(), RemoteError::Rejected);
        assert_eq!(parse_group(b"nope").unwrap_err(), RemoteError::Rejected);
        assert_eq!(
            parse_group(br#"{"group_id":"","display_name":"x","join_code":"y"}"#).unwrap_err(),
            RemoteError::Rejected
        );
    }
}
