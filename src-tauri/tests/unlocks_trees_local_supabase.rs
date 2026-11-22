//! Unlock codes and tree planting against the real local Supabase stack
//! (`npm run supabase:start`, which seeds the synthetic `TQ-TEST-*` codes).
//!
//! Ignored by default. Needs the same variables as cloud_save_local_supabase.rs:
//!
//!   TERMINALQUEST_TEST_SUPABASE_URL
//!   TERMINALQUEST_TEST_SUPABASE_PUBLISHABLE_KEY
//!   TERMINALQUEST_TEST_SUPABASE_SERVICE_ROLE_KEY
//!
//!   cargo test --test unlocks_trees_local_supabase -- --ignored
//!
//! Two throwaway users are created through the admin API and signed in with a
//! password; the real `Rewards` service runs on top of the real `AuthManager`.
//! Checked: a valid code, an invalid / retired code, a resend (no second grant,
//! the first item is returned), the same code for a second user, a planting, its
//! resend, an unsupported target, a lost connection, and another account.

use std::sync::Arc;

use serde_json::{json, Value};
use terminalquest_lib::auth::client::HttpClient;
use terminalquest_lib::auth::config::AuthConfig;
use terminalquest_lib::auth::session::{account_fingerprint, AuthManager, State};
use terminalquest_lib::auth::store::{MemoryStore, SecretStore, Slot, StoreError, StoredSession};
use terminalquest_lib::auth::Provider;
use terminalquest_lib::cloud_save::CloudError;
use terminalquest_lib::rewards::remote::{HttpRemote, PlantingStatus, RedeemStatus};
use terminalquest_lib::rewards::Rewards;

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
    let email = format!("rewards-{}@terminalquest.invalid", suffix());
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
async fn unlocks_and_trees_against_local_supabase() {
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
        async move { run_scenario(&http, &config, &alice, &bob).await }
    });
    let result = scenario.await;

    // Always remove the users (their records go with them: ON DELETE CASCADE).
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
        |auth: &Auth| Rewards::new(Arc::clone(auth), HttpRemote::new(Some(config.clone())));
    let (alice_dev, _) = device(http, config, alice).await;
    let (bob_dev, bob_token) = device(http, config, bob).await;
    let alice_svc = service(&alice_dev);
    let bob_svc = service(&bob_dev);

    // --- Unlock codes
    let first = alice_svc
        .redeem(&alice_account, "TQ-TEST-WAND")
        .await
        .unwrap();
    assert_eq!(first.status, RedeemStatus::Redeemed);
    assert_eq!(first.item_key.as_deref(), Some("wand"));
    assert_eq!(first.account, alice_account);
    // A resend does not grant again and returns the first item.
    let again = alice_svc
        .redeem(&alice_account, " TQ-TEST-WAND ")
        .await
        .unwrap();
    assert_eq!(again.status, RedeemStatus::AlreadyRedeemed);
    assert_eq!(again.item_key.as_deref(), Some("wand"));
    // Invalid, retired, wrong case and blank codes grant nothing.
    for code in ["NO-SUCH-CODE", "TQ-TEST-RETIRED", "tq-test-wand", ""] {
        let invalid = alice_svc.redeem(&alice_account, code).await.unwrap();
        assert_eq!(
            (invalid.status, invalid.item_key),
            (RedeemStatus::InvalidCode, None)
        );
    }
    // An item that the client does not have is still recorded by the server.
    let missing = alice_svc
        .redeem(&alice_account, "TQ-TEST-MISSING-ITEM")
        .await
        .unwrap();
    assert_eq!(
        missing.item_key.as_deref(),
        Some("synthetic_item_not_installed")
    );
    // A second user can use the same code.
    let bob_first = bob_svc.redeem(&bob_account, "TQ-TEST-WAND").await.unwrap();
    assert_eq!(bob_first.status, RedeemStatus::Redeemed);
    // Only the caller's own records are visible, and none can be written directly.
    let rest = format!("{}/rest/v1/unlock_code_redemptions", config.url);
    let rows: Value = http
        .get(format!("{rest}?select=code"))
        .header("apikey", &config.publishable_key)
        .bearer_auth(&bob_token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(rows, json!([{ "code": "TQ-TEST-WAND" }]));
    let forged = http
        .post(&rest)
        .header("apikey", &config.publishable_key)
        .bearer_auth(&bob_token)
        .json(&json!({ "user_id": bob.id, "code": "FORGED", "item_key": "wand" }))
        .send()
        .await
        .unwrap();
    assert!(
        forged.status().is_client_error(),
        "records cannot be written directly"
    );
    let private = http
        .get(format!("{}/rest/v1/unlock_codes?select=*", config.url))
        .header("apikey", &config.publishable_key)
        .bearer_auth(&bob_token)
        .send()
        .await
        .unwrap();
    assert!(
        private.status().is_client_error(),
        "the code table is not exposed"
    );

    // --- Tree planting
    for (mission, target) in [
        ("fog_owl", "owl_plant_tree1"),
        ("dev_skills", "skills_plant_tree1"),
        ("dev_skills", "devskills_tree1"),
    ] {
        let recorded = alice_svc
            .record_planting(&alice_account, mission, target)
            .await
            .unwrap();
        assert_eq!(recorded.status, PlantingStatus::Recorded);
        let resent = alice_svc
            .record_planting(&alice_account, mission, target)
            .await
            .unwrap();
        assert_eq!(resent.status, PlantingStatus::AlreadyRecorded);
    }
    for (mission, target) in [("owl", "owl_plant_tree1"), ("fog_owl", "unknown")] {
        let refused = alice_svc
            .record_planting(&alice_account, mission, target)
            .await
            .unwrap();
        assert_eq!(refused.status, PlantingStatus::UnsupportedTarget);
    }
    // Per user: Bob records the same target on his own.
    assert_eq!(
        bob_svc
            .record_planting(&bob_account, "fog_owl", "owl_plant_tree1")
            .await
            .unwrap()
            .status,
        PlantingStatus::Recorded
    );
    let plantings: Value = http
        .get(format!(
            "{}/rest/v1/tree_plantings?select=user_id",
            config.url
        ))
        .header("apikey", &config.publishable_key)
        .bearer_auth(&bob_token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(
        plantings,
        json!([{ "user_id": bob.id }]),
        "Bob sees only his own record"
    );

    // --- Another account is named: refused before any request.
    assert_eq!(
        bob_svc
            .redeem(&alice_account, "TQ-TEST-TSHIRT")
            .await
            .unwrap_err(),
        CloudError::AccountChanged
    );
    assert_eq!(
        alice_svc
            .redeem(&alice_account, "TQ-TEST-TSHIRT")
            .await
            .unwrap()
            .status,
        RedeemStatus::Redeemed,
        "the refused call recorded nothing for Alice's TSHIRT"
    );

    // --- The connection is lost: offline, nothing recorded.
    let dead = Rewards::new(
        Arc::clone(&bob_dev),
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
        dead.redeem(&bob_account, "TQ-TEST-TSHIRT")
            .await
            .unwrap_err(),
        CloudError::Offline
    );
    assert_eq!(
        dead.record_planting(&bob_account, "dev_skills", "skills_plant_tree1")
            .await
            .unwrap_err(),
        CloudError::Offline
    );
    // The same calls then succeed as a first grant / record: the lost ones left nothing behind.
    assert_eq!(
        bob_svc
            .redeem(&bob_account, "TQ-TEST-TSHIRT")
            .await
            .unwrap()
            .status,
        RedeemStatus::Redeemed
    );
    assert_eq!(
        bob_svc
            .record_planting(&bob_account, "dev_skills", "skills_plant_tree1")
            .await
            .unwrap()
            .status,
        PlantingStatus::Recorded
    );
}
