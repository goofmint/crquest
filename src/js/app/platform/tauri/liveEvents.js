/**
 * Platform live events module (Tauri): live events and the public rankings.
 *
 * The network calls are made in Rust (src-tauri/src/live_events). Reading the
 * event list and the rankings is public (no token, works signed out). Joining,
 * changing the participation and the own status use the access token of the
 * native auth session; the renderer never sees a token or the user id. `account`
 * is the opaque fingerprint from the auth status (`status.account`); a call that
 * finds another account signed in rejects with `account_changed`.
 *
 * Scores are computed by the server from certified achievements. Nothing here
 * sends a score.
 *
 * The commands reject with an error code string, exposed as `error.liveEventCode`:
 * signed_out | account_changed | offline | server | unauthorized | rejected |
 * event_not_found | event_closed | not_eligible | invalid_display_name |
 * already_participant | not_participant.
 */
import { invoke } from '@tauri-apps/api/core';
import { rejectAsError } from './errors';

async function call(command, args) {
  try {
    return await rejectAsError(invoke(command, args));
  } catch (error) {
    if (/^[a-z_]+$/.test(error.message)) {
      error.liveEventCode = error.message;
    }
    throw error;
  }
}

/** Published events: `[{ eventId, title, startsAt, endsAt, phase, isOpen }]`. */
export function listLiveEvents() {
  return call('live_events_list');
}

/**
 * The individual ranking, one page. Resolves `{ rows, total }`; a row is
 * `{ rank, displayName, score, achievementCount }`.
 */
export function getLiveEventRanking(eventId, { limit = 50, offset = 0 } = {}) {
  return call('live_events_ranking', { eventId, limit, offset });
}

/** The team ranking, one page: rows add `contributorCount`. */
export function getLiveEventTeamRanking(eventId, { limit = 50, offset = 0 } = {}) {
  return call('live_events_team_ranking', { eventId, limit, offset });
}

/** Joins with a public display name. Resolves `{ account, eventId, displayName, showInRanking }`. */
export function joinLiveEvent(account, eventId, displayName, showInRanking) {
  return call('live_events_join', { expectedAccount: account, eventId, displayName, showInRanking });
}

/** Changes the display name and / or the visibility (`null` / omitted keeps the value). */
export function updateLiveEventParticipation(account, eventId, { displayName = null, showInRanking = null } = {}) {
  return call('live_events_update', { expectedAccount: account, eventId, displayName, showInRanking });
}

/** `{ joined, displayName, showInRanking, score, achievementCount, rank }` (`rank` is null when hidden). */
export function getMyLiveEventStatus(account, eventId) {
  return call('live_events_status', { expectedAccount: account, eventId });
}
