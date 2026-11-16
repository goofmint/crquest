/**
 * Platform layer (Tauri).
 *
 * Wraps every access that the renderer code makes to the host: paths, dialogs,
 * the persistent store, the file system, the shell, command execution,
 * devtools, the help menu, environment values, resource URLs and conversation
 * template rendering. The code lives in ./tauri/. Each file in this directory
 * (`paths.js`, `fs.js`, ...) only re-exports the file of the same name there,
 * so callers and tests keep importing `platform/<name>`.
 *
 * Shared conventions for every area:
 * - A synchronous function reports failure by throwing. An asynchronous
 *   function reports failure by returning a rejected Promise.
 * - No fallbacks: a missing value is never replaced by a default.
 * - No logging and no retries. Errors of the Tauri plugins are turned into
 *   `Error` objects (with `code` where Node code reads it) by ./tauri/errors.js,
 *   and nothing else is translated.
 * - Results that the API defines as normal values (a missing key in the store
 *   is `undefined`, a cancelled open dialog resolves with `canceled: true`, a
 *   missing path in the fs functions is `undefined` / `false`) stay normal
 *   values.
 * - Error handling that exists in callers (for example mapping `ENOENT` to
 *   `false`, logging then returning `undefined`, or converting errors to
 *   validation tuples) stays in the callers.
 * - `initPlatform()` (init.js) must have completed before any other function
 *   is called; the Tauri entry (tauriIndex.jsx) awaits it first.
 */

export {};
