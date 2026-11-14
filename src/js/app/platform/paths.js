/**
 * Paths contract.
 *
 * Wraps Electron's `remote.app.getPath(name)`. Today it is called with
 * 'appData' (src/js/app/config/config.js) and 'userData'
 * (src/js/app/config/config.js and src/js/app/common/code_runner.js).
 *
 * Only the Electron string is returned. Everything built on top of it stays in
 * the callers: `path.resolve`, appending 'TerminalQuest' to appData, the
 * `${userData}/QuestIDE` suffix in code_runner.js and any `local_config`
 * override in config.js.
 *
 * @typedef {'appData' | 'userData'} PlatformPathName
 *
 * @typedef {Object} PlatformPaths
 * @property {(name: PlatformPathName) => string} getPath
 *   Synchronous. Returns the absolute directory path exactly as Electron
 *   returns it (no normalization, no trailing-slash handling). Throws if
 *   Electron cannot resolve the name. Never returns a fallback.
 */
