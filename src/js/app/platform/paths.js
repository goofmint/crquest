/**
 * Platform paths module.
 *
 * Single place for Electron path/version lookups that used to be scattered
 * over config.js, analytics.js, code_runner.js, Settings.jsx and gameEvents.js.
 * Nothing is evaluated at import time; every function reads Electron (or the
 * bundled package.json) when it is called. Nothing is cached here. Callers
 * keep the logic built on top of the returned values (path.resolve, the
 * 'TerminalQuest' suffix, `${userData}/QuestIDE`, local_config overrides).
 *
 * Differs from the #5 contract (a single `getPath(name)`): it is replaced by
 * `getAppDataPath()` and `getUserDataPath()`, and `getAppVersion()` and
 * `getGamePackageVersion()` are added.
 *
 * Every function is synchronous and throws an Error instead of returning a
 * fallback when Electron's `remote.app` is unavailable or a value is missing
 * or invalid.
 *
 * @typedef {Object} PlatformPaths
 * @property {() => string} getAppDataPath
 *   remote.app.getPath('appData'), unmodified.
 * @property {() => string} getUserDataPath
 *   remote.app.getPath('userData'), unmodified.
 * @property {() => string} getAppVersion
 *   remote.app.getVersion() (the Electron version in dev, the app version
 *   when packaged).
 * @property {() => string} getGamePackageVersion
 *   `version` of the game's package.json at staticFilePath('package.json'),
 *   loaded with require (CommonJS cache behavior kept). Load/JSON errors
 *   propagate.
 */
import { remote } from 'electron';
import { staticFilePath } from '../common/fs_utils';

function getApp() {
  if (!remote || !remote.app) {
    throw new Error('Electron remote.app is not available');
  }
  return remote.app;
}

function assertNonEmptyString(value, description) {
  if (typeof value !== 'string' || value === '') {
    throw new Error(`${description} must be a non-empty string`);
  }
  return value;
}

export function getAppDataPath() {
  return assertNonEmptyString(
    getApp().getPath('appData'),
    "remote.app.getPath('appData')"
  );
}

export function getUserDataPath() {
  return assertNonEmptyString(
    getApp().getPath('userData'),
    "remote.app.getPath('userData')"
  );
}

export function getAppVersion() {
  return assertNonEmptyString(
    getApp().getVersion(),
    'remote.app.getVersion()'
  );
}

export function getGamePackageVersion() {
  const packageJsonPath = staticFilePath('package.json');
  const { version } = require(packageJsonPath);
  return assertNonEmptyString(version, `version in ${packageJsonPath}`);
}
