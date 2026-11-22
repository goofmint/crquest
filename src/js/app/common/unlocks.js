/**
 * Redeeming an item unlock code. The server (Supabase, via the native
 * `unlock_code_redeem` command) matches the code and records the grant for the
 * signed-in account; this module applies the answer to the local save.
 *
 * - Signed out (or any state without an account): nothing is sent and nothing
 *   is granted: `login_required`.
 * - The local "already used" list never stops a request: the server decides, and
 *   its `already_redeemed` answer repairs a local grant that was lost (the item
 *   is added again if it is missing). The grant is idempotent.
 * - Offline / server / session problems grant nothing and can be retried.
 *
 * Outcomes: redeemed | already_redeemed | invalid | login_required |
 * unavailable. `redeemed` and `already_redeemed` carry `itemKey` and
 * `installed` (false when the item is not in the installed content; the key is
 * still saved, so the item shows up once the content is installed).
 */
import { getAuthStatus } from '../platform/auth';
import { redeemUnlockCode } from '../platform/unlocks';
import { getContext, updateContext } from './context';

export const OUTCOME = Object.freeze({
  REDEEMED: 'redeemed',
  ALREADY_REDEEMED: 'already_redeemed',
  INVALID: 'invalid',
  LOGIN_REQUIRED: 'login_required',
  UNAVAILABLE: 'unavailable',
});

/**
 * Adds the item to the inventory and the code to the used list in one context
 * update. The lists are merged into the latest state when the update is
 * committed (`updateContext`), so a concurrent inventory change is not lost.
 * Safe to repeat.
 */
export function grantUnlockedItem(code, itemKey) {
  updateContext(state => {
    const inventory = state.inventory || [];
    const unlockCodes = state.unlockCodes || [];
    const update = {};
    if (!inventory.includes(itemKey)) {
      update.inventory = [...inventory, itemKey];
    }
    if (!unlockCodes.includes(code)) {
      update.unlockCodes = [...unlockCodes, code];
    }
    return update;
  });
}

function isInstalled(itemKey) {
  const items = getContext('items') || {};
  return Object.prototype.hasOwnProperty.call(items, itemKey) && Boolean(items[itemKey]);
}

export async function redeemCode(rawCode) {
  const code = String(rawCode ?? '').trim();

  let status;
  try {
    status = await getAuthStatus();
  } catch (error) {
    return { outcome: OUTCOME.UNAVAILABLE };
  }
  if (!status || status.state !== 'signed_in' || !status.account) {
    return { outcome: OUTCOME.LOGIN_REQUIRED };
  }

  let result;
  try {
    result = await redeemUnlockCode(status.account, code);
  } catch (error) {
    // signed_out / account_changed mean that the sign-in changed under the call.
    if (error.cloudCode === 'signed_out' || error.cloudCode === 'account_changed') {
      return { outcome: OUTCOME.LOGIN_REQUIRED };
    }
    return { outcome: OUTCOME.UNAVAILABLE };
  }

  if (result.status === 'invalid_code') {
    return { outcome: OUTCOME.INVALID };
  }
  if (
    (result.status !== 'redeemed' && result.status !== 'already_redeemed') ||
    typeof result.itemKey !== 'string' ||
    !result.itemKey
  ) {
    return { outcome: OUTCOME.UNAVAILABLE };
  }

  // The sign-in may have changed while the request was in flight: grant only to
  // the account that the server redeemed the code for.
  let current;
  try {
    current = await getAuthStatus();
  } catch (error) {
    return { outcome: OUTCOME.UNAVAILABLE };
  }
  if (!current || current.state !== 'signed_in' || !current.account || current.account !== result.account) {
    return { outcome: OUTCOME.LOGIN_REQUIRED };
  }

  grantUnlockedItem(code, result.itemKey);
  return {
    outcome: result.status === 'redeemed' ? OUTCOME.REDEEMED : OUTCOME.ALREADY_REDEEMED,
    itemKey: result.itemKey,
    installed: isInstalled(result.itemKey),
  };
}
