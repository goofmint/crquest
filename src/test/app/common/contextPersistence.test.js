import {
  setContext,
  setContextRef,
  emitter,
  suppressPersistence,
  resumePersistence,
  flushPendingSaves,
} from '../../../js/app/common/context/index';
import { setValueAsync } from '../../../js/app/platform/store';
import { showAlert } from '../../../js/app/platform/dialog';

vi.mock('../../../js/app/platform/store', () => ({ setValueAsync: vi.fn() }));
vi.mock('../../../js/app/platform/dialog', () => ({ showAlert: vi.fn() }));
vi.mock('../../../js/app/common/context/sync', () => ({ syncContext: vi.fn() }));
vi.mock('../../../js/app/common/context/schema', () => ({
  validateContextUpdate: vi.fn(update =>
    Object.entries(update).map(([key, value]) => ({ key, valid: true, update: value }))
  ),
  reduceEntries: entries => Object.fromEntries(entries),
  describeSchema: () => ({
    fields: { saved: { meta: { saveToDisk: true } }, other: {} },
  }),
}));

import { syncContext } from '../../../js/app/common/context/sync';

function useContextRef() {
  const ref = {
    current: { setState: vi.fn((update, callback) => callback()) },
  };
  setContextRef(ref);
}

beforeEach(() => {
  vi.clearAllMocks();
  setValueAsync.mockResolvedValue(undefined);
  showAlert.mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  useContextRef();
});
afterEach(() => console.error.mockRestore());

describe('setContext persistence', () => {
  it('writes saved fields only; events and sync run synchronously, the write follows in the queue', async () => {
    const order = [];
    const onSaved = () => order.push('event:saved');
    emitter.on('contextUpdate:saved', onSaved);
    setValueAsync.mockImplementation(async key => void order.push(`write:${key}`));
    syncContext.mockImplementation(() => order.push('sync'));
    setContext({ saved: 1, other: 2 });
    emitter.off('contextUpdate:saved', onSaved);
    await flushPendingSaves();
    expect(order).toEqual(['event:saved', 'sync', 'write:saved']);
    expect(setValueAsync).toHaveBeenCalledTimes(1);
    expect(setValueAsync).toHaveBeenCalledWith('saved', 1);
  });

  it('does not wait for the write and reports a failed write without throwing', async () => {
    const failure = new Error('write failed');
    setValueAsync.mockRejectedValue(failure);
    expect(() => setContext({ saved: 1 })).not.toThrow();
    expect(syncContext).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(showAlert).toHaveBeenCalledTimes(1));
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('saved'), failure);
  });
});

describe('setContext save serialization', () => {
  it('starts each save only after the previous one finished, in call order', async () => {
    const events = [];
    const finishers = [];
    setValueAsync.mockImplementation(
      (key, value) =>
        new Promise(resolve => {
          events.push(`start:${key}=${value}`);
          finishers.push(() => {
            events.push(`end:${key}=${value}`);
            resolve();
          });
        })
    );
    setContext({ saved: 1 });
    setContext({ saved: 2 });
    await Promise.resolve();
    expect(events).toEqual(['start:saved=1']);
    finishers[0]();
    await vi.waitFor(() => expect(events).toContain('start:saved=2'));
    finishers[1]();
    await flushPendingSaves();
    expect(events).toEqual(['start:saved=1', 'end:saved=1', 'start:saved=2', 'end:saved=2']);
  });

  it('a failed save does not block later saves, and reports only its own error', async () => {
    const failure = new Error('first failed');
    setValueAsync.mockRejectedValueOnce(failure).mockResolvedValue(undefined);
    setContext({ saved: 1 });
    setContext({ saved: 2 });
    await flushPendingSaves();
    await vi.waitFor(() => expect(showAlert).toHaveBeenCalledTimes(1));
    expect(setValueAsync.mock.calls).toEqual([['saved', 1], ['saved', 2]]);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('saved'), failure);
  });
});

describe('persistence suppression', () => {
  afterEach(() => resumePersistence());

  it('skips only the persistence while suppressed; state, events and sync still happen', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ref = { current: { setState: vi.fn((u, cb) => cb()) } };
    setContextRef(ref);
    const onSaved = vi.fn();
    emitter.on('contextUpdate:saved', onSaved);
    suppressPersistence();
    setContext({ saved: 1 });
    emitter.off('contextUpdate:saved', onSaved);
    expect(setValueAsync).not.toHaveBeenCalled();
    expect(ref.current.setState).toHaveBeenCalledWith({ saved: 1 }, expect.any(Function));
    expect(onSaved).toHaveBeenCalledWith(1);
    expect(syncContext).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('saved'));
    resumePersistence();
    setContext({ saved: 2 });
    await flushPendingSaves();
    expect(setValueAsync).toHaveBeenCalledWith('saved', 2);
    console.warn.mockRestore();
  });
});
