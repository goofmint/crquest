//! Optional GitHub / Google login (Supabase Auth, PKCE, system browser).
//!
//! Everything secret stays on this side: the code verifier, the one-time
//! `code`, the access token and the refresh token never reach the renderer
//! (which also runs extensions and validators), `setContext`, `config.json`,
//! logs or error messages. The renderer gets `AuthStatus` and nothing else;
//! there is deliberately no command that returns a token. The game does not
//! wait for any of this: signed out, offline or unconfigured, it runs as before.
//!
//! See docs/supabase/auth.md.

pub mod callback;
pub mod client;
pub mod config;
pub mod pkce;
pub mod session;
pub mod store;

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager, State};

pub use session::{AuthManager, AuthStatus};

/// Event sent to the `main` window when the status changes.
pub const STATUS_EVENT: &str = "auth://status-changed";
/// Service name of the OS credential store entries.
const KEYRING_SERVICE: &str = "com.terminalquest.desktop";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Github,
    Google,
}

impl Provider {
    pub fn as_str(self) -> &'static str {
        match self {
            Provider::Github => "github",
            Provider::Google => "google",
        }
    }

    pub fn parse(value: &str) -> Option<Provider> {
        match value {
            "github" => Some(Provider::Github),
            "google" => Some(Provider::Google),
            _ => None,
        }
    }
}

/// Command errors: a code only (no URL, no token, no server message).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthError {
    Unconfigured,
    AlreadySignedIn,
    BrowserOpenFailed,
}

impl std::fmt::Display for AuthError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            AuthError::Unconfigured => "login is not configured in this build",
            AuthError::AlreadySignedIn => "already signed in",
            AuthError::BrowserOpenFailed => "could not open the system browser",
        })
    }
}

impl std::error::Error for AuthError {}

pub type AppAuth = AuthManager<store::KeyringStore, client::HttpClient>;

#[tauri::command]
pub fn auth_status(auth: State<'_, Arc<AppAuth>>) -> AuthStatus {
    auth.status()
}

#[tauri::command]
pub async fn auth_start_login(
    auth: State<'_, Arc<AppAuth>>,
    provider: Provider,
) -> Result<AuthStatus, AuthError> {
    auth.inner().start_login(provider).await
}

#[tauri::command]
pub async fn auth_cancel_login(auth: State<'_, Arc<AppAuth>>) -> Result<AuthStatus, AuthError> {
    Ok(auth.inner().cancel_login().await)
}

#[tauri::command]
pub async fn auth_logout(auth: State<'_, Arc<AppAuth>>) -> Result<AuthStatus, AuthError> {
    Ok(auth.inner().logout().await)
}

/// Creates the manager, restores the session in the background and routes the
/// callback URLs (cold start and while running) to it. Does not block startup.
pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_deep_link::DeepLinkExt;
    use tauri_plugin_opener::OpenerExt;

    // Windows / Linux register the scheme at install time; this covers dev
    // builds and AppImage (which has no installer).
    #[cfg(any(target_os = "linux", target_os = "windows"))]
    if cfg!(debug_assertions) || std::env::var_os("APPIMAGE").is_some() {
        // Not fatal: the game must start. Only the scheme registration is lost.
        if app.deep_link().register_all().is_err() {
            eprintln!("auth: could not register the terminalquest:// scheme");
        }
    }

    let emit_handle = app.handle().clone();
    let open_handle = app.handle().clone();
    let manager: Arc<AppAuth> = Arc::new(AuthManager::new(
        config::AuthConfig::from_build(),
        store::KeyringStore::new(KEYRING_SERVICE),
        client::HttpClient::new(config::AuthConfig::from_build()),
        move |status| {
            let _ = emit_handle.emit_to("main", STATUS_EVENT, status);
        },
        // Opened from Rust so that the URL never goes through the renderer.
        move |url| open_handle.opener().open_url(url, None::<&str>).is_ok(),
    ));
    app.manage(Arc::clone(&manager));

    let initial: Vec<String> = app
        .deep_link()
        .get_current()
        .ok()
        .flatten()
        .unwrap_or_default()
        .iter()
        .map(|u| u.to_string())
        .collect();
    let startup = Arc::clone(&manager);
    tauri::async_runtime::spawn(async move {
        startup.restore().await;
        for url in initial {
            startup.handle_callback(&url).await;
        }
    });

    let running = Arc::clone(&manager);
    app.deep_link().on_open_url(move |event| {
        for url in event.urls() {
            let manager = Arc::clone(&running);
            let url = url.to_string();
            tauri::async_runtime::spawn(async move { manager.handle_callback(&url).await });
        }
    });
    Ok(())
}
