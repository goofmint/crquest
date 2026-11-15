//! Quit confirmation: closing the main window asks first (OK quits, Cancel
//! keeps the app open). Implemented in Rust so that it does not depend on the
//! frontend having started, and needs no capability (the dialog is shown by
//! the backend, not invoked from a webview).

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{Manager, Window};
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

/// Asks whether to quit. Call after `prevent_close()`; the window is destroyed
/// only when the user chooses OK.
pub fn confirm_close(window: &Window) {
    let confirmation = window.state::<CloseConfirmation>();
    if !confirmation.begin() {
        return;
    }
    let target = window.clone();
    window
        .dialog()
        .message(DIALOG_MESSAGE)
        .title(DIALOG_TITLE)
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom(
            OK_LABEL.to_string(),
            CANCEL_LABEL.to_string(),
        ))
        .show(move |quit| {
            target.state::<CloseConfirmation>().finish();
            if quit {
                if let Err(error) = target.destroy() {
                    eprintln!("failed to close the window: {error}");
                }
            }
        });
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
