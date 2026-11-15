/**
 * Platform environment module (Tauri). Same contract as ../env.js: `isDev()`
 * is a synchronous boolean that never changes. The value comes from the Rust
 * `is_dev` command (debug build) and is read by `initPlatform()`; calling
 * `isDev()` earlier throws.
 */
import { getPlatformState } from './state';

export function isDev() {
  return getPlatformState('env.isDev').isDev;
}
