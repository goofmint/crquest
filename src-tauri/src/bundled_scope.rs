//! Access to `<extension directory>/.bundled` for the directory the user chose.
//!
//! "Sync Bundled Assets" (assetLoader.js `syncBundledAssets`) removes and
//! re-creates `<extension directory>/.bundled` (a hidden directory), and the
//! tileset loader reads images from it. The dialog allows the chosen directory
//! and `<dir>/**` in the fs and asset protocol scopes, but on Unix a glob `**`
//! does not match a leading-dot name (`require_literal_leading_dot` is true by
//! default), so `.bundled` would be denied (lstat / remove / copy / mkdir /
//! read). This plugin adds exactly `<dir>/.bundled` and `<dir>/.bundled/**` to
//! the scope that received `<dir>`; nothing else (dotfiles elsewhere stay
//! hidden, `requireLiteralLeadingDot` is not turned off).
//!
//! It must be registered after the fs plugin and BEFORE
//! `tauri-plugin-persisted-scope`, so that the restore at startup (which
//! replays `allow_directory`) goes through the same listener.

use std::path::{Path, PathBuf};

use tauri::fs::Scope;
use tauri::plugin::{Builder, TauriPlugin};
use tauri::scope::fs::Event;
use tauri::{Manager, Runtime};
use tauri_plugin_fs::FsExt;

/// Same value as `BUNDLED_ASSET_DIRECTORY` in src/js/app/common/extensions.js.
pub const BUNDLED_DIRECTORY: &str = ".bundled";

/// The `.bundled` directory to allow for an allowed directory `path`; `None`
/// when `path` is itself a `.bundled` directory (the one this plugin adds, or
/// a restored one), which ends the recursion.
pub fn bundled_child(path: &Path) -> Option<PathBuf> {
    if path
        .file_name()
        .is_some_and(|name| name == BUNDLED_DIRECTORY)
    {
        return None;
    }
    Some(path.join(BUNDLED_DIRECTORY))
}

fn follow(scope: &Scope) {
    let target = scope.clone();
    scope.listen(move |event| {
        if let Event::PathAllowed(path) = event {
            if !path.is_dir() {
                return;
            }
            if let Some(bundled) = bundled_child(path) {
                if let Err(error) = target.allow_directory(&bundled, true) {
                    eprintln!("failed to allow {}: {error}", bundled.display());
                }
            }
        }
    });
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("bundled-scope")
        .setup(|app, _api| {
            follow(&app.fs_scope());
            follow(&app.asset_protocol_scope());
            Ok(())
        })
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_chosen_directory_gets_its_bundled_child() {
        assert_eq!(
            bundled_child(Path::new("/home/u/ext")),
            Some(PathBuf::from("/home/u/ext/.bundled"))
        );
    }

    #[test]
    fn the_bundled_directory_itself_is_not_expanded_again() {
        assert_eq!(bundled_child(Path::new("/home/u/ext/.bundled")), None);
    }

    #[test]
    fn other_dot_directories_are_not_special() {
        assert_eq!(
            bundled_child(Path::new("/home/u/.ext")),
            Some(PathBuf::from("/home/u/.ext/.bundled"))
        );
    }

    #[test]
    fn the_unix_glob_does_not_reach_the_hidden_directory_without_it() {
        let options = glob::MatchOptions {
            require_literal_separator: true,
            require_literal_leading_dot: true,
            ..Default::default()
        };
        let recursive = glob::Pattern::new("/home/u/ext/**").unwrap();
        let bundled = glob::Pattern::new("/home/u/ext/.bundled/**").unwrap();
        assert!(!recursive.matches_with("/home/u/ext/.bundled", options));
        assert!(!recursive.matches_with("/home/u/ext/.bundled/tilesets/a.png", options));
        assert!(bundled.matches_with("/home/u/ext/.bundled/tilesets/a.png", options));
        assert!(bundled.matches_with("/home/u/ext/.bundled/objects/x/y.png", options));
        assert!(!bundled.matches_with("/home/u/ext/.other/a.png", options));
    }
}
