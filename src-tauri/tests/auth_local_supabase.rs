//! Session handling against the real local Supabase Auth (`npm run supabase:start`).
//!
//! Ignored by default. Runs only when these variables are set (values from
//! `npx supabase status -o env`; the secret key stays in this test process):
//!
//!   TERMINALQUEST_TEST_SUPABASE_URL              e.g. http://127.0.0.1:54321
//!   TERMINALQUEST_TEST_SUPABASE_PUBLISHABLE_KEY  the publishable (anon) key
//!   TERMINALQUEST_TEST_SUPABASE_SERVICE_ROLE_KEY the secret (service_role) key
//!
//!   cargo test --test auth_local_supabase -- --ignored
//!
//! A throwaway user is created through the admin API and signs in with a
//! password. THIS IS NOT AN OAUTH ROUND TRIP: the GitHub / Google redirect and
//! the PKCE code exchange are not exercised here (they need real provider
//! credentials; see docs/supabase/auth.md for the manual procedure). What is
//! covered is everything after the tokens exist: restore, refresh with
//! rotation, storing the rotated token, logout, and `expired` after rejection.

use std::sync::Arc;

use serde_json::{json, Value};
use terminalquest_lib::auth::client::HttpClient;
use terminalquest_lib::auth::config::AuthConfig;
use terminalquest_lib::auth::session::{AuthManager, State};
use terminalquest_lib::auth::store::{MemoryStore, SecretStore, Slot, StoreError, StoredSession};
use terminalquest_lib::auth::Provider;

struct Shared(Arc<MemoryStore>);

impl SecretStore for Shared {
    fn load(&self, slot: Slot) -> Result<Option<String>, StoreError> {
        self.0.load(slot)
    }
    fn save(&self, slot: Slot, value: &str) -> Result<(), StoreError> {
        self.0.save(slot, value)
    }
    fn delete(&self, slot: Slot) -> Result<(), StoreError> {
        self.0.delete(slot)
    }
}

fn env(name: &str) -> String {
    std::env::var(name)
        .unwrap_or_else(|_| panic!("{name} is not set (see the header of this file)"))
}

fn manager(config: &AuthConfig, store: &Arc<MemoryStore>) -> Arc<AuthManager<Shared, HttpClient>> {
    Arc::new(AuthManager::new(
        Some(config.clone()),
        Shared(store.clone()),
        HttpClient::new(Some(config.clone())),
        |_| {},
        |_| true,
    ))
}

fn stored_refresh_token(store: &MemoryStore) -> String {
    let json = store
        .load(Slot::Session)
        .unwrap()
        .expect("a session is stored");
    serde_json::from_str::<StoredSession>(&json)
        .unwrap()
        .refresh_token
}

#[tokio::test]
#[ignore = "needs the local Supabase stack and its keys in the environment"]
async fn refresh_rotation_logout_and_rejection_against_local_auth() {
    let url = env("TERMINALQUEST_TEST_SUPABASE_URL");
    let publishable = env("TERMINALQUEST_TEST_SUPABASE_PUBLISHABLE_KEY");
    let secret = env("TERMINALQUEST_TEST_SUPABASE_SERVICE_ROLE_KEY");
    let config =
        AuthConfig::resolve(Some(&url), Some(&publishable), true).expect("a valid local URL");
    let http = reqwest::Client::new();

    // 1. A throwaway user, created locally (never a real account).
    let email = format!("test-{}@terminalquest.invalid", rand_suffix());
    let password = format!("pw-{}-Aa1", rand_suffix());
    let created: Value = http
        .post(format!("{}/auth/v1/admin/users", config.url))
        .header("apikey", &secret)
        .bearer_auth(&secret)
        .json(&json!({ "email": email, "password": password, "email_confirm": true }))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .expect("the admin API created the user")
        .json()
        .await
        .unwrap();
    let user_id = created["id"].as_str().unwrap().to_string();

    // Run in a task so that a failed assertion still reaches the cleanup below.
    let scenario = tokio::spawn({
        let (http, config, user_id) = (http.clone(), config.clone(), user_id.clone());
        async move { run_scenario(&http, &config, &email, &password, &user_id).await }
    });
    let result = scenario.await;

    // 5. Always remove the user.
    let deleted = http
        .delete(format!("{}/auth/v1/admin/users/{user_id}", config.url))
        .header("apikey", &secret)
        .bearer_auth(&secret)
        .send()
        .await
        .unwrap();
    assert!(
        deleted.status().is_success(),
        "the throwaway user was not deleted"
    );
    result.expect("the scenario passed");
}

async fn run_scenario(
    http: &reqwest::Client,
    config: &AuthConfig,
    email: &str,
    password: &str,
    user_id: &str,
) {
    // 2. Password sign-in gives a session (this replaces the OAuth step).
    let session: Value = http
        .post(format!("{}/auth/v1/token?grant_type=password", config.url))
        .header("apikey", &config.publishable_key)
        .json(&json!({ "email": email, "password": password }))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .expect("password sign-in")
        .json()
        .await
        .unwrap();
    let first_refresh = session["refresh_token"].as_str().unwrap().to_string();

    // 3. Hand it to the session manager through an in-memory store.
    let store = Arc::new(MemoryStore::default());
    store
        .save(
            Slot::Session,
            &serde_json::to_string(&StoredSession {
                refresh_token: first_refresh.clone(),
                user_id: user_id.to_string(),
                provider: Provider::Github,
                display_name: None,
            })
            .unwrap(),
        )
        .unwrap();
    let auth = manager(config, &store);
    auth.restore().await;
    assert_eq!(
        auth.status().state,
        State::SignedIn,
        "restore refreshed the session"
    );
    assert!(!auth.status().offline);

    // 4a. The rotated refresh token replaced the old one in the store.
    let rotated = stored_refresh_token(&store);
    assert_ne!(
        rotated, first_refresh,
        "the refresh token was rotated and stored"
    );

    // 4b. Logout: local state is gone, the server session is revoked.
    assert_eq!(auth.logout().await.state, State::SignedOut);
    assert!(!store.contains(Slot::Session));

    // 4c. The server now rejects that refresh token -> `expired`.
    store
        .save(
            Slot::Session,
            &serde_json::to_string(&StoredSession {
                refresh_token: rotated,
                user_id: user_id.to_string(),
                provider: Provider::Github,
                display_name: None,
            })
            .unwrap(),
        )
        .unwrap();
    let restarted = manager(config, &store);
    restarted.restore().await;
    assert_eq!(restarted.status().state, State::Expired);
    assert!(!store.contains(Slot::Session));
}

fn rand_suffix() -> String {
    format!(
        "{:x}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    )
}
