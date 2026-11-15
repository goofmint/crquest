/**
 * Platform menu module (Tauri). Same exports as ../menu.js.
 *
 * Decision D2 (docs/migration/tauri-runtime.md): the first launch milestone
 * adds no menu items. This is an explicit no-op, not a fallback: the items
 * ("Toggle Developer Tools", "Sync Bundled Assets", "Open User Data",
 * "Open Save File") are not reachable from the Tauri build until W10, which
 * implements them with the Tauri menu API. Replacing the application menu from
 * JavaScript is deliberately avoided here: it would replace the macOS menu that
 * src-tauri/src/close.rs builds (Cmd+Q confirmation). DevTools stay reachable
 * through the shortcut installed by src/js/tauriShell.js.
 */
export function addHelpMenuItems() {}
