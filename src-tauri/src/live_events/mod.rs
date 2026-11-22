//! Live events and the public rankings (Supabase RPC, docs/supabase/live-events.md).
//!
//! All network I/O happens here. Reading the event list and the rankings is
//! public: it uses the publishable key only, with no user token, so it works
//! when signed out. Joining, changing the participation and the own status need
//! the access token of the Rust-side auth session; the renderer never sees a
//! token or the Supabase user id. Like the cloud save, those calls name the
//! account they expect and fail with `account_changed` when another account is
//! signed in.
//!
//! Scores come from the server's certified achievements ledger only. Nothing
//! here sends or computes a score.

pub mod remote;

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::State;

use crate::auth::session::{Access, AccessError};
use crate::cloud_save::AccessSource;
use remote::{EventCode, HttpRemote, LiveRemote, RemoteError};

/// Command errors: a code only (no URL, no token, no server message).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LiveEventError {
    SignedOut,
    AccountChanged,
    Offline,
    Server,
    Unauthorized,
    Rejected,
    EventNotFound,
    EventClosed,
    NotEligible,
    InvalidDisplayName,
    AlreadyParticipant,
    NotParticipant,
}

impl std::fmt::Display for LiveEventError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            LiveEventError::SignedOut => "not signed in",
            LiveEventError::AccountChanged => "another account is signed in",
            LiveEventError::Offline => "offline",
            LiveEventError::Server => "the server could not serve the request",
            LiveEventError::Unauthorized => "the server did not accept the session",
            LiveEventError::Rejected => "the server refused the request",
            LiveEventError::EventNotFound => "the event was not found",
            LiveEventError::EventClosed => "the event is closed",
            LiveEventError::NotEligible => "not eligible for the event",
            LiveEventError::InvalidDisplayName => "the display name is not valid",
            LiveEventError::AlreadyParticipant => "already participating",
            LiveEventError::NotParticipant => "not participating",
        })
    }
}

impl std::error::Error for LiveEventError {}

impl From<RemoteError> for LiveEventError {
    fn from(error: RemoteError) -> Self {
        match error {
            RemoteError::Network => LiveEventError::Offline,
            RemoteError::Server => LiveEventError::Server,
            RemoteError::Unauthorized => LiveEventError::Unauthorized,
            RemoteError::Rejected => LiveEventError::Rejected,
            RemoteError::Event(code) => match code {
                EventCode::EventNotFound => LiveEventError::EventNotFound,
                EventCode::EventClosed => LiveEventError::EventClosed,
                EventCode::NotEligible => LiveEventError::NotEligible,
                EventCode::InvalidDisplayName => LiveEventError::InvalidDisplayName,
                EventCode::AlreadyParticipant => LiveEventError::AlreadyParticipant,
                EventCode::NotParticipant => LiveEventError::NotParticipant,
            },
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveEventSummary {
    #[serde(alias = "event_id")]
    pub event_id: String,
    pub title: String,
    #[serde(alias = "starts_at")]
    pub starts_at: String,
    #[serde(alias = "ends_at")]
    pub ends_at: String,
    /// `upcoming` | `active` | `ended`, decided by the server clock.
    pub phase: String,
    #[serde(alias = "is_open")]
    pub is_open: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RankingRow {
    pub rank: i64,
    #[serde(alias = "display_name")]
    pub display_name: String,
    pub score: i64,
    #[serde(alias = "achievement_count")]
    pub achievement_count: i64,
    /// Teams only.
    #[serde(alias = "contributor_count", default)]
    pub contributor_count: Option<i64>,
    #[serde(alias = "total_count", skip_serializing)]
    pub total_count: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RankingPage {
    pub rows: Vec<RankingRow>,
    /// The number of ranked entries over all pages (0 when the page is empty).
    pub total: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParticipationStatus {
    pub joined: bool,
    #[serde(alias = "display_name")]
    pub display_name: Option<String>,
    #[serde(alias = "show_in_ranking")]
    pub show_in_ranking: Option<bool>,
    #[serde(default)]
    pub score: i64,
    #[serde(alias = "achievement_count", default)]
    pub achievement_count: i64,
    /// `None` for a hidden participant (no rank is revealed) or a non-participant.
    #[serde(default)]
    pub rank: Option<i64>,
}

/// The state of a participation after a join or an update.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Participation {
    #[serde(alias = "event_id")]
    pub event_id: String,
    #[serde(alias = "display_name")]
    pub display_name: String,
    #[serde(alias = "show_in_ranking")]
    pub show_in_ranking: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Joined {
    pub account: String,
    #[serde(flatten)]
    pub participation: Participation,
}

fn is_event_id(id: &str) -> bool {
    id.len() == 36 && id.chars().all(|c| c == '-' || c.is_ascii_hexdigit())
}

/// A response is an array of rows (`RETURNS TABLE`); a bare object is accepted too.
fn rows<T: for<'de> Deserialize<'de>>(value: Value) -> Result<Vec<T>, LiveEventError> {
    let items = match value {
        Value::Array(items) => items,
        other => vec![other],
    };
    items
        .into_iter()
        .map(|item| serde_json::from_value(item).map_err(|_| LiveEventError::Rejected))
        .collect()
}

fn page(rows: Vec<RankingRow>) -> RankingPage {
    let total = rows.first().map_or(0, |r| r.total_count);
    RankingPage { rows, total }
}

pub struct LiveEvents<A: AccessSource, R: LiveRemote> {
    access: A,
    remote: R,
}

impl<A: AccessSource, R: LiveRemote> LiveEvents<A, R> {
    pub fn new(access: A, remote: R) -> Self {
        LiveEvents { access, remote }
    }

    async fn authorize(&self, expected_account: &str) -> Result<Access, LiveEventError> {
        let access = self.access.current_access().await.map_err(|e| match e {
            AccessError::SignedOut => LiveEventError::SignedOut,
            AccessError::Offline => LiveEventError::Offline,
        })?;
        if access.account != expected_account {
            return Err(LiveEventError::AccountChanged);
        }
        Ok(access)
    }

    fn checked_id(event_id: &str) -> Result<(), LiveEventError> {
        if is_event_id(event_id) {
            Ok(())
        } else {
            Err(LiveEventError::EventNotFound)
        }
    }

    /// Published events (public: no token).
    pub async fn list(&self) -> Result<Vec<LiveEventSummary>, LiveEventError> {
        let value = self
            .remote
            .rpc("list_live_events", None, &json!({}))
            .await?;
        rows(value)
    }

    /// The individual ranking (public: no token).
    pub async fn ranking(
        &self,
        event_id: &str,
        limit: i32,
        offset: i32,
    ) -> Result<RankingPage, LiveEventError> {
        Self::checked_id(event_id)?;
        let value = self
            .remote
            .rpc(
                "get_live_event_ranking",
                None,
                &json!({ "p_event_id": event_id, "p_limit": limit, "p_offset": offset }),
            )
            .await?;
        Ok(page(rows(value)?))
    }

    /// The team ranking (public: no token).
    pub async fn team_ranking(
        &self,
        event_id: &str,
        limit: i32,
        offset: i32,
    ) -> Result<RankingPage, LiveEventError> {
        Self::checked_id(event_id)?;
        let value = self
            .remote
            .rpc(
                "get_live_event_team_ranking",
                None,
                &json!({ "p_event_id": event_id, "p_limit": limit, "p_offset": offset }),
            )
            .await?;
        Ok(page(rows(value)?))
    }

    /// Joins with a public display name that the user chose.
    pub async fn join(
        &self,
        expected_account: &str,
        event_id: &str,
        display_name: &str,
        show_in_ranking: bool,
    ) -> Result<Joined, LiveEventError> {
        Self::checked_id(event_id)?;
        let access = self.authorize(expected_account).await?;
        let value = self
            .remote
            .rpc(
                "join_live_event",
                Some(&access.token),
                &json!({
                    "p_event_id": event_id,
                    "p_display_name": display_name,
                    "p_show_in_ranking": show_in_ranking,
                }),
            )
            .await?;
        let participation = rows::<Participation>(value)?
            .into_iter()
            .next()
            .ok_or(LiveEventError::Rejected)?;
        Ok(Joined {
            account: access.account,
            participation,
        })
    }

    /// Changes the display name and / or the visibility (`None` keeps the value).
    pub async fn update(
        &self,
        expected_account: &str,
        event_id: &str,
        display_name: Option<&str>,
        show_in_ranking: Option<bool>,
    ) -> Result<Joined, LiveEventError> {
        Self::checked_id(event_id)?;
        let access = self.authorize(expected_account).await?;
        let value = self
            .remote
            .rpc(
                "update_live_event_participation",
                Some(&access.token),
                &json!({
                    "p_event_id": event_id,
                    "p_display_name": display_name,
                    "p_show_in_ranking": show_in_ranking,
                }),
            )
            .await?;
        let participation = rows::<Participation>(value)?
            .into_iter()
            .next()
            .ok_or(LiveEventError::Rejected)?;
        Ok(Joined {
            account: access.account,
            participation,
        })
    }

    /// The caller's own participation, score and rank.
    pub async fn status(
        &self,
        expected_account: &str,
        event_id: &str,
    ) -> Result<ParticipationStatus, LiveEventError> {
        Self::checked_id(event_id)?;
        let access = self.authorize(expected_account).await?;
        let value = self
            .remote
            .rpc(
                "get_my_live_event_status",
                Some(&access.token),
                &json!({ "p_event_id": event_id }),
            )
            .await?;
        rows::<ParticipationStatus>(value)?
            .into_iter()
            .next()
            .ok_or(LiveEventError::Rejected)
    }
}

pub type AppLiveEvents = LiveEvents<Arc<crate::auth::AppAuth>, HttpRemote>;

#[tauri::command]
pub async fn live_events_list(
    events: State<'_, Arc<AppLiveEvents>>,
) -> Result<Vec<LiveEventSummary>, LiveEventError> {
    events.list().await
}

#[tauri::command]
pub async fn live_events_ranking(
    events: State<'_, Arc<AppLiveEvents>>,
    event_id: String,
    limit: i32,
    offset: i32,
) -> Result<RankingPage, LiveEventError> {
    events.ranking(&event_id, limit, offset).await
}

#[tauri::command]
pub async fn live_events_team_ranking(
    events: State<'_, Arc<AppLiveEvents>>,
    event_id: String,
    limit: i32,
    offset: i32,
) -> Result<RankingPage, LiveEventError> {
    events.team_ranking(&event_id, limit, offset).await
}

#[tauri::command]
pub async fn live_events_join(
    events: State<'_, Arc<AppLiveEvents>>,
    expected_account: String,
    event_id: String,
    display_name: String,
    show_in_ranking: bool,
) -> Result<Joined, LiveEventError> {
    events
        .join(&expected_account, &event_id, &display_name, show_in_ranking)
        .await
}

#[tauri::command]
pub async fn live_events_update(
    events: State<'_, Arc<AppLiveEvents>>,
    expected_account: String,
    event_id: String,
    display_name: Option<String>,
    show_in_ranking: Option<bool>,
) -> Result<Joined, LiveEventError> {
    events
        .update(
            &expected_account,
            &event_id,
            display_name.as_deref(),
            show_in_ranking,
        )
        .await
}

#[tauri::command]
pub async fn live_events_status(
    events: State<'_, Arc<AppLiveEvents>>,
    expected_account: String,
    event_id: String,
) -> Result<ParticipationStatus, LiveEventError> {
    events.status(&expected_account, &event_id).await
}

/// Registers the service. Call after `auth::setup`.
pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::Manager;
    let auth: Arc<crate::auth::AppAuth> = Arc::clone(&*app.state::<Arc<crate::auth::AppAuth>>());
    let service: Arc<AppLiveEvents> = Arc::new(LiveEvents::new(
        auth,
        HttpRemote::new(crate::auth::config::AuthConfig::from_build()),
    ));
    app.manage(service);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    const EVENT: &str = "00000000-0000-4000-8000-0000000002e1";

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
        answer: Mutex<Option<Result<Value, RemoteError>>>,
        /// (rpc name, token, args)
        calls: Mutex<Vec<(String, Option<String>, Value)>>,
    }

    impl LiveRemote for Arc<FakeRemote> {
        async fn rpc(
            &self,
            name: &'static str,
            token: Option<&str>,
            args: &Value,
        ) -> Result<Value, RemoteError> {
            self.calls
                .lock()
                .unwrap()
                .push((name.into(), token.map(str::to_string), args.clone()));
            self.answer
                .lock()
                .unwrap()
                .clone()
                .unwrap_or(Ok(Value::Array(vec![])))
        }
    }

    fn service(
        account: &str,
    ) -> (
        LiveEvents<Arc<FakeAccess>, Arc<FakeRemote>>,
        Arc<FakeAccess>,
        Arc<FakeRemote>,
    ) {
        let access = Arc::new(FakeAccess(Mutex::new(Ok(("TOKEN".into(), account.into())))));
        let remote = Arc::new(FakeRemote::default());
        (
            LiveEvents::new(access.clone(), remote.clone()),
            access,
            remote,
        )
    }

    fn answer(remote: &FakeRemote, value: Result<Value, RemoteError>) {
        *remote.answer.lock().unwrap() = Some(value);
    }

    #[tokio::test]
    async fn public_reads_work_signed_out_and_send_no_token() {
        let (svc, access, remote) = service("acct-a");
        *access.0.lock().unwrap() = Err(AccessError::SignedOut);
        answer(
            &remote,
            Ok(json!([{
                "event_id": EVENT, "title": "Spring", "starts_at": "2026-03-01T00:00:00+00:00",
                "ends_at": "2026-03-02T00:00:00+00:00", "phase": "active", "is_open": true
            }])),
        );
        let events = svc.list().await.unwrap();
        assert_eq!(events[0].event_id, EVENT);
        assert!(events[0].is_open);

        answer(
            &remote,
            Ok(json!([
                {"rank": 1, "display_name": "A", "score": 50, "achievement_count": 2, "total_count": 3},
                {"rank": 1, "display_name": "B", "score": 50, "achievement_count": 1, "total_count": 3}
            ])),
        );
        let ranking = svc.ranking(EVENT, 50, 0).await.unwrap();
        assert_eq!(ranking.total, 3);
        assert_eq!(ranking.rows.len(), 2);
        let serialized = serde_json::to_value(&ranking).unwrap();
        // total_count is lifted to the page; rows carry only the public fields.
        assert!(serialized["rows"][0].get("totalCount").is_none());
        assert_eq!(serialized["rows"][0]["displayName"], "A");

        answer(
            &remote,
            Ok(
                json!([{"rank": 1, "display_name": "T", "score": 9, "achievement_count": 3,
                "contributor_count": 2, "total_count": 1}]),
            ),
        );
        let teams = svc.team_ranking(EVENT, 50, 0).await.unwrap();
        assert_eq!(teams.rows[0].contributor_count, Some(2));

        let calls = remote.calls.lock().unwrap();
        assert_eq!(calls.len(), 3);
        assert!(calls.iter().all(|(_, token, _)| token.is_none()));
        assert_eq!(calls[1].2["p_limit"], 50);
    }

    #[tokio::test]
    async fn an_empty_page_has_total_zero() {
        let (svc, _, _) = service("acct-a");
        let page = svc.ranking(EVENT, 50, 100).await.unwrap();
        assert_eq!((page.rows.len(), page.total), (0, 0));
    }

    #[tokio::test]
    async fn authenticated_calls_use_the_token_and_the_expected_account() {
        let (svc, _, remote) = service("acct-a");
        answer(
            &remote,
            Ok(
                json!([{"event_id": EVENT, "display_name": "Alice", "show_in_ranking": true,
                "joined_at": "2026-03-01T00:00:00+00:00"}]),
            ),
        );
        let joined = svc.join("acct-a", EVENT, "Alice", true).await.unwrap();
        assert_eq!(joined.account, "acct-a");
        assert_eq!(joined.participation.display_name, "Alice");
        let json = serde_json::to_value(&joined).unwrap();
        assert_eq!(json["showInRanking"], true);
        assert!(json.get("joinedAt").is_none());

        answer(
            &remote,
            Ok(
                json!([{"joined": true, "display_name": "Alice", "show_in_ranking": false,
                "score": 12, "achievement_count": 1, "rank": null}]),
            ),
        );
        let status = svc.status("acct-a", EVENT).await.unwrap();
        assert_eq!((status.score, status.rank), (12, None));

        svc.update("acct-a", EVENT, None, Some(false)).await.ok();
        let calls = remote.calls.lock().unwrap();
        assert!(calls
            .iter()
            .all(|(_, token, _)| token.as_deref() == Some("TOKEN")));
        assert_eq!(calls[0].2["p_display_name"], "Alice");
        assert_eq!(calls[2].2["p_display_name"], Value::Null);
        assert_eq!(calls[2].2["p_show_in_ranking"], false);
    }

    #[tokio::test]
    async fn authenticated_calls_never_reach_the_server_for_another_or_no_account() {
        let (svc, access, remote) = service("acct-b");
        assert_eq!(
            svc.join("acct-a", EVENT, "A", true).await.unwrap_err(),
            LiveEventError::AccountChanged
        );
        assert_eq!(
            svc.status("acct-a", EVENT).await.unwrap_err(),
            LiveEventError::AccountChanged
        );
        assert_eq!(
            svc.update("acct-a", EVENT, Some("x"), None)
                .await
                .unwrap_err(),
            LiveEventError::AccountChanged
        );
        *access.0.lock().unwrap() = Err(AccessError::SignedOut);
        assert_eq!(
            svc.join("acct-b", EVENT, "A", true).await.unwrap_err(),
            LiveEventError::SignedOut
        );
        *access.0.lock().unwrap() = Err(AccessError::Offline);
        assert_eq!(
            svc.status("acct-b", EVENT).await.unwrap_err(),
            LiveEventError::Offline
        );
        assert!(remote.calls.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_malformed_event_id_is_refused_locally() {
        let (svc, _, remote) = service("acct-a");
        assert_eq!(
            svc.ranking("../x", 50, 0).await.unwrap_err(),
            LiveEventError::EventNotFound
        );
        assert_eq!(
            svc.join("acct-a", "", "A", true).await.unwrap_err(),
            LiveEventError::EventNotFound
        );
        assert!(remote.calls.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn remote_failures_map_to_codes() {
        let (svc, _, remote) = service("acct-a");
        for (failure, code) in [
            (RemoteError::Network, LiveEventError::Offline),
            (RemoteError::Server, LiveEventError::Server),
            (RemoteError::Unauthorized, LiveEventError::Unauthorized),
            (RemoteError::Rejected, LiveEventError::Rejected),
            (
                RemoteError::Event(EventCode::EventClosed),
                LiveEventError::EventClosed,
            ),
            (
                RemoteError::Event(EventCode::NotEligible),
                LiveEventError::NotEligible,
            ),
            (
                RemoteError::Event(EventCode::AlreadyParticipant),
                LiveEventError::AlreadyParticipant,
            ),
            (
                RemoteError::Event(EventCode::InvalidDisplayName),
                LiveEventError::InvalidDisplayName,
            ),
        ] {
            answer(&remote, Err(failure));
            assert_eq!(svc.list().await.unwrap_err(), code);
            assert_eq!(
                svc.join("acct-a", EVENT, "A", true).await.unwrap_err(),
                code
            );
        }
    }

    #[tokio::test]
    async fn a_malformed_answer_is_rejected() {
        let (svc, _, remote) = service("acct-a");
        answer(&remote, Ok(json!([{"unexpected": true}])));
        assert_eq!(svc.list().await.unwrap_err(), LiveEventError::Rejected);
        assert_eq!(
            svc.join("acct-a", EVENT, "A", true).await.unwrap_err(),
            LiveEventError::Rejected
        );
        answer(&remote, Ok(json!([])));
        assert_eq!(
            svc.status("acct-a", EVENT).await.unwrap_err(),
            LiveEventError::Rejected
        );
    }

    #[test]
    fn errors_carry_no_secrets_and_serialize_as_codes() {
        assert_eq!(
            serde_json::to_string(&LiveEventError::EventClosed).unwrap(),
            "\"event_closed\""
        );
        for error in [
            LiveEventError::SignedOut,
            LiveEventError::AccountChanged,
            LiveEventError::Offline,
            LiveEventError::Server,
            LiveEventError::Unauthorized,
            LiveEventError::Rejected,
            LiveEventError::NotEligible,
        ] {
            let text = format!(
                "{error} {error:?} {}",
                serde_json::to_string(&error).unwrap()
            );
            assert!(!text.contains("http") && !text.contains("TOKEN"));
        }
    }
}
