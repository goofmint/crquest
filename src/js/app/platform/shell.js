/**
 * Platform shell module.
 *
 * Wraps Electron 11's `shell`. Nothing touches Electron at import time.
 *
 * Existing call sites:
 * - src/js/index.js: external links (`openExternal`); the call is not
 *   awaited today and still is not.
 * - src/js/index.js: `openPath` for the "Open User Data" and "Open Save File"
 *   menu items (replaces `shell.openItem`, which does not exist in Electron
 *   11.5.0; #76). The menu click handlers do not await or catch it, so a
 *   rejection surfaces as an unhandled rejection, like `openExternal`.
 *
 * `openExternal` passes the url straight to `shell.openExternal` with no
 * options and returns its Promise as-is (no catch, logging or validation).
 * `openPath` delegates to `shell.openPath`, which resolves with an error
 * string (empty on success); a non-empty string becomes a rejection with
 * `new Error(thatString)`.
 *
 * @typedef {Object} PlatformShell
 * @property {(url: string) => Promise<void>} openExternal
 *   Opens the URL with the OS default handler. Returns the Promise from
 *   Electron unchanged.
 * @property {(path: string) => Promise<void>} openPath
 *   Opens the file or folder with the OS default handler. Resolves on
 *   success; rejects with `Error(message)` when Electron reports a failure
 *   string, and propagates Electron's own rejection unchanged.
 */
import { shell } from 'electron';

export function openExternal(url) {
  return shell.openExternal(url);
}

export async function openPath(path) {
  const errorMessage = await shell.openPath(path);
  if (errorMessage !== '') {
    throw new Error(errorMessage);
  }
}
