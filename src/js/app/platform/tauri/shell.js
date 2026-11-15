/**
 * Platform shell module (Tauri). Same exports as ../shell.js, on
 * @tauri-apps/plugin-opener. `openUrl` is limited to http(s) and `openPath`
 * to the user data directories by the capability scope.
 */
import { openUrl, openPath as openerOpenPath } from '@tauri-apps/plugin-opener';
import { rejectAsError } from './errors';

export function openExternal(url) {
  return rejectAsError(openUrl(url));
}

export function openPath(path) {
  return rejectAsError(openerOpenPath(path));
}
