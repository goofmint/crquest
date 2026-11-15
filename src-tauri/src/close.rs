//! Quit confirmation: closing the main window asks first (OK quits, Cancel
//! keeps the app open). Implemented in Rust so that it does not depend on the
//! frontend having started, and needs no capability (the dialog is shown by
//! the backend, not invoked from a webview).

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{Manager, Runtime, Window};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

/// Label of the only window (`app.windows[0].label` in tauri.conf.json).
pub const MAIN_WINDOW_LABEL: &str = "main";

const DIALOG_TITLE: &str = "TerminalQuest";
const DIALOG_MESSAGE: &str = "Are you sure you want to quit TerminalQuest?";
const OK_LABEL: &str = "OK";
const CANCEL_LABEL: &str = "Cancel";

/// Tracks whether a confirmation dialog is already open, so that repeated
/// close requests (clicking the close button again, Cmd+W) do not stack
/// dialogs.
#[derive(Default)]
pub struct CloseConfirmation {
    open: AtomicBool,
}

impl CloseConfirmation {
    /// Returns true if the caller may show the dialog (none is open yet) and
    /// marks one as open.
    pub fn begin(&self) -> bool {
        !self.open.swap(true, Ordering::SeqCst)
    }

    /// Marks the dialog as closed.
    pub fn finish(&self) {
        self.open.store(false, Ordering::SeqCst);
    }
}

/// Asks whether to quit and runs `on_confirmed` only when the user chooses
/// OK. Does nothing while a dialog is already open.
fn ask_to_quit<R: Runtime, M: Manager<R>>(
    manager: &M,
    on_confirmed: impl FnOnce() + Send + 'static,
) {
    let confirmation = manager.state::<CloseConfirmation>();
    if !confirmation.begin() {
        return;
    }
    let app = manager.app_handle().clone();
    manager
        .dialog()
        .message(DIALOG_MESSAGE)
        .title(DIALOG_TITLE)
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom(
            OK_LABEL.to_string(),
            CANCEL_LABEL.to_string(),
        ))
        .show(move |quit| {
            app.state::<CloseConfirmation>().finish();
            if quit {
                on_confirmed();
            }
        });
}

/// Window close (close button, Cmd+W, Alt+F4). Call after `prevent_close()`;
/// the window is destroyed only when the user chooses OK.
pub fn confirm_close<R: Runtime>(window: &Window<R>) {
    let target = window.clone();
    ask_to_quit(window, move || {
        if let Err(error) = target.destroy() {
            eprintln!("failed to close the window: {error}");
        }
    });
}

#[cfg(target_os = "macos")]
const QUIT_MENU_ID: &str = "quit-with-confirmation";

/// macOS: the standard Quit item (Cmd+Q, app menu) calls `terminate:`, which
/// the runtime only reports after the fact (`RunEvent::Exit`): it emits neither
/// `CloseRequested` nor a cancelable `ExitRequested`, so it would bypass the
/// confirmation. The app menu's Quit is replaced by an item that asks first.
/// The Dock's Quit also calls `terminate:` and cannot be intercepted.
#[cfg(target_os = "macos")]
pub fn install_quit_menu<R: Runtime>(
    app: &tauri::App<R>,
) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::menu::{Menu, MenuItemBuilder};

    let handle = app.handle();
    let menu = Menu::default(handle)?;
    let app_submenu = menu
        .items()?
        .into_iter()
        .next()
        .and_then(|item| item.as_submenu().cloned())
        .ok_or("the app menu is missing")?;
    // Menu::default puts the predefined Quit item last in the app submenu.
    let quit = app_submenu.items()?.pop().ok_or("the app menu is empty")?;
    app_submenu.remove(&quit)?;
    app_submenu.append(
        &MenuItemBuilder::with_id(QUIT_MENU_ID, format!("Quit {DIALOG_TITLE}"))
            .accelerator("CmdOrCtrl+Q")
            .build(handle)?,
    )?;
    app.set_menu(menu)?;
    Ok(())
}

/// Handles the replaced Quit item: confirm, then exit (no window close is
/// involved, so there is no second prompt).
#[cfg(target_os = "macos")]
pub fn on_menu_event<R: Runtime>(app: &tauri::AppHandle<R>, id: &str) {
    if id == QUIT_MENU_ID {
        let handle = app.clone();
        ask_to_quit(app, move || handle.exit(0));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_one_dialog_can_be_open() {
        let confirmation = CloseConfirmation::default();
        assert!(confirmation.begin());
        assert!(!confirmation.begin());
    }

    #[test]
    fn a_dialog_can_be_shown_again_after_it_finished() {
        let confirmation = CloseConfirmation::default();
        assert!(confirmation.begin());
        confirmation.finish();
        assert!(confirmation.begin());
    }
}
