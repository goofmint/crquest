/**
 * Platform devtools module (Tauri). Same exports as ../devtools.js.
 *
 * The Rust commands act on the window that calls them (the app has one
 * window), and exist in debug builds only; in a release build they reject.
 * The Electron functions are synchronous and throw when no window is
 * focused. These cannot be: the call is dispatched and returns undefined, and
 * a failure (release build) surfaces as an unhandled promise rejection, like
 * `shell.openExternal` call sites that do not await.
 */
import { invoke } from '@tauri-apps/api/core';
import { rejectAsError } from './errors';

export function openDevTools() {
  rejectAsError(invoke('open_devtools'));
}

export function toggleDevTools() {
  rejectAsError(invoke('toggle_devtools'));
}
