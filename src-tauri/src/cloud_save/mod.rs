//! Cloud save: reads and writes the signed-in user's save row in Supabase.
//!
//! All network I/O happens here, with the access token of the Rust-side auth
//! session (src/auth). The renderer passes data in and gets data out; it never
//! sees a token or the Supabase user id. It identifies the account by the opaque
//! fingerprint from the auth status, and every call names the account it
//! expects: a call that finds another account signed in fails with
//! `account_changed` instead of touching the wrong user's save.
//!
//! The data is self-reported by the client. It must never feed rankings or team
//! scores (docs/supabase/cloud-save.md).

pub mod remote;

use std::sync::Arc;

use serde::Serialize;
use serde_json::Value;
use tauri::State;

use crate::auth::client::AuthApi;
use crate::auth::session::{Access, AccessError, AuthManager};
use crate::auth::store::SecretStore;
use remote::{CloudRemote, RemoteError, MAX_DATA_BYTES};

/// Command errors: a code only (no URL, no token, no server message).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CloudError {
    /// Not signed in.
    SignedOut,
    /// Another account is signed in than the one the caller expected.
    AccountChanged,
    /// No connection (also: signed in but the token could not be refreshed).
    Offline,
    /// The server could not serve the request (5xx, 429): retry later.
    Server,
    /// The server did not accept the token.
    Unauthorized,
    /// The server refused the request (constraint, malformed answer).
    Rejected,
    TooLarge,
}

impl std::fmt::Display for CloudError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            CloudError::SignedOut => "not signed in",
            CloudError::AccountChanged => "another account is signed in",
            CloudError::Offline => "offline",
            CloudError::Server => "the server could not serve the request",
            CloudError::Unauthorized => "the server did not accept the session",
            CloudError::Rejected => "the server refused the request",
            CloudError::TooLarge => "the save is too large",
        })
    }
}

impl std::error::Error for CloudError {}

impl From<RemoteError> for CloudError {
    fn from(error: RemoteError) -> Self {
        match error {
            RemoteError::Network => CloudError::Offline,
            RemoteError::Server => CloudError::Server,
            RemoteError::Unauthorized => CloudError::Unauthorized,
            RemoteError::TooLarge => CloudError::TooLarge,
            RemoteError::Rejected => CloudError::Rejected,
        }
    }
}

/// Where the access token comes from (the auth session in production).
pub trait AccessSource: Send + Sync + 'static {
    fn current_access(
        &self,
    ) -> impl std::future::Future<Output = Result<Access, AccessError>> + Send;
}

impl<S: SecretStore, C: AuthApi> AccessSource for Arc<AuthManager<S, C>> {
    async fn current_access(&self) -> Result<Access, AccessError> {
        self.access().await
    }
}

/// A save as the renderer gets it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudSaveRow {
    /// The fingerprint of the account that the row belongs to.
    pub account: String,
    pub revision: i64,
    pub updated_at: String,
    pub schema_version: i32,
    pub data: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudSaveAccepted {
    pub account: String,
    pub revision: i64,
    pub updated_at: String,
}

pub struct CloudSave<A: AccessSource, R: CloudRemote> {
    access: A,
    remote: R,
}

impl<A: AccessSource, R: CloudRemote> CloudSave<A, R> {
    pub fn new(access: A, remote: R) -> Self {
        CloudSave { access, remote }
    }

    async fn authorize(&self, expected_account: &str) -> Result<Access, CloudError> {
        let access = self.access.current_access().await.map_err(|e| match e {
            AccessError::SignedOut => CloudError::SignedOut,
            AccessError::Offline => CloudError::Offline,
        })?;
        if access.account != expected_account {
            return Err(CloudError::AccountChanged);
        }
        Ok(access)
    }

    /// The signed-in user's save, or `None` when there is none.
    pub async fn fetch(&self, expected_account: &str) -> Result<Option<CloudSaveRow>, CloudError> {
        let access = self.authorize(expected_account).await?;
        let row = self.remote.fetch(&access.token).await?;
        Ok(row.map(|row| CloudSaveRow {
            account: access.account,
            revision: row.revision,
            updated_at: row.updated_at,
            schema_version: row.schema_version,
            data: row.data,
        }))
    }

    /// Writes the save; the server assigns the revision.
    pub async fn upload(
        &self,
        expected_account: &str,
        data: &Value,
        schema_version: i32,
    ) -> Result<CloudSaveAccepted, CloudError> {
        if !data.is_object() || schema_version < 1 {
            return Err(CloudError::Rejected);
        }
        // Compared before any request, so that an oversized save costs nothing.
        let size = serde_json::to_vec(data)
            .map(|b| b.len())
            .unwrap_or(usize::MAX);
        if size > MAX_DATA_BYTES {
            return Err(CloudError::TooLarge);
        }
        let access = self.authorize(expected_account).await?;
        let accepted = self
            .remote
            .upsert(&access.token, data, schema_version)
            .await?;
        Ok(CloudSaveAccepted {
            account: access.account,
            revision: accepted.revision,
            updated_at: accepted.updated_at,
        })
    }
}

pub type AppCloudSave = CloudSave<Arc<crate::auth::AppAuth>, remote::HttpRemote>;

#[tauri::command]
pub async fn cloud_save_fetch(
    cloud: State<'_, Arc<AppCloudSave>>,
    expected_account: String,
) -> Result<Option<CloudSaveRow>, CloudError> {
    cloud.fetch(&expected_account).await
}

#[tauri::command]
pub async fn cloud_save_upload(
    cloud: State<'_, Arc<AppCloudSave>>,
    expected_account: String,
    data: Value,
    schema_version: i32,
) -> Result<CloudSaveAccepted, CloudError> {
    cloud.upload(&expected_account, &data, schema_version).await
}

/// Registers the service. Call after `auth::setup`.
pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::Manager;
    let auth: Arc<crate::auth::AppAuth> = Arc::clone(&*app.state::<Arc<crate::auth::AppAuth>>());
    let service: Arc<AppCloudSave> = Arc::new(CloudSave::new(
        auth,
        remote::HttpRemote::new(crate::auth::config::AuthConfig::from_build()),
    ));
    app.manage(service);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use remote::{RemoteAccepted, RemoteRow};
    use std::sync::Mutex;

    struct FakeAccess(Mutex<Result<(String, String), AccessError>>);

    impl FakeAccess {
        fn signed_in(account: &str) -> Self {
            FakeAccess(Mutex::new(Ok(("TOKEN".into(), account.into()))))
        }
    }

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
        row: Mutex<Option<RemoteRow>>,
        fail: Mutex<Option<RemoteError>>,
        calls: Mutex<Vec<String>>,
    }

    impl CloudRemote for Arc<FakeRemote> {
        async fn fetch(&self, token: &str) -> Result<Option<RemoteRow>, RemoteError> {
            self.calls.lock().unwrap().push(format!("fetch:{token}"));
            if let Some(e) = *self.fail.lock().unwrap() {
                return Err(e);
            }
            Ok(self.row.lock().unwrap().clone())
        }
        async fn upsert(
            &self,
            token: &str,
            data: &Value,
            _schema_version: i32,
        ) -> Result<RemoteAccepted, RemoteError> {
            self.calls.lock().unwrap().push(format!("upsert:{token}"));
            if let Some(e) = *self.fail.lock().unwrap() {
                return Err(e);
            }
            let revision = self.row.lock().unwrap().as_ref().map_or(0, |r| r.revision) + 1;
            *self.row.lock().unwrap() = Some(RemoteRow {
                data: data.clone(),
                schema_version: 1,
                revision,
                updated_at: "t".into(),
            });
            Ok(RemoteAccepted {
                revision,
                updated_at: "t".into(),
            })
        }
    }

    fn service(
        account: &str,
    ) -> (
        CloudSave<Arc<FakeAccess>, Arc<FakeRemote>>,
        Arc<FakeAccess>,
        Arc<FakeRemote>,
    ) {
        let access = Arc::new(FakeAccess::signed_in(account));
        let remote = Arc::new(FakeRemote::default());
        (
            CloudSave::new(access.clone(), remote.clone()),
            access,
            remote,
        )
    }

    #[tokio::test]
    async fn upload_then_fetch_round_trips_with_the_account_fingerprint() {
        let (svc, _, _) = service("acct-a");
        assert_eq!(svc.fetch("acct-a").await.unwrap(), None);
        let accepted = svc
            .upload("acct-a", &serde_json::json!({"xp": 5}), 1)
            .await
            .unwrap();
        assert_eq!(
            (accepted.revision, accepted.account.as_str()),
            (1, "acct-a")
        );
        let row = svc.fetch("acct-a").await.unwrap().unwrap();
        assert_eq!(row.data["xp"], 5);
        assert_eq!(row.account, "acct-a");
    }

    #[tokio::test]
    async fn a_call_for_another_account_never_reaches_the_server() {
        let (svc, _, remote) = service("acct-b");
        assert_eq!(
            svc.fetch("acct-a").await.unwrap_err(),
            CloudError::AccountChanged
        );
        assert_eq!(
            svc.upload("acct-a", &serde_json::json!({}), 1)
                .await
                .unwrap_err(),
            CloudError::AccountChanged
        );
        assert!(remote.calls.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn signed_out_and_offline_sessions_are_reported_without_a_request() {
        let (svc, access, remote) = service("acct-a");
        *access.0.lock().unwrap() = Err(AccessError::SignedOut);
        assert_eq!(
            svc.fetch("acct-a").await.unwrap_err(),
            CloudError::SignedOut
        );
        *access.0.lock().unwrap() = Err(AccessError::Offline);
        assert_eq!(svc.fetch("acct-a").await.unwrap_err(), CloudError::Offline);
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
            (RemoteError::TooLarge, CloudError::TooLarge),
        ] {
            *remote.fail.lock().unwrap() = Some(failure);
            assert_eq!(svc.fetch("acct-a").await.unwrap_err(), code);
            assert_eq!(
                svc.upload("acct-a", &serde_json::json!({}), 1)
                    .await
                    .unwrap_err(),
                code
            );
        }
    }

    #[tokio::test]
    async fn invalid_and_oversized_uploads_are_refused_locally() {
        let (svc, _, remote) = service("acct-a");
        assert_eq!(
            svc.upload("acct-a", &serde_json::json!([1]), 1)
                .await
                .unwrap_err(),
            CloudError::Rejected
        );
        assert_eq!(
            svc.upload("acct-a", &serde_json::json!({}), 0)
                .await
                .unwrap_err(),
            CloudError::Rejected
        );
        let big = serde_json::json!({ "x": "y".repeat(MAX_DATA_BYTES) });
        assert_eq!(
            svc.upload("acct-a", &big, 1).await.unwrap_err(),
            CloudError::TooLarge
        );
        assert!(remote.calls.lock().unwrap().is_empty());
    }

    #[test]
    fn errors_and_rows_carry_no_secrets() {
        for error in [
            CloudError::SignedOut,
            CloudError::AccountChanged,
            CloudError::Offline,
            CloudError::Server,
            CloudError::Unauthorized,
            CloudError::Rejected,
            CloudError::TooLarge,
        ] {
            let text = format!(
                "{error} {error:?} {}",
                serde_json::to_string(&error).unwrap()
            );
            assert!(!text.contains("http") && !text.contains("TOKEN"));
        }
    }
}
