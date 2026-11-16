//! The fs scopes of `capabilities/platform.json`, evaluated by Tauri's real
//! scope matcher (`tauri::fs::Scope`, built the way tauri-plugin-fs builds the
//! per-command scope in `resolve_path`) against the paths the app uses for the
//! QuestIDE saved code: `<config dir>/TerminalQuest/QuestIDE/<level>/<objective>/user_code.js`
//! (config.js `codeStoragePath`, QuestIDE.jsx, ValidationHelper.getQuestIdeUserCode,
//! ClearDataButton).
//!
//! Only `is_allowed` is called: nothing is created, read or removed. Not
//! covered: the plugin's own checks around the scope (symlink resolution, the
//! command ACL itself), which need a webview.

use std::path::{Path, PathBuf};

use serde_json::Value;
use tauri::scope::fs::Scope;
use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};
use tauri::utils::config::FsScope;
use tauri::Manager;

fn capability() -> Value {
    serde_json::from_str(include_str!("../capabilities/platform.json")).unwrap()
}

/// The `allow` entries of the permission `identifier`, with variables such as
/// `$CONFIG` still in them.
fn allowed_paths(identifier: &str) -> Vec<PathBuf> {
    let capability = capability();
    let permission = capability["permissions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["identifier"] == identifier)
        .unwrap_or_else(|| panic!("{identifier} is not in platform.json"));
    permission["allow"]
        .as_array()
        .unwrap()
        .iter()
        .map(|entry| PathBuf::from(entry["path"].as_str().unwrap()))
        .collect()
}

fn app() -> tauri::App<MockRuntime> {
    mock_builder().build(mock_context(noop_assets())).unwrap()
}

fn scope(app: &tauri::App<MockRuntime>, identifier: &str) -> Scope {
    Scope::new(
        app,
        &FsScope::Scope {
            allow: allowed_paths(identifier),
            deny: Vec::new(),
            require_literal_leading_dot: None,
        },
    )
    .unwrap()
}

fn questide_dir(app: &tauri::App<MockRuntime>) -> PathBuf {
    app.path()
        .config_dir()
        .unwrap()
        .join("TerminalQuest")
        .join("QuestIDE")
}

/// What QuestIDE needs, per fs permission: writeAsync = mkdir (recursive, on
/// the parent) + write_text_file; loadSavedCode = stat + read_text_file;
/// validators = read_text_file; Clear Data = lstat + remove of QuestIDE.
const QUESTIDE_PERMISSIONS: [&str; 7] = [
    "fs:allow-mkdir",
    "fs:allow-write-text-file",
    "fs:allow-read-text-file",
    "fs:allow-stat",
    "fs:allow-lstat",
    "fs:allow-exists",
    "fs:allow-remove",
];

#[test]
fn questide_saved_code_is_allowed_for_every_operation_it_uses() {
    let app = app();
    let root = questide_dir(&app);
    let paths = [
        root.clone(),
        root.join("fog_owl"),
        root.join("fog_owl").join("js_node_env_setup"),
        root.join("fog_owl")
            .join("js_node_env_setup")
            .join("user_code.js"),
    ];
    for permission in QUESTIDE_PERMISSIONS {
        let scope = scope(&app, permission);
        for path in &paths {
            assert!(
                scope.is_allowed(path),
                "{permission} must allow {}",
                path.display()
            );
        }
    }
}

#[test]
fn the_lowercase_legacy_directory_is_allowed_too() {
    // config.js `userDataPath` (`<config dir>/terminalquest`): saves, store
    let app = app();
    let legacy = app.path().config_dir().unwrap().join("terminalquest");
    for permission in [
        "fs:allow-write-text-file",
        "fs:allow-mkdir",
        "fs:allow-remove",
    ] {
        let scope = scope(&app, permission);
        assert!(scope.is_allowed(legacy.join("config.json")), "{permission}");
    }
}

#[test]
fn nothing_outside_the_app_directories_is_writable() {
    let app = app();
    let config = app.path().config_dir().unwrap();
    let outside: Vec<PathBuf> = vec![
        config.clone(),
        config.join("Other").join("user_code.js"),
        // a sibling that only shares the prefix
        config.join("TerminalQuestX").join("QuestIDE").join("a.js"),
        app.path()
            .home_dir()
            .unwrap()
            .join("Documents")
            .join("a.js"),
        PathBuf::from("/tmp/user_code.js"),
    ];
    for permission in [
        "fs:allow-mkdir",
        "fs:allow-write-text-file",
        "fs:allow-write-file",
        "fs:allow-copy-file",
        "fs:allow-remove",
    ] {
        let scope = scope(&app, permission);
        for path in &outside {
            assert!(
                !scope.is_allowed(path),
                "{permission} must not allow {}",
                path.display()
            );
        }
    }
}

#[test]
fn the_bundled_resources_are_readable_but_not_writable() {
    // The mock app has no resource directory, so the entries are compared as
    // written (`$RESOURCE`, `$RESOURCE/**`).
    let resource = PathBuf::from("$RESOURCE/**");
    assert!(allowed_paths("fs:allow-read-text-file").contains(&resource));
    for permission in [
        "fs:allow-mkdir",
        "fs:allow-write-text-file",
        "fs:allow-write-file",
        "fs:allow-copy-file",
        "fs:allow-remove",
    ] {
        assert!(
            !allowed_paths(permission)
                .iter()
                .any(|p| p.to_string_lossy().contains("$RESOURCE")),
            "{permission} must not allow $RESOURCE"
        );
    }
}

/// The executable paths a learner types are outside every fs scope. This is
/// why the executable-path check is not an fs call (`path_exists` command).
#[test]
fn a_typed_executable_path_is_outside_the_fs_read_scopes() {
    let app = app();
    for permission in ["fs:allow-stat", "fs:allow-exists", "fs:allow-lstat"] {
        let scope = scope(&app, permission);
        for path in [
            "/usr/bin/python3",
            "/opt/homebrew/bin/node",
            "/usr/local/bin/git",
        ] {
            assert!(!scope.is_allowed(Path::new(path)), "{permission} {path}");
        }
    }
}
