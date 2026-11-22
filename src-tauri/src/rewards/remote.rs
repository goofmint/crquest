//! The two Supabase RPC calls of the unlock codes and the tree planting, behind
//! a trait so that the service can be tested without a network. Errors carry no
//! URL, body, code or token.

use std::future::Future;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::auth::config::AuthConfig;
use crate::cloud_save::remote::{classify, RemoteError};

/// `redeem_unlock_code` answers with one of these.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RedeemStatus {
    Redeemed,
    AlreadyRedeemed,
    InvalidCode,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct RemoteRedeem {
    pub status: RedeemStatus,
    /// Present for `redeemed` and `already_redeemed` (the first grant's item).
    pub item_key: Option<String>,
}

/// `record_tree_planting` answers with one of these.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlantingStatus {
    Recorded,
    AlreadyRecorded,
    UnsupportedTarget,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct RemotePlanting {
    pub status: PlantingStatus,
}

pub trait RewardsRemote: Send + Sync + 'static {
    /// `redeem_unlock_code`: the server matches the code and records the grant
    /// for the token's user.
    fn redeem(
        &self,
        token: &str,
        code: &str,
    ) -> impl Future<Output = Result<RemoteRedeem, RemoteError>> + Send;
    /// `record_tree_planting`: the server checks the target against its
    /// allow-list and records it once per user.
    fn record_planting(
        &self,
        token: &str,
        mission_id: &str,
        target_id: &str,
    ) -> impl Future<Output = Result<RemotePlanting, RemoteError>> + Send;
}

pub struct HttpRemote {
    config: Option<AuthConfig>,
    http: reqwest::Client,
}

impl HttpRemote {
    pub fn new(config: Option<AuthConfig>) -> Self {
        // A timeout is reported as a lost connection (`offline`).
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .connect_timeout(Duration::from_secs(8))
            .build()
            .expect("the HTTP client builds");
        HttpRemote { config, http }
    }

    async fn rpc(&self, name: &str, token: &str, body: Value) -> Result<Vec<u8>, RemoteError> {
        let config = self.config.as_ref().ok_or(RemoteError::Rejected)?;
        let response = self
            .http
            .post(format!("{}/rest/v1/rpc/{name}", config.url))
            .header("apikey", &config.publishable_key)
            .bearer_auth(token)
            .json(&body)
            .send()
            .await
            .map_err(|_| RemoteError::Network)?;
        let status = response.status();
        if !status.is_success() {
            return Err(classify(status.as_u16()));
        }
        response
            .bytes()
            .await
            .map(|b| b.to_vec())
            .map_err(|_| RemoteError::Network)
    }
}

pub fn parse_redeem(bytes: &[u8]) -> Result<RemoteRedeem, RemoteError> {
    let parsed: RemoteRedeem = serde_json::from_slice(bytes).map_err(|_| RemoteError::Rejected)?;
    // A grant without an item cannot be applied: treat the answer as malformed.
    if parsed.status != RedeemStatus::InvalidCode
        && parsed.item_key.as_deref().is_none_or(str::is_empty)
    {
        return Err(RemoteError::Rejected);
    }
    Ok(parsed)
}

pub fn parse_planting(bytes: &[u8]) -> Result<RemotePlanting, RemoteError> {
    serde_json::from_slice(bytes).map_err(|_| RemoteError::Rejected)
}

impl RewardsRemote for HttpRemote {
    async fn redeem(&self, token: &str, code: &str) -> Result<RemoteRedeem, RemoteError> {
        let bytes = self
            .rpc(
                "redeem_unlock_code",
                token,
                serde_json::json!({ "p_code": code }),
            )
            .await?;
        parse_redeem(&bytes)
    }

    async fn record_planting(
        &self,
        token: &str,
        mission_id: &str,
        target_id: &str,
    ) -> Result<RemotePlanting, RemoteError> {
        let bytes = self
            .rpc(
                "record_tree_planting",
                token,
                serde_json::json!({ "p_mission_id": mission_id, "p_target_id": target_id }),
            )
            .await?;
        parse_planting(&bytes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redeem_answers_are_parsed() {
        let granted = parse_redeem(
            br#"{"status":"redeemed","item_key":"wand","redeemed_at":"2026-01-01T00:00:00+00:00"}"#,
        )
        .unwrap();
        assert_eq!(granted.status, RedeemStatus::Redeemed);
        assert_eq!(granted.item_key.as_deref(), Some("wand"));
        let again =
            parse_redeem(br#"{"status":"already_redeemed","item_key":"wand","redeemed_at":"t"}"#)
                .unwrap();
        assert_eq!(again.status, RedeemStatus::AlreadyRedeemed);
        let invalid =
            parse_redeem(br#"{"status":"invalid_code","item_key":null,"redeemed_at":null}"#)
                .unwrap();
        assert_eq!(invalid.status, RedeemStatus::InvalidCode);
    }

    #[test]
    fn a_malformed_redeem_answer_is_rejected() {
        for bytes in [
            &b"not json"[..],
            br#"{"status":"unknown"}"#,
            br#"{"status":"redeemed","item_key":null}"#,
            br#"{"status":"already_redeemed"}"#,
            br#"[]"#,
        ] {
            assert_eq!(parse_redeem(bytes).unwrap_err(), RemoteError::Rejected);
        }
    }

    #[test]
    fn planting_answers_are_parsed() {
        for (text, status) in [
            ("recorded", PlantingStatus::Recorded),
            ("already_recorded", PlantingStatus::AlreadyRecorded),
            ("unsupported_target", PlantingStatus::UnsupportedTarget),
        ] {
            let body = format!(r#"{{"status":"{text}","planted_at":null}}"#);
            assert_eq!(parse_planting(body.as_bytes()).unwrap().status, status);
        }
        assert_eq!(
            parse_planting(br#"{"status":"nope"}"#).unwrap_err(),
            RemoteError::Rejected
        );
    }
}
