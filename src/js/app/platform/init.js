/**
 * Platform initialization (Electron: nothing to do).
 *
 * The Tauri implementation (`tauri/init.js`) reads values that are only
 * available asynchronously (OS directories, app version, dev flag) so that
 * `paths` and `env` can keep their synchronous contracts. The application
 * entry must `await initPlatform()` before any other platform module is
 * used. With Electron every value is available synchronously, so this is a
 * no-op that exists only so that the same call works for both builds (see
 * docs/migration/tauri-platform.md). Nothing calls it yet.
 *
 * @typedef {Object} PlatformInit
 * @property {() => Promise<void>} initPlatform
 */

export async function initPlatform() {}
