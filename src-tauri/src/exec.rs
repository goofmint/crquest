//! Command execution for the platform layer (`run_command` / `command_exists`).
//!
//! Semantics follow `src/js/app/platform/exec.js` (Electron): the program is
//! started WITHOUT a shell, a non-zero exit is data, and spawn failures,
//! signal kills, timeouts and `maxBuffer` overruns are failures. This module
//! has no dependency on Tauri so that it can be unit tested.
//!
//! Security model (see docs/migration/tauri-platform.md): the allowlist is a
//! list of program-name patterns that comes from the capability scope
//! (`src-tauri/capabilities/platform.json`). A program is accepted when its
//! file stem (extension `.exe` / `.cmd` removed, ASCII case-insensitive)
//! matches a pattern. A bare name is resolved through PATH by the OS; a name
//! with a directory part must be an absolute path to an existing file.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::ffi::OsStr;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

/// Node's `child_process.execFile` default `maxBuffer` (Node 12): 1 MiB per stream.
pub const DEFAULT_MAX_BUFFER: usize = 1024 * 1024;

const POLL_INTERVAL: Duration = Duration::from_millis(10);

/// One entry of the capability scope: `{ "program": "<pattern>" }`.
/// `*` in a pattern matches any run of characters.
#[derive(Debug, Clone, Deserialize)]
pub struct ProgramEntry {
    pub program: String,
}

#[derive(Debug, Default, Clone)]
pub struct RunOptions {
    pub cwd: Option<String>,
    /// Like Node's `env` option: when present it REPLACES the environment.
    pub env: Option<HashMap<String, String>>,
    pub timeout_ms: Option<u64>,
    pub max_buffer: Option<usize>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct RunOutput {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum FailureKind {
    /// The program is not permitted by the scope.
    NotAllowed,
    /// The request itself is malformed (empty name, relative path, bad cwd).
    InvalidArgument,
    /// The process could not be started (`code` is `ENOENT`, `EACCES`, ...).
    Spawn,
    /// The timeout elapsed and the process was killed.
    Timeout,
    /// stdout or stderr exceeded `maxBuffer` and the process was killed.
    MaxBuffer,
    /// The process was terminated by a signal.
    Signal,
}

/// Serialized to the frontend as the rejection value of `invoke`.
#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RunFailure {
    pub kind: FailureKind,
    /// Node-style error code for `Spawn` (`ENOENT`, `EACCES`, `EPERM`, `UNKNOWN`).
    pub code: Option<String>,
    pub message: String,
    pub stdout: String,
    pub stderr: String,
    /// True when this side killed the process (timeout / maxBuffer).
    pub killed: bool,
}

fn failure(kind: FailureKind, message: impl Into<String>) -> RunFailure {
    RunFailure {
        kind,
        code: None,
        message: message.into(),
        stdout: String::new(),
        stderr: String::new(),
        killed: false,
    }
}

/// `*` wildcard match, ASCII case-insensitive.
fn wildcard_match(pattern: &str, text: &str) -> bool {
    let p: Vec<char> = pattern.to_ascii_lowercase().chars().collect();
    let t: Vec<char> = text.to_ascii_lowercase().chars().collect();
    let (mut pi, mut ti) = (0, 0);
    let mut star: Option<(usize, usize)> = None;
    while ti < t.len() {
        if pi < p.len() && p[pi] == '*' {
            star = Some((pi, ti));
            pi += 1;
        } else if pi < p.len() && p[pi] == t[ti] {
            pi += 1;
            ti += 1;
        } else if let Some((sp, st)) = star {
            pi = sp + 1;
            ti = st + 1;
            star = Some((sp, st + 1));
        } else {
            return false;
        }
    }
    while pi < p.len() && p[pi] == '*' {
        pi += 1;
    }
    pi == p.len()
}

/// File name without directory and without a trailing `.exe` / `.cmd`.
fn program_stem(program: &str) -> String {
    let file_name = program.rsplit(['/', '\\']).next().unwrap_or(program);
    let lower = file_name.to_ascii_lowercase();
    for ext in [".exe", ".cmd"] {
        if lower.ends_with(ext) {
            return file_name[..file_name.len() - ext.len()].to_string();
        }
    }
    file_name.to_string()
}

fn has_directory_part(program: &str) -> bool {
    program.contains('/') || program.contains('\\')
}

/// Checks `program` against the scope patterns. An empty pattern list denies
/// everything (a missing scope must never mean "allow all").
pub fn authorize_program(program: &str, patterns: &[String]) -> Result<(), RunFailure> {
    if program.trim().is_empty() || program.contains('\0') {
        return Err(failure(
            FailureKind::InvalidArgument,
            "program must be a non-empty string",
        ));
    }
    if has_directory_part(program) && !Path::new(program).is_absolute() {
        return Err(failure(
            FailureKind::InvalidArgument,
            format!("program path must be absolute: {program}"),
        ));
    }
    let stem = program_stem(program);
    if patterns.iter().any(|p| wildcard_match(p, &stem)) {
        Ok(())
    } else {
        Err(failure(
            FailureKind::NotAllowed,
            format!("program is not allowed: {program}"),
        ))
    }
}

fn io_error_code(error: &std::io::Error) -> &'static str {
    match error.kind() {
        std::io::ErrorKind::NotFound => "ENOENT",
        std::io::ErrorKind::PermissionDenied => "EACCES",
        _ => "UNKNOWN",
    }
}

enum Chunk {
    Data(bool, Vec<u8>),
    Eof,
}

fn pump<R: Read + Send + 'static>(is_stdout: bool, mut reader: R, tx: mpsc::Sender<Chunk>) {
    thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if tx.send(Chunk::Data(is_stdout, buf[..n].to_vec())).is_err() {
                        return;
                    }
                }
            }
        }
        let _ = tx.send(Chunk::Eof);
    });
}

/// Runs `program` with `args` without a shell. `program` must already have
/// been authorized.
pub fn run(program: &str, args: &[String], options: &RunOptions) -> Result<RunOutput, RunFailure> {
    let max_buffer = options.max_buffer.unwrap_or(DEFAULT_MAX_BUFFER);
    let mut command = Command::new(program);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(cwd) = &options.cwd {
        if !Path::new(cwd).is_dir() {
            let mut f = failure(
                FailureKind::Spawn,
                format!("spawn {program} ENOENT (cwd does not exist: {cwd})"),
            );
            f.code = Some("ENOENT".to_string());
            return Err(f);
        }
        command.current_dir(cwd);
    }
    if let Some(env) = &options.env {
        command.env_clear().envs(env);
    }

    let mut child = command.spawn().map_err(|e| {
        let code = io_error_code(&e);
        let mut f = failure(FailureKind::Spawn, format!("spawn {program} {code}: {e}"));
        f.code = Some(code.to_string());
        f
    })?;

    let (tx, rx) = mpsc::channel();
    if let Some(out) = child.stdout.take() {
        pump(true, out, tx.clone());
    }
    if let Some(err) = child.stderr.take() {
        pump(false, err, tx.clone());
    }
    drop(tx);

    let started = Instant::now();
    let mut stdout = Vec::new();
    let mut stderr = Vec::new();
    let mut exit = None;
    let mut open_streams = 2;

    let finish_failure = |kind: FailureKind, message: String, stdout: &[u8], stderr: &[u8]| {
        let mut f = failure(kind, message);
        f.stdout = String::from_utf8_lossy(stdout).into_owned();
        f.stderr = String::from_utf8_lossy(stderr).into_owned();
        f.killed = matches!(kind, FailureKind::Timeout | FailureKind::MaxBuffer);
        f
    };

    loop {
        match rx.recv_timeout(POLL_INTERVAL) {
            Ok(Chunk::Data(is_stdout, data)) => {
                let target = if is_stdout { &mut stdout } else { &mut stderr };
                target.extend_from_slice(&data);
                if target.len() > max_buffer {
                    let _ = child.kill();
                    let _ = child.wait();
                    let name = if is_stdout { "stdout" } else { "stderr" };
                    return Err(finish_failure(
                        FailureKind::MaxBuffer,
                        format!("{name} maxBuffer length exceeded"),
                        &stdout,
                        &stderr,
                    ));
                }
            }
            Ok(Chunk::Eof) => open_streams -= 1,
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            // Both readers are gone (also the case when the pipes were never taken).
            Err(mpsc::RecvTimeoutError::Disconnected) => open_streams = 0,
        }
        if exit.is_none() {
            if let Ok(Some(status)) = child.try_wait() {
                exit = Some(status);
            }
        }
        if exit.is_some() && open_streams <= 0 {
            break;
        }
        if let Some(timeout_ms) = options.timeout_ms {
            if timeout_ms > 0 && started.elapsed() >= Duration::from_millis(timeout_ms) {
                let _ = child.kill();
                let _ = child.wait();
                return Err(finish_failure(
                    FailureKind::Timeout,
                    format!("Command timed out after {timeout_ms} ms: {program}"),
                    &stdout,
                    &stderr,
                ));
            }
        }
    }

    let status = exit.expect("loop only breaks once the process has exited");
    match status.code() {
        Some(code) => Ok(RunOutput {
            code,
            stdout: String::from_utf8_lossy(&stdout).into_owned(),
            stderr: String::from_utf8_lossy(&stderr).into_owned(),
        }),
        None => Err(finish_failure(
            FailureKind::Signal,
            format!("Command was terminated by a signal: {program}"),
            &stdout,
            &stderr,
        )),
    }
}

fn is_executable_file(path: &Path) -> bool {
    let Ok(meta) = std::fs::metadata(path) else {
        return false;
    };
    if !meta.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        meta.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}

/// PATH lookup (`command -v` / `where` equivalent for executables on disk).
pub fn find_in_path(name: &str, path_var: &OsStr, path_ext: &[String]) -> Option<PathBuf> {
    for dir in std::env::split_paths(path_var) {
        if dir.as_os_str().is_empty() {
            continue;
        }
        let plain = dir.join(name);
        if is_executable_file(&plain) {
            return Some(plain);
        }
        for ext in path_ext {
            let candidate = dir.join(format!("{name}{ext}"));
            if is_executable_file(&candidate) {
                return Some(candidate);
            }
        }
    }
    None
}

/// `command_exists`: `name` must be a bare, allowed program name.
pub fn command_exists(
    name: &str,
    patterns: &[String],
    path_var: &OsStr,
    path_ext: &[String],
) -> Result<bool, RunFailure> {
    authorize_program(name, patterns)?;
    if has_directory_part(name) {
        return Err(failure(
            FailureKind::InvalidArgument,
            "command_exists requires a bare command name, not a path",
        ));
    }
    Ok(find_in_path(name, path_var, path_ext).is_some())
}

/// Windows executable extensions to try (`PATHEXT`); empty elsewhere.
pub fn system_path_ext() -> Vec<String> {
    if cfg!(windows) {
        std::env::var("PATHEXT")
            .unwrap_or_else(|_| ".EXE;.CMD".to_string())
            .split(';')
            .filter(|e| !e.is_empty())
            .map(|e| e.to_ascii_lowercase())
            .collect()
    } else {
        Vec::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn patterns() -> Vec<String> {
        ["git", "node", "npm", "python", "python3", "python3.*"]
            .iter()
            .map(|s| s.to_string())
            .collect()
    }

    #[test]
    fn wildcard_basics() {
        assert!(wildcard_match("git", "GIT"));
        assert!(wildcard_match("python3.*", "python3.11"));
        assert!(!wildcard_match("python3.*", "python3"));
        assert!(!wildcard_match("git", "gitk"));
        assert!(wildcard_match("*", "anything"));
    }

    #[test]
    fn stem_strips_directory_and_extension() {
        assert_eq!(program_stem("/usr/bin/git"), "git");
        assert_eq!(program_stem("C:\\Program Files\\Git\\bin\\git.EXE"), "git");
        assert_eq!(program_stem("npm.cmd"), "npm");
        assert_eq!(program_stem("npm.bat"), "npm.bat");
    }

    #[test]
    fn allows_listed_programs_by_name_and_absolute_path() {
        assert!(authorize_program("git", &patterns()).is_ok());
        assert!(authorize_program("python3.12", &patterns()).is_ok());
        assert!(authorize_program("/opt/homebrew/bin/node", &patterns()).is_ok());
        #[cfg(windows)]
        assert!(authorize_program("C:\\Python312\\python.exe", &patterns()).is_ok());
    }

    #[test]
    fn rejects_everything_else() {
        let kind = |p: &str| authorize_program(p, &patterns()).unwrap_err().kind;
        assert_eq!(kind("sh"), FailureKind::NotAllowed);
        assert_eq!(kind("/bin/sh"), FailureKind::NotAllowed);
        assert_eq!(kind("rm"), FailureKind::NotAllowed);
        assert_eq!(kind("git;rm"), FailureKind::NotAllowed);
        assert_eq!(kind("npm.bat"), FailureKind::NotAllowed);
        assert_eq!(kind("python-evil"), FailureKind::NotAllowed);
        assert_eq!(kind("./git"), FailureKind::InvalidArgument);
        assert_eq!(kind("bin/git"), FailureKind::InvalidArgument);
        assert_eq!(kind(""), FailureKind::InvalidArgument);
        assert_eq!(kind("  "), FailureKind::InvalidArgument);
    }

    #[test]
    fn empty_scope_denies_all() {
        assert_eq!(
            authorize_program("git", &[]).unwrap_err().kind,
            FailureKind::NotAllowed
        );
    }

    #[test]
    fn command_exists_rejects_paths_and_unlisted_names() {
        let path = std::env::var_os("PATH").unwrap();
        assert_eq!(
            command_exists("/bin/sh", &patterns(), &path, &[])
                .unwrap_err()
                .kind,
            FailureKind::NotAllowed
        );
        assert_eq!(
            command_exists("/usr/bin/git", &patterns(), &path, &[])
                .unwrap_err()
                .kind,
            FailureKind::InvalidArgument
        );
        assert_eq!(
            command_exists("sh", &patterns(), &path, &[])
                .unwrap_err()
                .kind,
            FailureKind::NotAllowed
        );
    }

    #[cfg(unix)]
    mod unix {
        use super::*;
        use std::os::unix::fs::PermissionsExt;

        fn sh(script: &str, options: &RunOptions) -> Result<RunOutput, RunFailure> {
            run("/bin/sh", &["-c".to_string(), script.to_string()], options)
        }

        #[test]
        fn captures_output_and_zero_exit() {
            let out = sh("echo out; echo err 1>&2", &RunOptions::default()).unwrap();
            assert_eq!(out.code, 0);
            assert_eq!(out.stdout, "out\n");
            assert_eq!(out.stderr, "err\n");
        }

        #[test]
        fn non_zero_exit_is_data() {
            let out = sh("echo partial; exit 3", &RunOptions::default()).unwrap();
            assert_eq!(out.code, 3);
            assert_eq!(out.stdout, "partial\n");
        }

        #[test]
        fn no_shell_interpretation_of_arguments() {
            let out = run(
                "/bin/echo",
                &["$HOME; echo injected".to_string()],
                &RunOptions::default(),
            )
            .unwrap();
            assert_eq!(out.stdout, "$HOME; echo injected\n");
        }

        #[test]
        fn missing_program_is_enoent() {
            let err = run("/nonexistent/program", &[], &RunOptions::default()).unwrap_err();
            assert_eq!(err.kind, FailureKind::Spawn);
            assert_eq!(err.code.as_deref(), Some("ENOENT"));
        }

        #[test]
        fn non_executable_file_is_eacces() {
            let dir = std::env::temp_dir().join(format!("tq-exec-eacces-{}", std::process::id()));
            std::fs::create_dir_all(&dir).unwrap();
            let file = dir.join("plain");
            std::fs::write(&file, "x").unwrap();
            std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o644)).unwrap();
            let err = run(file.to_str().unwrap(), &[], &RunOptions::default()).unwrap_err();
            std::fs::remove_dir_all(&dir).unwrap();
            assert_eq!(err.kind, FailureKind::Spawn);
            assert_eq!(err.code.as_deref(), Some("EACCES"));
        }

        #[test]
        fn cwd_is_applied_and_missing_cwd_fails() {
            let options = RunOptions {
                cwd: Some("/".to_string()),
                ..Default::default()
            };
            assert_eq!(sh("pwd", &options).unwrap().stdout, "/\n");
            let bad = RunOptions {
                cwd: Some("/nonexistent/dir".to_string()),
                ..Default::default()
            };
            assert_eq!(sh("pwd", &bad).unwrap_err().code.as_deref(), Some("ENOENT"));
        }

        #[test]
        fn env_replaces_the_environment() {
            let mut env = HashMap::new();
            env.insert("TQ_ONLY".to_string(), "yes".to_string());
            let options = RunOptions {
                env: Some(env),
                ..Default::default()
            };
            let out = sh("echo \"$TQ_ONLY:${HOME:-unset}\"", &options).unwrap();
            assert_eq!(out.stdout, "yes:unset\n");
        }

        #[test]
        fn timeout_kills_and_keeps_partial_output() {
            let options = RunOptions {
                timeout_ms: Some(200),
                ..Default::default()
            };
            let err = sh("echo started; sleep 5", &options).unwrap_err();
            assert_eq!(err.kind, FailureKind::Timeout);
            assert!(err.killed);
            assert_eq!(err.stdout, "started\n");
        }

        #[test]
        fn max_buffer_kills_the_process() {
            let options = RunOptions {
                max_buffer: Some(1024),
                timeout_ms: Some(10_000),
                ..Default::default()
            };
            let err = sh("yes aaaaaaaa", &options).unwrap_err();
            assert_eq!(err.kind, FailureKind::MaxBuffer);
            assert!(err.killed);
        }

        #[test]
        fn signal_exit_is_a_failure() {
            let err = sh("kill -9 $$", &RunOptions::default()).unwrap_err();
            assert_eq!(err.kind, FailureKind::Signal);
            assert!(!err.killed);
        }

        #[test]
        fn path_lookup_finds_executables_only() {
            let dir = std::env::temp_dir().join(format!("tq-exec-path-{}", std::process::id()));
            std::fs::create_dir_all(&dir).unwrap();
            let exe = dir.join("git");
            std::fs::write(&exe, "#!/bin/sh\n").unwrap();
            std::fs::set_permissions(&exe, std::fs::Permissions::from_mode(0o755)).unwrap();
            let node = dir.join("node");
            std::fs::write(&node, "x").unwrap();
            std::fs::set_permissions(&node, std::fs::Permissions::from_mode(0o644)).unwrap();
            let path = std::env::join_paths([&dir]).unwrap();
            assert!(command_exists("git", &patterns(), &path, &[]).unwrap());
            assert!(!command_exists("node", &patterns(), &path, &[]).unwrap());
            assert!(!command_exists("npm", &patterns(), &path, &[]).unwrap());
            std::fs::remove_dir_all(&dir).unwrap();
        }
    }
}
