/**
 * Platform store module.
 *
 * Single place for `electron-store` (6.0.0) access. Replaces the 4 call sites
 * that each did `new Store()` (ContextProvider.jsx, common/context/index.js,
 * common/audio/index.js, ClearDataButton.jsx). All of them used no
 * constructor arguments and shared the same default file (config.json in
 * Electron's userData directory), so a single instance is equivalent.
 *
 * The Store instance is created lazily by the first operation, with no
 * options, and is kept in this module (it is not exported). Nothing is
 * created at import time. If creation throws, the failure is not cached: the
 * exception propagates to the caller and the next operation tries again.
 *
 * The four functions delegate 1:1 to `get` / `set` / `has` / `delete` with the
 * same arguments and return the library's result untouched. No defaults, no
 * try/catch, no logging, no value caching.
 *
 * Keys are top-level keys only (for example 'audio' or a saveToDisk schema
 * field name). Values must be JSON-serializable.
 *
 * Differs from the #5 contract: the `PlatformStore` object shape
 * (`get`/`set`/`has`/`delete` methods) is replaced by the exported functions
 * `getValue`, `setValue`, `hasValue` and `deleteValue`.
 *
 * Caller responsibilities that stay outside this module: the truthy check when
 * restoring saved fields (ContextProvider.jsx), choosing which fields are
 * saved or kept on "clear progress" (schema meta), and the audio default state
 * when `getValue('audio')` is falsy.
 */
import Store from 'electron-store';

let storeInstance;

function getStore() {
  if (!storeInstance) {
    storeInstance = new Store();
  }
  return storeInstance;
}

/**
 * Synchronous. Returns the stored value, or `undefined` when the key does not
 * exist.
 * @param {string} key
 * @returns {*}
 */
export function getValue(key) {
  return getStore().get(key);
}

/**
 * Synchronous. Persists the value. Throws a TypeError for a value that cannot
 * be serialized to JSON (for example `undefined` or a function).
 * @param {string} key
 * @param {*} value
 */
export function setValue(key, value) {
  return getStore().set(key, value);
}

/**
 * Synchronous. True if the key exists.
 * @param {string} key
 * @returns {boolean}
 */
export function hasValue(key) {
  return getStore().has(key);
}

/**
 * Synchronous. Removes the key; deleting a missing key is not an error.
 * @param {string} key
 */
export function deleteValue(key) {
  return getStore().delete(key);
}
