//! Team and operation membership (Supabase RPC `join_group` / `leave_group`,
//! docs/supabase/teams-operations.md).
//!
//! All network I/O happens here with the access token of the Rust-side auth
//! session; the renderer passes the join code (or the group id) in and gets a
//! typed result out, and never sees a token or the user id. Like the cloud
//! save, every call names the account it expects and fails with
//! `account_changed` before anything is sent when another account is signed in.
//! Nothing is logged: not the join code, the group id, the token or the user id.

pub mod remote;

use std::sync::Arc;

use serde::Serialize;
use tauri::State;

use crate::auth::session::{Access, AccessError};
use crate::cloud_save::AccessSource;
use remote::{GroupCode, GroupsRemote, RemoteError};

/// Longest join code that is sent. The server applies its own rules; this only
/// spares a request that cannot succeed.
const MAX_JOIN_CODE_CHARS: usize = 128;

/// Command errors: a code only (no URL, no token, no server message).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum GroupError {
    SignedOut,
    AccountChanged,
    Offline,
    Server,
    Unauthorized,
    Rejected,
    InvalidJoinCode,
    AlreadyMember,
    NotMember,
    InvalidKind,
}

impl std::fmt::Display for GroupError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            GroupError::SignedOut => "not signed in",
            GroupError::AccountChanged => "another account is signed in",
            GroupError::Offline => "offline",
            GroupError::Server => "the server could not serve the request",
            GroupError::Unauthorized => "the server did not accept the session",
            GroupError::Rejected => "the server refused the request",
            GroupError::InvalidJoinCode => "the join code was not found",
            GroupError::AlreadyMember => "already a member",
            GroupError::NotMember => "not a member",
            GroupError::InvalidKind => "unknown group kind",
        })
    }
}

impl std::error::Error for GroupError {}

impl From<RemoteError> for GroupError {
    fn from(e: RemoteError) -> Self {
        match e {
            RemoteError::Network => GroupError::Offline,
            RemoteError::Server => GroupError::Server,
            RemoteError::Unauthorized => GroupError::Unauthorized,
            RemoteError::Rejected => GroupError::Rejected,
            RemoteError::Group(GroupCode::InvalidJoinCode) => GroupError::InvalidJoinCode,
            RemoteError::Group(GroupCode::AlreadyMember) => GroupError::AlreadyMember,
            RemoteError::Group(GroupCode::NotMember) => GroupError::NotMember,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupJoinResult {
    pub account: String,
    pub group_id: String,
    pub display_name: String,
    pub join_code: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupListResult {
    pub account: String,
    pub groups: Vec<GroupEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupEntry {
    pub group_id: String,
    pub display_name: String,
    pub join_code: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct GroupLeaveResult {
    pub account: String,
}

pub struct Groups<A: AccessSource, R: GroupsRemote> {
    access: A,
    remote: R,
}

fn is_uuid(id: &str) -> bool {
    id.len() == 36
        && id.char_indices().all(|(i, c)| match i {
            8 | 13 | 18 | 23 => c == '-',
            _ => c.is_ascii_hexdigit(),
        })
}

impl<A: AccessSource, R: GroupsRemote> Groups<A, R> {
    pub fn new(access: A, remote: R) -> Self {
        Groups { access, remote }
    }

    async fn authorize(&self, expected_account: &str) -> Result<Access, GroupError> {
        let access = self.access.current_access().await.map_err(|e| match e {
            AccessError::SignedOut => GroupError::SignedOut,
            AccessError::Offline => GroupError::Offline,
        })?;
        if access.account != expected_account {
            return Err(GroupError::AccountChanged);
        }
        Ok(access)
    }

    /// Joins the team / operation with `join_code` for the signed-in user.
    pub async fn join(
        &self,
        expected_account: &str,
        kind: &str,
        join_code: &str,
    ) -> Result<GroupJoinResult, GroupError> {
        if kind != "team" && kind != "operation" {
            return Err(GroupError::InvalidKind);
        }
        let access = self.authorize(expected_account).await?;
        let code = join_code.trim();
        if code.is_empty() || code.chars().count() > MAX_JOIN_CODE_CHARS {
            // Same answer as the server gives, without a request.
            return Err(GroupError::InvalidJoinCode);
        }
        let group = self.remote.join(&access.token, kind, code).await?;
        Ok(GroupJoinResult {
            account: access.account,
            group_id: group.group_id,
            display_name: group.display_name,
            join_code: group.join_code,
        })
    }

    /// The signed-in user's active memberships of one kind (restores a lost
    /// local entry).
    pub async fn list(
        &self,
        expected_account: &str,
        kind: &str,
    ) -> Result<GroupListResult, GroupError> {
        if kind != "team" && kind != "operation" {
            return Err(GroupError::InvalidKind);
        }
        let access = self.authorize(expected_account).await?;
        let groups = self.remote.list(&access.token, kind).await?;
        Ok(GroupListResult {
            account: access.account,
            groups: groups
                .into_iter()
                .map(|g| GroupEntry {
                    group_id: g.group_id,
                    display_name: g.display_name,
                    join_code: g.join_code,
                })
                .collect(),
        })
    }

    /// Leaves the group for the signed-in user. An id that is not a server id
    /// (an entry saved by the former backend) cannot be a server membership:
    /// `not_member` without a request.
    pub async fn leave(
        &self,
        expected_account: &str,
        group_id: &str,
    ) -> Result<GroupLeaveResult, GroupError> {
        let access = self.authorize(expected_account).await?;
        if !is_uuid(group_id) {
            return Err(GroupError::NotMember);
        }
        self.remote.leave(&access.token, group_id).await?;
        Ok(GroupLeaveResult {
            account: access.account,
        })
    }
}

pub type AppGroups = Groups<Arc<crate::auth::AppAuth>, remote::HttpRemote>;

#[tauri::command]
pub async fn group_join(
    groups: State<'_, Arc<AppGroups>>,
    expected_account: String,
    kind: String,
    join_code: String,
) -> Result<GroupJoinResult, GroupError> {
    groups.join(&expected_account, &kind, &join_code).await
}

#[tauri::command]
pub async fn group_list(
    groups: State<'_, Arc<AppGroups>>,
    expected_account: String,
    kind: String,
) -> Result<GroupListResult, GroupError> {
    groups.list(&expected_account, &kind).await
}

#[tauri::command]
pub async fn group_leave(
    groups: State<'_, Arc<AppGroups>>,
    expected_account: String,
    group_id: String,
) -> Result<GroupLeaveResult, GroupError> {
    groups.leave(&expected_account, &group_id).await
}

/// Registers the service. Call after `auth::setup`.
pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::Manager;
    let auth: Arc<crate::auth::AppAuth> = Arc::clone(&*app.state::<Arc<crate::auth::AppAuth>>());
    let service: Arc<AppGroups> = Arc::new(Groups::new(
        auth,
        remote::HttpRemote::new(crate::auth::config::AuthConfig::from_build()),
    ));
    app.manage(service);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use remote::RemoteGroup;
    use std::sync::Mutex;

    const GID: &str = "123e4567-e89b-12d3-a456-426614174000";

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

    impl GroupsRemote for Arc<FakeRemote> {
        async fn join(
            &self,
            token: &str,
            kind: &str,
            join_code: &str,
        ) -> Result<RemoteGroup, RemoteError> {
            self.calls
                .lock()
                .unwrap()
                .push(format!("join:{token}:{kind}:{join_code}"));
            if let Some(e) = *self.fail.lock().unwrap() {
                return Err(e);
            }
            Ok(RemoteGroup {
                group_id: GID.into(),
                display_name: "Owls".into(),
                join_code: join_code.into(),
            })
        }
        async fn list(&self, token: &str, kind: &str) -> Result<Vec<RemoteGroup>, RemoteError> {
            self.calls
                .lock()
                .unwrap()
                .push(format!("list:{token}:{kind}"));
            if let Some(e) = *self.fail.lock().unwrap() {
                return Err(e);
            }
            Ok(vec![RemoteGroup {
                group_id: GID.into(),
                display_name: "Owls".into(),
                join_code: "OWL123".into(),
            }])
        }
        async fn leave(&self, token: &str, group_id: &str) -> Result<(), RemoteError> {
            self.calls
                .lock()
                .unwrap()
                .push(format!("leave:{token}:{group_id}"));
            if let Some(e) = *self.fail.lock().unwrap() {
                return Err(e);
            }
            Ok(())
        }
    }

    fn service(
        account: &str,
    ) -> (
        Groups<Arc<FakeAccess>, Arc<FakeRemote>>,
        Arc<FakeAccess>,
        Arc<FakeRemote>,
    ) {
        let access = Arc::new(FakeAccess(Mutex::new(Ok(("TOKEN".into(), account.into())))));
        let remote = Arc::new(FakeRemote::default());
        (Groups::new(access.clone(), remote.clone()), access, remote)
    }

    #[tokio::test]
    async fn joining_uses_the_session_token_and_trims_the_code() {
        let (svc, _, remote) = service("acct-a");
        let joined = svc.join("acct-a", "team", "  OWL123 ").await.unwrap();
        assert_eq!(
            (joined.group_id.as_str(), joined.display_name.as_str()),
            (GID, "Owls")
        );
        assert_eq!(joined.account, "acct-a");
        assert_eq!(
            *remote.calls.lock().unwrap(),
            vec!["join:TOKEN:team:OWL123"]
        );
    }

    #[tokio::test]
    async fn listing_returns_the_memberships_of_the_signed_in_account() {
        let (svc, _, remote) = service("acct-a");
        let listed = svc.list("acct-a", "team").await.unwrap();
        assert_eq!(listed.groups.len(), 1);
        assert_eq!(listed.groups[0].join_code, "OWL123");
        assert_eq!(
            svc.list("acct-b", "team").await.unwrap_err(),
            GroupError::AccountChanged
        );
        assert_eq!(
            svc.list("acct-a", "club").await.unwrap_err(),
            GroupError::InvalidKind
        );
        assert_eq!(*remote.calls.lock().unwrap(), vec!["list:TOKEN:team"]);
    }

    #[tokio::test]
    async fn leaving_calls_the_server_for_server_ids_only() {
        let (svc, _, remote) = service("acct-a");
        svc.leave("acct-a", GID).await.unwrap();
        assert_eq!(
            svc.leave("acct-a", "legacy-team-id").await.unwrap_err(),
            GroupError::NotMember
        );
        assert_eq!(
            *remote.calls.lock().unwrap(),
            vec![format!("leave:TOKEN:{GID}")]
        );
    }

    #[tokio::test]
    async fn a_call_for_another_account_never_reaches_the_server() {
        let (svc, _, remote) = service("acct-b");
        assert_eq!(
            svc.join("acct-a", "team", "OWL123").await.unwrap_err(),
            GroupError::AccountChanged
        );
        assert_eq!(
            svc.leave("acct-a", GID).await.unwrap_err(),
            GroupError::AccountChanged
        );
        assert!(remote.calls.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn signed_out_and_offline_sessions_are_reported_without_a_request() {
        let (svc, access, remote) = service("acct-a");
        *access.0.lock().unwrap() = Err(AccessError::SignedOut);
        assert_eq!(
            svc.join("acct-a", "team", "OWL123").await.unwrap_err(),
            GroupError::SignedOut
        );
        assert_eq!(
            svc.leave("acct-a", GID).await.unwrap_err(),
            GroupError::SignedOut
        );
        *access.0.lock().unwrap() = Err(AccessError::Offline);
        assert_eq!(
            svc.join("acct-a", "team", "OWL123").await.unwrap_err(),
            GroupError::Offline
        );
        assert!(remote.calls.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn remote_failures_map_to_codes() {
        let (svc, _, remote) = service("acct-a");
        for (failure, code) in [
            (RemoteError::Network, GroupError::Offline),
            (RemoteError::Server, GroupError::Server),
            (RemoteError::Unauthorized, GroupError::Unauthorized),
            (RemoteError::Rejected, GroupError::Rejected),
            (
                RemoteError::Group(GroupCode::InvalidJoinCode),
                GroupError::InvalidJoinCode,
            ),
            (
                RemoteError::Group(GroupCode::AlreadyMember),
                GroupError::AlreadyMember,
            ),
            (
                RemoteError::Group(GroupCode::NotMember),
                GroupError::NotMember,
            ),
        ] {
            *remote.fail.lock().unwrap() = Some(failure);
            assert_eq!(
                svc.join("acct-a", "operation", "OWL123").await.unwrap_err(),
                code
            );
            assert_eq!(svc.leave("acct-a", GID).await.unwrap_err(), code);
        }
    }

    #[tokio::test]
    async fn inputs_that_cannot_succeed_are_answered_without_a_request() {
        let (svc, _, remote) = service("acct-a");
        for code in ["", "   ", &"x".repeat(129)] {
            assert_eq!(
                svc.join("acct-a", "team", code).await.unwrap_err(),
                GroupError::InvalidJoinCode
            );
        }
        assert_eq!(
            svc.join("acct-a", "club", "OWL123").await.unwrap_err(),
            GroupError::InvalidKind
        );
        assert!(remote.calls.lock().unwrap().is_empty());
    }

    #[test]
    fn results_serialize_for_the_renderer_without_secrets() {
        let joined = serde_json::to_value(GroupJoinResult {
            account: "acct".into(),
            group_id: GID.into(),
            display_name: "Owls".into(),
            join_code: "OWL123".into(),
        })
        .unwrap();
        assert_eq!(
            joined,
            serde_json::json!({"account": "acct", "groupId": GID, "displayName": "Owls", "joinCode": "OWL123"})
        );
        assert_eq!(
            serde_json::to_value(GroupError::InvalidJoinCode).unwrap(),
            "invalid_join_code"
        );
    }
}
