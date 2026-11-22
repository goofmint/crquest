fn main() {
    // The Supabase connection is fixed at build time (src/auth/config.rs).
    println!("cargo:rerun-if-env-changed=TERMINALQUEST_SUPABASE_URL");
    println!("cargo:rerun-if-env-changed=TERMINALQUEST_SUPABASE_PUBLISHABLE_KEY");

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
            "auth_status",
            "auth_start_login",
            "auth_cancel_login",
            "auth_logout",
            "cloud_save_fetch",
            "cloud_save_upload",
            "unlock_code_redeem",
            "tree_planting_record",
            "group_join",
            "group_leave",
            "group_list",
            "live_events_list",
            "live_events_ranking",
            "live_events_team_ranking",
            "live_events_join",
            "live_events_update",
            "live_events_status",
        ]),
    ))
    .expect("failed to run tauri-build");
}
