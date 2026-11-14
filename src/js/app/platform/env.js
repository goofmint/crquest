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
 */
import electronIsDev from 'electron-is-dev';

const dev = electronIsDev;

export function isDev() {
  return dev;
}
