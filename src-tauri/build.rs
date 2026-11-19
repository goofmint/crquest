fn main() {
    // App commands are listed so that each one gets an `allow-*` permission
    // and can only be called from windows whose capability grants it.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "run_command",
            "command_exists",
            "path_exists",
            "is_dev",
            "open_devtools",
            "toggle_devtools",
            "enable_help_menu",
            "set_shell_texts",
        ]),
    ))
    .expect("failed to run tauri-build");
}
