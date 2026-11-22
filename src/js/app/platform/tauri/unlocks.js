/**
 * Platform unlock code module (Tauri): redeems an item unlock code on the
 * server for the signed-in user.
 *
 * The call is made in Rust (src-tauri/src/rewards) with the access token of the
 * native auth session; the renderer never sees a token or the user id.
 * `account` is the opaque fingerprint from the auth status (`status.account`).
 *
 * Resolves `{ account, status, itemKey }`:
 *   status 'redeemed' | 'already_redeemed'  -> `itemKey` is the item to grant
 *   status 'invalid_code'                   -> `itemKey` is null
 * The commands reject with an error code string, exposed as `error.cloudCode`:
 * signed_out | account_changed | offline | server | unauthorized | rejected.
 */
import { invoke } from '@tauri-apps/api/core';
import { rejectAsError } from './errors';

export async function redeemUnlockCode(account, code) {
  try {
    return await rejectAsError(invoke('unlock_code_redeem', { expectedAccount: account, code }));
  } catch (error) {
    if (/^[a-z_]+$/.test(error.message)) {
      error.cloudCode = error.message;
    }
    throw error;
  }
}
