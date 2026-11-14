/**
 * Platform devtools module.
 *
 * Existing call sites:
 * - src/js/index.js (Help menu item): toggles devtools of the focused window.
 * - src/js/app/components/App.jsx (Konami code): opens devtools of the focused
 *   window.
 *
 * Both target the currently focused window, so neither function takes a window
 * argument. The focused window is looked up on every call
 * (`remote.BrowserWindow.getFocusedWindow()`); nothing touches Electron at
 * import time. When no window is focused, a descriptive Error is thrown
 * (previously a TypeError from dereferencing null); the call never silently
 * does nothing.
 *
 * Differs from the #5 contract only in the failure type: an explicit Error
 * with a descriptive message instead of an incidental TypeError.
 *
 * Out of scope: installing the React DevTools extension in main.js, and the
 * DEVTOOLS_WARNING console output done by the callers.
 *
 * @typedef {Object} PlatformDevtools
 * @property {() => void} openDevTools
 *   Synchronous. Opens devtools of the focused window. Throws if there is no
 *   focused window. Returns undefined.
 * @property {() => void} toggleDevTools
 *   Synchronous. Toggles devtools of the focused window. Throws if there is no
 *   focused window. Returns undefined.
 */
import { remote } from 'electron';

function getFocusedWebContents(action) {
  const win = remote.BrowserWindow.getFocusedWindow();
  if (!win) {
    throw new Error(`No focused window: cannot ${action} DevTools`);
  }
  return win.webContents;
}

export function openDevTools() {
  getFocusedWebContents('open').openDevTools();
}

export function toggleDevTools() {
  getFocusedWebContents('toggle').toggleDevTools();
}
