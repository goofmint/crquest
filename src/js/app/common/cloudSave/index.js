/**
 * Wires the cloud sync engine to the real platform: the native cloud save
 * commands, the auth status, the local store and the dialogs.
 * See docs/supabase/cloud-save.md.
 */
import { fetchCloudSave, uploadCloudSave } from '../../platform/cloudSave';
import { getAuthStatus, onAuthStatusChange, logout } from '../../platform/auth';
import { showAlert, showConfirm } from '../../platform/dialog';
import { t } from '../../i18n';
import { getContext, applySavedFields, setLocalChangeListener } from '../context';
import { getCloudSaveFields } from './snapshot';
import { CloudSyncEngine } from './syncEngine';
import { loadSyncState, saveSyncState, clearSyncState } from './syncState';
import { requestChoice, dismissChoice, submitChoice } from './choice';
import { setSyncStatus } from './statusStore';

export { STATUS } from './syncEngine';
export { submitChoice };

function createEngine() {
  return new CloudSyncEngine({
    api: { fetch: fetchCloudSave, upload: uploadCloudSave },
    auth: { getStatus: getAuthStatus, onChange: onAuthStatusChange, logout },
    state: { load: loadSyncState, save: saveSyncState },
    local: { getContext: () => getContext(), applySaved: applySavedFields },
    ui: {
      choose: requestChoice,
      dismissChoice,
      confirmUpload: () => showConfirm(t('cloudSave.confirmUpload')),
      notify: kind => showAlert(t(`cloudSave.notice.${kind}`)).catch(() => {}),
    },
    reload: () => window.location.reload(),
  });
}

let engine = null;

export function getCloudSync() {
  engine = engine || createEngine();
  return engine;
}

/** Call once the game context is initialized. Never throws. */
export async function startCloudSync() {
  const sync = getCloudSync();
  const fields = getCloudSaveFields();
  sync.onStatusChange(setSyncStatus);
  setLocalChangeListener(changedKeys => {
    if (changedKeys.some(key => fields.includes(key))) sync.notifyLocalChange();
  });
  window.addEventListener('online', () => sync.retryNow());
  await sync.start();
}

/**
 * Clear Data, step 1 (before anything is deleted): the sync stops. A restore
 * that is writing the store finishes first, and nothing is written, bound or
 * reloaded by the sync after this resolves.
 */
export function stopCloudSync() {
  return getCloudSync().stop();
}

/** Clear Data failed: follow the sign-in again (reads the sync state anew). */
export function resumeCloudSync() {
  return getCloudSync().start();
}

/**
 * Clear Data, step 2 (after the local data is gone): forgets which account the
 * save was bound to and signs out (the next sign-in then treats the empty
 * local save as new and offers the cloud save). The cloud save is not deleted.
 * Both are attempted whatever happens to the first; it throws if either could
 * not be confirmed, because a stale binding or session must not survive.
 */
export async function resetCloudSync() {
  const problems = [];
  try {
    await getCloudSync().stop();
  } catch (error) {
    problems.push(error);
  }
  try {
    await clearSyncState();
  } catch (error) {
    problems.push(error);
  }
  try {
    const status = await logout();
    if (!status || status.state !== 'signed_out' || status.errorCode === 'logout_incomplete') {
      problems.push(new Error('The sign-in could not be removed from this computer'));
    }
  } catch (error) {
    problems.push(error);
  }
  if (problems.length) {
    problems.forEach(error => console.error('Could not reset the cloud sync', error));
    throw problems[0];
  }
}
