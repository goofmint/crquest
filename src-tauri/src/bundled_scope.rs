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

    // The real scope objects of a (mock) app with the plugins registered in the
    // order of lib.rs. A directory is added through the same call the dialog
    // makes (`allow_directory`, recursive) and the persisted-scope restore
    // replays; the real `is_allowed` decides. Gap: persisted-scope itself is not
    // registered here (it writes into the real app data directory); its restore
    // is the same `allow_directory` call on these scopes (see its source).
    mod real_scope {
        use super::*;
        use std::fs::create_dir_all;
        use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};

        struct Fixture {
            root: PathBuf,
            app: tauri::App<MockRuntime>,
        }

        fn fixture(name: &str) -> Fixture {
            let root = std::env::temp_dir()
                .join(format!("tq-bundled-scope-{name}-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&root);
            for dir in [
                ".bundled/tilesets",
                ".bundled/objects/a",
                ".other",
                ".git",
                "ext1",
            ] {
                create_dir_all(root.join(dir)).unwrap();
            }
            for file in [
                ".bundled/tilesets/t.png",
                ".bundled/objects/a/o.png",
                ".other/x.txt",
                ".git/config",
                "ext1/e.txt",
            ] {
                std::fs::write(root.join(file), b"x").unwrap();
            }
            let app = mock_builder()
                .plugin(tauri_plugin_fs::init())
                .plugin(init())
                .build(mock_context(noop_assets()))
                .unwrap();
            Fixture {
                root: root.canonicalize().unwrap(),
                app,
            }
        }

        fn check(scope: &Scope, root: &Path) {
            for allowed in [
                "",
                "ext1",
                "ext1/e.txt",
                ".bundled",
                ".bundled/tilesets",
                ".bundled/tilesets/t.png",
                ".bundled/objects/a",
                ".bundled/objects/a/o.png",
            ] {
                assert!(
                    scope.is_allowed(root.join(allowed)),
                    "{allowed} must be allowed"
                );
            }
            // Other hidden directories: the default of `require_literal_leading_dot`
            // is true on Unix and false on Windows (tauri scope/fs.rs), so a
            // recursive allow of the parent hides them on Unix only. Not run on
            // Windows by the author; the Windows branch states its default.
            for hidden in [".other", ".other/x.txt", ".git", ".git/config"] {
                #[cfg(unix)]
                assert!(
                    !scope.is_allowed(root.join(hidden)),
                    "{hidden} must not be allowed"
                );
                #[cfg(windows)]
                assert!(
                    scope.is_allowed(root.join(hidden)),
                    "{hidden} is allowed by the Windows default"
                );
            }
        }
        }

        #[test]
        fn selection_allows_bundled_only_in_fs_and_asset_scopes() {
            let f = fixture("select");
            f.app.fs_scope().allow_directory(&f.root, true).unwrap();
            f.app
                .asset_protocol_scope()
                .allow_directory(&f.root, true)
                .unwrap();
            check(&f.app.fs_scope(), &f.root);
            check(&f.app.asset_protocol_scope(), &f.root);
            let _ = std::fs::remove_dir_all(&f.root);
        }

        #[test]
        fn restore_replays_allow_directory_and_gets_the_same_result() {
            let f = fixture("restore");
            // persisted-scope restores `<dir>` and `<dir>/**` entries, then
            // (for saved `.bundled` entries) `<dir>/.bundled` again
            f.app.fs_scope().allow_directory(&f.root, true).unwrap();
            f.app
                .fs_scope()
                .allow_directory(f.root.join(".bundled"), true)
                .unwrap();
            f.app
                .asset_protocol_scope()
                .allow_directory(&f.root, true)
                .unwrap();
            f.app
                .asset_protocol_scope()
                .allow_directory(f.root.join(".bundled"), true)
                .unwrap();
            check(&f.app.fs_scope(), &f.root);
            check(&f.app.asset_protocol_scope(), &f.root);
            let _ = std::fs::remove_dir_all(&f.root);
        }

        #[test]
        fn without_the_plugin_the_hidden_directory_follows_the_platform_default() {
            let f = fixture("baseline");
            let app = mock_builder()
                .plugin(tauri_plugin_fs::init())
                .build(mock_context(noop_assets()))
                .unwrap();
            app.fs_scope().allow_directory(&f.root, true).unwrap();
            assert!(app.fs_scope().is_allowed(f.root.join("ext1/e.txt")));
            let hidden_file = f.root.join(".bundled/tilesets/t.png");
            // Unix default: `**` does not match a leading dot. Windows default
            // (`require_literal_leading_dot` false): it does, so no plugin is
            // needed there (not run on Windows by the author).
            #[cfg(unix)]
            assert!(!app.fs_scope().is_allowed(&hidden_file));
            #[cfg(windows)]
            assert!(app.fs_scope().is_allowed(&hidden_file));
            let _ = std::fs::remove_dir_all(&f.root);
        }
    }
}
