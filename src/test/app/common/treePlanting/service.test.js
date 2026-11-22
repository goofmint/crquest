import { TreePlantingService, RESULT, normalizePending } from '../../../../js/app/common/treePlanting/service';

const rejection = cloudCode => Object.assign(new Error(cloudCode), { cloudCode });
const signedIn = account => ({ state: 'signed_in', account });
const flush = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

function setup({ status = signedIn('A'), stored = [] } = {}) {
  let emit = () => {};
  const unlisten = vi.fn();
  const saved = [];
  const deps = {
    auth: {
      getStatus: vi.fn().mockResolvedValue(status),
      onChange: vi.fn(listener => {
        emit = listener;
        return Promise.resolve(unlisten);
      }),
    },
    api: { record: vi.fn().mockResolvedValue({ status: 'recorded' }) },
    store: {
      load: vi.fn().mockResolvedValue(stored),
      save: vi.fn(async value => { saved.push(value); }),
      clear: vi.fn().mockResolvedValue(undefined),
    },
  };
  const service = new TreePlantingService(deps, { retryBaseMs: 1000, retryMaxMs: 4000 });
  return { service, deps, saved, emit: status => emit(status), unlisten };
}

const target = { missionId: 'fog_owl', targetId: 'owl_plant_tree1' };

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  console.error.mockRestore();
});

describe('record', () => {
  test('signed in and online: the server records it for the signed-in account', async () => {
    const { service, deps } = setup();
    await expect(service.record(target)).resolves.toBe(RESULT.RECORDED);
    expect(deps.api.record).toHaveBeenCalledWith('A', 'fog_owl', 'owl_plant_tree1');
    expect(service.getPending()).toEqual([]);
  });

  test('a repeat is already_recorded', async () => {
    const { service, deps } = setup();
    deps.api.record.mockResolvedValue({ status: 'already_recorded' });
    await expect(service.record(target)).resolves.toBe(RESULT.ALREADY_RECORDED);
  });

  test.each(['unsupported_target', 'surprise'])('the server answer %s is unsupported and not queued', async status => {
    const { service, deps } = setup();
    deps.api.record.mockResolvedValue({ status });
    await expect(service.record(target)).resolves.toBe(RESULT.UNSUPPORTED);
    expect(service.getPending()).toEqual([]);
  });

  test.each(['signed_out', 'unconfigured', 'expired', 'pending', 'restoring'])(
    'signed out (%s): nothing is sent or queued',
    async state => {
      const { service, deps, saved } = setup({ status: { state } });
      await expect(service.record(target)).resolves.toBe(RESULT.SIGNED_OUT);
      expect(deps.api.record).not.toHaveBeenCalled();
      expect(service.getPending()).toEqual([]);
      expect(saved).toEqual([]);
    }
  );

  test('an unreadable auth status counts as signed out', async () => {
    const { service, deps } = setup();
    deps.auth.getStatus.mockRejectedValue(new Error('boom'));
    await expect(service.record(target)).resolves.toBe(RESULT.SIGNED_OUT);
  });

  test.each(['offline', 'server', 'unauthorized', 'signed_out', 'account_changed'])(
    '%s: queued with the account and stored',
    async code => {
      const { service, deps, saved } = setup();
      deps.api.record.mockRejectedValue(rejection(code));
      await expect(service.record(target)).resolves.toBe(RESULT.PENDING);
      expect(service.getPending()).toEqual([{ account: 'A', ...target }]);
      expect(saved.at(-1)).toEqual([{ account: 'A', ...target }]);
      service.clear();
    }
  );

  test('a server that does not answer in time is treated as offline', async () => {
    const { service, deps } = setup();
    deps.api.record.mockReturnValue(new Promise(() => {}));
    const result = service.record(target);
    await vi.advanceTimersByTimeAsync(10000);
    await expect(result).resolves.toBe(RESULT.PENDING);
    expect(service.getPending()).toEqual([{ account: 'A', ...target }]);
    service.clear();
  });

  test('a refusal (rejected) or an unexpected error is final and not queued', async () => {
    const { service, deps } = setup();
    deps.api.record.mockRejectedValueOnce(rejection('rejected')).mockRejectedValueOnce(new Error('ACL'));
    await expect(service.record(target)).resolves.toBe(RESULT.UNSUPPORTED);
    await expect(service.record(target)).resolves.toBe(RESULT.UNSUPPORTED);
    expect(service.getPending()).toEqual([]);
  });

  test('missing ids are unsupported without a request', async () => {
    const { service, deps } = setup();
    await expect(service.record({ missionId: '', targetId: 'x' })).resolves.toBe(RESULT.UNSUPPORTED);
    await expect(service.record({})).resolves.toBe(RESULT.UNSUPPORTED);
    expect(deps.api.record).not.toHaveBeenCalled();
  });

  test('the same planting is queued once', async () => {
    const { service, deps } = setup();
    deps.api.record.mockRejectedValue(rejection('offline'));
    await service.record(target);
    await service.record(target);
    expect(service.getPending()).toHaveLength(1);
    service.clear();
  });
});

describe('resending', () => {
  test('a queued planting is resent for the same account and removed', async () => {
    const { service, deps, saved } = setup({ stored: [{ account: 'A', ...target }] });
    await service.start();
    await flush();
    expect(deps.api.record).toHaveBeenCalledWith('A', 'fog_owl', 'owl_plant_tree1');
    expect(service.getPending()).toEqual([]);
    expect(saved.at(-1)).toEqual([]);
  });

  test('another account is never sent the queue', async () => {
    const { service, deps } = setup({ status: signedIn('B'), stored: [{ account: 'A', ...target }] });
    await service.start();
    await flush();
    expect(deps.api.record).not.toHaveBeenCalled();
    expect(service.getPending()).toHaveLength(1);
  });

  test('signed out: the queue is kept, and sent after signing in to the same account', async () => {
    const { service, deps, emit } = setup({ status: { state: 'signed_out' }, stored: [{ account: 'A', ...target }] });
    await service.start();
    await flush();
    expect(deps.api.record).not.toHaveBeenCalled();
    emit(signedIn('B'));
    await flush();
    expect(deps.api.record).not.toHaveBeenCalled();
    emit(signedIn('A'));
    await flush();
    expect(deps.api.record).toHaveBeenCalledTimes(1);
    expect(service.getPending()).toEqual([]);
  });

  test('already_recorded and unsupported_target also remove the entry; rejected too', async () => {
    const stored = ['a', 'b', 'c'].map(targetId => ({ account: 'A', missionId: 'm', targetId }));
    const { service, deps } = setup({ stored });
    deps.api.record
      .mockResolvedValueOnce({ status: 'already_recorded' })
      .mockResolvedValueOnce({ status: 'unsupported_target' })
      .mockRejectedValueOnce(rejection('rejected'));
    await service.start();
    await flush();
    expect(service.getPending()).toEqual([]);
  });

  test('a failure keeps the entry and retries with a growing delay, then succeeds', async () => {
    const { service, deps } = setup({ stored: [{ account: 'A', ...target }] });
    deps.api.record.mockRejectedValue(rejection('offline'));
    await service.start();
    await flush();
    expect(deps.api.record).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(deps.api.record).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1999);
    expect(deps.api.record).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(deps.api.record).toHaveBeenCalledTimes(3);
    deps.api.record.mockResolvedValue({ status: 'recorded' });
    await vi.advanceTimersByTimeAsync(4000);
    expect(deps.api.record).toHaveBeenCalledTimes(4);
    expect(service.getPending()).toEqual([]);
    await vi.advanceTimersByTimeAsync(60000);
    expect(deps.api.record).toHaveBeenCalledTimes(4);
  });

  test('retryNow (the online event) resends at once', async () => {
    const { service, deps } = setup({ stored: [{ account: 'A', ...target }] });
    deps.api.record.mockRejectedValueOnce(rejection('offline'));
    await service.start();
    await flush();
    service.retryNow();
    await flush();
    expect(deps.api.record).toHaveBeenCalledTimes(2);
    expect(service.getPending()).toEqual([]);
  });

  test('a sign-in change during a resend stops it without losing the entry', async () => {
    const { service, deps } = setup({ stored: [{ account: 'A', ...target }] });
    deps.api.record.mockRejectedValueOnce(rejection('account_changed'));
    await service.start();
    await flush();
    expect(service.getPending()).toHaveLength(1);
  });

  test('an auth event that arrives before the first status answer wins', async () => {
    const { service, deps, emit } = setup({ status: signedIn('OLD') });
    let answer;
    deps.auth.getStatus.mockReturnValue(new Promise(resolve => { answer = resolve; }));
    const started = service.start();
    await flush();
    emit({ state: 'signed_out' });
    answer(signedIn('OLD'));
    await started;
    await expect(service.record(target)).resolves.toBe(RESULT.SIGNED_OUT);
  });

  test('a store that cannot be read does not break recording', async () => {
    const { service, deps } = setup();
    deps.store.load.mockRejectedValue(new Error('disk'));
    await service.start();
    await expect(service.record(target)).resolves.toBe(RESULT.RECORDED);
  });
});

describe('clear', () => {
  test('forgets the queue, stops the timer and the subscription, and clears the store', async () => {
    const { service, deps, unlisten } = setup({ stored: [{ account: 'A', ...target }] });
    deps.api.record.mockRejectedValue(rejection('offline'));
    await service.start();
    await flush();
    await service.clear();
    expect(service.getPending()).toEqual([]);
    expect(deps.store.clear).toHaveBeenCalled();
    expect(unlisten).toHaveBeenCalled();
    const calls = deps.api.record.mock.calls.length;
    await vi.advanceTimersByTimeAsync(600000);
    expect(deps.api.record.mock.calls.length).toBe(calls);
  });
});

describe('stored queue and Clear Data races', () => {
  test('a load that finishes after clear() is discarded', async () => {
    const { service, deps } = setup();
    let finish;
    deps.store.load.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const started = service.start();
    await flush();
    await service.clear();
    finish([{ account: 'A', ...target }]);
    await started;
    await flush();
    expect(service.getPending()).toEqual([]);
    expect(deps.api.record).not.toHaveBeenCalled();
  });

  test('a failed load never overwrites the stored queue; it is retried and merged with new items', async () => {
    const stored = [{ account: 'A', missionId: 'm', targetId: 'old' }];
    const { service, deps, saved } = setup({ stored });
    // start() and record() each try to read the store once and fail.
    deps.store.load.mockRejectedValueOnce(new Error('disk')).mockRejectedValueOnce(new Error('disk'));
    deps.api.record.mockRejectedValue(rejection('offline'));
    await service.start();
    await service.record(target);
    expect(service.getPending()).toEqual([{ account: 'A', ...target }]);
    expect(saved).toEqual([]);
    // The next attempt reads the store, and saves the old and the new items.
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(deps.store.load).toHaveBeenCalledTimes(3);
    expect(service.getPending()).toEqual([...stored, { account: 'A', ...target }]);
    expect(saved.at(-1)).toEqual([...stored, { account: 'A', ...target }]);
    service.clear();
  });

  test('a successfully loaded empty queue is saved normally', async () => {
    const { service, deps, saved } = setup({ stored: undefined });
    deps.api.record.mockRejectedValue(rejection('offline'));
    await service.record(target);
    expect(saved.at(-1)).toEqual([{ account: 'A', ...target }]);
    service.clear();
  });

  test('a request that started before clear() is not queued afterwards; later failures still are', async () => {
    const { service, deps } = setup();
    let fail;
    deps.api.record.mockReturnValueOnce(new Promise((_, reject) => { fail = reject; }));
    const result = service.record(target);
    await flush();
    await service.clear();
    fail(rejection('offline'));
    await expect(result).resolves.toBe(RESULT.UNSUPPORTED);
    expect(service.getPending()).toEqual([]);
    deps.api.record.mockRejectedValue(rejection('offline'));
    await expect(service.record(target)).resolves.toBe(RESULT.PENDING);
    service.clear();
  });

  test('the retry timer survives a resend when something is still queued (even queued during it)', async () => {
    const { service, deps } = setup({ stored: [{ account: 'A', ...target }] });
    const late = { missionId: 'm', targetId: 'late' };
    deps.api.record.mockImplementationOnce(async () => {
      // A planting that fails while the resend is running.
      deps.api.record.mockRejectedValueOnce(rejection('offline'));
      await service.record(late);
      return { status: 'recorded' };
    });
    await service.start();
    await flush();
    expect(service.getPending()).toEqual([{ account: 'A', ...late }]);
    deps.api.record.mockResolvedValue({ status: 'recorded' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(service.getPending()).toEqual([]);
  });

  test('an auth status that arrives after clear() is stale and sends nothing', async () => {
    const { service, deps } = setup();
    let answer;
    deps.auth.getStatus.mockReturnValue(new Promise(resolve => { answer = resolve; }));
    const result = service.record(target);
    await flush();
    await service.clear();
    answer(signedIn('A'));
    await expect(result).resolves.toBe(RESULT.UNSUPPORTED);
    expect(deps.api.record).not.toHaveBeenCalled();
    expect(service.account).toBeNull();
    expect(service.accountKnown).toBe(false);
  });

  test('a failed save is retried by the next resend, with the current queue', async () => {
    const { service, deps, saved } = setup();
    deps.api.record.mockRejectedValue(rejection('offline'));
    deps.store.save.mockRejectedValueOnce(new Error('disk full'));
    await service.record(target);
    await flush();
    expect(saved).toEqual([]);
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(saved.at(-1)).toEqual([{ account: 'A', ...target }]);
    service.clear();
  });

  test('nothing is saved before the load completed, even when a save failed earlier', async () => {
    const { service, deps, saved } = setup();
    deps.store.load.mockRejectedValue(new Error('disk'));
    deps.api.record.mockRejectedValue(rejection('offline'));
    await service.record(target);
    await vi.advanceTimersByTimeAsync(5000);
    await flush();
    expect(deps.store.save).not.toHaveBeenCalled();
    expect(saved).toEqual([]);
    service.clear();
  });

  test('resuming after clear() follows the sign-in again without restoring the queue', async () => {
    const { service, deps, emit } = setup({ stored: [{ account: 'A', ...target }] });
    await service.start();
    await flush();
    await service.clear();
    deps.store.load.mockResolvedValue([]);
    await service.start();
    expect(deps.auth.onChange).toHaveBeenCalledTimes(2);
    expect(service.getPending()).toEqual([]);
    emit(signedIn('A'));
  });
});

describe('normalizePending', () => {
  test('keeps valid entries once and drops the rest', () => {
    const entry = { account: 'A', missionId: 'm', targetId: 't' };
    expect(normalizePending([entry, { ...entry }, null, { account: 'A' }, 'x', { ...entry, targetId: 'u' }])).toEqual([
      entry,
      { ...entry, targetId: 'u' },
    ]);
    expect(normalizePending(undefined)).toEqual([]);
    expect(normalizePending({})).toEqual([]);
  });
});
