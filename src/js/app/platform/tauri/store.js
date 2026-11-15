/**
 * Platform store module (Tauri). Same exports as ../store.js, on
 * @tauri-apps/plugin-store.
 *
 * `getValue` / `setValue` / `hasValue` / `deleteValue` are synchronous in the
 * Electron contract (electron-store) and cannot be implemented on Tauri's
 * asynchronous store: they throw `ERR_TAURI_SYNC_UNSUPPORTED`. Their callers
 * (ContextProvider.jsx, common/context, common/audio, ClearDataButton.jsx)
 * must be changed to the async variants below before the app can run on
 * Tauri. The variants are additional exports of this module only.
 *
 * The store file is `config.json` under the app data directory chosen by the
 * plugin (`$APPDATA/<identifier>`). It is created lazily by the first
 * operation; a failure is not cached. Writes are saved immediately.
 */
import { load } from '@tauri-apps/plugin-store';
import { rejectAsError, unsupportedSync } from './errors';

const STORE_FILE = 'config.json';

let storePromise;

function getStore() {
  if (!storePromise) {
    storePromise = rejectAsError(load(STORE_FILE, { autoSave: false })).catch(
      error => {
        storePromise = undefined;
        throw error;
      }
    );
  }
  return storePromise;
}

const INSTEAD = 'Use the matching *Async function.';

export function getValue() {
  throw unsupportedSync('store', 'getValue', INSTEAD);
}

export function setValue() {
  throw unsupportedSync('store', 'setValue', INSTEAD);
}

export function hasValue() {
  throw unsupportedSync('store', 'hasValue', INSTEAD);
}

export function deleteValue() {
  throw unsupportedSync('store', 'deleteValue', INSTEAD);
}

/** Resolves the stored value, or `undefined` when the key does not exist. */
export async function getValueAsync(key) {
  const store = await getStore();
  return rejectAsError(store.get(key));
}

/** Persists the value. Rejects for `undefined` (not JSON-serializable). */
export async function setValueAsync(key, value) {
  if (value === undefined || typeof value === 'function') {
    throw new TypeError(`Cannot store ${typeof value} for key "${key}"`);
  }
  const store = await getStore();
  await rejectAsError(store.set(key, value));
  await rejectAsError(store.save());
}

export async function hasValueAsync(key) {
  const store = await getStore();
  return rejectAsError(store.has(key));
}

/** Removes the key; deleting a missing key is not an error. */
export async function deleteValueAsync(key) {
  const store = await getStore();
  await rejectAsError(store.delete(key));
  await rejectAsError(store.save());
}
