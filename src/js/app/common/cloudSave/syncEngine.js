/**
 * Cloud save sync engine: keeps the local save and the signed-in user's cloud
 * save together, without ever making the game wait for it.
 *
 * Rules:
 * - Local saving is independent of this module. Signed out, offline or on any
 *   failure here, the game keeps saving locally.
 * - The local save is bound to one account (`boundAccount`, an opaque
 *   fingerprint from the native auth status). Uploads happen only for the bound
 *   account, after the reconciliation of this sign-in finished.
 * - Conflicts: the last write that the server accepts wins (the server assigns
 *   a rising revision). This device never merges.
 * - Every asynchronous result is checked against the generation of the sign-in
 *   that started it: after a logout or an account switch it is discarded.
 *   (The native side also refuses a call that names another account.)
 * - A restore writes the store key by key under a marker and then reloads the
 *   window, so that startup migrations and game objects see consistent data.
 *
 * All outside effects are injected (`deps`), so the engine is testable.
 */
import {
  CLOUD_SAVE_SCHEMA_VERSION,
  createSnapshot,
  hasMeaningfulProgress,
  summarize,
  validateSnapshot,
  mergeMigrations,
  getCloudSaveFields,
} from './snapshot';
import { EMPTY_SYNC_STATE } from './syncState';

export const STATUS = Object.freeze({
  SIGNED_OUT: 'signed_out',
  SYNCING: 'syncing',
  SYNCED: 'synced',
  OFFLINE: 'offline',
  ERROR: 'error',
  CHOOSING: 'choosing',
  UNSUPPORTED: 'unsupported',
});

const DEFAULTS = { debounceMs: 2000, retryBaseMs: 5000, retryMaxMs: 300000 };

// Error codes that are worth retrying, and which status they show.
const RETRYABLE = { offline: STATUS.OFFLINE, server: STATUS.ERROR, unauthorized: STATUS.ERROR };
// The sign-in changed under the call: the auth status event decides what next.
const AUTH_CHANGED = ['account_changed', 'signed_out'];

export class CloudSyncEngine {
  /**
   * @param {object} deps
   * @param {{fetch: Function, upload: Function}} deps.api  fetchCloudSave / uploadCloudSave
   * @param {{getStatus: Function, onChange: Function, logout: Function}} deps.auth
   * @param {{load: Function, save: Function}} deps.state   persisted sync state
   * @param {{getContext: Function, applySaved: Function}} deps.local
   * @param {{choose: Function, dismissChoice: Function, confirmUpload: Function, notify: Function}} deps.ui
   * @param {Function} deps.reload
   */
  constructor(deps, options = {}) {
    this.deps = deps;
    this.options = { ...DEFAULTS, ...options };
    this.state = { ...EMPTY_SYNC_STATE };
    this.account = null;
    this.generation = 0;
    this.reconciled = false;
    this.restoring = false;
    this.stopped = false;
    this.started = false;
    this.unsupported = false;
    this.mutations = 0;
    this.status = STATUS.SIGNED_OUT;
    this.listeners = new Set();
    this.debounceTimer = null;
    this.retryTimer = null;
    this.retryFn = null;
    this.retryCount = 0;
    this.uploadRun = null;
    this.rerun = false;
    // The account whose first upload the player approved (or that needs no
    // approval) but that did not bind yet, e.g. because the upload failed.
    this.pendingBind = null;
    this.restoreRun = null;
    this.applying = null;
    this.persistChain = Promise.resolve();
    this.unlistenAuth = null;
  }

  // ----- public -----

  getStatus() {
    return this.status;
  }

  onStatusChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Loads the persisted state and follows the auth status. Never throws. */
  async start() {
    if (this.started) return;
    this.started = true;
    this.stopped = false;
    try {
      this.state = { ...EMPTY_SYNC_STATE, ...(await this.deps.state.load()) };
    } catch (error) {
      // Without the state the engine cannot tell whose save this is: stay off.
      console.error('Cloud sync: could not read the sync state', error);
      this.stopped = true;
      return;
    }
    try {
      this.unlistenAuth = await this.deps.auth.onChange(status => this.handleAuth(status));
      this.handleAuth(await this.deps.auth.getStatus());
    } catch (error) {
      console.error('Cloud sync: could not follow the sign-in status', error);
    }
  }

  /** Called after a local change to a cloud save field. */
  notifyLocalChange() {
    if (this.stopped || !this.started) return;
    this.mutations += 1;
    if (this.restoring) return;
    if (!this.state.dirty) {
      this.state = { ...this.state, dirty: true };
      this.persist();
    }
    if (this.canSync(this.generation)) {
      this.scheduleUpload();
    }
  }

  /** The network came back (window `online`). */
  retryNow() {
    if (this.retryFn && !this.stopped) {
      const retry = this.retryFn;
      this.clearRetry();
      retry();
    }
  }

  /** For Clear Data: nothing runs or writes after this resolves. */
  async stop() {
    this.stopped = true;
    this.started = false;
    this.generation += 1;
    this.account = null;
    this.pendingBind = null;
    this.restoreRun = null;
    this.restoring = false;
    this.clearTimers();
    this.uploadRun = null;
    this.deps.ui.dismissChoice();
    if (this.unlistenAuth) {
      this.unlistenAuth();
      this.unlistenAuth = null;
    }
    // A restore that is writing the store finishes (or fails) before this
    // resolves; it does nothing after that (see restore()).
    if (this.applying) await this.applying.catch(() => {});
    await this.persistChain;
  }

  // ----- auth -----

  handleAuth(status) {
    if (this.stopped) return;
    const account = status && status.state === 'signed_in' && status.account ? status.account : null;
    if (account !== this.account) {
      this.switchAccount(account);
    } else if (account && !status.offline && this.status === STATUS.OFFLINE) {
      this.retryNow();
    }
  }

  switchAccount(account) {
    this.generation += 1;
    this.clearTimers();
    this.uploadRun = null;
    this.pendingBind = null;
    this.rerun = false;
    this.retryCount = 0;
    this.reconciled = false;
    this.unsupported = false;
    this.account = account;
    this.deps.ui.dismissChoice();
    if (!account) {
      this.setStatus(STATUS.SIGNED_OUT);
      return;
    }
    this.setStatus(STATUS.SYNCING);
    const generation = this.generation;
    this.guard(generation, () => this.reconcile(generation));
  }

  // ----- reconciliation (once per sign-in) -----

  async reconcile(generation) {
    const account = this.account;
    let row;
    try {
      row = await this.deps.api.fetch(account);
    } catch (error) {
      return this.failed(generation, error, () => this.guard(generation, () => this.reconcile(generation)));
    }
    if (!this.current(generation)) return;
    if (row && row.account !== account) return;
    if (row && row.schemaVersion > CLOUD_SAVE_SCHEMA_VERSION) {
      this.unsupported = true;
      this.setStatus(STATUS.UNSUPPORTED);
      this.deps.ui.notify('unsupported');
      return;
    }
    let valid = null;
    if (row) {
      valid = validateSnapshot(row.data);
      if (!valid.ok) {
        this.setStatus(STATUS.ERROR);
        this.deps.ui.notify('invalid');
        return;
      }
    }

    // A restore that was interrupted for this account is repeated first.
    const marker = this.state.restoreInProgress;
    if (marker && marker.account === account && row) {
      return this.restore(generation, row, valid.values);
    }
    // A marker for another account (or with no cloud save left) means that the
    // local data is a half-written copy: it belongs to nobody.
    const bound = marker ? null : this.state.boundAccount;

    if (bound === account) {
      return this.reconcileSameAccount(generation, row, valid);
    }
    // Unknown owner (a marker) is treated like another account's save: it is
    // never uploaded without the player's explicit confirmation.
    return this.reconcileNewBinding(generation, row, valid, bound, Boolean(marker));
  }

  async reconcileSameAccount(generation, row, valid) {
    if (this.state.dirty || !row) {
      // The last write that the server accepts wins; a missing row is rewritten.
      this.reconciled = true;
      return this.flush(generation);
    }
    if (row.revision > this.state.ackRevision) {
      // Another device wrote since: take it over (there is nothing unsent here).
      return this.restore(generation, row, valid.values);
    }
    this.reconciled = true;
    this.setStatus(STATUS.SYNCED);
  }

  async reconcileNewBinding(generation, row, valid, bound, unknownOwner) {
    const local = createSnapshot(this.deps.local.getContext());
    if (!row) {
      if (bound !== null || unknownOwner) {
        // Local progress of another account (or of an unfinished restore): never upload it silently.
        const confirmed = await this.ask(generation, () => this.deps.ui.confirmUpload());
        if (!this.current(generation)) return;
        if (!confirmed) {
          await this.deps.auth.logout().catch(() => {});
          return;
        }
      }
      return this.uploadAndBind(generation);
    }
    if (!hasMeaningfulProgress(local)) {
      return this.restore(generation, row, valid.values);
    }
    this.setStatus(STATUS.CHOOSING);
    const choice = await this.ask(generation, () =>
      this.deps.ui.choose({
        local: summarize(local),
        cloud: { ...summarize(valid.values), updatedAt: row.updatedAt },
      })
    );
    if (!this.current(generation)) return;
    if (choice === 'cloud') {
      return this.restore(generation, row, valid.values);
    }
    if (choice === 'local') {
      return this.uploadAndBind(generation);
    }
    // Cancelled: nothing is written on either side, and the account is left.
    this.setStatus(STATUS.SIGNED_OUT);
    await this.deps.auth.logout().catch(() => {});
  }

  async ask(generation, question) {
    try {
      return await question();
    } catch (error) {
      console.error('Cloud sync: a question to the player failed', error);
      return undefined;
    }
  }

  async uploadAndBind(generation) {
    this.reconciled = true;
    this.pendingBind = this.account;
    return this.flush(generation, { bind: true });
  }

  // ----- restore -----

  async restore(generation, row, values) {
    const account = this.account;
    const run = {};
    this.restoreRun = run;
    this.restoring = true;
    this.clearTimers();
    // Still the restore that this sign-in (and this engine run) started?
    const live = () => this.current(generation) && this.restoreRun === run;
    const finish = () => {
      if (this.restoreRun === run) {
        this.restoreRun = null;
        this.restoring = false;
      }
    };
    try {
      // Never two restores writing at the same time.
      if (this.applying) await this.applying.catch(() => {});
      if (!live()) return finish();
      await this.save({ restoreInProgress: { account, revision: row.revision } });
      if (!live()) return finish();
      const local = this.deps.local.getContext();
      const toWrite = { ...values };
      if (values.migrations) {
        toWrite.migrations = mergeMigrations(local.migrations, values.migrations);
      }
      const removed = getCloudSaveFields().filter(key => !(key in toWrite));
      const applying = this.deps.local.applySaved(toWrite, removed);
      this.applying = applying;
      try {
        await applying;
      } finally {
        if (this.applying === applying) this.applying = null;
      }
    } catch (error) {
      if (!live()) {
        // An old run: it must not touch the state of the current one. The
        // marker stays, so that the restore is repeated.
        console.error('Cloud sync: a superseded restore failed', error);
        return finish();
      }
      // The marker stays: the next sign-in repeats the restore. The store may
      // hold a mix until then, so the game keeps the in-memory state and does
      // not upload.
      console.error('Cloud sync: restore failed', error);
      finish();
      this.reconciled = false;
      this.setStatus(STATUS.ERROR);
      this.deps.ui.notify('restoreFailed');
      return;
    }
    // The sign-in changed or the engine was stopped while the store was being
    // written: no binding, no reload. The marker (already stored) stays.
    if (!live()) return finish();
    try {
      await this.save({
        boundAccount: account,
        ackRevision: row.revision,
        dirty: false,
        restoreInProgress: null,
      });
    } catch (error) {
      console.error('Cloud sync: could not record the restore', error);
    }
    if (!live()) return finish();
    // Persistence stays suppressed (see applySavedFields) until the reload.
    this.deps.reload();
  }

  // ----- upload -----

  canSync(generation) {
    return (
      !this.stopped &&
      this.current(generation) &&
      this.account !== null &&
      this.reconciled &&
      !this.restoring &&
      !this.unsupported &&
      (this.state.boundAccount === this.account || this.pendingBind === this.account) &&
      // An unfinished restore blocks uploads, except a first upload that the
      // player confirmed (pendingBind), which replaces the half-restored data.
      (!this.state.restoreInProgress || this.pendingBind === this.account)
    );
  }

  current(generation) {
    return !this.stopped && generation === this.generation;
  }

  scheduleUpload() {
    clearTimeout(this.debounceTimer);
    const generation = this.generation;
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.guard(generation, () => this.flush(generation));
    }, this.options.debounceMs);
  }

  /**
   * Uploads the current snapshot (again, while local changes keep arriving).
   * `bind` is the first upload of a new binding: it is allowed although the
   * local save is not bound to this account yet, and it binds on success.
   */
  async flush(generation, { bind = false } = {}) {
    if (!this.current(generation) || !this.reconciled || this.restoring || this.unsupported) return;
    if (!bind && !this.canSync(generation)) return;
    if (this.uploadRun) {
      this.rerun = true;
      return;
    }
    const run = {};
    this.uploadRun = run;
    const account = this.account;
    this.setStatus(STATUS.SYNCING);
    try {
      let again = false;
      do {
        this.rerun = false;
        const startedAt = this.mutations;
        const snapshot = createSnapshot(this.deps.local.getContext());
        let accepted;
        try {
          accepted = await this.deps.api.upload(account, snapshot, CLOUD_SAVE_SCHEMA_VERSION);
        } catch (error) {
          // The release happens in `finally`, and only for this run.
          if (this.uploadRun !== run) return;
          return this.failed(generation, error, () => this.guard(generation, () => this.flush(generation, { bind })));
        }
        if (this.uploadRun !== run || !this.current(generation) || accepted.account !== account) {
          return; // stale: discarded
        }
        const unchanged = this.mutations === startedAt;
        bind = false;
        await this.save({
          boundAccount: account,
          ackRevision: accepted.revision,
          dirty: !unchanged,
          restoreInProgress: null,
        });
        if (this.pendingBind === account) this.pendingBind = null;
        this.retryCount = 0;
        again = !unchanged || this.rerun;
      } while (again && this.uploadRun === run && this.current(generation));
      if (this.uploadRun === run && this.current(generation)) {
        this.setStatus(STATUS.SYNCED);
      }
    } finally {
      if (this.uploadRun === run) this.uploadRun = null;
    }
  }

  // ----- failures and retries -----

  failed(generation, error, retry) {
    if (!this.current(generation)) return;
    const code = error && error.cloudCode;
    if (AUTH_CHANGED.includes(code)) return;
    if (RETRYABLE[code]) {
      this.setStatus(RETRYABLE[code]);
      this.scheduleRetry(retry);
      return;
    }
    // Refused by the server (a bad or oversized save) or unexpected: no
    // automatic retry; the next local change tries again.
    console.error('Cloud sync failed', code || error);
    this.setStatus(STATUS.ERROR);
    if (code === 'too_large') this.deps.ui.notify('tooLarge');
  }

  scheduleRetry(retry) {
    this.clearRetry();
    const delay = Math.min(this.options.retryBaseMs * 2 ** this.retryCount, this.options.retryMaxMs);
    this.retryCount += 1;
    this.retryFn = retry;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.retryFn = null;
      retry();
    }, delay);
  }

  clearRetry() {
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.retryFn = null;
  }

  clearTimers() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
    this.clearRetry();
  }

  /** Runs `task`; an unexpected exception becomes the error status. */
  guard(generation, task) {
    Promise.resolve()
      .then(task)
      .catch(error => {
        console.error('Cloud sync: unexpected failure', error);
        if (this.current(generation)) this.setStatus(STATUS.ERROR);
      });
  }

  // ----- persisted state -----

  persist() {
    const snapshot = { ...this.state };
    this.persistChain = this.persistChain
      .then(() => this.deps.state.save(snapshot))
      .catch(error => console.error('Cloud sync: could not save the sync state', error));
    return this.persistChain;
  }

  /** Merges into the state and waits until it is stored; rejects if it fails. */
  async save(partial) {
    this.state = { ...this.state, ...partial };
    const snapshot = { ...this.state };
    const write = this.persistChain.then(() => this.deps.state.save(snapshot));
    this.persistChain = write.catch(error =>
      console.error('Cloud sync: could not save the sync state', error)
    );
    await write;
  }

  setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.listeners.forEach(listener => {
      try {
        listener(status);
      } catch (error) {
        console.error(error);
      }
    });
  }
}
