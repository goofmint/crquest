/**
 * Platform paths module (Tauri). Same exports as ../paths.js.
 *
 * - `getAppDataPath()`: the OS config directory (Electron `appData`), read by
 *   `initPlatform()`. Synchronous; throws before initialization.
 * - `getUserDataPath()`: `<appData>/terminalquest`. Electron's `userData` is
 *   `<appData>/<app name>` and the app name is the `name` in package.json
 *   (`terminalquest`; main.js does not call `setName`), so the existing save
 *   file location is kept. Hard-coded on purpose: it is a compatibility
 *   constant, not a setting.
 * - `getResourceDirPath()`: the bundle resource directory (`resourceDir()`),
 *   read by `initPlatform()`. It is the Electron `staticFilePath('.')`
 *   counterpart: `content/`, `levels/` and `avatars/` sit directly under it
 *   (`bundle.resources` in tauri.conf.json, docs/migration/tauri-resources.md).
 *   Synchronous; throws before initialization.
 * - `getAppVersion()`: the Tauri app version (tauri.conf.json `version`).
 *   Differs from Electron in dev, where Electron reports its own version.
 * - `getGamePackageVersion()`: tauri.conf.json takes `version` from
 *   public/package.json, so the app version IS the game's package version.
 *   No file is read (the bundled files are not in the fs scope).
 */
import { getVersion } from '@tauri-apps/api/app';
import { getPlatformState } from './state';
import { rejectAsError } from './errors';

const USER_DATA_DIR_NAME = 'terminalquest';

function assertNonEmptyString(value, description) {
  if (typeof value !== 'string' || value === '') {
    throw new Error(`${description} must be a non-empty string`);
  }
  return value;
}

function joinPath(base, name) {
  const separator = base.includes('\\') && !base.includes('/') ? '\\' : '/';
  return `${base.replace(/[\\/]+$/, '')}${separator}${name}`;
}

export function getAppDataPath() {
  return assertNonEmptyString(
    getPlatformState('paths.getAppDataPath').appDataPath,
    'configDir()'
  );
}

export function getUserDataPath() {
  return joinPath(getAppDataPath(), USER_DATA_DIR_NAME);
}

export function getResourceDirPath() {
  return assertNonEmptyString(
    getPlatformState('paths.getResourceDirPath').resourceDirPath,
    'resourceDir()'
  );
}

export function getAppVersion() {
  return assertNonEmptyString(
    getPlatformState('paths.getAppVersion').appVersion,
    'getVersion()'
  );
}

export async function getGamePackageVersion() {
  return assertNonEmptyString(
    await rejectAsError(getVersion()),
    'getVersion() (game package version)'
  );
}
