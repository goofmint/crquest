import { setContext, setContextRef, emitter } from '../../../js/app/common/context/index';
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
  it('writes saved fields only, in the same step as the events (event, write, next key, sync)', () => {
    const order = [];
    const onSaved = () => order.push('event:saved');
    emitter.on('contextUpdate:saved', onSaved);
    setValueAsync.mockImplementation(async key => void order.push(`write:${key}`));
    syncContext.mockImplementation(() => order.push('sync'));
    setContext({ saved: 1, other: 2 });
    emitter.off('contextUpdate:saved', onSaved);
    expect(order).toEqual(['event:saved', 'write:saved', 'sync']);
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
