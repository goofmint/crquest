//! Unlock codes and tree planting: the two Supabase RPCs behind them.
//!
//! Like the cloud save, all network I/O happens here with the access token of
//! the Rust-side auth session; the renderer passes the code (or the target) in
//! and gets a typed result out. It identifies the account by the opaque
//! fingerprint from the auth status, and every call names the account it
//! expects: a call that finds another account signed in fails with
//! `account_changed` before anything is sent.
//!
//! The server matches the code and records the grant per user; a tree planting
//! is a self-reported record (attestation), not a certified achievement
//! (docs/supabase/unlocks-and-trees.md). Nothing is logged: not the code, the
//! target, the token or the user id.

pub mod remote;

use std::sync::Arc;

use serde::Serialize;
use tauri::State;

use crate::cloud_save::{AccessSource, CloudError};
use remote::{PlantingStatus, RedeemStatus, RewardsRemote};

/// Longest code or id that is sent. The server applies the same limits; this
/// only spares a request that cannot succeed.
const MAX_INPUT_CHARS: usize = 128;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnlockRedeemResult {
    pub account: String,
    pub status: RedeemStatus,
    /// The item to grant locally (`redeemed` and `already_redeemed`).
    pub item_key: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreePlantingResult {
    pub account: String,
    pub status: PlantingStatus,
}

pub struct Rewards<A: AccessSource, R: RewardsRemote> {
    access: A,
    remote: R,
}

impl<A: AccessSource, R: RewardsRemote> Rewards<A, R> {
    pub fn new(access: A, remote: R) -> Self {
        Rewards { access, remote }
    }

    async fn authorize(
        &self,
        expected_account: &str,
    ) -> Result<crate::auth::session::Access, CloudError> {
        use crate::auth::session::AccessError;
        let access = self.access.current_access().await.map_err(|e| match e {
            AccessError::SignedOut => CloudError::SignedOut,
            AccessError::Offline => CloudError::Offline,
        })?;
        if access.account != expected_account {
            return Err(CloudError::AccountChanged);
        }
        Ok(access)
    }

    /// Redeems `code` for the signed-in user. A resend answers
    /// `already_redeemed` with the first grant's item, so that the caller can
    /// repair a lost local grant.
    pub async fn redeem(
        &self,
        expected_account: &str,
        code: &str,
    ) -> Result<UnlockRedeemResult, CloudError> {
        let code = code.trim();
        if code.is_empty() || code.chars().count() > MAX_INPUT_CHARS {
            // Same answer as the server gives, without a request.
            return Ok(UnlockRedeemResult {
                account: self.authorize(expected_account).await?.account,
                status: RedeemStatus::InvalidCode,
                item_key: None,
            });
        }
        let access = self.authorize(expected_account).await?;
        let answer = self.remote.redeem(&access.token, code).await?;
        Ok(UnlockRedeemResult {
            account: access.account,
            status: answer.status,
            item_key: answer.item_key,
        })
    }

    /// Records a tree planting for the signed-in user (idempotent per target).
    pub async fn record_planting(
        &self,
        expected_account: &str,
        mission_id: &str,
        target_id: &str,
    ) -> Result<TreePlantingResult, CloudError> {
        let too_long = |s: &str| s.is_empty() || s.chars().count() > MAX_INPUT_CHARS;
        if too_long(mission_id) || too_long(target_id) {
            return Ok(TreePlantingResult {
                account: self.authorize(expected_account).await?.account,
                status: PlantingStatus::UnsupportedTarget,
            });
        }
        let access = self.authorize(expected_account).await?;
        let answer = self
            .remote
            .record_planting(&access.token, mission_id, target_id)
            .await?;
        Ok(TreePlantingResult {
            account: access.account,
            status: answer.status,
        })
    }
}

pub type AppRewards = Rewards<Arc<crate::auth::AppAuth>, remote::HttpRemote>;

#[tauri::command]
pub async fn unlock_code_redeem(
    rewards: State<'_, Arc<AppRewards>>,
    expected_account: String,
    code: String,
) -> Result<UnlockRedeemResult, CloudError> {
    rewards.redeem(&expected_account, &code).await
}

#[tauri::command]
pub async fn tree_planting_record(
    rewards: State<'_, Arc<AppRewards>>,
    expected_account: String,
    mission_id: String,
    target_id: String,
) -> Result<TreePlantingResult, CloudError> {
    rewards
        .record_planting(&expected_account, &mission_id, &target_id)
        .await
}

/// Registers the service. Call after `auth::setup`.
pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::Manager;
    let auth: Arc<crate::auth::AppAuth> = Arc::clone(&*app.state::<Arc<crate::auth::AppAuth>>());
    let service: Arc<AppRewards> = Arc::new(Rewards::new(
        auth,
        remote::HttpRemote::new(crate::auth::config::AuthConfig::from_build()),
    ));
    app.manage(service);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::session::{Access, AccessError};
    use crate::cloud_save::remote::RemoteError;
    use remote::{RemotePlanting, RemoteRedeem};
    use std::sync::Mutex;

    struct FakeAccess(Mutex<Result<(String, String), AccessError>>);

    impl AccessSource for Arc<FakeAccess> {
        async fn current_access(&self) -> Result<Access, AccessError> {
            self.0
                .lock()
                .unwrap()
                .clone()
                .map(|(token, account)| Access { token, account })
        }
    }

    #[derive(Default)]
    struct FakeRemote {
        fail: Mutex<Option<RemoteError>>,
        calls: Mutex<Vec<String>>,
    }

    impl RewardsRemote for Arc<FakeRemote> {
        async fn redeem(&self, token: &str, code: &str) -> Result<RemoteRedeem, RemoteError> {
            self.calls
                .lock()
                .unwrap()
                .push(format!("redeem:{token}:{code}"));
            if let Some(e) = *self.fail.lock().unwrap() {
                return Err(e);
            }
            Ok(if code == "GOOD" {
                RemoteRedeem {
                    status: RedeemStatus::Redeemed,
                    item_key: Some("wand".into()),
                }
            } else {
                RemoteRedeem {
                    status: RedeemStatus::InvalidCode,
                    item_key: None,
                }
            })
        }
        async fn record_planting(
            &self,
            token: &str,
            mission_id: &str,
            target_id: &str,
        ) -> Result<RemotePlanting, RemoteError> {
            self.calls
                .lock()
                .unwrap()
                .push(format!("plant:{token}:{mission_id}:{target_id}"));
            if let Some(e) = *self.fail.lock().unwrap() {
                return Err(e);
            }
            Ok(RemotePlanting {
                status: PlantingStatus::Recorded,
            })
        }
    }

    fn service(
        account: &str,
    ) -> (
        Rewards<Arc<FakeAccess>, Arc<FakeRemote>>,
        Arc<FakeAccess>,
        Arc<FakeRemote>,
    ) {
        let access = Arc::new(FakeAccess(Mutex::new(Ok(("TOKEN".into(), account.into())))));
        let remote = Arc::new(FakeRemote::default());
        (Rewards::new(access.clone(), remote.clone()), access, remote)
    }

    #[tokio::test]
    async fn a_code_is_redeemed_with_the_session_token_and_the_account_fingerprint() {
        let (svc, _, remote) = service("acct-a");
        let granted = svc.redeem("acct-a", "  GOOD ").await.unwrap();
        assert_eq!(
            (
                granted.status,
                granted.item_key.as_deref(),
                granted.account.as_str()
            ),
            (RedeemStatus::Redeemed, Some("wand"), "acct-a")
        );
        // The surrounding whitespace is trimmed before the code is sent.
        assert_eq!(*remote.calls.lock().unwrap(), vec!["redeem:TOKEN:GOOD"]);
        let invalid = svc.redeem("acct-a", "BAD").await.unwrap();
        assert_eq!(
            (invalid.status, invalid.item_key),
            (RedeemStatus::InvalidCode, None)
        );
    }

    #[tokio::test]
    async fn a_planting_is_recorded_for_the_signed_in_account() {
        let (svc, _, remote) = service("acct-a");
        let result = svc
            .record_planting("acct-a", "fog_owl", "owl_plant_tree1")
            .await
            .unwrap();
        assert_eq!(result.status, PlantingStatus::Recorded);
        assert_eq!(
            *remote.calls.lock().unwrap(),
            vec!["plant:TOKEN:fog_owl:owl_plant_tree1"]
        );
    }

    #[tokio::test]
    async fn a_call_for_another_account_never_reaches_the_server() {
        let (svc, _, remote) = service("acct-b");
        assert_eq!(
            svc.redeem("acct-a", "GOOD").await.unwrap_err(),
            CloudError::AccountChanged
        );
        assert_eq!(
            svc.record_planting("acct-a", "m", "t").await.unwrap_err(),
            CloudError::AccountChanged
        );
        assert!(remote.calls.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn signed_out_and_offline_sessions_are_reported_without_a_request() {
        let (svc, access, remote) = service("acct-a");
        *access.0.lock().unwrap() = Err(AccessError::SignedOut);
        assert_eq!(
            svc.redeem("acct-a", "GOOD").await.unwrap_err(),
            CloudError::SignedOut
        );
        assert_eq!(
            svc.record_planting("acct-a", "m", "t").await.unwrap_err(),
            CloudError::SignedOut
        );
        *access.0.lock().unwrap() = Err(AccessError::Offline);
        assert_eq!(
            svc.redeem("acct-a", "GOOD").await.unwrap_err(),
            CloudError::Offline
        );
        assert_eq!(
            svc.record_planting("acct-a", "m", "t").await.unwrap_err(),
            CloudError::Offline
        );
        assert!(remote.calls.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn remote_failures_map_to_codes() {
        let (svc, _, remote) = service("acct-a");
        for (failure, code) in [
            (RemoteError::Network, CloudError::Offline),
            (RemoteError::Server, CloudError::Server),
            (RemoteError::Unauthorized, CloudError::Unauthorized),
            (RemoteError::Rejected, CloudError::Rejected),
        ] {
            *remote.fail.lock().unwrap() = Some(failure);
            assert_eq!(svc.redeem("acct-a", "GOOD").await.unwrap_err(), code);
            assert_eq!(
                svc.record_planting("acct-a", "m", "t").await.unwrap_err(),
                code
            );
        }
    }

    #[tokio::test]
    async fn inputs_that_cannot_succeed_are_answered_without_a_request() {
        let (svc, _, remote) = service("acct-a");
        for code in ["", "   ", &"x".repeat(129)] {
            assert_eq!(
                svc.redeem("acct-a", code).await.unwrap().status,
                RedeemStatus::InvalidCode
            );
        }
        for (mission, target) in [("", "t"), ("m", ""), (&"x".repeat(129), "t")] {
            assert_eq!(
                svc.record_planting("acct-a", mission, target)
                    .await
                    .unwrap()
                    .status,
                PlantingStatus::UnsupportedTarget
            );
        }
        assert!(remote.calls.lock().unwrap().is_empty());
    }

    #[test]
    fn results_serialize_for_the_renderer_without_secrets() {
        let redeem = serde_json::to_value(UnlockRedeemResult {
            account: "acct".into(),
            status: RedeemStatus::AlreadyRedeemed,
            item_key: Some("wand".into()),
        })
        .unwrap();
        assert_eq!(
            redeem,
            serde_json::json!({"account": "acct", "status": "already_redeemed", "itemKey": "wand"})
        );
        let planting = serde_json::to_value(TreePlantingResult {
            account: "acct".into(),
            status: PlantingStatus::UnsupportedTarget,
        })
        .unwrap();
        assert_eq!(
            planting,
            serde_json::json!({"account": "acct", "status": "unsupported_target"})
        );
    }
}
