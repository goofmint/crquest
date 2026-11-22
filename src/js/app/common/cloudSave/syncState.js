/**
 * The persisted state of the cloud sync, in its own store key (not part of the
 * game save, not in the schema, never uploaded).
 *
 *   boundAccount       fingerprint of the account that this local save syncs
 *                      with (null: not bound yet). It is not the user id.
 *   ackRevision        the last revision of the cloud save that this device
 *                      has uploaded or restored
 *   dirty              local changes that the cloud does not have yet
 *   restoreInProgress  { account, revision } while a restore is being written
 *                      to the store; a restart repeats it
 */
import { getValueAsync, setValueAsync, deleteValueAsync } from '../../platform/store';

export const SYNC_STATE_KEY = 'cloudSync';

export const EMPTY_SYNC_STATE = Object.freeze({
  boundAccount: null,
  ackRevision: 0,
  dirty: false,
  restoreInProgress: null,
});

export async function loadSyncState() {
  const stored = await getValueAsync(SYNC_STATE_KEY);
  if (!stored || typeof stored !== 'object') {
    return { ...EMPTY_SYNC_STATE };
  }
  return {
    boundAccount: typeof stored.boundAccount === 'string' ? stored.boundAccount : null,
    ackRevision: Number.isFinite(stored.ackRevision) ? stored.ackRevision : 0,
    dirty: stored.dirty === true,
    restoreInProgress:
      stored.restoreInProgress && typeof stored.restoreInProgress.account === 'string'
        ? {
            account: stored.restoreInProgress.account,
            revision: Number(stored.restoreInProgress.revision) || 0,
          }
        : null,
  };
}

export function saveSyncState(state) {
  return setValueAsync(SYNC_STATE_KEY, state);
}

export function clearSyncState() {
  return deleteValueAsync(SYNC_STATE_KEY);
}
