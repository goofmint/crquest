/**
 * Tauri platform initialization. See ../init.js and
 * docs/migration/tauri-platform.md.
 *
 * Reads, once and with no fallback (any failure rejects):
 * - `configDir()`: the OS per-user config directory. This is what Electron
 *   calls `appData` (macOS ~/Library/Application Support, Windows %APPDATA%,
 *   Linux ~/.config).
 * - the app version (`tauri.conf.json` `version`, which points at
 *   public/package.json, the game's package.json).
 * - the `is_dev` command (debug build).
 */
import { configDir } from '@tauri-apps/api/path';
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { rejectAsError } from './errors';
import { setPlatformState } from './state';

export async function initPlatform() {
  const [appDataPath, appVersion, isDev] = await Promise.all([
    rejectAsError(configDir()),
    rejectAsError(getVersion()),
    rejectAsError(invoke('is_dev')),
  ]);
  setPlatformState({ appDataPath, appVersion, isDev });
}
