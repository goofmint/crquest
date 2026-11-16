/**
 * Platform store module (Tauri). Same exports as ../store.js, on
 * @tauri-apps/plugin-store.
 *
 * The contract is asynchronous only (`getValueAsync` / `setValueAsync` /
 * `hasValueAsync` / `deleteValueAsync`); the synchronous API was removed in W4
 * (#135) from both implementations.
 *
 * The store file is `config.json` under the app data directory chosen by the
 * plugin (`$APPDATA/<identifier>`). It is opened lazily by the first
 * operation. A missing file is fine (first run); any other read failure
 * (corrupt JSON, permissions) rejects and is not cached. Writes are saved immediately.
 */
import { load } from '@tauri-apps/plugin-store';
import { rejectAsError } from './errors';
import { STORE_FILE } from './storeFile';

let storePromise;

// `load()` of tauri-plugin-store ignores every error while reading the file
// (a corrupt or unreadable file silently yields an empty store, and the next
// save would overwrite it). So the file is read again with `reload()`, which
// reports errors; only a missing file (first run) is tolerated. A store that
// fails to open is closed, so that the next attempt starts from scratch.
async function openStore() {
  const store = await rejectAsError(load(STORE_FILE, { autoSave: false }));
  try {
    await rejectAsError(store.reload({ ignoreDefaults: true }));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return store;
    }
    try {
      await store.close();
    } catch {
      // The original failure is the one to report.
    }
    throw error;
  }
  return store;
}

function getStore() {
  if (!storePromise) {
    const opening = openStore();
    storePromise = opening;
    opening.catch(() => {
      if (storePromise === opening) {
        storePromise = undefined;
      }
    });
  }
  return storePromise;
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
