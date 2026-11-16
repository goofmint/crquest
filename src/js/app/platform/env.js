/**
 * Platform environment module.
 *
 * Wraps `electron-is-dev`. The value is fixed when this module is first
 * loaded (the same moment `electron-is-dev` is first required) and never
 * recomputed: `isDev()` returns that same boolean on every call. No try/catch
 * and no defaults; a failure to load `electron-is-dev` propagates. Depends on
 * nothing in the app, so no circular import is possible.
 *
 * @typedef {Object} PlatformEnv
 * @property {() => boolean} isDev
 *   True when running in development (not packaged). Fixed at module load.
 * @property {() => 'darwin' | 'win32' | 'linux'} getPlatform
 *   The operating system, in the vocabulary of Node's `process.platform`.
 *   Electron: `process.platform`, read on every call (exactly the value the
 *   callers used to read directly). The Tauri implementation maps the OS
 *   plugin's names onto the same words.
 */
import electronIsDev from 'electron-is-dev';

const dev = electronIsDev;

export function isDev() {
  return dev;
}

export function getPlatform() {
  return process.platform;
}
