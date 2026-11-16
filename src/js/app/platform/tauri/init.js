/**
 * Tauri platform initialization. See ../init.js and
 * docs/migration/tauri-platform.md.
 *
 * Reads, once and with no fallback (any failure rejects):
 * - `configDir()`: the OS per-user config directory. This is what Electron
 *   calls `appData` (macOS ~/Library/Application Support, Windows %APPDATA%,
 *   Linux ~/.config).
 * - `resourceDir()`: the bundle resource directory (`bundle.resources`).
 * - the app version (`tauri.conf.json` `version`, which points at
 *   public/package.json, the game's package.json).
 * - the `is_dev` command (debug build).
 * - the OS (`platform()` of @tauri-apps/plugin-os), converted to the words of
 *   Node's `process.platform`. Only the desktop targets are supported; any
 *   other value rejects.
 */
import { configDir, resourceDir } from '@tauri-apps/api/path';
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { platform } from '@tauri-apps/plugin-os';
import { rejectAsError } from './errors';
import { setPlatformState } from './state';

// Tauri's platform name -> Node's process.platform value.
const NODE_PLATFORM_BY_TAURI_PLATFORM = Object.freeze({
  macos: 'darwin',
  windows: 'win32',
  linux: 'linux',
});

function toNodePlatform(tauriPlatform) {
  if (!Object.hasOwn(NODE_PLATFORM_BY_TAURI_PLATFORM, tauriPlatform)) {
    throw new Error(
      `Unsupported operating system reported by the OS plugin: ${JSON.stringify(tauriPlatform)} (supported: ${Object.keys(NODE_PLATFORM_BY_TAURI_PLATFORM).join(', ')})`
    );
  }
  return NODE_PLATFORM_BY_TAURI_PLATFORM[tauriPlatform];
}

export async function initPlatform() {
  const [appDataPath, resourceDirPath, appVersion, isDev, nodePlatform] = await Promise.all([
    rejectAsError(configDir()),
    rejectAsError(resourceDir()),
    rejectAsError(getVersion()),
    rejectAsError(invoke('is_dev')),
    // platform() reads a value injected by the plugin and is synchronous, so
    // a throw is wrapped to reach the same error normalization.
    rejectAsError(Promise.resolve().then(() => toNodePlatform(platform()))),
  ]);
  setPlatformState({ appDataPath, resourceDirPath, appVersion, isDev, platform: nodePlatform });
}
