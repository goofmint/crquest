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

let cachedStore;
let pendingOperation = Promise.resolve();
let pendingRecovery;

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

async function recoverStore() {
  if (!pendingRecovery) {
    return;
  }

  try {
    await pendingRecovery();
  } catch {
    // Discard the resource itself. Loading again without closing it would
    // return the same native cache, which can also be saved on app exit.
    await rejectAsError(cachedStore.close());
    cachedStore = undefined;
  }
  pendingRecovery = undefined;
}

function withStore(operation) {
  const result = pendingOperation.then(async () => {
    // If both restoration and close failed, retry recovery before any later
    // operation can observe or persist values from the dirty native cache.
    await recoverStore();
    cachedStore ??= await openStore();
    return operation(cachedStore);
  });
  pendingOperation = result.catch(() => {});
  return result;
}

function mutateStore(key, mutate) {
  return withStore(async store => {
    const previousValue = await rejectAsError(store.get(key));
    try {
      await rejectAsError(mutate(store));
      await rejectAsError(store.save());
    } catch (error) {
      pendingRecovery = () => rejectAsError(previousValue === undefined
        ? store.delete(key)
        : store.set(key, previousValue));
      try {
        await recoverStore();
      } catch {
        // Preserve the initial failure. The next operation retries recovery.
      }
      throw error;
    }
  });
}

/** Resolves the stored value, or `undefined` when the key does not exist. */
export async function getValueAsync(key) {
  return withStore(store => rejectAsError(store.get(key)));
}

/** Persists the value. Rejects for `undefined` (not JSON-serializable). */
export async function setValueAsync(key, value) {
  if (value === undefined || typeof value === 'function') {
    throw new TypeError(`Cannot store ${typeof value} for key "${key}"`);
  }
  return mutateStore(key, store => store.set(key, value));
}

export async function hasValueAsync(key) {
  return withStore(store => rejectAsError(store.has(key)));
}

/** Removes the key; deleting a missing key is not an error. */
export async function deleteValueAsync(key) {
  return mutateStore(key, store => store.delete(key));
}
