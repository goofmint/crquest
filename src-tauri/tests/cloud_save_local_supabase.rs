//! Cloud save against the real local Supabase stack (`npm run supabase:start`).
//!
//! Ignored by default. Needs the same variables as auth_local_supabase.rs:
//!
//!   TERMINALQUEST_TEST_SUPABASE_URL
//!   TERMINALQUEST_TEST_SUPABASE_PUBLISHABLE_KEY
//!   TERMINALQUEST_TEST_SUPABASE_SERVICE_ROLE_KEY
//!
//!   cargo test --test cloud_save_local_supabase -- --ignored
//!
//! Throwaway users are created through the admin API and signed in with a
//! password (not an OAuth round trip; see docs/supabase/auth.md). Each device is
//! a separate session: its own `AuthManager`, which refreshes through the real
//! Auth server, and the real `CloudSave` service on top of it. The decision
//! logic (upload / restore / choice) lives in the renderer and is covered by
//! the JavaScript tests; here the server-side contract is checked: a new save
//! uploads, an existing one is overwritten by the last accepted write, a second
//! device reads it, a lost connection fails without side effects, and another
//! user is denied.

use std::sync::Arc;

use serde_json::{json, Value};
use terminalquest_lib::auth::client::HttpClient;
use terminalquest_lib::auth::config::AuthConfig;
use terminalquest_lib::auth::session::{account_fingerprint, AuthManager, State};
use terminalquest_lib::auth::store::{MemoryStore, SecretStore, Slot, StoreError, StoredSession};
use terminalquest_lib::auth::Provider;
use terminalquest_lib::cloud_save::remote::HttpRemote;
use terminalquest_lib::cloud_save::{CloudError, CloudSave};

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
    let email = format!("cloud-{}@terminalquest.invalid", suffix());
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

#[tokio::test]
#[ignore = "needs the local Supabase stack and its keys in the environment"]
async fn cloud_save_against_local_supabase() {
    let url = env("TERMINALQUEST_TEST_SUPABASE_URL");
    let publishable = env("TERMINALQUEST_TEST_SUPABASE_PUBLISHABLE_KEY");
    let secret = env("TERMINALQUEST_TEST_SUPABASE_SERVICE_ROLE_KEY");
    let config =
        AuthConfig::resolve(Some(&url), Some(&publishable), true).expect("a valid local URL");
    let http = reqwest::Client::new();

    let alice = create_user(&http, &config, &secret).await;
    let bob = create_user(&http, &config, &secret).await;

    let scenario = tokio::spawn({
        let (http, config) = (http.clone(), config.clone());
        let (alice_id, alice_email, alice_pw) = (
            alice.id.clone(),
            alice.email.clone(),
            alice.password.clone(),
        );
        let (bob_id, bob_email, bob_pw) = (bob.id.clone(), bob.email.clone(), bob.password.clone());
        async move {
            let alice = User {
                id: alice_id,
                email: alice_email,
                password: alice_pw,
            };
            let bob = User {
                id: bob_id,
                email: bob_email,
                password: bob_pw,
            };
            run_scenario(&http, &config, &alice, &bob).await
        }
    });
    let result = scenario.await;

    // Always remove the users (their saves go with them: ON DELETE CASCADE).
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

async fn run_scenario(http: &reqwest::Client, config: &AuthConfig, alice: &User, bob: &User) {
    let alice_account = account_fingerprint(&alice.id);
    let bob_account = account_fingerprint(&bob.id);
    let service =
        |auth: &Auth| CloudSave::new(Arc::clone(auth), HttpRemote::new(Some(config.clone())));

    // --- 1. A new local save: the cloud has none, the upload creates revision 1.
    let (alice_1, _) = device(http, config, alice).await;
    let alice_1_cloud = service(&alice_1);
    assert!(alice_1_cloud.fetch(&alice_account).await.unwrap().is_none());
    let first = alice_1_cloud
        .upload(&alice_account, &json!({ "xp": 10, "device": 1 }), 1)
        .await
        .unwrap();
    assert_eq!(first.revision, 1);
    assert_eq!(first.account, alice_account);

    // --- 2. An existing cloud save and a local one: the "use this device"
    // choice overwrites; the revision is assigned by the server and increases.
    let second = alice_1_cloud
        .upload(&alice_account, &json!({ "xp": 20, "device": 1 }), 1)
        .await
        .unwrap();
    assert_eq!(second.revision, 2);

    // --- 3. A second device restores what the first one wrote.
    let (alice_2, _) = device(http, config, alice).await;
    let alice_2_cloud = service(&alice_2);
    let row = alice_2_cloud
        .fetch(&alice_account)
        .await
        .unwrap()
        .expect("the second device sees the save");
    assert_eq!(row.revision, 2);
    assert_eq!(row.data["xp"], 20);
    assert_eq!(row.schema_version, 1);
    // Last accepted write wins: the second device writes, then the first one.
    assert_eq!(
        alice_2_cloud
            .upload(&alice_account, &json!({ "xp": 30, "device": 2 }), 1)
            .await
            .unwrap()
            .revision,
        3
    );
    assert_eq!(
        alice_1_cloud
            .upload(&alice_account, &json!({ "xp": 25, "device": 1 }), 1)
            .await
            .unwrap()
            .revision,
        4
    );
    let latest = alice_2_cloud.fetch(&alice_account).await.unwrap().unwrap();
    assert_eq!(
        (latest.revision, latest.data["device"].clone()),
        (4, json!(1))
    );

    // --- 4. The connection is lost: a clear error, and nothing changed.
    let dead = CloudSave::new(
        Arc::clone(&alice_1),
        HttpRemote::new(Some(
            AuthConfig::resolve(
                Some("http://127.0.0.1:9"),
                Some(&config.publishable_key),
                true,
            )
            .unwrap(),
        )),
    );
    assert_eq!(
        dead.upload(&alice_account, &json!({ "xp": 99 }), 1)
            .await
            .unwrap_err(),
        CloudError::Offline
    );
    assert_eq!(
        dead.fetch(&alice_account).await.unwrap_err(),
        CloudError::Offline
    );
    assert_eq!(
        alice_2_cloud
            .fetch(&alice_account)
            .await
            .unwrap()
            .unwrap()
            .revision,
        4
    );

    // --- 5. Another user is denied.
    let (bob_dev, bob_token) = device(http, config, bob).await;
    let bob_cloud = service(&bob_dev);
    // The service refuses a call that names another account, before any request.
    assert_eq!(
        bob_cloud.fetch(&alice_account).await.unwrap_err(),
        CloudError::AccountChanged
    );
    // Bob sees no save of his own, and none of Alice's.
    assert!(bob_cloud.fetch(&bob_account).await.unwrap().is_none());
    let rest = format!("{}/rest/v1/cloud_saves", config.url);
    let rows: Value = http
        .get(format!("{rest}?select=*&user_id=eq.{}", alice.id))
        .header("apikey", &config.publishable_key)
        .bearer_auth(&bob_token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(rows, json!([]), "RLS hides Alice's row from Bob");
    // Bob cannot update, delete, or insert for Alice.
    let patched = http
        .patch(format!("{rest}?user_id=eq.{}", alice.id))
        .header("apikey", &config.publishable_key)
        .header("Prefer", "return=representation")
        .bearer_auth(&bob_token)
        .json(&json!({ "data": { "hacked": true } }))
        .send()
        .await
        .unwrap();
    let patched_rows: Value = patched.json().await.unwrap();
    assert_eq!(patched_rows, json!([]), "no row of Alice's was updated");
    let deleted = http
        .delete(format!("{rest}?user_id=eq.{}", alice.id))
        .header("apikey", &config.publishable_key)
        .bearer_auth(&bob_token)
        .send()
        .await
        .unwrap();
    assert!(deleted.status().is_client_error(), "DELETE is not granted");
    let forged = http
        .post(&rest)
        .header("apikey", &config.publishable_key)
        .bearer_auth(&bob_token)
        .json(&json!({ "user_id": alice.id, "data": {}, "schema_version": 1 }))
        .send()
        .await
        .unwrap();
    assert!(
        forged.status().is_client_error(),
        "user_id cannot be chosen"
    );
    // Without a user (publishable key only) nothing is readable or writable.
    let anonymous = http
        .get(&rest)
        .header("apikey", &config.publishable_key)
        .send()
        .await
        .unwrap();
    assert!(anonymous.status().is_client_error());
    // Alice's save is untouched.
    let still = alice_2_cloud.fetch(&alice_account).await.unwrap().unwrap();
    assert_eq!((still.revision, still.data["xp"].clone()), (4, json!(25)));
    // Bob's own write lands in Bob's row only.
    assert_eq!(
        bob_cloud
            .upload(&bob_account, &json!({ "xp": 1 }), 1)
            .await
            .unwrap()
            .revision,
        1
    );
    assert_eq!(
        alice_2_cloud
            .fetch(&alice_account)
            .await
            .unwrap()
            .unwrap()
            .revision,
        4
    );
}
