vi.mock('../../../../js/app/components/game/DynamicLevel', () => ({
  __esModule: true,
  default: class MockDynamicLevel {},
}));

import extendYup from '../../../../js/app/common/extendYup';

beforeAll(() => extendYup());

import { CloudSyncEngine, STATUS } from '../../../../js/app/common/cloudSave/syncEngine';

const A = 'account-a';
const B = 'account-b';
const signedIn = (account, offline = false) => ({ state: 'signed_in', account, offline });
const signedOut = { state: 'signed_out', account: null };

const emptyContext = () => ({ xp: 0, inventory: ['tshirt', 'jeans'], completedObjectives: {}, migrations: { local: true } });
const playedContext = (xp = 100) => ({
  xp,
  inventory: ['tshirt', 'jeans'],
  completedObjectives: { 'm/o': { missionName: 'm', objectiveName: 'o', completedOn: new Date('2026-01-01') } },
  migrations: { local: true },
});
const cloudRow = (account, over = {}) => ({
  account,
  revision: 5,
  updatedAt: '2026-02-03T04:05:06Z',
  schemaVersion: 1,
  data: { xp: 7, completedObjectives: {}, migrations: { remote: true } },
  ...over,
});
const code = cloudCode => Object.assign(new Error(cloudCode), { cloudCode });

// The engine's work is a chain of promises; this lets it run to its next wait.
const settle = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

function harness({ state = {}, context = emptyContext(), cloud = null } = {}) {
  const h = {
    context,
    cloud, // the row of the account named in a call (or null)
    stored: { boundAccount: null, ackRevision: 0, dirty: false, restoreInProgress: null, ...state },
    authListener: null,
    authStatus: signedOut,
    calls: [],
    revision: cloud ? cloud.revision : 0,
    choice: 'local',
    confirm: true,
    applyError: null,
  };
  h.deps = {
    api: {
      fetch: vi.fn(async account => {
        h.calls.push(`fetch:${account}`);
        if (h.fetchError) throw h.fetchError;
        return h.cloud;
      }),
      upload: vi.fn(async (account, data, version) => {
        h.calls.push(`upload:${account}`);
        if (h.uploadError) throw h.uploadError;
        if (h.uploadGate) await h.uploadGate;
        h.revision += 1;
        h.cloud = { account, revision: h.revision, updatedAt: 'now', schemaVersion: version, data };
        return { account, revision: h.revision, updatedAt: 'now' };
      }),
    },
    auth: {
      getStatus: vi.fn(async () => h.authStatus),
      onChange: vi.fn(async listener => {
        h.authListener = listener;
        return () => {};
      }),
      logout: vi.fn(async () => {
        h.calls.push('logout');
      }),
    },
    state: {
      load: vi.fn(async () => ({ ...h.stored })),
      save: vi.fn(async s => {
        h.stored = { ...s };
      }),
    },
    local: {
      getContext: () => h.context,
      applySaved: vi.fn(async (values, removed) => {
        h.calls.push('applySaved');
        if (h.applyError) throw h.applyError;
        h.applied = { values, removed };
      }),
    },
    ui: {
      choose: vi.fn(async summaries => {
        h.calls.push('choose');
        h.chosen = summaries;
        return h.choiceGate ? h.choiceGate : h.choice;
      }),
      dismissChoice: vi.fn(),
      confirmUpload: vi.fn(async () => h.confirm),
      notify: vi.fn(),
    },
    reload: vi.fn(() => h.calls.push('reload')),
  };
  h.engine = new CloudSyncEngine(h.deps, { debounceMs: 100, retryBaseMs: 1000, retryMaxMs: 8000 });
  h.signIn = async (account, offline = false) => {
    h.authStatus = signedIn(account, offline);
    if (!h.engine.started) {
      await h.engine.start();
    } else {
      h.authListener(h.authStatus);
    }
    await settle();
  };
  h.signOut = async () => {
    h.authStatus = signedOut;
    h.authListener(signedOut);
    await settle();
  };
  return h;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  console.error.mockRestore();
});

describe('first sign-in', () => {
  test('a new local save with no cloud save is uploaded and bound to the account', async () => {
    const h = harness({ context: playedContext() });
    await h.signIn(A);
    expect(h.calls).toEqual([`fetch:${A}`, `upload:${A}`]);
    expect(h.stored).toMatchObject({ boundAccount: A, ackRevision: 1, dirty: false });
    expect(h.engine.getStatus()).toBe(STATUS.SYNCED);
    // what was uploaded is a snapshot of the cloud fields only
    const [, data] = h.deps.api.upload.mock.calls[0];
    expect(data.xp).toBe(100);
    expect(data).not.toHaveProperty('user');
  });

  test('an empty local save restores the cloud save automatically and reloads', async () => {
    const h = harness({ cloud: cloudRow(A) });
    await h.signIn(A);
    expect(h.calls).toEqual([`fetch:${A}`, 'applySaved', 'reload']);
    expect(h.deps.ui.choose).not.toHaveBeenCalled();
    // migrations are merged with the local ones; fields the cloud lacks are removed
    expect(h.applied.values.xp).toBe(7);
    expect(h.applied.values.migrations).toEqual({ remote: true, local: true });
    expect(h.applied.removed).toContain('inventory');
    expect(h.stored).toMatchObject({ boundAccount: A, ackRevision: 5, dirty: false, restoreInProgress: null });
  });

  test('local progress and a cloud save: the player chooses; this computer wins', async () => {
    const h = harness({ context: playedContext(), cloud: cloudRow(A) });
    h.choice = 'local';
    await h.signIn(A);
    expect(h.chosen.local).toEqual({ xp: 100, objectives: 1 });
    expect(h.chosen.cloud).toMatchObject({ xp: 7, objectives: 0, updatedAt: '2026-02-03T04:05:06Z' });
    expect(h.calls).toEqual([`fetch:${A}`, 'choose', `upload:${A}`]);
    expect(h.stored).toMatchObject({ boundAccount: A, ackRevision: 6 });
    expect(h.deps.reload).not.toHaveBeenCalled();
  });

  test('local progress and a cloud save: the cloud save is chosen', async () => {
    const h = harness({ context: playedContext(), cloud: cloudRow(A) });
    h.choice = 'cloud';
    await h.signIn(A);
    expect(h.calls).toEqual([`fetch:${A}`, 'choose', 'applySaved', 'reload']);
    expect(h.stored.boundAccount).toBe(A);
  });

  test('cancelling the choice writes nothing on either side and signs out', async () => {
    const h = harness({ context: playedContext(), cloud: cloudRow(A) });
    h.choice = 'cancel';
    await h.signIn(A);
    expect(h.calls).toEqual([`fetch:${A}`, 'choose', 'logout']);
    expect(h.deps.state.save).not.toHaveBeenCalled();
    expect(h.stored.boundAccount).toBeNull();
  });

  test('an unexpected answer (a failed dialog) is treated as cancel, not as a choice', async () => {
    const h = harness({ context: playedContext(), cloud: cloudRow(A) });
    h.deps.ui.choose.mockRejectedValue(new Error('dialog failed'));
    await h.signIn(A);
    expect(h.calls).not.toContain(`upload:${A}`);
    expect(h.calls).not.toContain('applySaved');
    expect(h.calls).toContain('logout');
  });
});

describe('same account, later sessions (another device in between)', () => {
  test('unsent local changes are uploaded: the last accepted write wins', async () => {
    const h = harness({
      context: playedContext(),
      cloud: cloudRow(A, { revision: 9 }),
      state: { boundAccount: A, ackRevision: 5, dirty: true },
    });
    await h.signIn(A);
    expect(h.calls).toEqual([`fetch:${A}`, `upload:${A}`]);
    expect(h.stored).toMatchObject({ ackRevision: 10, dirty: false });
  });

  test('nothing unsent and a newer cloud revision: the other device is taken over', async () => {
    const h = harness({ cloud: cloudRow(A, { revision: 9 }), state: { boundAccount: A, ackRevision: 5 } });
    await h.signIn(A);
    expect(h.calls).toEqual([`fetch:${A}`, 'applySaved', 'reload']);
    expect(h.stored.ackRevision).toBe(9);
  });

  test('nothing unsent and nothing new: nothing happens', async () => {
    const h = harness({ cloud: cloudRow(A, { revision: 5 }), state: { boundAccount: A, ackRevision: 5 } });
    await h.signIn(A);
    expect(h.calls).toEqual([`fetch:${A}`]);
    expect(h.engine.getStatus()).toBe(STATUS.SYNCED);
  });

  test('the cloud save is gone: the local save is uploaded again', async () => {
    const h = harness({ context: playedContext(), state: { boundAccount: A, ackRevision: 5 } });
    await h.signIn(A);
    expect(h.calls).toEqual([`fetch:${A}`, `upload:${A}`]);
  });
});

describe('another account', () => {
  test('a save bound to another account is never uploaded silently', async () => {
    const h = harness({ context: playedContext(), state: { boundAccount: A, ackRevision: 3 } });
    h.confirm = false;
    await h.signIn(B);
    expect(h.deps.ui.confirmUpload).toHaveBeenCalled();
    expect(h.calls).toEqual([`fetch:${B}`, 'logout']);
  });

  test('...unless the player confirms: then it is uploaded and rebound', async () => {
    const h = harness({ context: playedContext(), state: { boundAccount: A, ackRevision: 3 } });
    await h.signIn(B);
    expect(h.calls).toEqual([`fetch:${B}`, `upload:${B}`]);
    expect(h.stored).toMatchObject({ boundAccount: B, ackRevision: 1 });
  });

  test('with a cloud save on the other account, the player chooses', async () => {
    const h = harness({ context: playedContext(), cloud: cloudRow(B), state: { boundAccount: A, ackRevision: 3, dirty: true } });
    await h.signIn(B);
    expect(h.deps.ui.choose).toHaveBeenCalled();
  });

  test('logging out stops syncing; local changes stay dirty and are not uploaded to anyone', async () => {
    const h = harness({ context: playedContext() });
    await h.signIn(A);
    h.calls.length = 0;
    await h.signOut();
    expect(h.engine.getStatus()).toBe(STATUS.SIGNED_OUT);
    h.engine.notifyLocalChange();
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.calls).toEqual([]);
    expect(h.stored.dirty).toBe(true);
    expect(h.stored.boundAccount).toBe(A); // the binding is kept
    // the same account again: the unsent change goes up
    h.cloud = { ...h.cloud };
    await h.signIn(A);
    expect(h.calls).toEqual([`fetch:${A}`, `upload:${A}`]);
    expect(h.stored.dirty).toBe(false);
  });

  test('switching accounts while the first fetch is running discards that result', async () => {
    const h = harness({ context: playedContext() });
    let release;
    h.deps.api.fetch.mockImplementationOnce(
      () => new Promise(resolve => { release = () => resolve(null); })
    );
    await h.signIn(A);
    await h.signIn(B); // A's fetch is still pending
    release(); // A's answer arrives late
    await settle();
    expect(h.calls).toContain(`upload:${B}`);
    expect(h.calls).not.toContain(`upload:${A}`);
    expect(h.stored.boundAccount).toBe(B);
  });

  test('logging out while the choice is open discards the answer and closes the dialog', async () => {
    const h = harness({ context: playedContext(), cloud: cloudRow(A) });
    let answer;
    h.choiceGate = new Promise(resolve => { answer = resolve; });
    await h.signIn(A);
    expect(h.engine.getStatus()).toBe(STATUS.CHOOSING);
    await h.signOut();
    expect(h.deps.ui.dismissChoice).toHaveBeenCalled();
    answer('cloud');
    await settle();
    expect(h.calls).not.toContain('applySaved');
    expect(h.calls).not.toContain(`upload:${A}`);
    expect(h.engine.getStatus()).toBe(STATUS.SIGNED_OUT);
  });

  test('logging out during an upload: the acknowledgement is not recorded', async () => {
    const h = harness({ context: playedContext() });
    let release;
    h.uploadGate = new Promise(resolve => { release = resolve; });
    await h.signIn(A);
    expect(h.calls).toContain(`upload:${A}`);
    await h.signOut();
    release();
    await settle();
    expect(h.stored.boundAccount).toBeNull();
    expect(h.stored.ackRevision).toBe(0);
  });
});

describe('uploads after the first sync', () => {
  async function synced(overrides) {
    const h = harness({ context: playedContext(), ...overrides });
    await h.signIn(A);
    h.calls.length = 0;
    return h;
  }

  test('changes are debounced into one upload and the dirty flag is persisted at once', async () => {
    const h = await synced();
    h.engine.notifyLocalChange();
    h.engine.notifyLocalChange();
    h.engine.notifyLocalChange();
    await settle();
    expect(h.stored.dirty).toBe(true);
    expect(h.calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(100);
    expect(h.calls).toEqual([`upload:${A}`]);
    expect(h.stored).toMatchObject({ dirty: false, ackRevision: 2 });
  });

  test('a change during an upload keeps it dirty and uploads again', async () => {
    const h = await synced();
    let release;
    h.uploadGate = new Promise(resolve => { release = resolve; });
    h.engine.notifyLocalChange();
    await vi.advanceTimersByTimeAsync(100);
    expect(h.calls).toEqual([`upload:${A}`]);
    h.engine.notifyLocalChange(); // while the first request is in flight
    h.uploadGate = null;
    release();
    await settle();
    expect(h.calls).toEqual([`upload:${A}`, `upload:${A}`]);
    expect(h.stored).toMatchObject({ dirty: false, ackRevision: 3 });
  });

  test('a lost connection keeps the change, shows offline and retries with a growing delay', async () => {
    const h = await synced();
    h.uploadError = code('offline');
    h.engine.notifyLocalChange();
    await vi.advanceTimersByTimeAsync(100);
    expect(h.engine.getStatus()).toBe(STATUS.OFFLINE);
    expect(h.stored.dirty).toBe(true);
    await vi.advanceTimersByTimeAsync(1000); // 1st retry fails
    await vi.advanceTimersByTimeAsync(1999);
    expect(h.deps.api.upload).toHaveBeenCalledTimes(2 + 1); // first sync + 2 attempts
    await vi.advanceTimersByTimeAsync(1); // 2nd retry (after 2 s) fails
    expect(h.deps.api.upload).toHaveBeenCalledTimes(4);
    h.uploadError = null;
    await vi.advanceTimersByTimeAsync(4000);
    expect(h.engine.getStatus()).toBe(STATUS.SYNCED);
    expect(h.stored.dirty).toBe(false);
  });

  test('coming back online retries at once', async () => {
    const h = await synced();
    h.uploadError = code('offline');
    h.engine.notifyLocalChange();
    await vi.advanceTimersByTimeAsync(100);
    h.uploadError = null;
    h.engine.retryNow();
    await settle();
    expect(h.engine.getStatus()).toBe(STATUS.SYNCED);
    expect(h.stored.dirty).toBe(false);
  });

  test('a refused upload is not retried automatically; the next change tries again', async () => {
    const h = await synced();
    h.uploadError = code('too_large');
    h.engine.notifyLocalChange();
    await vi.advanceTimersByTimeAsync(100);
    expect(h.engine.getStatus()).toBe(STATUS.ERROR);
    expect(h.deps.ui.notify).toHaveBeenCalledWith('tooLarge');
    await vi.advanceTimersByTimeAsync(60000);
    expect(h.deps.api.upload).toHaveBeenCalledTimes(2);
    h.uploadError = null;
    h.engine.notifyLocalChange();
    await vi.advanceTimersByTimeAsync(100);
    expect(h.engine.getStatus()).toBe(STATUS.SYNCED);
  });

  test('"account changed" and "signed out" errors are left to the sign-in status', async () => {
    const h = await synced();
    h.uploadError = code('account_changed');
    h.engine.notifyLocalChange();
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(60000);
    expect(h.deps.api.upload).toHaveBeenCalledTimes(2);
  });

  test('changes before the first sync finished do not upload on their own', async () => {
    const h = harness({ context: playedContext(), cloud: cloudRow(A) });
    h.choiceGate = new Promise(() => {});
    await h.signIn(A);
    h.engine.notifyLocalChange();
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.calls).toEqual([`fetch:${A}`, 'choose']);
    expect(h.stored.dirty).toBe(true);
  });

  test('signed out, changes are only recorded', async () => {
    const h = harness({ context: playedContext() });
    await h.engine.start();
    h.engine.notifyLocalChange();
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.calls).toEqual([]);
    expect(h.stored.dirty).toBe(true);
  });
});

describe('restore safety', () => {
  test('a failed restore keeps the marker, does not reload, does not bind, and is repeated at the next sign-in', async () => {
    const h = harness({ cloud: cloudRow(A) });
    h.applyError = new Error('disk full');
    await h.signIn(A);
    expect(h.deps.reload).not.toHaveBeenCalled();
    expect(h.deps.ui.notify).toHaveBeenCalledWith('restoreFailed');
    expect(h.stored.restoreInProgress).toEqual({ account: A, revision: 5 });
    expect(h.stored.boundAccount).toBeNull();
    // nothing is uploaded from a half-restored save
    h.engine.notifyLocalChange();
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.deps.api.upload).not.toHaveBeenCalled();

    // next launch
    const next = harness({ cloud: cloudRow(A), state: h.stored, context: playedContext() });
    await next.signIn(A);
    expect(next.calls).toEqual([`fetch:${A}`, 'applySaved', 'reload']); // no dialog: the marker decides
    expect(next.stored).toMatchObject({ boundAccount: A, restoreInProgress: null });
  });

  test('a marker of another account makes the local save unbound: the player is asked', async () => {
    const h = harness({
      context: playedContext(),
      cloud: cloudRow(B),
      state: { boundAccount: B, ackRevision: 5, restoreInProgress: { account: A, revision: 2 } },
    });
    await h.signIn(B);
    expect(h.deps.ui.choose).toHaveBeenCalled();
    expect(h.deps.reload).not.toHaveBeenCalled();
  });

  test('a cloud save of a newer schema version is not touched and nothing is uploaded', async () => {
    const h = harness({ context: playedContext(), cloud: cloudRow(A, { schemaVersion: 99 }) });
    await h.signIn(A);
    expect(h.engine.getStatus()).toBe(STATUS.UNSUPPORTED);
    expect(h.deps.ui.notify).toHaveBeenCalledWith('unsupported');
    h.engine.notifyLocalChange();
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.calls).toEqual([`fetch:${A}`]);
  });

  test('a cloud save that fails validation is not applied', async () => {
    const h = harness({ cloud: cloudRow(A, { data: { xp: -1 } }) });
    await h.signIn(A);
    expect(h.calls).toEqual([`fetch:${A}`]);
    expect(h.engine.getStatus()).toBe(STATUS.ERROR);
    expect(h.deps.ui.notify).toHaveBeenCalledWith('invalid');
  });

  test('a fetch that fails while offline is retried and the game is not blocked', async () => {
    const h = harness({ context: playedContext() });
    h.fetchError = code('offline');
    await h.signIn(A, true);
    expect(h.engine.getStatus()).toBe(STATUS.OFFLINE);
    h.fetchError = null;
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.calls.filter(c => c.startsWith('upload')).length).toBe(1);
    expect(h.engine.getStatus()).toBe(STATUS.SYNCED);
  });
});

describe('start and stop', () => {
  test('an unreadable sync state keeps the engine off', async () => {
    const h = harness({ context: playedContext() });
    h.deps.state.load.mockRejectedValue(new Error('corrupt'));
    h.authStatus = signedIn(A);
    await h.engine.start();
    await settle();
    expect(h.calls).toEqual([]);
    h.engine.notifyLocalChange();
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.calls).toEqual([]);
  });

  test('after stop (Clear Data) nothing runs and nothing is written', async () => {
    const h = harness({ context: playedContext() });
    await h.signIn(A);
    h.calls.length = 0;
    h.engine.notifyLocalChange();
    await h.engine.stop();
    h.deps.state.save.mockClear();
    await vi.advanceTimersByTimeAsync(5000);
    h.engine.notifyLocalChange();
    expect(h.calls).toEqual([]);
    expect(h.deps.state.save).not.toHaveBeenCalled();
  });

  test('status listeners are told about changes', async () => {
    const h = harness({ context: playedContext() });
    const seen = [];
    h.engine.onStatusChange(s => seen.push(s));
    await h.signIn(A);
    await h.signOut();
    expect(seen).toEqual([STATUS.SYNCING, STATUS.SYNCED, STATUS.SIGNED_OUT]);
  });
});

describe('review fixes', () => {
  test('a failed old upload does not release the run of a newer sign-in', async () => {
    const h = harness({ context: playedContext() });
    const gates = [];
    let inFlight = 0;
    let maxInFlight = 0;
    h.deps.api.upload.mockImplementation(
      (account, data, version) =>
        new Promise((resolve, reject) => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          gates.push({
            resolve: () => { inFlight -= 1; resolve({ account, revision: 1, updatedAt: 't' }); },
            reject: e => { inFlight -= 1; reject(e); },
          });
        })
    );
    await h.signIn(A); // A's first upload is pending (gates[0])
    await h.signIn(B); // B's first upload is pending (gates[1])
    gates[0].reject(code('offline')); // A's request fails late
    await settle();
    h.engine.notifyLocalChange();
    await vi.advanceTimersByTimeAsync(100);
    // B's run still owns the upload: the change waits instead of a parallel request
    expect(gates).toHaveLength(2);
    gates[1].resolve();
    await settle();
    expect(maxInFlight).toBe(1 + 1); // A's and B's initial requests only
  });

  test('an unfinished restore of unknown owner is never uploaded without confirmation', async () => {
    const h = harness({
      context: playedContext(),
      state: { boundAccount: A, ackRevision: 2, restoreInProgress: { account: A, revision: 2 } },
    });
    h.confirm = false;
    await h.signIn(A); // no cloud save left to repeat the restore from
    expect(h.deps.ui.confirmUpload).toHaveBeenCalled();
    expect(h.calls).toEqual([`fetch:${A}`, 'logout']);
    expect(h.stored.restoreInProgress).not.toBeNull();
  });

  test('a confirmed upload replaces an unfinished restore and clears the marker', async () => {
    const h = harness({
      context: playedContext(),
      state: { boundAccount: A, ackRevision: 2, restoreInProgress: { account: A, revision: 2 } },
    });
    await h.signIn(A);
    expect(h.calls).toEqual([`fetch:${A}`, `upload:${A}`]);
    expect(h.stored).toMatchObject({ boundAccount: A, restoreInProgress: null });
  });

  test('stop() during a restore: the write finishes, but nothing is bound, saved or reloaded after it', async () => {
    const h = harness({ cloud: cloudRow(A) });
    let finishApply;
    h.deps.local.applySaved.mockImplementation(() => new Promise(resolve => { finishApply = resolve; }));
    await h.signIn(A);
    expect(finishApply).toBeDefined();
    const stopped = h.engine.stop();
    let done = false;
    stopped.then(() => { done = true; });
    await settle();
    expect(done).toBe(false); // waits for the in-flight write
    h.deps.state.save.mockClear();
    finishApply();
    await stopped;
    await settle();
    expect(h.deps.reload).not.toHaveBeenCalled();
    expect(h.deps.state.save).not.toHaveBeenCalled();
    expect(h.stored.boundAccount).toBeNull();
  });

  test('a restore superseded by a sign-out does not bind or reload, and its failure does not touch the state', async () => {
    const h = harness({ cloud: cloudRow(A) });
    let failApply;
    h.deps.local.applySaved.mockImplementation(() => new Promise((_, reject) => { failApply = reject; }));
    await h.signIn(A);
    await h.signOut();
    failApply(new Error('late failure'));
    await settle();
    expect(h.deps.ui.notify).not.toHaveBeenCalledWith('restoreFailed');
    expect(h.engine.getStatus()).toBe(STATUS.SIGNED_OUT);
    expect(h.deps.reload).not.toHaveBeenCalled();
  });

  test('a restore of the current sign-in still completes', async () => {
    const h = harness({ cloud: cloudRow(A) });
    await h.signIn(A);
    expect(h.deps.reload).toHaveBeenCalledTimes(1);
    expect(h.stored.boundAccount).toBe(A);
  });

  test('an approved first upload that failed is retried by the next local change', async () => {
    const h = harness({ context: playedContext() });
    h.uploadError = code('rejected');
    await h.signIn(A);
    expect(h.engine.getStatus()).toBe(STATUS.ERROR);
    expect(h.stored.boundAccount).toBeNull();
    h.uploadError = null;
    h.engine.notifyLocalChange();
    await vi.advanceTimersByTimeAsync(100);
    expect(h.stored).toMatchObject({ boundAccount: A, ackRevision: 1, dirty: false });
  });

  test('a declined save of another account is not uploaded by later local changes', async () => {
    const h = harness({ context: playedContext(), state: { boundAccount: A, ackRevision: 3 } });
    let answer;
    h.deps.ui.confirmUpload.mockImplementation(() => new Promise(resolve => { answer = resolve; }));
    await h.signIn(B);
    h.engine.notifyLocalChange();
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.calls).toEqual([`fetch:${B}`]); // still waiting for the confirmation
    answer(false);
    await settle();
    expect(h.calls).not.toContain(`upload:${B}`);
  });

  test('after stop() the engine can be started again (Clear Data failed)', async () => {
    const h = harness({ context: playedContext() });
    await h.signIn(A);
    await h.engine.stop();
    h.calls.length = 0;
    await h.engine.start();
    await settle();
    expect(h.calls).toEqual([`fetch:${A}`]);
  });
});
