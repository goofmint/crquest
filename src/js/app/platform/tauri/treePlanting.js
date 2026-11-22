/**
 * Platform tree planting module (Tauri): records a tree planting on the server
 * for the signed-in user (a self-reported record, not a certified achievement).
 *
 * The call is made in Rust (src-tauri/src/rewards); the renderer never sees a
 * token or the user id. `account` is the opaque fingerprint from the auth
 * status. Resolves `{ account, status }` with status 'recorded' |
 * 'already_recorded' | 'unsupported_target'. Rejections carry `error.cloudCode`:
 * signed_out | account_changed | offline | server | unauthorized | rejected.
 */
import { invoke } from '@tauri-apps/api/core';
import { rejectAsError } from './errors';

export async function recordTreePlanting(account, missionId, targetId) {
  try {
    return await rejectAsError(
      invoke('tree_planting_record', { expectedAccount: account, missionId, targetId })
    );
  } catch (error) {
    if (/^[a-z_]+$/.test(error.message)) {
      error.cloudCode = error.message;
    }
    throw error;
  }
}
