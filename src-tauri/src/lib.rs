mod exec;

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

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .invoke_handler(tauri::generate_handler![run_command, command_exists])
        .run(tauri::generate_context!())
        .expect("error while running TerminalQuest");
}
