/**
 * Shell contract.
 *
 * Wraps Electron 11's `shell`.
 *
 * Existing call sites (src/js/index.js):
 * - `shell.openExternal(url)` for external links; the call is not awaited
 *   today.
 * - `shell.openItem(path)` for the "Open User Data" and "Open Save File" menu
 *   items. `openItem` is deprecated in Electron 11 and returns a boolean.
 *
 * The plan for this ticket described only `openExternal` and `openPath`.
 * Because the real code calls `openItem`, the contract includes `openItem`
 * with its current semantics. `openPath` is also defined (available in
 * Electron 11) but has no caller yet. Replacing `openItem` with `openPath` at
 * the call sites changes behavior (boolean vs error string) and is left to a
 * later ticket.
 *
 * @typedef {Object} PlatformShell
 * @property {(url: string) => Promise<void>} openExternal
 *   Opens the URL with the OS default handler. Rejects if the OS reports a
 *   failure.
 * @property {(fullPath: string) => boolean} openItem
 *   Synchronous. Opens the file or folder with the OS default application.
 *   Returns whether the item was opened successfully; does not throw for a
 *   failure to open.
 * @property {(path: string) => Promise<void>} openPath
 *   Opens the file or folder. Electron resolves with an error string, empty on
 *   success; a non-empty string is converted to a rejection with
 *   `new Error(thatString)`.
 */
