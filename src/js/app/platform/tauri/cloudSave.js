/**
 * Platform cloud save module (Tauri): the signed-in user's save in Supabase.
 *
 * The network calls are made in Rust (src-tauri/src/cloud_save) with the access
 * token of the native auth session; the renderer never sees a token or the user
 * id. `account` is the opaque fingerprint from the auth status
 * (`status.account`). A call that finds another account signed in than the one
 * named rejects with `account_changed`.
 *
 * The commands reject with an error code string, exposed as `error.cloudCode`:
 * signed_out | account_changed | offline | server | unauthorized | rejected |
 * too_large.
 */
import { invoke } from '@tauri-apps/api/core';
import { rejectAsError } from './errors';

async function call(command, args) {
  try {
    return await rejectAsError(invoke(command, args));
  } catch (error) {
    if (/^[a-z_]+$/.test(error.message)) {
      error.cloudCode = error.message;
    }
    throw error;
  }
}

/**
 * Resolves `null` when the account has no cloud save, otherwise
 * `{ account, revision, updatedAt, schemaVersion, data }`.
 */
export function fetchCloudSave(account) {
  return call('cloud_save_fetch', { expectedAccount: account });
}

/**
 * Writes the save. The server assigns the revision; resolves
 * `{ account, revision, updatedAt }`.
 */
export function uploadCloudSave(account, data, schemaVersion) {
  return call('cloud_save_upload', { expectedAccount: account, data, schemaVersion });
}
