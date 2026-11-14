/**
 * Shell contract.
 *
 * Wraps Electron 11's `shell`.
 *
 * Existing call sites (src/js/index.js):
 * - `shell.openExternal(url)` for external links; the call is not awaited
 *   today.
 * - `shell.openItem(path)` for the "Open User Data" and "Open Save File" menu
 *   items. This API does NOT exist in Electron 11.5.0 (`typeof
 *   shell.openItem === 'undefined'`, verified at runtime; it was replaced by
 *   `shell.openPath` in Electron 9), so those two menu items currently throw
 *   a TypeError. The contract therefore does not define `openItem`; fixing the
 *   call sites to use `openPath` is tracked as a separate ticket.
 *
 * @typedef {Object} PlatformShell
 * @property {(url: string) => Promise<void>} openExternal
 *   Opens the URL with the OS default handler. Rejects if the OS reports a
 *   failure.
 * @property {(path: string) => Promise<void>} openPath
 *   Opens the file or folder. Electron resolves with an error string, empty on
 *   success; a non-empty string is converted to a rejection with
 *   `new Error(thatString)`.
 */

export {};
