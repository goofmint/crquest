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
//! The ids and event name are mirrored in menu.js. The initial labels are in
//! English; the frontend supplies the selected language after startup.

use std::collections::HashMap;
use tauri::menu::{Menu, MenuItem, Submenu, HELP_SUBMENU_ID};
use tauri::{AppHandle, Emitter, Manager, Runtime, State};

use crate::close::{CloseConfirmation, CloseDialogText, MAIN_WINDOW_LABEL};

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
) -> Result<Vec<MenuItem<R>>, tauri::Error> {
    current_items()
        .map(|item| {
            let menu_item = MenuItem::with_id(app, item.id, item.label, false, None::<&str>)?;
            help.append(&menu_item)?;
            Ok(menu_item)
        })
        .collect()
}

pub struct ShellMenu<R: Runtime> {
    help: Submenu<R>,
    help_items: Vec<MenuItem<R>>,
    #[cfg(target_os = "macos")]
    quit: MenuItem<R>,
}

fn apply_label<E>(
    menu_labels: &HashMap<String, String>,
    id: &str,
    set_text: impl FnOnce(&str) -> Result<(), E>,
) -> Result<(), E> {
    if let Some(label) = menu_labels.get(id) {
        set_text(label)?;
    }
    Ok(())
}

impl<R: Runtime> ShellMenu<R> {
    fn set_labels(&self, labels: &HashMap<String, String>) -> tauri::Result<()> {
        apply_label(labels, "help", |text| self.help.set_text(text))?;
        for item in &self.help_items {
            apply_label(labels, item.id().as_ref(), |text| item.set_text(text))?;
        }
        #[cfg(target_os = "macos")]
        apply_label(labels, crate::close::QUIT_MENU_ID, |text| {
            self.quit.set_text(text)
        })?;
        Ok(())
    }
}

/// Adds the disabled Help items. macOS: to the Help submenu of the menu that
/// `close::install_quit_menu` set (call it first); the menu is not replaced.
/// Windows and Linux: the app has no menu, so a menu with only Help is set.
pub fn install<R: Runtime>(
    app: &tauri::App<R>,
    #[cfg(target_os = "macos")] quit: MenuItem<R>,
) -> Result<ShellMenu<R>, Box<dyn std::error::Error>> {
    let handle = app.handle();
    let existing_menu = app.menu();
    let help = if let Some(menu) = &existing_menu {
        menu.get(HELP_SUBMENU_ID)
            .and_then(|kind| kind.as_submenu().cloned())
            .ok_or("the Help menu is missing")?
    } else {
        Submenu::with_id(handle, HELP_SUBMENU_ID, "Help", true)?
    };
    let help_items = append_items(handle, &help)?;
    if existing_menu.is_none() {
        app.set_menu(Menu::with_items(handle, &[&help])?)?;
    }
    Ok(ShellMenu {
        help,
        help_items,
        #[cfg(target_os = "macos")]
        quit,
    })
}

/// Enables the Help items. Called by the frontend after it started listening
/// for `HELP_MENU_EVENT`.
#[tauri::command]
pub fn enable_help_menu<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let menu = app.state::<ShellMenu<R>>();
    for item in &menu.help_items {
        item.set_enabled(true).map_err(|error| error.to_string())?;
    }
    Ok(())
}

/// Refreshes the labels of existing menu items and the close confirmation.
#[tauri::command]
pub fn set_shell_texts<R: Runtime>(
    app: AppHandle<R>,
    confirmation: State<'_, CloseConfirmation>,
    menu_labels: HashMap<String, String>,
    close_dialog: CloseDialogText,
) -> Result<(), String> {
    confirmation.set_text(close_dialog)?;
    app.state::<ShellMenu<R>>()
        .set_labels(&menu_labels)
        .map_err(|error| error.to_string())
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

    #[test]
    fn applies_only_the_label_for_the_menu_item() {
        let labels = HashMap::from([
            (
                "help-open-save-file".to_string(),
                "セーブファイルを開く".to_string(),
            ),
            ("unknown".to_string(), "無視する".to_string()),
        ]);
        let mut updates = Vec::new();
        for item in available_items(true) {
            apply_label(&labels, item.id, |text| {
                updates.push((item.id, text.to_string()));
                Ok::<_, ()>(())
            })
            .unwrap();
        }
        assert_eq!(
            updates,
            [("help-open-save-file", "セーブファイルを開く".to_string())]
        );
    }
}
