mod bundled_scope;
mod close;
mod exec;
mod help_menu;

use std::collections::HashMap;
use tauri::ipc::CommandScope;

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

pub fn run() {
    tauri::Builder::default()
        .manage(close::CloseConfirmation::default())
        .setup(|app| {
            // The quit menu first (macOS): the Help items are added to its menu.
            #[cfg(target_os = "macos")]
            close::install_quit_menu(app)?;
            help_menu::install(app)?;
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
            is_dev,
            open_devtools,
            toggle_devtools,
            help_menu::enable_help_menu
        ])
        .run(tauri::generate_context!())
        .expect("error while running TerminalQuest");
}
