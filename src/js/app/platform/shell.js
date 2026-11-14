/**
 * Platform shell module.
 *
 * Wraps Electron 11's `shell`. Nothing touches Electron at import time.
 *
 * Existing call sites:
 * - src/js/index.js: external links (`openExternal`); the call is not
 *   awaited today and still is not.
 * - src/js/index.js: `shell.openItem(path)` for the "Open User Data" and "Open
 *   Save File" menu items. This API does NOT exist in Electron 11.5.0 (it was
 *   replaced by `shell.openPath` in Electron 9), so those two menu items
 *   currently throw a TypeError. They are intentionally left untouched here;
 *   `openPath` is NOT implemented in this module and comes with the openItem
 *   migration ticket (#76).
 *
 * Differs from the #5 contract: only `openExternal` is implemented; `openPath`
 * is deferred to #76. `openExternal` passes the url straight to
 * `shell.openExternal` with no options and returns its Promise as-is (no
 * catch, logging or validation).
 *
 * @typedef {Object} PlatformShell
 * @property {(url: string) => Promise<void>} openExternal
 *   Opens the URL with the OS default handler. Returns the Promise from
 *   Electron unchanged.
 */
import { shell } from 'electron';

export function openExternal(url) {
  return shell.openExternal(url);
}
