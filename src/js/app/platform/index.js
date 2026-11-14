/**
 * Platform layer contracts (Phase 1, task 1-1).
 *
 * Purpose: the platform layer will eventually wrap every direct Electron /
 * Node.js access made by the renderer code (paths, dialogs, persistent store,
 * file system, shell, command execution, devtools) so that the backing runtime
 * can later be swapped (Electron 11 -> Tauri 2).
 *
 * This directory only DEFINES contracts as JSDoc. It contains no executable
 * statements and no imports, and nothing under src/js or src/test references
 * it yet. Each file ends with `export {};`, which only marks it as a module so
 * that the `import('./x').Type` references below resolve in editors. Adding it does not change runtime behavior. Implementations and the
 * migration of call sites are separate, later tickets.
 *
 * Baseline versions the contracts are written against (do not rely on APIs or
 * options that only exist in newer versions):
 * - Electron 11.5.0 (package.json: ^11.5.0, package-lock.json: 11.5.0)
 * - Node.js v12.18.3 (the Node bundled with Electron 11.5.0)
 * - electron-store 6.0.0 (public/package.json: ^6.0.0, public/package-lock.json:
 *   6.0.0; the renderer runtime dependencies live under public/)
 * - fs-jetpack 2.2.2 (public/package-lock.json; the root package.json resolves
 *   2.2.3, but that copy is only used by the build tasks, not the renderer)
 *
 * Shared conventions for every area:
 * - A synchronous method reports failure by throwing. An asynchronous method
 *   reports failure by returning a rejected Promise.
 * - No fallbacks: a missing value is never replaced by a default.
 * - No logging, no retries, and no error normalization or translation. Errors
 *   raised by the underlying API (for example Node errors carrying `code`) are
 *   propagated unchanged.
 * - Results the underlying API defines as normal values (a missing key in the
 *   store is `undefined`, a cancelled open dialog resolves with
 *   `canceled: true`, a missing path in fs-jetpack is `undefined` / `false`)
 *   stay normal values.
 * - Error handling that exists in callers today (for example mapping `ENOENT`
 *   to `false`, logging then returning `undefined`, or converting errors to
 *   validation tuples) stays in the callers.
 *
 * @typedef {Object} Platform
 * @property {import('./paths').PlatformPaths} paths
 * @property {import('./dialog').PlatformDialog} dialog
 * @property {import('./store').PlatformStore} store
 * @property {import('./fs').PlatformFs} fs
 * @property {import('./shell').PlatformShell} shell
 * @property {import('./exec').PlatformExec} exec
 * @property {import('./devtools').PlatformDevtools} devtools
 */

export {};
