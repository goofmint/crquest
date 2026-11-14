/**
 * Dialog contract.
 *
 * Wraps Electron's `remote.dialog`.
 *
 * Existing call sites:
 * - showMessageBoxSync(null, options) in src/js/index.js, behind
 *   `window.confirm` (buttons ['OK', 'Cancel'], defaultId 0, cancelId 1) and
 *   `window.alert` (buttons ['OK']). The result is compared with 0 by the
 *   caller.
 * - showOpenDialog(options) in
 *   src/js/app/components/menu/settings/Extensions.jsx with `title`,
 *   `message`, `buttonLabel`, `properties: ['openDirectory']` and an optional
 *   `defaultPath`. The caller reads `filePaths[0]` and treats a falsy value as
 *   "nothing chosen".
 *
 * Other Electron 11 options of the same methods are passed through untouched;
 * the platform layer neither validates nor defaults options.
 *
 * @typedef {Object} PlatformMessageBoxOptions
 * @property {string} [type] - 'none' | 'info' | 'error' | 'question' | 'warning'
 * @property {string[]} [buttons]
 * @property {number} [defaultId]
 * @property {number} [cancelId]
 * @property {string} [title]
 * @property {string} [message]
 * @property {string} [detail]
 *
 * @typedef {Object} PlatformOpenDialogOptions
 * @property {string} [title]
 * @property {string} [message] - macOS
 * @property {string} [buttonLabel]
 * @property {string} [defaultPath]
 * @property {string[]} [properties] - e.g. 'openFile', 'openDirectory'
 *
 * @typedef {Object} PlatformOpenDialogResult
 * @property {boolean} canceled
 * @property {string[]} filePaths
 *
 * @typedef {Object} PlatformDialog
 * @property {(window: null, options: PlatformMessageBoxOptions) => number} showMessageBoxSync
 *   Synchronous and blocking. Returns the index of the clicked button. It must
 *   not return a Promise, because `window.confirm` / `window.alert` are
 *   synchronous. The first argument is the parent window; existing callers
 *   always pass `null`. Throws on failure.
 * @property {(options: PlatformOpenDialogOptions) => Promise<PlatformOpenDialogResult>} showOpenDialog
 *   Resolves with `{ canceled, filePaths }`. Cancellation is a normal result
 *   (`canceled: true`, empty `filePaths`), not a rejection. Any other failure
 *   rejects.
 */
