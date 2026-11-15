/**
 * Platform devtools module (Tauri). Same exports as ../devtools.js.
 *
 * The Rust commands act on the window that calls them (the app has one
 * window), and exist in debug builds only; in a release build they reject.
 * The Electron functions are synchronous and throw when no window is
 * focused. These cannot be: they return a Promise<void> that rejects with an
 * Error on failure (release build). Callers that await it can report the
 * failure (src/js/tauriShell.js); a caller that does not (the Konami code in
 * App.jsx) gets an unhandled promise rejection, like `shell.openExternal` call
 * sites that do not await.
 */
import { invoke } from '@tauri-apps/api/core';
import { rejectAsError } from './errors';

export function openDevTools() {
  return rejectAsError(invoke('open_devtools'));
}

export function toggleDevTools() {
  return rejectAsError(invoke('toggle_devtools'));
}
