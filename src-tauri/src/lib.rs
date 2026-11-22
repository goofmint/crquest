pub mod auth;
mod bundled_scope;
#[cfg(test)]
mod capability_scope;
mod close;
pub mod cloud_save;
mod exec;
mod help_menu;
pub mod live_events;
pub mod rewards;

use std::collections::HashMap;
use tauri::ipc::CommandScope;
use tauri::Manager;

use exec::{FailureKind, ProgramEntry, RunFailure, RunOptions, RunOutput};

/// The allowed program patterns come from the capability scope of
/// `allow-run-command` / `allow-command-exists` (capabilities/platform.json).
/// An empty scope denies everything.
fn scope_patterns(scope: &CommandScope<ProgramEntry>) -> Vec<String> {
    scope.allows().iter().map(|e| e.program.clone()).collect()
}

fn join_failure(error: tauri::Error) -> RunFailure {
    RunFailure {
        kind: FailureKind::Spawn,
        code: None,
        message: format!("command task failed: {error}"),
        stdout: String::new(),
        stderr: String::new(),
        killed: false,
    }
}

/// Runs an allowed program without a shell. Resolves with the exit code and
/// output for any exit code; rejects with a `RunFailure` otherwise.
#[tauri::command]
async fn run_command(
    scope: CommandScope<ProgramEntry>,
    program: String,
    args: Vec<String>,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
    timeout_ms: Option<u64>,
    max_buffer: Option<usize>,
) -> Result<RunOutput, RunFailure> {
    exec::authorize_program(&program, &scope_patterns(&scope))?;
    let options = RunOptions {
        cwd,
        env,
        timeout_ms,
        max_buffer,
    };
    tauri::async_runtime::spawn_blocking(move || exec::run(&program, &args, &options))
        .await
        .map_err(join_failure)?
}

/// True if `name` (a bare, allowed program name) is an executable on PATH.
#[tauri::command]
async fn command_exists(
    scope: CommandScope<ProgramEntry>,
    name: String,
) -> Result<bool, RunFailure> {
    let patterns = scope_patterns(&scope);
    tauri::async_runtime::spawn_blocking(move || {
        let path_var = std::env::var_os("PATH").unwrap_or_default();
        exec::command_exists(&name, &patterns, &path_var, &exec::system_path_ext())
    })
    .await
    .map_err(join_failure)?
}

/// True if `path` (an absolute path whose file name is an allowed program
/// name) exists. See `exec::path_exists`.
#[tauri::command]
async fn path_exists(scope: CommandScope<ProgramEntry>, path: String) -> Result<bool, RunFailure> {
    let patterns = scope_patterns(&scope);
    tauri::async_runtime::spawn_blocking(move || exec::path_exists(&path, &patterns))
        .await
        .map_err(join_failure)?
}

/// True in debug builds (`cargo build` without `--release`), like
/// `electron-is-dev` for an unpackaged Electron app.
#[tauri::command]
fn is_dev() -> bool {
    cfg!(debug_assertions)
}

/// DevTools are compiled into debug builds only (the `devtools` cargo feature
/// is not enabled because it uses a private API on macOS). In release builds
/// the commands fail explicitly.
#[cfg(debug_assertions)]
#[tauri::command]
fn open_devtools(webview_window: tauri::WebviewWindow) -> Result<(), String> {
    webview_window.open_devtools();
    Ok(())
}

#[cfg(debug_assertions)]
#[tauri::command]
fn toggle_devtools(webview_window: tauri::WebviewWindow) -> Result<(), String> {
    if webview_window.is_devtools_open() {
        webview_window.close_devtools();
    } else {
        webview_window.open_devtools();
    }
    Ok(())
}

#[cfg(not(debug_assertions))]
#[tauri::command]
fn open_devtools() -> Result<(), String> {
    Err("DevTools are not available in release builds".to_string())
}

#[cfg(not(debug_assertions))]
#[tauri::command]
fn toggle_devtools() -> Result<(), String> {
    Err("DevTools are not available in release builds".to_string())
}

/// The generated context (embedded `frontendDist`, config, ACL). One place, so
/// that the tests can inspect the same context that `run` starts with.
fn context() -> tauri::Context {
    tauri::generate_context!()
}

pub fn run() {
    let builder = tauri::Builder::default();
    // First: a second launch (also the one the OS starts for a terminalquest://
    // callback while the app runs) is forwarded to this instance. With the
    // `deep-link` feature the URL reaches the deep-link plugin's handler.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        if let Some(window) = app.get_webview_window(close::MAIN_WINDOW_LABEL) {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }));
    builder
        // After single-instance. The renderer is not granted the deep-link
        // commands. The plugin does `app.emit("deep-link://new-url", ..)` to
        // every webview, though, and `core:default` allows `listen`, so page
        // scripts could see the callback URL. That is tolerated on purpose: the
        // `code` is useless without the PKCE verifier, which never leaves Rust
        // (docs/supabase/auth.md).
        .plugin(tauri_plugin_deep_link::init())
        .manage(close::CloseConfirmation::default())
        .setup(|app| {
            // The quit menu first (macOS): the Help items are added to its menu.
            #[cfg(target_os = "macos")]
            let quit = close::install_quit_menu(app)?;
            app.manage(help_menu::install(
                app,
                #[cfg(target_os = "macos")]
                quit,
            )?);
            auth::setup(app)?;
            cloud_save::setup(app)?;
            rewards::setup(app)?;
            live_events::setup(app)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            #[cfg(target_os = "macos")]
            close::on_menu_event(app, event.id().as_ref());
            help_menu::on_menu_event(app, event.id().as_ref());
        })
        .on_window_event(|window, event| {
            if window.label() != close::MAIN_WINDOW_LABEL {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                close::confirm_close(window);
            }
        })
        .plugin(tauri_plugin_fs::init())
        // Adds <dir>/.bundled next to every directory the user chose (the Sync
        // Bundled Assets target). After fs, before persisted-scope, so that the
        // restore at startup goes through it too.
        .plugin(bundled_scope::init())
        // Must come after the fs plugin: restores the fs and asset scopes that
        // the dialog added (the extension directory) after a restart.
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .invoke_handler(tauri::generate_handler![
            run_command,
            command_exists,
            path_exists,
            is_dev,
            open_devtools,
            toggle_devtools,
            help_menu::enable_help_menu,
            help_menu::set_shell_texts,
            auth::auth_status,
            auth::auth_start_login,
            auth::auth_cancel_login,
            auth::auth_logout,
            cloud_save::cloud_save_fetch,
            cloud_save::cloud_save_upload,
            rewards::unlock_code_redeem,
            rewards::tree_planting_record,
            live_events::live_events_list,
            live_events::live_events_ranking,
            live_events::live_events_team_ranking,
            live_events::live_events_join,
            live_events::live_events_update,
            live_events::live_events_status
        ])
        .run(context())
        .expect("error while running TerminalQuest");
}

#[cfg(test)]
mod tests {
    use super::*;

    /// QuestIDE and the validators start `code_runner/worker.js` with
    /// `new Worker(<page-relative URL>)`; the page is served from the embedded
    /// `frontendDist`, so the file must be in it, byte for byte.
    #[test]
    fn the_worker_script_is_embedded_in_the_frontend_dist() {
        let context = context();
        let embedded = context
            .assets()
            .get(&"/code_runner/worker.js".into())
            .expect("code_runner/worker.js is not embedded in frontendDist");
        let on_disk = std::fs::read(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../public/code_runner/worker.js"
        ))
        .unwrap();
        assert_eq!(embedded.as_ref(), on_disk.as_slice());
    }

    /// `frontendDist` is the staging directory (tasks/stage_tauri_frontend.js):
    /// `content/` and `levels/` are resources read through the asset protocol,
    /// `node_modules/` is bundled (one stylesheet is linked by index.html), and
    /// dotfiles are not served.
    #[test]
    fn the_frontend_dist_leaves_out_the_resource_only_directories() {
        let context = context();
        let paths: Vec<String> = context
            .assets()
            .iter()
            .map(|(path, _)| path.to_string())
            .collect();
        assert!(paths.iter().any(|path| path == "/index.html"));
        assert!(paths.iter().any(|path| path == "/tauri-game.js"));
        assert!(paths.iter().any(|path| path == "/lib/animate.min.css"));
        let unexpected: Vec<&String> = paths
            .iter()
            .filter(|path| {
                path.starts_with("/content/")
                    || path.starts_with("/levels/")
                    || path.starts_with("/node_modules/")
                    || path.contains("/.")
                    || path == &"/package.json"
                    || path == &"/package-lock.json"
            })
            .collect();
        assert!(unexpected.is_empty(), "embedded: {unexpected:?}");
    }

    fn csp_sources(directive: &str) -> Vec<String> {
        let csp = context()
            .config()
            .app
            .security
            .csp
            .clone()
            .expect("a CSP is configured");
        let directives: std::collections::HashMap<
            String,
            tauri::utils::config::CspDirectiveSources,
        > = csp.into();
        directives
            .get(directive)
            .unwrap_or_else(|| panic!("CSP has no {directive}"))
            .clone()
            .into()
    }

    /// The directives that the code needs (docs/migration/tauri-runtime.md,
    /// W12, lists the evidence of each one). A change here is a decision.
    #[test]
    fn the_csp_allows_what_the_app_uses_and_nothing_broader() {
        assert_eq!(csp_sources("default-src"), ["'self'"]);
        // new Function (moduleLoader, pug, ejs), no inline script
        assert_eq!(csp_sources("script-src"), ["'self'", "'unsafe-eval'"]);
        // code_runner/worker.js and Ace's blob: worker
        assert_eq!(csp_sources("worker-src"), ["'self'", "blob:"]);
        // styled-components, Ace and React style attributes
        assert_eq!(csp_sources("style-src"), ["'self'", "'unsafe-inline'"]);
        for directive in ["img-src", "media-src"] {
            let sources = csp_sources(directive);
            assert!(sources.contains(&"asset:".to_string()));
            assert!(sources.contains(&"http://asset.localhost".to_string()));
        }
        let connect = csp_sources("connect-src");
        for source in [
            "ipc:",
            "http://ipc.localhost",
            "asset:",
            "http://asset.localhost",
        ] {
            assert!(
                connect.contains(&source.to_string()),
                "connect-src lacks {source}"
            );
        }
        // Every network host is an exact https origin: no wildcard, no scheme-only source
        for directive in ["connect-src", "frame-src"] {
            for source in csp_sources(directive) {
                let local = [
                    "'self'",
                    "ipc:",
                    "asset:",
                    "http://ipc.localhost",
                    "http://asset.localhost",
                ];
                assert!(
                    local.contains(&source.as_str())
                        || (source.starts_with("https://") && !source.contains('*')),
                    "{directive}: {source}"
                );
            }
        }
    }

    /// Tauri adds nonces and hashes to `style-src` / `script-src` for inline
    /// `<style>` / `<script>` of the HTML it serves, and a nonce makes the
    /// browser ignore `'unsafe-inline'`. The page has none (it has only
    /// `<link>` and `<script src>`), so the policy above stays as written.
    #[test]
    fn the_page_has_no_inline_script_or_style() {
        let context = context();
        let html = context
            .assets()
            .get(&"/index.html".into())
            .expect("index.html is embedded");
        let html = String::from_utf8(html.to_vec()).unwrap().to_lowercase();
        assert!(!html.contains("<style"));
        for script in html.split("<script").skip(1) {
            let tag = &script[..script.find('>').unwrap()];
            assert!(tag.contains(" src="), "inline script: <script{tag}>");
        }
    }
}
