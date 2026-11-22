//! Team / operation membership against the real local Supabase stack
//! (`npm run supabase:start`).
//!
//! Ignored by default. Needs the same variables as cloud_save_local_supabase.rs:
//!
//!   TERMINALQUEST_TEST_SUPABASE_URL
//!   TERMINALQUEST_TEST_SUPABASE_PUBLISHABLE_KEY
//!   TERMINALQUEST_TEST_SUPABASE_SERVICE_ROLE_KEY
//!
//!   cargo test --test groups_local_supabase -- --ignored
//!
//! Two throwaway users and one throwaway team and operation (created with the
//! service role, with random join codes) are used; the real `Groups` service
//! runs on top of the real `AuthManager`. Checked: join (the code is trimmed and
//! case-insensitive), an invalid code, the wrong kind, a duplicate join, two
//! concurrent joins (exactly one wins), the list, a second user's isolation
//! (cannot leave another user's membership), leave and re-join, and another
//! account named in the call.

use std::sync::Arc;

use serde_json::{json, Value};
use terminalquest_lib::auth::client::HttpClient;
use terminalquest_lib::auth::config::AuthConfig;
use terminalquest_lib::auth::session::{account_fingerprint, AuthManager, State};
use terminalquest_lib::auth::store::{MemoryStore, SecretStore, Slot, StoreError, StoredSession};
use terminalquest_lib::auth::Provider;
use terminalquest_lib::groups::remote::HttpRemote;
use terminalquest_lib::groups::{GroupError, Groups};

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

type Auth = Arc<AuthManager<Shared, HttpClient>>;

fn env(name: &str) -> String {
    std::env::var(name)
        .unwrap_or_else(|_| panic!("{name} is not set (see the header of this file)"))
}

fn suffix() -> String {
    format!(
        "{:x}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    )
}

struct User {
    id: String,
    email: String,
    password: String,
}

async fn create_user(http: &reqwest::Client, config: &AuthConfig, secret: &str) -> User {
    let email = format!("groups-{}@terminalquest.invalid", suffix());
    let password = format!("pw-{}-Aa1", suffix());
    let created: Value = http
        .post(format!("{}/auth/v1/admin/users", config.url))
        .header("apikey", secret)
        .bearer_auth(secret)
        .json(&json!({ "email": email, "password": password, "email_confirm": true }))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .expect("the admin API created the user")
        .json()
        .await
        .unwrap();
    User {
        id: created["id"].as_str().unwrap().to_string(),
        email,
        password,
    }
}

/// A new device: a password sign-in, handed to a session manager.
async fn device(
    http: &reqwest::Client,
    config: &AuthConfig,
    user: &User,
) -> (Auth, String /* access token, for direct REST checks */) {
    let session: Value = http
        .post(format!("{}/auth/v1/token?grant_type=password", config.url))
        .header("apikey", &config.publishable_key)
        .json(&json!({ "email": user.email, "password": user.password }))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .expect("password sign-in")
        .json()
        .await
        .unwrap();
    let store = Arc::new(MemoryStore::default());
    store
        .save(
            Slot::Session,
            &serde_json::to_string(&StoredSession {
                refresh_token: session["refresh_token"].as_str().unwrap().to_string(),
                user_id: user.id.clone(),
                provider: Provider::Github,
                display_name: None,
            })
            .unwrap(),
        )
        .unwrap();
    let auth: Auth = Arc::new(AuthManager::new(
        Some(config.clone()),
        Shared(store),
        HttpClient::new(Some(config.clone())),
        |_| {},
        |_| true,
    ));
    auth.restore().await;
    assert_eq!(auth.status().state, State::SignedIn);
    let token = session["access_token"].as_str().unwrap().to_string();
    (auth, token)
}

async fn create_group(
    http: &reqwest::Client,
    config: &AuthConfig,
    secret: &str,
    kind: &str,
    code: &str,
) -> String {
    let created: Value = http
        .post(format!("{}/rest/v1/groups", config.url))
        .header("apikey", secret)
        .bearer_auth(secret)
        .header("Prefer", "return=representation")
        .json(&json!({ "kind": kind, "display_name": format!("Test {code}"), "join_code": code }))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .expect("the group was created")
        .json()
        .await
        .unwrap();
    created[0]["id"].as_str().unwrap().to_string()
}

#[tokio::test]
#[ignore = "needs the local Supabase stack and its keys in the environment"]
async fn groups_against_local_supabase() {
    let url = env("TERMINALQUEST_TEST_SUPABASE_URL");
    let publishable = env("TERMINALQUEST_TEST_SUPABASE_PUBLISHABLE_KEY");
    let secret = env("TERMINALQUEST_TEST_SUPABASE_SERVICE_ROLE_KEY");
    let config =
        AuthConfig::resolve(Some(&url), Some(&publishable), true).expect("a valid local URL");
    let http = reqwest::Client::new();

    let alice = create_user(&http, &config, &secret).await;
    let bob = create_user(&http, &config, &secret).await;
    let team_code = format!("GT{}", suffix().to_uppercase());
    let operation_code = format!("GO{}", suffix().to_uppercase());
    let team_id = create_group(&http, &config, &secret, "team", &team_code).await;
    let operation_id = create_group(&http, &config, &secret, "operation", &operation_code).await;

    let scenario = tokio::spawn({
        let (http, config, team_code, operation_code, team_id) = (
            http.clone(),
            config.clone(),
            team_code.clone(),
            operation_code.clone(),
            team_id.clone(),
        );
        let alice = User {
            id: alice.id.clone(),
            email: alice.email.clone(),
            password: alice.password.clone(),
        };
        let bob = User {
            id: bob.id.clone(),
            email: bob.email.clone(),
            password: bob.password.clone(),
        };
        async move {
            run_scenario(
                &http,
                &config,
                &alice,
                &bob,
                &team_code,
                &operation_code,
                &team_id,
            )
            .await
        }
    });
    let result = scenario.await;

    // Always remove what was created (memberships go with them: ON DELETE CASCADE).
    for id in [&team_id, &operation_id] {
        let deleted = http
            .delete(format!("{}/rest/v1/groups?id=eq.{id}", config.url))
            .header("apikey", &secret)
            .bearer_auth(&secret)
            .send()
            .await
            .unwrap();
        assert!(
            deleted.status().is_success(),
            "a throwaway group was not deleted"
        );
    }
    for user in [&alice, &bob] {
        let deleted = http
            .delete(format!("{}/auth/v1/admin/users/{}", config.url, user.id))
            .header("apikey", &secret)
            .bearer_auth(&secret)
            .send()
            .await
            .unwrap();
        assert!(
            deleted.status().is_success(),
            "a throwaway user was not deleted"
        );
    }
    result.expect("the scenario passed");
}

async fn run_scenario(
    http: &reqwest::Client,
    config: &AuthConfig,
    alice: &User,
    bob: &User,
    team_code: &str,
    operation_code: &str,
    team_id: &str,
) {
    let alice_account = account_fingerprint(&alice.id);
    let bob_account = account_fingerprint(&bob.id);
    let service =
        |auth: &Auth| Groups::new(Arc::clone(auth), HttpRemote::new(Some(config.clone())));
    let (alice_dev, _) = device(http, config, alice).await;
    let (bob_dev, _) = device(http, config, bob).await;
    let alice_svc = service(&alice_dev);
    let bob_svc = service(&bob_dev);

    // Join: the code is trimmed and case-insensitive; the answer is the server's.
    let lower = format!("  {}  ", team_code.to_lowercase());
    let joined = alice_svc
        .join(&alice_account, "team", &lower)
        .await
        .unwrap();
    assert_eq!(joined.group_id, team_id);
    assert_eq!(joined.join_code, team_code);
    assert_eq!(joined.account, alice_account);
    // An invalid code and the wrong kind look the same.
    assert_eq!(
        alice_svc
            .join(&alice_account, "team", "NOSUCH123")
            .await
            .unwrap_err(),
        GroupError::InvalidJoinCode
    );
    assert_eq!(
        alice_svc
            .join(&alice_account, "operation", team_code)
            .await
            .unwrap_err(),
        GroupError::InvalidJoinCode
    );
    // A duplicate join is refused; the membership stays single.
    assert_eq!(
        alice_svc
            .join(&alice_account, "team", team_code)
            .await
            .unwrap_err(),
        GroupError::AlreadyMember
    );

    // Two concurrent joins by the same user: exactly one wins.
    let (first, second) = tokio::join!(
        bob_svc.join(&bob_account, "operation", operation_code),
        bob_svc.join(&bob_account, "operation", operation_code)
    );
    let outcomes = [first.map(|_| ()), second.map(|_| ())];
    assert_eq!(outcomes.iter().filter(|r| r.is_ok()).count(), 1);
    assert!(outcomes
        .iter()
        .any(|r| *r == Err(GroupError::AlreadyMember)));

    // The list shows the caller's own memberships only.
    let listed = alice_svc.list(&alice_account, "team").await.unwrap();
    assert_eq!(listed.groups.len(), 1);
    assert_eq!(listed.groups[0].group_id, team_id);
    assert!(alice_svc
        .list(&alice_account, "operation")
        .await
        .unwrap()
        .groups
        .is_empty());
    assert!(bob_svc
        .list(&bob_account, "team")
        .await
        .unwrap()
        .groups
        .is_empty());

    // Another user cannot leave Alice's membership.
    assert_eq!(
        bob_svc.leave(&bob_account, team_id).await.unwrap_err(),
        GroupError::NotMember
    );
    assert_eq!(
        alice_svc
            .list(&alice_account, "team")
            .await
            .unwrap()
            .groups
            .len(),
        1
    );

    // Another account is named: refused before any request.
    assert_eq!(
        bob_svc.leave(&alice_account, team_id).await.unwrap_err(),
        terminalquest_lib::groups::GroupError::AccountChanged
    );

    // Leave, a second leave, and a re-join (a new membership).
    alice_svc.leave(&alice_account, team_id).await.unwrap();
    assert_eq!(
        alice_svc.leave(&alice_account, team_id).await.unwrap_err(),
        GroupError::NotMember
    );
    assert!(alice_svc
        .list(&alice_account, "team")
        .await
        .unwrap()
        .groups
        .is_empty());
    alice_svc
        .join(&alice_account, "team", team_code)
        .await
        .unwrap();
    assert_eq!(
        alice_svc
            .list(&alice_account, "team")
            .await
            .unwrap()
            .groups
            .len(),
        1
    );
}
