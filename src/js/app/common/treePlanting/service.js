/**
 * Tree planting: records a planting on the server for the signed-in account,
 * without ever deciding or delaying the local progress.
 *
 * Rules (docs/supabase/unlocks-and-trees.md):
 * - Local progress is the caller's business and never waits for this module.
 *   `record()` never rejects.
 * - Signed in and online: the server records it (idempotent per account and
 *   target). Result `recorded` or `already_recorded`.
 * - Signed in but the server cannot be reached (offline / server error /
 *   session not accepted): the planting is queued together with the account
 *   fingerprint it happened under (`pending`) and resent for that same account
 *   only: on start, on sign-in, on `online` and on a backoff timer.
 * - Signed out (or sign-in unavailable): nothing is sent and nothing is queued
 *   (`signed_out`). Past progress, restored progress and progress made while
 *   signed out is never sent later, because it cannot be attributed to an
 *   account. The queue survives a sign-out and is resent only after signing in
 *   to the same account again.
 * - The server refusing the target (`unsupported`) is final: not queued.
 *
 * All outside effects are injected, so the service is testable.
 */

export const RESULT = Object.freeze({
  RECORDED: 'recorded',
  ALREADY_RECORDED: 'already_recorded',
  PENDING: 'pending',
  SIGNED_OUT: 'signed_out',
  UNSUPPORTED: 'unsupported',
});

// `recordTimeoutMs`: the objective does not wait longer than this for the server;
// a slow answer is treated as offline (the planting is queued and the retry is
// idempotent on the server).
const DEFAULTS = { retryBaseMs: 5000, retryMaxMs: 300000, recordTimeoutMs: 10000 };
// The server could not be asked (or did not accept the session): try again later.
const RETRYABLE = ['offline', 'server', 'unauthorized'];
// The sign-in changed under the call. The planting still belongs to the account
// that was signed in when it happened, so it is queued for that account.
const SIGN_IN_CHANGED = ['signed_out', 'account_changed'];

function sameEntry(a, b) {
  return a.account === b.account && a.missionId === b.missionId && a.targetId === b.targetId;
}

export function normalizePending(stored) {
  if (!Array.isArray(stored)) return [];
  const entries = [];
  for (const item of stored) {
    if (
      item &&
      typeof item.account === 'string' &&
      item.account &&
      typeof item.missionId === 'string' &&
      item.missionId &&
      typeof item.targetId === 'string' &&
      item.targetId &&
      !entries.some(entry => sameEntry(entry, item))
    ) {
      entries.push({ account: item.account, missionId: item.missionId, targetId: item.targetId });
    }
  }
  return entries;
}

export class TreePlantingService {
  /**
   * @param {object} deps
   * @param {{getStatus: Function, onChange: Function}} deps.auth getAuthStatus / onAuthStatusChange
   * @param {{record: Function}} deps.api recordTreePlanting(account, missionId, targetId)
   * @param {{load: Function, save: Function}} deps.store the pending queue (its own store key)
   */
  constructor(deps, options = {}) {
    this.deps = deps;
    this.options = { ...DEFAULTS, ...options };
    this.pending = [];
    // True once the stored queue was read successfully (an empty queue counts).
    // Until then nothing is written to the store, so that a failed read cannot
    // lead to the stored queue being replaced; new items stay in memory.
    this.loadedOk = false;
    this.loading = null;
    this.account = null;
    this.accountKnown = false;
    this.authEvents = 0;
    this.startRun = null;
    this.flushing = null;
    this.flushAgain = false;
    this.retryTimer = null;
    this.retryCount = 0;
    this.persistChain = Promise.resolve();
    // True while the latest queue state could not be stored; a later resend
    // (after the load completed) saves it again.
    this.persistDirty = false;
    this.persistSeq = 0;
    this.unlistenAuth = null;
    this.epoch = 0;
  }

  getPending() {
    return this.pending.map(entry => ({ ...entry }));
  }

  /** Follows the sign-in and resends what is queued. Never throws. */
  start() {
    if (!this.startRun) {
      this.startRun = this.run();
    }
    return this.startRun;
  }

  async run() {
    const epoch = this.epoch;
    // Subscribe first, then ask: an event that arrives meanwhile is newer than
    // the answer to the question and wins.
    try {
      const events = this.authEvents;
      const unlisten = await this.deps.auth.onChange(status => this.handleStatus(status));
      if (epoch !== this.epoch) {
        unlisten();
        return;
      }
      this.unlistenAuth = unlisten;
      const status = await this.deps.auth.getStatus();
      if (epoch === this.epoch && events === this.authEvents) {
        this.handleStatus(status);
      }
    } catch (error) {
      console.error('Tree planting: could not follow the sign-in', error);
    }
    // Signing in (handleStatus) resends the queue once it is loaded.
    await this.load();
  }

  handleStatus(status) {
    this.authEvents += 1;
    const account = status && status.state === 'signed_in' && status.account ? status.account : null;
    const changed = account !== this.account;
    this.account = account;
    this.accountKnown = true;
    if (account && changed) {
      this.retryCount = 0;
      this.clearRetry();
      this.flush();
    }
  }

  /** Call on the `online` event. */
  retryNow() {
    this.retryCount = 0;
    this.clearRetry();
    this.flush();
  }

  // Reads the stored queue; a failure is retried by the next call. A result that
  // arrives after clear() is discarded (the epoch changed).
  load() {
    if (this.loadedOk) return Promise.resolve();
    if (!this.loading) {
      const epoch = this.epoch;
      const run = (async () => {
        try {
          const stored = normalizePending(await this.deps.store.load());
          if (epoch !== this.epoch) return;
          // Plantings queued while loading keep their place after the stored ones.
          const queuedMeanwhile = this.pending.filter(entry => !stored.some(s => sameEntry(s, entry)));
          this.pending = [...stored, ...queuedMeanwhile];
          this.loadedOk = true;
          if (queuedMeanwhile.length > 0) this.persist();
        } catch (error) {
          console.error('Tree planting: could not read the pending list', error);
        } finally {
          if (this.loading === run) this.loading = null;
        }
      })();
      this.loading = run;
    }
    return this.loading;
  }

  persist() {
    if (!this.loadedOk) return this.persistChain;
    const snapshot = this.getPending();
    const seq = (this.persistSeq += 1);
    const epoch = this.epoch;
    this.persistDirty = true;
    this.persistChain = this.persistChain
      .then(() => this.deps.store.save(snapshot))
      .then(() => {
        if (seq === this.persistSeq && epoch === this.epoch) this.persistDirty = false;
      })
      .catch(error => {
        console.error('Tree planting: could not store the pending list', error);
        // Saved again by the next resend.
        if (epoch === this.epoch) this.scheduleRetry();
      });
    return this.persistChain;
  }

  async currentAccount(epoch = this.epoch) {
    if (!this.accountKnown) {
      try {
        const events = this.authEvents;
        const status = await this.deps.auth.getStatus();
        // A response that arrives after clear() is stale: it must not restore the auth state.
        if (epoch !== this.epoch) return null;
        if (events === this.authEvents) this.handleStatus(status);
      } catch (error) {
        return null;
      }
    }
    return this.account;
  }

  /**
   * Records a planting. Resolves a RESULT value, never rejects.
   */
  async record({ missionId, targetId }) {
    const epoch = this.epoch;
    try {
      if (typeof missionId !== 'string' || !missionId || typeof targetId !== 'string' || !targetId) {
        return RESULT.UNSUPPORTED;
      }
      const account = await this.currentAccount(epoch);
      if (epoch !== this.epoch) return RESULT.UNSUPPORTED;
      if (!account) return RESULT.SIGNED_OUT;
      try {
        const answer = await this.withTimeout(this.deps.api.record(account, missionId, targetId));
        return this.fromServer(answer && answer.status);
      } catch (error) {
        const code = error && error.cloudCode;
        if (RETRYABLE.includes(code) || SIGN_IN_CHANGED.includes(code)) {
          // Discarded when Clear Data ran meanwhile: the planting belongs to erased progress.
          return (await this.enqueue({ account, missionId, targetId }, epoch))
            ? RESULT.PENDING
            : RESULT.UNSUPPORTED;
        }
        // rejected (or anything unexpected): the server will not take it.
        return RESULT.UNSUPPORTED;
      }
    } catch (error) {
      console.error('Tree planting: could not record', error);
      return RESULT.UNSUPPORTED;
    }
  }

  withTimeout(promise) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { cloudCode: 'offline' })), this.options.recordTimeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  fromServer(status) {
    switch (status) {
      case 'recorded':
        return RESULT.RECORDED;
      case 'already_recorded':
        return RESULT.ALREADY_RECORDED;
      default:
        return RESULT.UNSUPPORTED;
    }
  }

  async enqueue(entry, epoch) {
    await this.load();
    if (epoch !== this.epoch) return false;
    if (!this.pending.some(existing => sameEntry(existing, entry))) {
      this.pending.push(entry);
      this.persist();
    }
    this.scheduleRetry();
    return true;
  }

  // ----- resending -----

  flush() {
    if (this.flushing) {
      this.flushAgain = true;
      return this.flushing;
    }
    this.flushing = (async () => {
      try {
        do {
          this.flushAgain = false;
          await this.load();
          // The stored queue could not be read: try again later.
          if (!this.loadedOk) this.scheduleRetry();
          // The last save failed: save the current queue again (never before the load).
          else if (this.persistDirty) this.persist();
          await this.flushOnce();
        } while (this.flushAgain);
      } catch (error) {
        console.error('Tree planting: could not resend', error);
      } finally {
        this.flushing = null;
      }
    })();
    return this.flushing;
  }

  async flushOnce() {
    const epoch = this.epoch;
    const account = this.account;
    if (!account) return;
    const mine = this.pending.filter(entry => entry.account === account);
    for (const entry of mine) {
      if (epoch !== this.epoch || this.account !== account) return;
      try {
        await this.deps.api.record(account, entry.missionId, entry.targetId);
      } catch (error) {
        const code = error && error.cloudCode;
        if (RETRYABLE.includes(code)) {
          this.scheduleRetry();
          return;
        }
        if (SIGN_IN_CHANGED.includes(code)) {
          // The auth status event decides what happens next.
          return;
        }
        // rejected / unexpected: the server will never take it.
        await this.remove(entry, epoch);
        continue;
      }
      // recorded, already_recorded or unsupported_target: done either way.
      await this.remove(entry, epoch);
    }
    // Keep the timer while something for this account is still queued (including
    // plantings queued during this resend).
    if (!this.persistDirty && !this.pending.some(entry => entry.account === account)) {
      this.retryCount = 0;
      this.clearRetry();
    }
  }

  async remove(entry, epoch) {
    if (epoch !== this.epoch) return;
    this.pending = this.pending.filter(existing => !sameEntry(existing, entry));
    await this.persist();
  }

  scheduleRetry() {
    if (this.retryTimer) return;
    const delay = Math.min(this.options.retryBaseMs * 2 ** this.retryCount, this.options.retryMaxMs);
    this.retryCount += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.flush();
    }, delay);
  }

  clearRetry() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /**
   * Clear Data: forgets the queue, in memory and in the store, and stops
   * everything. Resolves once the store no longer holds it.
   */
  async clear() {
    this.epoch += 1;
    this.clearRetry();
    if (this.unlistenAuth) {
      this.unlistenAuth();
      this.unlistenAuth = null;
    }
    this.startRun = null;
    this.pending = [];
    this.loading = null;
    this.loadedOk = true;
    this.persistDirty = false;
    this.persistSeq += 1;
    this.account = null;
    this.accountKnown = false;
    await this.persistChain;
    await this.deps.store.clear();
  }
}
