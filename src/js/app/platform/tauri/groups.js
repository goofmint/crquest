/**
 * Platform team / operation membership module (Tauri): joins and leaves a team
 * or an operation for the signed-in user.
 *
 * The calls are made in Rust (src-tauri/src/groups) with the access token of the
 * native auth session; the renderer never sees a token or the user id. `account`
 * is the opaque fingerprint from the auth status (`status.account`); a call that
 * finds another account signed in rejects with `account_changed`.
 *
 * joinGroup resolves `{ account, groupId, displayName, joinCode }`; leaveGroup
 * resolves `{ account }`. Rejections carry `error.groupCode`:
 * signed_out | account_changed | offline | server | unauthorized | rejected |
 * invalid_join_code | already_member | not_member | invalid_kind.
 */
import { invoke } from '@tauri-apps/api/core';
import { rejectAsError } from './errors';

async function call(command, args) {
  try {
    return await rejectAsError(invoke(command, args));
  } catch (error) {
    if (/^[a-z_]+$/.test(error.message)) {
      error.groupCode = error.message;
    }
    throw error;
  }
}

/** `kind` is 'team' or 'operation'. */
export function joinGroup(account, kind, joinCode) {
  return call('group_join', { expectedAccount: account, kind, joinCode });
}

/** The active memberships of one kind: `{ account, groups: [{ groupId, displayName, joinCode }] }`. */
export function listGroups(account, kind) {
  return call('group_list', { expectedAccount: account, kind });
}

export function leaveGroup(account, groupId) {
  return call('group_leave', { expectedAccount: account, groupId });
}
