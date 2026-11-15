/**
 * Platform environment module (Tauri). Same contract as ../env.js: `isDev()`
 * is a synchronous boolean that never changes. The value comes from the Rust
 * `is_dev` command (debug build) and is read by `initPlatform()`; calling
 * `isDev()` earlier throws.
 *
 * `getPlatform()` returns the OS in the vocabulary of Node's
 * `process.platform` ('darwin' | 'win32' | 'linux'), converted by
 * `initPlatform()` from `@tauri-apps/plugin-os`; calling it earlier throws.
 */
import { getPlatformState } from './state';

export function isDev() {
  return getPlatformState('env.isDev').isDev;
}

export function getPlatform() {
  return getPlatformState('env.getPlatform').platform;
}
