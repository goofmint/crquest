/**
 * Platform auth module (Tauri): optional GitHub / Google login.
 *
 * Only a secret-free status crosses this boundary:
 *   { state, provider, displayName, offline, persistence, errorCode }
 * `state` is restoring | signed_out | signed_in | pending | expired | error |
 * unconfigured. Tokens, the PKCE verifier and the callback URL stay in Rust
 * (src-tauri/src/auth); there is intentionally no way to read them here.
 * The commands reject with an error code string (`unconfigured`,
 * `already_signed_in`, `browser_open_failed`), exposed as `error.code`.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { rejectAsError } from './errors';

const STATUS_EVENT = 'auth://status-changed';

async function call(command, args) {
  try {
    return await rejectAsError(invoke(command, args));
  } catch (error) {
    // Rust rejects with the bare code; keep it machine-readable.
    if (/^[a-z_]+$/.test(error.message)) {
      error.authCode = error.message;
    }
    throw error;
  }
}

export function getAuthStatus() {
  return call('auth_status');
}

/** `provider` is 'github' or 'google'. Resolves with the new status ('pending'). */
export function startLogin(provider) {
  return call('auth_start_login', { provider });
}

export function cancelLogin() {
  return call('auth_cancel_login');
}

export function logout() {
  return call('auth_logout');
}

/**
 * Calls `listener(status)` when the status changes. Resolves with an unlisten
 * function (the subscription is asynchronous in Tauri).
 */
export function onAuthStatusChange(listener) {
  return rejectAsError(listen(STATUS_EVENT, event => listener(event.payload)));
}
