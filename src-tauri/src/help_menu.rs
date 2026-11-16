//! Help menu items of the Electron build ("Toggle Developer Tools", "Sync
//! Bundled Assets", "Open User Data", "Open Save File").
//!
//! The menu is built here, in the backend, because replacing the application
//! menu from JavaScript would drop the macOS menu that `close.rs` installs
//! (the Cmd+Q confirmation). The items are added to the existing Help submenu
//! (macOS) or to a menu that holds only Help (Windows and Linux, where the app
//! has no menu otherwise), **disabled**. A click is forwarded to the main
//! window as the `HELP_MENU_EVENT` event whose payload is the item id. What an
//! item does is decided in JavaScript (src/js/app/platform/tauri/menu.js),
//! which listens first and only then calls `enable_help_menu`, so that no click
//! can arrive before there is a listener.
//!
//! The ids, labels and the event name are mirrored in menu.js; keep both in
//! sync (the labels are the ones of src/js/index.jsx).

use tauri::menu::{Menu, MenuItem, Submenu, HELP_SUBMENU_ID};
use tauri::{AppHandle, Emitter, Runtime};

use crate::close::MAIN_WINDOW_LABEL;

pub const HELP_MENU_EVENT: &str = "help-menu-click";

struct HelpItem {
    id: &'static str,
    label: &'static str,
    /// DevTools are compiled into debug builds only (see `open_devtools` in
    /// lib.rs), so the item would only ever report a failure in a release
    /// build and is not created there.
    debug_only: bool,
}

const HELP_ITEMS: [HelpItem; 4] = [
    HelpItem {
        id: "help-toggle-devtools",
        label: "Toggle Developer Tools",
        debug_only: true,
    },
    HelpItem {
        id: "help-sync-assets",
        label: "Sync Bundled Assets",
        debug_only: false,
    },
    HelpItem {
        id: "help-open-user-data",
        label: "Open User Data",
        debug_only: false,
    },
    HelpItem {
        id: "help-open-save-file",
        label: "Open Save File",
        debug_only: false,
    },
];

fn available_items(debug_build: bool) -> impl Iterator<Item = &'static HelpItem> {
    HELP_ITEMS
        .iter()
        .filter(move |item| debug_build || !item.debug_only)
}

fn current_items() -> impl Iterator<Item = &'static HelpItem> {
    available_items(cfg!(debug_assertions))
}

/// True if `id` is one of the Help items of this module.
pub fn is_help_item(id: &str) -> bool {
    HELP_ITEMS.iter().any(|item| item.id == id)
}

/// Forwards a click on a Help item to the main window. Other ids are ignored
/// (they belong to `close.rs`).
pub fn on_menu_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    if !is_help_item(id) {
        return;
    }
    if let Err(error) = app.emit_to(MAIN_WINDOW_LABEL, HELP_MENU_EVENT, id) {
        eprintln!("failed to forward the Help menu click {id}: {error}");
    }
}

fn append_items<R: Runtime>(
    app: &AppHandle<R>,
    help: &Submenu<R>,
) -> Result<(), Box<dyn std::error::Error>> {
    for item in current_items() {
        help.append(&MenuItem::with_id(
            app,
            item.id,
            item.label,
            false,
            None::<&str>,
        )?)?;
    }
    Ok(())
}

/// Adds the disabled Help items. macOS: to the Help submenu of the menu that
/// `close::install_quit_menu` set (call it first); the menu is not replaced.
/// Windows and Linux: the app has no menu, so a menu with only Help is set.
pub fn install<R: Runtime>(app: &tauri::App<R>) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle();
    if let Some(menu) = app.menu() {
        let help = menu
            .get(HELP_SUBMENU_ID)
            .and_then(|kind| kind.as_submenu().cloned())
            .ok_or("the Help menu is missing")?;
        return append_items(handle, &help);
    }
    let help = Submenu::with_id(handle, HELP_SUBMENU_ID, "Help", true)?;
    append_items(handle, &help)?;
    app.set_menu(Menu::with_items(handle, &[&help])?)?;
    Ok(())
}

/// Enables the Help items. Called by the frontend after it started listening
/// for `HELP_MENU_EVENT`.
#[tauri::command]
pub fn enable_help_menu<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let menu = app.menu().ok_or("the application menu is missing")?;
    let help = menu
        .get(HELP_SUBMENU_ID)
        .and_then(|kind| kind.as_submenu().cloned())
        .ok_or("the Help menu is missing")?;
    for item in current_items() {
        help.get(item.id)
            .and_then(|kind| kind.as_menuitem().cloned())
            .ok_or_else(|| format!("the Help item {} is missing", item.id))?
            .set_enabled(true)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn ids_and_labels_are_unique() {
        let ids: HashSet<_> = HELP_ITEMS.iter().map(|item| item.id).collect();
        let labels: HashSet<_> = HELP_ITEMS.iter().map(|item| item.label).collect();
        assert_eq!(ids.len(), HELP_ITEMS.len());
        assert_eq!(labels.len(), HELP_ITEMS.len());
    }

    #[test]
    fn ids_do_not_collide_with_the_quit_item() {
        assert!(!is_help_item("quit-with-confirmation"));
    }

    #[test]
    fn debug_builds_have_all_items_in_the_electron_order() {
        let labels: Vec<_> = available_items(true).map(|item| item.label).collect();
        assert_eq!(
            labels,
            [
                "Toggle Developer Tools",
                "Sync Bundled Assets",
                "Open User Data",
                "Open Save File"
            ]
        );
    }

    #[test]
    fn release_builds_have_no_devtools_item() {
        let labels: Vec<_> = available_items(false).map(|item| item.label).collect();
        assert_eq!(
            labels,
            ["Sync Bundled Assets", "Open User Data", "Open Save File"]
        );
    }

    #[test]
    fn only_help_items_are_recognized() {
        assert!(is_help_item("help-open-save-file"));
        assert!(!is_help_item("help-unknown"));
        assert!(!is_help_item(""));
    }
}
