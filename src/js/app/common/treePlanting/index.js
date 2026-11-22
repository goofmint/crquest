/**
 * Wires the tree planting service to the real platform: the native record
 * command, the auth status and the local store (its own key, not part of the
 * game save, never uploaded).
 * See docs/supabase/unlocks-and-trees.md.
 */
import { recordTreePlanting as recordRemote } from '../../platform/treePlanting';
import { getAuthStatus, onAuthStatusChange } from '../../platform/auth';
import { getValueAsync, setValueAsync, deleteValueAsync } from '../../platform/store';
import { TreePlantingService, RESULT } from './service';

export { RESULT };

export const PENDING_KEY = 'treePlantingPending';

let service = null;

export function getTreePlanting() {
  if (!service) {
    service = new TreePlantingService({
      auth: { getStatus: getAuthStatus, onChange: onAuthStatusChange },
      api: { record: recordRemote },
      store: {
        load: () => getValueAsync(PENDING_KEY),
        save: pending => (pending.length ? setValueAsync(PENDING_KEY, pending) : deleteValueAsync(PENDING_KEY)),
        clear: () => deleteValueAsync(PENDING_KEY),
      },
    });
  }
  return service;
}

/**
 * Records a planting for the signed-in account. Resolves one of RESULT, never
 * rejects. The local progress must not depend on the result.
 */
export function recordTreePlanting({ missionId, targetId }) {
  return getTreePlanting().record({ missionId, targetId });
}

/** Call once the game context is initialized. Never throws. */
export async function startTreePlanting() {
  const sync = getTreePlanting();
  window.addEventListener('online', () => sync.retryNow());
  await sync.start();
}

/**
 * Clear Data failed after the pending plantings were cleared: follow the
 * sign-in again (the cleared queue is not restored).
 */
export function resumeTreePlanting() {
  return getTreePlanting().start();
}

/** Clear Data: forgets the pending plantings. */
export function clearTreePlantingPending() {
  return getTreePlanting().clear();
}
