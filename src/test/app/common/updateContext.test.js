import { updateContext, setContextRef, emitter } from '../../../js/app/common/context/index';

vi.mock('../../../js/app/platform/store', () => ({ setValueAsync: vi.fn(), deleteValueAsync: vi.fn() }));
vi.mock('../../../js/app/platform/dialog', () => ({ showAlert: vi.fn() }));
vi.mock('../../../js/app/common/context/schema', () => ({
  validateContextUpdate: vi.fn(update =>
    Object.entries(update).map(([key, value]) => ({ key, valid: key !== 'bad', update: value }))
  ),
  reduceEntries: entries => Object.fromEntries(entries),
  describeSchema: () => ({ fields: { inventory: { meta: { saveToDisk: true } } } }),
}));

// A React-like state holder: setState calls are queued and applied in order
// against the running state when committed (batching).
function useBatchedState(initial) {
  const holder = { state: initial, queue: [] };
  setContextRef({
    current: {
      get state() {
        return holder.state;
      },
      setState: (arg, callback) => holder.queue.push({ arg, callback }),
    },
  });
  holder.commit = () => {
    const callbacks = [];
    for (const { arg, callback } of holder.queue.splice(0)) {
      const slice = typeof arg === 'function' ? arg(holder.state) : arg;
      if (slice) holder.state = { ...holder.state, ...slice };
      callbacks.push(callback);
    }
    callbacks.forEach(callback => callback());
  };
  return holder;
}

describe('updateContext', () => {
  test('several updates in one batch build on each other', () => {
    const holder = useBatchedState({ inventory: ['a'] });
    const add = item => updateContext(state => ({ inventory: [...state.inventory, item] }));
    add('b');
    add('c');
    holder.commit();
    expect(holder.state.inventory).toEqual(['a', 'b', 'c']);
  });

  test('emits the update events once per committed change, with the committed value', () => {
    const holder = useBatchedState({ inventory: [] });
    const seen = [];
    emitter.on('contextUpdate:inventory', value => seen.push(value));
    updateContext(() => ({ inventory: ['x'] }));
    updateContext(() => null);
    holder.commit();
    expect(seen).toEqual([['x']]);
    emitter.removeAllListeners('contextUpdate:inventory');
  });

  test('a null or empty update, and an invalid one, change nothing', () => {
    const holder = useBatchedState({ inventory: ['a'] });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    updateContext(() => null);
    updateContext(() => ({}));
    updateContext(() => ({ bad: 1 }));
    holder.commit();
    expect(holder.state).toEqual({ inventory: ['a'] });
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
