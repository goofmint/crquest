/**
 * Devtools contract.
 *
 * Existing call sites:
 * - src/js/index.js (Help menu item): `remote.BrowserWindow
 *   .getFocusedWindow().webContents.toggleDevTools()`
 * - src/js/app/components/App.jsx (Konami code, lines 34-40): `remote
 *   .BrowserWindow.getFocusedWindow().webContents.openDevTools()`
 *
 * Both target the currently focused window, so neither method takes a window
 * argument. `getFocusedWindow()` returns `null` when no window is focused; the
 * existing code then fails with a TypeError, and the contract keeps that: with
 * no target window the call throws and never silently does nothing.
 *
 * Out of scope: installing the React DevTools extension in main.js, and the
 * DEVTOOLS_WARNING console output done by the callers.
 *
 * @typedef {Object} PlatformDevtools
 * @property {() => void} openDevTools
 *   Synchronous. Opens devtools of the focused window. Throws if there is no
 *   focused window.
 * @property {() => void} toggleDevTools
 *   Synchronous. Toggles devtools of the focused window. Throws if there is no
 *   focused window.
 */

export {};
