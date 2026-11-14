/**
 * Platform paths module.
 *
 * Single place for Electron path/version lookups that used to be scattered
 * over config.js, analytics.js, code_runner.js, Settings.jsx and gameEvents.js.
 * Nothing is evaluated at import time; every function reads Electron (or the
 * bundled package.json) when it is called. Nothing is cached here (the game
 * package.json is re-read on every call). Callers
 * keep the logic built on top of the returned values (path.resolve, the
 * 'TerminalQuest' suffix, `${userData}/QuestIDE`, local_config overrides).
 *
 * Differs from the #5 contract (a single `getPath(name)`): it is replaced by
 * `getAppDataPath()` and `getUserDataPath()`, and `getAppVersion()` and
 * `getGamePackageVersion()` are added.
 *
 * Every function except `getGamePackageVersion` is synchronous and throws an
 * Error instead of returning a fallback when Electron's `remote.app` is
 * unavailable or a value is missing or invalid. `getGamePackageVersion` is
 * asynchronous and rejects in the same situations.
 *
 * @typedef {Object} PlatformPaths
 * @property {() => string} getAppDataPath
 *   remote.app.getPath('appData'), unmodified.
 * @property {() => string} getUserDataPath
 *   remote.app.getPath('userData'), unmodified.
 * @property {() => string} getAppVersion
 *   remote.app.getVersion() (the Electron version in dev, the app version
 *   when packaged).
 * @property {() => Promise<string>} getGamePackageVersion
 *   `version` of the game's package.json at staticFilePath('package.json'),
 *   read from disk with fs.readFile and JSON.parse on every call. Rejects on
 *   read/JSON errors and when `version` is not a non-empty string.
 */
import { remote } from 'electron';
import { staticFilePath } from '../common/fs_utils';
import { readFile } from './fs';

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

export async function getGamePackageVersion() {
  const packageJsonPath = staticFilePath('package.json');
  const { version } = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  return assertNonEmptyString(version, `version in ${packageJsonPath}`);
}
