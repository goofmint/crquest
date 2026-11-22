/**
 * Joining and leaving a team or an operation (docs/supabase/teams-operations.md).
 *
 * The server (Supabase, via the native `group_join` / `group_leave` commands)
 * is the authority for a membership, because the group rankings and the
 * contribution totals are computed from it. This module applies the answer to
 * the local save (`teams` / `operations` in the context), which stays the
 * source of the settings screens and works offline.
 *
 * - Join: needs a signed-in account and a connection. A local entry is not
 *   trusted on its own (it may be left from another account): the server is
 *   asked every time, and `already_member` becomes `already_joined`. Signed out: nothing is
 *   sent and nothing is joined (`login_required`); offline or a server problem
 *   joins nothing and can be retried.
 * - Leave: an entry that came from the server (its id is a UUID) is removed
 *   locally only after the server confirmed the leave (or says the user was not
 *   a member), so that no membership is left behind on the server. Signed out or
 *   offline: the entry stays and the leave can be retried (`login_required` /
 *   `unavailable`). An entry saved by the former backend (any other id) never
 *   was a server membership and is removed locally.
 * - No token or user id reaches this module; the join code is never logged.
 *
 * Outcomes: joined | already_joined | invalid_code | login_required |
 * unavailable | left | removed_locally.
 */
import { getAuthStatus } from '../platform/auth';
import { joinGroup, leaveGroup, listGroups } from '../platform/groups';
import { getContext, updateContext } from './context';

export const OUTCOME = Object.freeze({
  JOINED: 'joined',
  ALREADY_JOINED: 'already_joined',
  INVALID_CODE: 'invalid_code',
  LOGIN_REQUIRED: 'login_required',
  UNAVAILABLE: 'unavailable',
  LEFT: 'left',
  REMOVED_LOCALLY: 'removed_locally',
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// `kind` -> the context key.
const SLICE = { team: 'teams', operation: 'operations' };

async function signedInAccount() {
  let status;
  try {
    status = await getAuthStatus();
  } catch (error) {
    return { unavailable: true };
  }
  if (!status || status.state !== 'signed_in' || !status.account) {
    return { loginRequired: true };
  }
  return { account: status.account };
}

function serverFailure(error) {
  // signed_out / account_changed mean that the sign-in changed under the call.
  if (error.groupCode === 'signed_out' || error.groupCode === 'account_changed') {
    return { outcome: OUTCOME.LOGIN_REQUIRED };
  }
  return { outcome: OUTCOME.UNAVAILABLE };
}

export function isJoined(kind, joinCode) {
  const slice = getContext(SLICE[kind]) || { joined: [] };
  const wanted = String(joinCode).trim().toUpperCase();
  return slice.joined.some(group => String(group.joinCode).toUpperCase() === wanted);
}

const normalizeCode = code => String(code ?? '').trim().toUpperCase();

// Adds the server's record. Older entries with the same id or the same
// normalized join code (e.g. a record of the former backend) are replaced by it,
// at the position of the first of them.
function addLocal(kind, entry) {
  const key = SLICE[kind];
  updateContext(state => {
    const slice = state[key] || { joined: [] };
    const code = normalizeCode(entry.joinCode);
    const matches = group => group.id === entry.id || normalizeCode(group.joinCode) === code;
    const first = slice.joined.findIndex(matches);
    const unchanged =
      slice.joined.filter(matches).length === 1 &&
      first >= 0 &&
      ['id', 'joinCode', 'displayName'].every(field => slice.joined[first][field] === entry[field]);
    if (unchanged) {
      return {};
    }
    const joined = slice.joined.filter(group => !matches(group));
    joined.splice(first < 0 ? joined.length : first, 0, entry);
    return { [key]: { ...slice, joined } };
  });
}

function removeLocal(kind, id) {
  const key = SLICE[kind];
  updateContext(state => {
    const slice = state[key] || { joined: [] };
    return { [key]: { ...slice, joined: slice.joined.filter(group => group.id !== id) } };
  });
}

async function restoreFromServer(kind, account, code) {
  const normalized = code.toUpperCase();
  let listed;
  try {
    listed = await listGroups(account, kind);
  } catch (error) {
    return serverFailure(error);
  }
  const current = await signedInAccount();
  if (!current.account || current.account !== listed.account) {
    return { outcome: OUTCOME.LOGIN_REQUIRED };
  }
  const match = (listed.groups || []).find(
    group => String(group.joinCode).toUpperCase() === normalized
  );
  if (!match) {
    return { outcome: OUTCOME.ALREADY_JOINED };
  }
  addLocal(kind, { id: match.groupId, joinCode: match.joinCode, displayName: match.displayName });
  return { outcome: OUTCOME.JOINED, displayName: match.displayName };
}

export async function joinByCode(kind, rawCode) {
  const code = String(rawCode ?? '').trim();
  // A local entry does not short-circuit: after an account switch it may belong
  // to the previous account, so the server decides for the current one (a join
  // that answers `already_member` is then reported as already joined).
  const hadLocalEntry = isJoined(kind, code);

  const signedIn = await signedInAccount();
  if (signedIn.unavailable) {
    return { outcome: OUTCOME.UNAVAILABLE };
  }
  if (signedIn.loginRequired) {
    return { outcome: OUTCOME.LOGIN_REQUIRED };
  }

  let result;
  try {
    result = await joinGroup(signedIn.account, kind, code);
  } catch (error) {
    if (error.groupCode === 'invalid_join_code') {
      return { outcome: OUTCOME.INVALID_CODE };
    }
    if (error.groupCode === 'already_member') {
      // The server has the membership (the local save may have lost it): restore
      // the local entry from the server's list.
      const restored = await restoreFromServer(kind, signedIn.account, code);
      return hadLocalEntry && restored.outcome === OUTCOME.JOINED
        ? { outcome: OUTCOME.ALREADY_JOINED }
        : restored;
    }
    return serverFailure(error);
  }

  if (!result || typeof result.groupId !== 'string' || !result.groupId || !result.displayName) {
    return { outcome: OUTCOME.UNAVAILABLE };
  }

  // The sign-in may have changed while the request was in flight: record the
  // membership only for the account that the server joined.
  const current = await signedInAccount();
  if (!current.account || current.account !== result.account) {
    return { outcome: OUTCOME.LOGIN_REQUIRED };
  }

  addLocal(kind, {
    id: result.groupId,
    joinCode: result.joinCode,
    displayName: result.displayName,
  });
  return { outcome: OUTCOME.JOINED, displayName: result.displayName };
}

export async function leaveGroupEntry(kind, group) {
  if (!UUID_PATTERN.test(String(group.id))) {
    removeLocal(kind, group.id);
    return { outcome: OUTCOME.REMOVED_LOCALLY };
  }

  const signedIn = await signedInAccount();
  if (signedIn.unavailable) {
    return { outcome: OUTCOME.UNAVAILABLE };
  }
  if (signedIn.loginRequired) {
    return { outcome: OUTCOME.LOGIN_REQUIRED };
  }

  try {
    await leaveGroup(signedIn.account, group.id);
  } catch (error) {
    if (error.groupCode !== 'not_member') {
      return serverFailure(error);
    }
    // The server has no active membership: only the local entry is left.
  }
  // The sign-in may have changed while the request was in flight: the shared
  // list is changed only on behalf of the account that left.
  const current = await signedInAccount();
  if (!current.account || current.account !== signedIn.account) {
    return { outcome: OUTCOME.LOGIN_REQUIRED };
  }
  removeLocal(kind, group.id);
  return { outcome: OUTCOME.LEFT };
}
