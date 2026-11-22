//! The login state machine. One `tokio` mutex serializes everything that
//! changes the session: starting a login, consuming a callback, refreshing and
//! logging out. The status that the renderer sees is a separate, secret-free
//! value that can be read without waiting for that lock.

use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;

use serde::Serialize;

use super::callback::{self, DeniedReason, Outcome};
use super::client::{ApiError, AuthApi, Tokens};
use super::config::AuthConfig;
use super::pkce;
use super::store::{PendingAttempt, SecretStore, Slot, StoredSession};
use super::{AuthError, Provider};

/// A started login is valid for this long (seconds).
pub const PENDING_TTL_SECS: u64 = 600;
/// Refresh this long before the access token expires.
const REFRESH_MARGIN_SECS: u64 = 60;
const MIN_REFRESH_DELAY_SECS: u64 = 30;
/// Retry delay after a refresh failed because of the network.
const RETRY_SECS: u64 = 60;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum State {
    Restoring,
    SignedOut,
    SignedIn,
    Pending,
    Expired,
    Error,
    Unconfigured,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Persistence {
    Keyring,
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    ProviderDenied,
    ProviderError,
    LoginTimedOut,
    Network,
    SessionExpired,
    ExchangeFailed,
    BrowserOpenFailed,
    /// Logged out, but the stored session could neither be removed nor
    /// overwritten: it may come back at the next launch.
    LogoutIncomplete,
    /// A cancelled / finished login attempt could neither be removed from the
    /// credential store nor overwritten: it may come back after a restart.
    CancelIncomplete,
}

/// Written over the stored session when it cannot be deleted. It does not
/// parse as a `StoredSession`, so `restore()` ignores it and removes it.
const TOMBSTONE: &str = "{\"loggedOut\":true}";

/// Everything the renderer may know. No token, code, verifier, user id or URL.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatus {
    pub state: State,
    pub provider: Option<Provider>,
    pub display_name: Option<String>,
    pub offline: bool,
    pub persistence: Persistence,
    pub error_code: Option<ErrorCode>,
}

struct Inner {
    session: Option<StoredSession>,
    /// The access token and the Unix second it expires at. Memory only.
    access: Option<(String, u64)>,
    pending: Option<PendingAttempt>,
    timer_gen: u64,
    persistence_unavailable: bool,
    /// Nonces of attempts that were cancelled, consumed or replaced in this
    /// run: never loaded from the store again, even if deleting them failed.
    dead_nonces: HashSet<String>,
    /// Nonce that the expiry timer was already scheduled for.
    timer_nonce: Option<String>,
}

pub struct AuthManager<S: SecretStore, C: AuthApi> {
    config: Option<AuthConfig>,
    store: S,
    api: C,
    inner: tokio::sync::Mutex<Inner>,
    view: std::sync::Mutex<AuthStatus>,
    emit: Box<dyn Fn(&AuthStatus) + Send + Sync>,
    open: Box<dyn Fn(&str) -> bool + Send + Sync>,
    clock: Box<dyn Fn() -> u64 + Send + Sync>,
}

fn unix_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

impl<S: SecretStore, C: AuthApi> AuthManager<S, C> {
    /// `emit` is called after each change of the status, once the change is
    /// stored. `open` opens a URL in the system browser (false on failure).
    pub fn new(
        config: Option<AuthConfig>,
        store: S,
        api: C,
        emit: impl Fn(&AuthStatus) + Send + Sync + 'static,
        open: impl Fn(&str) -> bool + Send + Sync + 'static,
    ) -> Self {
        let state = if config.is_some() {
            State::Restoring
        } else {
            State::Unconfigured
        };
        AuthManager {
            config,
            store,
            api,
            inner: tokio::sync::Mutex::new(Inner {
                session: None,
                access: None,
                pending: None,
                timer_gen: 0,
                persistence_unavailable: false,
                dead_nonces: HashSet::new(),
                timer_nonce: None,
            }),
            view: std::sync::Mutex::new(AuthStatus {
                state,
                provider: None,
                display_name: None,
                offline: false,
                persistence: Persistence::Keyring,
                error_code: None,
            }),
            emit: Box::new(emit),
            open: Box::new(open),
            clock: Box::new(unix_now),
        }
    }

    #[cfg(test)]
    pub fn with_clock(mut self, clock: impl Fn() -> u64 + Send + Sync + 'static) -> Self {
        self.clock = Box::new(clock);
        self
    }

    pub fn status(&self) -> AuthStatus {
        self.view.lock().unwrap().clone()
    }

    fn now(&self) -> u64 {
        (self.clock)()
    }

    // ----- publishing -----

    fn publish(&self, inner: &Inner, state: State, offline: bool, error_code: Option<ErrorCode>) {
        let (provider, display_name) = match (&inner.session, &inner.pending) {
            (Some(s), _) => (Some(s.provider), s.display_name.clone()),
            (None, Some(p)) if state == State::Pending => (Some(p.provider), None),
            _ => (None, None),
        };
        let status = AuthStatus {
            state,
            provider,
            display_name,
            offline,
            persistence: if inner.persistence_unavailable {
                Persistence::Unavailable
            } else {
                Persistence::Keyring
            },
            error_code,
        };
        {
            let mut view = self.view.lock().unwrap();
            if *view == status {
                return;
            }
            *view = status.clone();
        }
        (self.emit)(&status);
    }

    // ----- storage (failures degrade to memory-only, never to plaintext) -----

    fn persist<T: Serialize>(&self, inner: &mut Inner, slot: Slot, value: &T) {
        let saved = serde_json::to_string(value)
            .map_err(|_| ())
            .and_then(|json| self.store.save(slot, &json).map_err(|_| ()));
        if saved.is_err() {
            inner.persistence_unavailable = true;
        }
    }

    /// Drops the pending attempt. Returns false when the stored copy could
    /// neither be deleted nor overwritten with a tombstone (it may come back
    /// after a restart); in this run it is never loaded again.
    fn forget_pending(&self, inner: &mut Inner) -> bool {
        if let Some(p) = inner.pending.take() {
            inner.dead_nonces.insert(p.nonce);
        }
        self.store.delete(Slot::Pending).is_ok()
            || self.store.save(Slot::Pending, TOMBSTONE).is_ok()
    }

    /// Loads a stored attempt (if none is in memory) and makes sure its expiry
    /// timer runs, whichever path got here first.
    fn load_pending(self: &Arc<Self>, inner: &mut Inner) {
        match self.store.load(Slot::Pending) {
            Ok(Some(json)) => match serde_json::from_str::<PendingAttempt>(&json) {
                Ok(p) if inner.dead_nonces.contains(&p.nonce) => {
                    let _ = self.store.delete(Slot::Pending);
                }
                Ok(p) if self.now() <= p.created_at.saturating_add(PENDING_TTL_SECS) => {
                    self.schedule_pending_timeout(inner, &p);
                    inner.pending = Some(p);
                }
                _ => {
                    let _ = self.store.delete(Slot::Pending);
                }
            },
            Ok(None) => {}
            Err(_) => inner.persistence_unavailable = true,
        }
    }

    // ----- restore / refresh -----

    /// Called once at startup, in the background.
    pub async fn restore(self: &Arc<Self>) {
        if self.config.is_none() {
            return;
        }
        let mut inner = self.inner.lock().await;
        if inner.session.is_some() {
            return; // a callback completed a login first
        }
        if inner.pending.is_none() {
            self.load_pending(&mut inner);
        }
        match self.store.load(Slot::Session) {
            Ok(Some(json)) => {
                if let Ok(session) = serde_json::from_str::<StoredSession>(&json) {
                    inner.session = Some(session);
                    self.refresh_locked(&mut inner).await;
                    return;
                }
                let _ = self.store.delete(Slot::Session);
            }
            Ok(None) => {}
            Err(_) => inner.persistence_unavailable = true,
        }
        let state = if inner.pending.is_some() {
            State::Pending
        } else {
            State::SignedOut
        };
        self.publish(&inner, state, false, None);
    }

    async fn refresh_if_current(self: &Arc<Self>, generation: u64) {
        let mut inner = self.inner.lock().await;
        if inner.timer_gen == generation {
            self.refresh_locked(&mut inner).await;
        }
    }

    async fn refresh_locked(self: &Arc<Self>, inner: &mut Inner) {
        let Some(session) = inner.session.clone() else {
            return;
        };
        match self.api.refresh(&session.refresh_token).await {
            Ok(tokens) => self.adopt(inner, tokens, session.provider),
            Err(ApiError::Network) => {
                // The refresh token may still be good: keep it, try again later.
                self.publish(inner, State::SignedIn, true, None);
                self.schedule_refresh(inner, RETRY_SECS);
            }
            Err(ApiError::Rejected) => {
                inner.session = None;
                inner.access = None;
                inner.timer_gen += 1;
                let _ = self.store.delete(Slot::Session);
                self.publish(
                    inner,
                    State::Expired,
                    false,
                    Some(ErrorCode::SessionExpired),
                );
            }
        }
    }

    /// Takes the tokens of a successful exchange or refresh: the rotated
    /// refresh token is stored first, then the change is published.
    fn adopt(self: &Arc<Self>, inner: &mut Inner, tokens: Tokens, fallback_provider: Provider) {
        let previous_name = inner.session.as_ref().and_then(|s| s.display_name.clone());
        let session = StoredSession {
            refresh_token: tokens.refresh_token,
            user_id: tokens.user_id,
            provider: tokens.provider.unwrap_or(fallback_provider),
            display_name: tokens.display_name.or(previous_name),
        };
        self.persist(inner, Slot::Session, &session);
        inner.session = Some(session);
        inner.access = Some((
            tokens.access_token,
            self.now().saturating_add(tokens.expires_in),
        ));
        self.publish(inner, State::SignedIn, false, None);
        let delay = tokens
            .expires_in
            .saturating_sub(REFRESH_MARGIN_SECS)
            .max(MIN_REFRESH_DELAY_SECS);
        self.schedule_refresh(inner, delay);
    }

    fn schedule_refresh(self: &Arc<Self>, inner: &mut Inner, delay_secs: u64) {
        inner.timer_gen += 1;
        let generation = inner.timer_gen;
        let this = Arc::clone(self);
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_secs(delay_secs)).await;
            this.refresh_if_current(generation).await;
        });
    }

    fn schedule_pending_timeout(self: &Arc<Self>, inner: &mut Inner, pending: &PendingAttempt) {
        if inner.timer_nonce.as_deref() == Some(pending.nonce.as_str()) {
            return;
        }
        inner.timer_nonce = Some(pending.nonce.clone());
        let remaining = pending
            .created_at
            .saturating_add(PENDING_TTL_SECS)
            .saturating_sub(self.now());
        let nonce = pending.nonce.clone();
        let this = Arc::clone(self);
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_secs(remaining + 1)).await;
            this.expire_pending(&nonce).await;
        });
    }

    async fn expire_pending(self: &Arc<Self>, nonce: &str) {
        let mut inner = self.inner.lock().await;
        if inner.pending.as_ref().map(|p| p.nonce == nonce) == Some(true) {
            self.forget_pending(&mut inner);
            self.publish(&inner, State::Error, false, Some(ErrorCode::LoginTimedOut));
        }
    }

    // ----- commands -----

    pub async fn start_login(
        self: &Arc<Self>,
        provider: Provider,
    ) -> Result<AuthStatus, AuthError> {
        let config = self.config.as_ref().ok_or(AuthError::Unconfigured)?;
        let mut inner = self.inner.lock().await;
        if inner.session.is_some() {
            return Err(AuthError::AlreadySignedIn);
        }
        let verifier = pkce::new_verifier();
        let attempt = PendingAttempt {
            nonce: pkce::new_nonce(),
            provider,
            created_at: self.now(),
            verifier,
        };
        let url = callback::authorize_url(
            config,
            provider,
            &pkce::challenge(&attempt.verifier),
            &attempt.nonce,
        );
        // A new attempt replaces (invalidates) the old nonce.
        if let Some(old) = inner.pending.take() {
            inner.dead_nonces.insert(old.nonce);
        }
        inner.pending = Some(attempt.clone());
        self.persist(&mut inner, Slot::Pending, &attempt);
        self.schedule_pending_timeout(&mut inner, &attempt);
        if !(self.open)(&url) {
            self.forget_pending(&mut inner);
            self.publish(
                &inner,
                State::Error,
                false,
                Some(ErrorCode::BrowserOpenFailed),
            );
            return Err(AuthError::BrowserOpenFailed);
        }
        self.publish(&inner, State::Pending, false, None);
        Ok(self.status())
    }

    pub async fn cancel_login(self: &Arc<Self>) -> AuthStatus {
        let mut inner = self.inner.lock().await;
        if inner.pending.is_some() {
            let cleared = self.forget_pending(&mut inner);
            if inner.session.is_none() {
                let code = (!cleared).then_some(ErrorCode::CancelIncomplete);
                self.publish(&inner, State::SignedOut, false, code);
            }
        }
        self.status()
    }

    /// Local state goes first, so that logging out works offline; the server
    /// side is best effort and its failure is not an error.
    pub async fn logout(self: &Arc<Self>) -> AuthStatus {
        let remote_token = {
            let mut inner = self.inner.lock().await;
            let now = self.now();
            let token = inner
                .access
                .take()
                .filter(|(_, expires_at)| *expires_at > now)
                .map(|(t, _)| t);
            inner.session = None;
            inner.timer_gen += 1;
            let pending_cleared = self.forget_pending(&mut inner);
            let session_cleared = self.store.delete(Slot::Session).is_ok()
                || self.store.save(Slot::Session, TOMBSTONE).is_ok();
            let mut error_code = None;
            if !pending_cleared || !session_cleared {
                // The refresh token may stay in the credential store. The
                // server-side revocation below is then the only protection.
                error_code = Some(ErrorCode::LogoutIncomplete);
            }
            self.publish(&inner, State::SignedOut, false, error_code);
            token
        };
        if let Some(token) = remote_token {
            let _ = self.api.logout(&token).await;
        }
        self.status()
    }

    /// A URL that arrived through the custom scheme. Anything that is not a
    /// callback for the pending attempt is ignored silently (stale, duplicate
    /// or forged URLs); the pending attempt is consumed exactly once.
    pub async fn handle_callback(self: &Arc<Self>, raw: &str) {
        let Some(callback) = callback::parse(raw) else {
            return;
        };
        let mut inner = self.inner.lock().await;
        if inner.pending.is_none() {
            self.load_pending(&mut inner);
        }
        let Some(pending) = inner.pending.clone() else {
            return;
        };
        if !callback::nonce_matches(&pending.nonce, &callback.attempt) {
            return;
        }
        self.forget_pending(&mut inner);
        if self.now() > pending.created_at.saturating_add(PENDING_TTL_SECS) {
            self.publish(&inner, State::Error, false, Some(ErrorCode::LoginTimedOut));
            return;
        }
        match callback.outcome {
            Outcome::Denied(reason) => {
                let code = match reason {
                    DeniedReason::AccessDenied => ErrorCode::ProviderDenied,
                    DeniedReason::Other => ErrorCode::ProviderError,
                };
                self.publish(&inner, State::Error, false, Some(code));
            }
            Outcome::Code(code) => match self.api.exchange_code(&code, &pending.verifier).await {
                Ok(tokens) => self.adopt(&mut inner, tokens, pending.provider),
                Err(ApiError::Network) => {
                    self.publish(&inner, State::Error, false, Some(ErrorCode::Network))
                }
                Err(ApiError::Rejected) => {
                    self.publish(&inner, State::Error, false, Some(ErrorCode::ExchangeFailed))
                }
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::store::MemoryStore;
    use std::collections::VecDeque;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::Mutex;

    #[derive(Default)]
    struct FakeApi {
        exchanges: Mutex<VecDeque<Result<Tokens, ApiError>>>,
        refreshes: Mutex<VecDeque<Result<Tokens, ApiError>>>,
        logouts: Mutex<Vec<String>>,
        logout_result: Mutex<Option<ApiError>>,
    }

    impl AuthApi for Arc<FakeApi> {
        async fn exchange_code(&self, _code: &str, _verifier: &str) -> Result<Tokens, ApiError> {
            self.exchanges
                .lock()
                .unwrap()
                .pop_front()
                .unwrap_or(Err(ApiError::Rejected))
        }
        async fn refresh(&self, _refresh_token: &str) -> Result<Tokens, ApiError> {
            self.refreshes
                .lock()
                .unwrap()
                .pop_front()
                .unwrap_or(Err(ApiError::Network))
        }
        async fn logout(&self, access_token: &str) -> Result<(), ApiError> {
            self.logouts.lock().unwrap().push(access_token.to_string());
            match *self.logout_result.lock().unwrap() {
                Some(e) => Err(e),
                None => Ok(()),
            }
        }
    }

    fn tokens(access: &str, refresh: &str) -> Tokens {
        Tokens {
            access_token: access.into(),
            refresh_token: refresh.into(),
            expires_in: 3600,
            user_id: "user-1".into(),
            provider: Some(Provider::Github),
            display_name: Some("Octo".into()),
        }
    }

    struct Fixture {
        manager: Arc<AuthManager<Arc<MemoryStore>, Arc<FakeApi>>>,
        store: Arc<MemoryStore>,
        api: Arc<FakeApi>,
        opened: Arc<Mutex<Vec<String>>>,
        events: Arc<Mutex<Vec<AuthStatus>>>,
        clock: Arc<AtomicU64>,
    }

    impl SecretStore for Arc<MemoryStore> {
        fn load(&self, slot: Slot) -> Result<Option<String>, crate::auth::store::StoreError> {
            (**self).load(slot)
        }
        fn save(&self, slot: Slot, value: &str) -> Result<(), crate::auth::store::StoreError> {
            (**self).save(slot, value)
        }
        fn delete(&self, slot: Slot) -> Result<(), crate::auth::store::StoreError> {
            (**self).delete(slot)
        }
    }

    fn fixture_with(store: MemoryStore, configured: bool) -> Fixture {
        let store = Arc::new(store);
        let api = Arc::new(FakeApi::default());
        let opened = Arc::new(Mutex::new(Vec::new()));
        let events = Arc::new(Mutex::new(Vec::new()));
        let clock = Arc::new(AtomicU64::new(1_000_000));
        let (o, e, c) = (opened.clone(), events.clone(), clock.clone());
        let config = configured.then(|| AuthConfig::resolve(None, Some("pub-key"), true).unwrap());
        let manager = AuthManager::new(
            config,
            store.clone(),
            api.clone(),
            move |s| e.lock().unwrap().push(s.clone()),
            move |url| {
                o.lock().unwrap().push(url.to_string());
                true
            },
        )
        .with_clock(move || c.load(Ordering::SeqCst));
        Fixture {
            manager: Arc::new(manager),
            store,
            api,
            opened,
            events,
            clock,
        }
    }

    fn fixture() -> Fixture {
        fixture_with(MemoryStore::default(), true)
    }

    /// The `attempt` nonce inside the `redirect_to` of the opened authorize URL.
    fn opened_nonce(f: &Fixture) -> String {
        let url = url::Url::parse(f.opened.lock().unwrap().last().unwrap()).unwrap();
        let redirect = url
            .query_pairs()
            .find(|(k, _)| k == "redirect_to")
            .unwrap()
            .1
            .into_owned();
        url::Url::parse(&redirect)
            .unwrap()
            .query_pairs()
            .find(|(k, _)| k == "attempt")
            .unwrap()
            .1
            .into_owned()
    }

    fn callback_url(nonce: &str) -> String {
        format!("terminalquest://auth/callback?attempt={nonce}&code=one-time-code")
    }

    async fn signed_in(f: &Fixture) {
        f.api
            .exchanges
            .lock()
            .unwrap()
            .push_back(Ok(tokens("ACCESS-1", "REFRESH-1")));
        f.manager.start_login(Provider::Github).await.unwrap();
        f.manager
            .handle_callback(&callback_url(&opened_nonce(f)))
            .await;
        assert_eq!(f.manager.status().state, State::SignedIn);
    }

    #[tokio::test]
    async fn unconfigured_builds_cannot_log_in() {
        let f = fixture_with(MemoryStore::default(), false);
        assert_eq!(f.manager.status().state, State::Unconfigured);
        f.manager.restore().await;
        assert_eq!(f.manager.status().state, State::Unconfigured);
        assert_eq!(
            f.manager.start_login(Provider::Google).await.unwrap_err(),
            AuthError::Unconfigured
        );
    }

    #[tokio::test]
    async fn restore_without_a_session_is_signed_out() {
        let f = fixture();
        assert_eq!(f.manager.status().state, State::Restoring);
        f.manager.restore().await;
        assert_eq!(f.manager.status().state, State::SignedOut);
    }

    #[tokio::test]
    async fn a_full_login_stores_the_session_and_consumes_the_attempt() {
        let f = fixture();
        f.manager.restore().await;
        let status = f.manager.start_login(Provider::Github).await.unwrap();
        assert_eq!(status.state, State::Pending);
        assert!(f.store.contains(Slot::Pending));
        f.api
            .exchanges
            .lock()
            .unwrap()
            .push_back(Ok(tokens("ACCESS-1", "REFRESH-1")));
        let url = callback_url(&opened_nonce(&f));
        f.manager.handle_callback(&url).await;
        let status = f.manager.status();
        assert_eq!(status.state, State::SignedIn);
        assert_eq!(status.provider, Some(Provider::Github));
        assert_eq!(status.display_name.as_deref(), Some("Octo"));
        assert!(f.store.contains(Slot::Session));
        assert!(!f.store.contains(Slot::Pending));
        // A duplicate of the same callback does nothing (no second exchange).
        f.api
            .exchanges
            .lock()
            .unwrap()
            .push_back(Ok(tokens("ACCESS-2", "REFRESH-2")));
        f.manager.handle_callback(&url).await;
        assert_eq!(f.api.exchanges.lock().unwrap().len(), 1);
        assert_eq!(f.manager.status().state, State::SignedIn);
    }

    #[tokio::test]
    async fn forged_or_mismatched_callbacks_leave_the_attempt_pending() {
        let f = fixture();
        f.manager.start_login(Provider::Google).await.unwrap();
        for url in [
            "terminalquest://auth/callback?attempt=WRONG&code=x".to_string(),
            "terminalquest://evil/callback?attempt=x&code=x".to_string(),
            "https://example.com/?code=x".to_string(),
            "garbage".to_string(),
        ] {
            f.manager.handle_callback(&url).await;
            assert_eq!(f.manager.status().state, State::Pending, "{url}");
        }
        assert!(f.api.exchanges.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_new_attempt_invalidates_the_old_nonce() {
        let f = fixture();
        f.manager.start_login(Provider::Github).await.unwrap();
        let old = opened_nonce(&f);
        f.manager.start_login(Provider::Google).await.unwrap();
        f.api
            .exchanges
            .lock()
            .unwrap()
            .push_back(Ok(tokens("A", "R")));
        f.manager.handle_callback(&callback_url(&old)).await;
        assert_eq!(f.manager.status().state, State::Pending);
        assert_eq!(f.api.exchanges.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn an_expired_attempt_reports_a_timeout() {
        let f = fixture();
        f.manager.start_login(Provider::Github).await.unwrap();
        f.clock.fetch_add(PENDING_TTL_SECS + 1, Ordering::SeqCst);
        f.manager
            .handle_callback(&callback_url(&opened_nonce(&f)))
            .await;
        let status = f.manager.status();
        assert_eq!(status.state, State::Error);
        assert_eq!(status.error_code, Some(ErrorCode::LoginTimedOut));
        assert!(!f.store.contains(Slot::Pending));
        // retry works after the failure
        assert_eq!(
            f.manager.start_login(Provider::Github).await.unwrap().state,
            State::Pending
        );
    }

    #[tokio::test]
    async fn a_denied_authorization_and_a_cancel_both_allow_a_retry() {
        let f = fixture();
        f.manager.start_login(Provider::Github).await.unwrap();
        let nonce = opened_nonce(&f);
        f.manager
            .handle_callback(&format!(
                "terminalquest://auth/callback?attempt={nonce}&error=access_denied"
            ))
            .await;
        assert_eq!(
            f.manager.status().error_code,
            Some(ErrorCode::ProviderDenied)
        );

        f.manager.start_login(Provider::Google).await.unwrap();
        assert_eq!(f.manager.cancel_login().await.state, State::SignedOut);
        assert!(!f.store.contains(Slot::Pending));
        assert_eq!(
            f.manager.start_login(Provider::Google).await.unwrap().state,
            State::Pending
        );
    }

    #[tokio::test]
    async fn exchange_failures_are_reported_by_kind() {
        let f = fixture();
        f.manager.start_login(Provider::Github).await.unwrap();
        f.api
            .exchanges
            .lock()
            .unwrap()
            .push_back(Err(ApiError::Network));
        f.manager
            .handle_callback(&callback_url(&opened_nonce(&f)))
            .await;
        assert_eq!(f.manager.status().error_code, Some(ErrorCode::Network));
    }

    #[tokio::test]
    async fn a_pending_attempt_survives_a_restart_and_completes() {
        let f = fixture();
        f.manager.start_login(Provider::Github).await.unwrap();
        let nonce = opened_nonce(&f);
        // "restart": a new manager on the same store
        let f2 = Fixture {
            manager: {
                let api = f.api.clone();
                Arc::new(
                    AuthManager::new(
                        Some(AuthConfig::resolve(None, Some("k"), true).unwrap()),
                        f.store.clone(),
                        api,
                        |_| {},
                        |_| true,
                    )
                    .with_clock({
                        let c = f.clock.clone();
                        move || c.load(Ordering::SeqCst)
                    }),
                )
            },
            ..f
        };
        f2.api
            .exchanges
            .lock()
            .unwrap()
            .push_back(Ok(tokens("A", "R")));
        f2.manager.handle_callback(&callback_url(&nonce)).await; // cold-start callback before restore
        f2.manager.restore().await;
        assert_eq!(f2.manager.status().state, State::SignedIn);
    }

    #[tokio::test]
    async fn restore_refreshes_and_stores_the_rotated_token() {
        let f = fixture();
        signed_in(&f).await;
        f.api
            .refreshes
            .lock()
            .unwrap()
            .push_back(Ok(tokens("ACCESS-2", "REFRESH-2")));
        let restarted = Arc::new(AuthManager::new(
            Some(AuthConfig::resolve(None, Some("k"), true).unwrap()),
            f.store.clone(),
            f.api.clone(),
            |_| {},
            |_| true,
        ));
        restarted.restore().await;
        assert_eq!(restarted.status().state, State::SignedIn);
        let stored = f.store.load(Slot::Session).unwrap().unwrap();
        assert!(stored.contains("REFRESH-2") && !stored.contains("REFRESH-1"));
        assert!(!stored.contains("ACCESS"));
    }

    #[tokio::test]
    async fn an_offline_refresh_keeps_the_session() {
        let f = fixture();
        signed_in(&f).await;
        f.api
            .refreshes
            .lock()
            .unwrap()
            .push_back(Err(ApiError::Network));
        f.manager
            .refresh_locked(&mut *f.manager.inner.lock().await)
            .await;
        let status = f.manager.status();
        assert_eq!(status.state, State::SignedIn);
        assert!(status.offline);
        assert!(f.store.contains(Slot::Session));
        // back online
        f.api
            .refreshes
            .lock()
            .unwrap()
            .push_back(Ok(tokens("ACCESS-3", "REFRESH-3")));
        f.manager
            .refresh_locked(&mut *f.manager.inner.lock().await)
            .await;
        assert!(!f.manager.status().offline);
    }

    #[tokio::test]
    async fn a_rejected_refresh_expires_the_session_and_login_works_again() {
        let f = fixture();
        signed_in(&f).await;
        f.api
            .refreshes
            .lock()
            .unwrap()
            .push_back(Err(ApiError::Rejected));
        f.manager
            .refresh_locked(&mut *f.manager.inner.lock().await)
            .await;
        let status = f.manager.status();
        assert_eq!(status.state, State::Expired);
        assert_eq!(status.error_code, Some(ErrorCode::SessionExpired));
        assert!(!f.store.contains(Slot::Session));
        assert_eq!(
            f.manager.start_login(Provider::Github).await.unwrap().state,
            State::Pending
        );
    }

    #[tokio::test]
    async fn logout_removes_local_state_first_even_if_the_server_fails() {
        let f = fixture();
        signed_in(&f).await;
        *f.api.logout_result.lock().unwrap() = Some(ApiError::Network);
        let status = f.manager.logout().await;
        assert_eq!(status.state, State::SignedOut);
        assert!(!f.store.contains(Slot::Session));
        assert_eq!(f.api.logouts.lock().unwrap().as_slice(), ["ACCESS-1"]);
    }

    #[tokio::test]
    async fn a_failed_delete_is_overwritten_so_the_old_session_is_not_restored() {
        let f = fixture();
        signed_in(&f).await;
        f.store.set_failing_delete(true);
        let status = f.manager.logout().await;
        assert_eq!(status.state, State::SignedOut);
        assert_eq!(status.error_code, None);
        // next launch: no refresh is attempted, the user stays signed out
        f.api
            .refreshes
            .lock()
            .unwrap()
            .push_back(Ok(tokens("A", "R")));
        let restarted = Arc::new(AuthManager::new(
            Some(AuthConfig::resolve(None, Some("k"), true).unwrap()),
            f.store.clone(),
            f.api.clone(),
            |_| {},
            |_| true,
        ));
        restarted.restore().await;
        assert_eq!(restarted.status().state, State::SignedOut);
        assert_eq!(f.api.refreshes.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn logout_reports_when_the_stored_session_cannot_be_cleared() {
        let f = fixture();
        signed_in(&f).await;
        f.store.set_failing(true);
        let status = f.manager.logout().await;
        assert_eq!(status.state, State::SignedOut);
        assert_eq!(status.error_code, Some(ErrorCode::LogoutIncomplete));
        // the server session is still revoked on a best-effort basis
        assert_eq!(f.api.logouts.lock().unwrap().as_slice(), ["ACCESS-1"]);
    }

    #[tokio::test]
    async fn a_cancelled_attempt_whose_delete_failed_cannot_be_completed() {
        let f = fixture();
        f.manager.start_login(Provider::Github).await.unwrap();
        let nonce = opened_nonce(&f);
        f.store.set_failing_delete(true);
        // overwritten with a tombstone: no notice needed
        let status = f.manager.cancel_login().await;
        assert_eq!(status.state, State::SignedOut);
        assert_eq!(status.error_code, None);
        f.api
            .exchanges
            .lock()
            .unwrap()
            .push_back(Ok(tokens("A", "R")));
        f.manager.handle_callback(&callback_url(&nonce)).await;
        assert_eq!(f.manager.status().state, State::SignedOut);
        assert_eq!(f.api.exchanges.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn an_attempt_that_cannot_be_cleared_is_reported_and_stays_dead_in_this_run() {
        let f = fixture();
        f.manager.start_login(Provider::Github).await.unwrap();
        let nonce = opened_nonce(&f);
        f.store.set_failing(true);
        let status = f.manager.cancel_login().await;
        assert_eq!(status.error_code, Some(ErrorCode::CancelIncomplete));
        // the store works again and still holds the old attempt
        f.store.set_failing(false);
        assert!(f.store.contains(Slot::Pending));
        f.api
            .exchanges
            .lock()
            .unwrap()
            .push_back(Ok(tokens("A", "R")));
        f.manager.handle_callback(&callback_url(&nonce)).await;
        assert_eq!(f.manager.status().state, State::SignedOut);
        assert_eq!(f.api.exchanges.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn logout_cancels_a_pending_attempt_even_if_its_delete_fails() {
        let f = fixture();
        f.manager.start_login(Provider::Github).await.unwrap();
        let nonce = opened_nonce(&f);
        f.store.set_failing_delete(true);
        assert_eq!(f.manager.logout().await.state, State::SignedOut);
        f.api
            .exchanges
            .lock()
            .unwrap()
            .push_back(Ok(tokens("A", "R")));
        f.manager.handle_callback(&callback_url(&nonce)).await;
        assert_eq!(f.manager.status().state, State::SignedOut);
    }

    #[tokio::test]
    async fn a_stored_attempt_loaded_by_a_callback_gets_its_expiry_timer() {
        let f = fixture();
        f.manager.start_login(Provider::Github).await.unwrap();
        let nonce = opened_nonce(&f);
        // "restart": the callback arrives before restore() ran
        let restarted = Arc::new(
            AuthManager::new(
                Some(AuthConfig::resolve(None, Some("k"), true).unwrap()),
                f.store.clone(),
                f.api.clone(),
                |_| {},
                |_| true,
            )
            .with_clock({
                let c = f.clock.clone();
                move || c.load(Ordering::SeqCst)
            }),
        );
        restarted
            .handle_callback(&format!(
                "terminalquest://auth/callback?attempt={nonce}&error=access_denied"
            ))
            .await;
        // consumed; but a loaded-and-kept attempt records its timer nonce
        let g = restarted.inner.lock().await;
        assert_eq!(g.timer_nonce.as_deref(), Some(nonce.as_str()));
    }

    #[tokio::test]
    async fn logout_skips_the_server_when_the_access_token_expired() {
        let f = fixture();
        signed_in(&f).await;
        f.clock.fetch_add(7200, Ordering::SeqCst);
        assert_eq!(f.manager.logout().await.state, State::SignedOut);
        assert!(f.api.logouts.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn without_a_keyring_the_session_stays_in_memory_and_is_flagged() {
        let f = fixture_with(MemoryStore::unavailable(), true);
        f.manager.restore().await;
        assert_eq!(f.manager.status().persistence, Persistence::Unavailable);
        signed_in(&f).await;
        let status = f.manager.status();
        assert_eq!(status.persistence, Persistence::Unavailable);
        assert!(!f.store.contains(Slot::Session));
    }

    #[tokio::test]
    async fn login_is_refused_while_signed_in() {
        let f = fixture();
        signed_in(&f).await;
        assert_eq!(
            f.manager.start_login(Provider::Google).await.unwrap_err(),
            AuthError::AlreadySignedIn
        );
    }

    #[tokio::test]
    async fn a_browser_that_cannot_open_is_an_error_state() {
        let store = Arc::new(MemoryStore::default());
        let manager = Arc::new(AuthManager::new(
            Some(AuthConfig::resolve(None, Some("k"), true).unwrap()),
            store.clone(),
            Arc::new(FakeApi::default()),
            |_| {},
            |_| false,
        ));
        assert_eq!(
            manager.start_login(Provider::Github).await.unwrap_err(),
            AuthError::BrowserOpenFailed
        );
        assert_eq!(
            manager.status().error_code,
            Some(ErrorCode::BrowserOpenFailed)
        );
        assert!(!store.contains(Slot::Pending));
    }

    #[tokio::test]
    async fn status_payloads_and_errors_never_contain_secrets() {
        let f = fixture();
        signed_in(&f).await;
        let mut all: Vec<AuthStatus> = f.events.lock().unwrap().clone();
        all.push(f.manager.status());
        for status in all {
            let json = serde_json::to_value(&status).unwrap();
            let mut keys: Vec<&str> = json
                .as_object()
                .unwrap()
                .keys()
                .map(String::as_str)
                .collect();
            keys.sort();
            assert_eq!(
                keys,
                [
                    "displayName",
                    "errorCode",
                    "offline",
                    "persistence",
                    "provider",
                    "state"
                ]
            );
            let text = json.to_string();
            for secret in ["ACCESS", "REFRESH", "one-time-code", "user-1", "verifier"] {
                assert!(!text.contains(secret), "{text}");
            }
        }
        for error in [
            AuthError::Unconfigured,
            AuthError::AlreadySignedIn,
            AuthError::BrowserOpenFailed,
        ] {
            let text = format!(
                "{error} {error:?} {}",
                serde_json::to_string(&error).unwrap()
            );
            assert!(!text.contains("http") && !text.contains("token"));
        }
    }
}
