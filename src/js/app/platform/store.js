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
 * The four functions are asynchronous (W4, #135): each is an `async` function
 * whose body calls `get` / `set` / `has` / `delete` of the library right away
 * (no `await` before it), so the operation runs at call time exactly as the
 * former synchronous function did, and a thrown error becomes a rejection.
 * The result is returned untouched. No defaults, no try/catch, no logging, no
 * value caching. The synchronous API (`getValue` etc.) was removed from the
 * contract because Tauri cannot implement it.
 *
 * Keys are top-level keys only (for example 'audio' or a saveToDisk schema
 * field name). Values must be JSON-serializable.
 *
 * Differs from the #5 contract: the `PlatformStore` object shape
 * (`get`/`set`/`has`/`delete` methods) is replaced by the exported functions
 * `getValueAsync`, `setValueAsync`, `hasValueAsync` and `deleteValueAsync`.
 *
 * Caller responsibilities that stay outside this module: the truthy check when
 * restoring saved fields (ContextProvider.jsx), choosing which fields are
 * saved or kept on "clear progress" (schema meta), and the audio default state
 * when `getValueAsync('audio')` resolves falsy.
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
 * Resolves the stored value, or `undefined` when the key does not exist.
 * @param {string} key
 * @returns {Promise<*>}
 */
export async function getValueAsync(key) {
  return getStore().get(key);
}

/**
 * Persists the value (at call time). Rejects with a TypeError for a value that
 * cannot be serialized to JSON (for example `undefined` or a function).
 * @param {string} key
 * @param {*} value
 * @returns {Promise<void>}
 */
export async function setValueAsync(key, value) {
  return getStore().set(key, value);
}

/**
 * Resolves true if the key exists.
 * @param {string} key
 * @returns {Promise<boolean>}
 */
export async function hasValueAsync(key) {
  return getStore().has(key);
}

/**
 * Removes the key; deleting a missing key is not an error.
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function deleteValueAsync(key) {
  return getStore().delete(key);
}
