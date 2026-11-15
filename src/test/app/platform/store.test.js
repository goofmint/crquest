const MODULE_PATH = '../../../js/app/platform/store';

async function loadStore({ makeInstance } = {}) {
  const instances = [];
  const ctor = vi.fn(function Store(...args) {
    const instance = makeInstance
      ? makeInstance(...args)
      : {
          get: vi.fn(),
          set: vi.fn(),
          has: vi.fn(),
          delete: vi.fn(),
        };
    instances.push(instance);
    return instance;
  });
  vi.resetModules();
  vi.doMock('electron-store', () => ({ __esModule: true, default: ctor }));
  const mod = await import(MODULE_PATH);
  return { mod, ctor, instances };
}

describe('platform store', () => {
  test('does not create a Store at import time', async () => {
    const { ctor } = await loadStore();
    expect(ctor).not.toHaveBeenCalled();
  });

  test('creates the Store once, with no arguments, across operations', async () => {
    const { mod, ctor } = await loadStore();
    await mod.getValueAsync('a');
    await mod.setValueAsync('a', 1);
    await mod.hasValueAsync('a');
    await mod.deleteValueAsync('a');
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(ctor.mock.calls[0]).toEqual([]);
  });

  test('getValueAsync resolves the result untouched, with the same argument', async () => {
    const { mod, instances } = await loadStore();
    const value = { nested: [1, 2] };
    await mod.getValueAsync('first');
    instances[0].get.mockReturnValueOnce(value);
    await expect(mod.getValueAsync('audio')).resolves.toBe(value);
    expect(instances[0].get).toHaveBeenLastCalledWith('audio');
    expect(instances[0].get.mock.calls[1]).toHaveLength(1);
  });

  test('getValueAsync resolves undefined for a missing key', async () => {
    const { mod } = await loadStore();
    await expect(mod.getValueAsync('missing')).resolves.toBeUndefined();
  });

  test('setValueAsync writes at call time (before any await) with the same arguments', async () => {
    const { mod, instances } = await loadStore();
    const value = { a: 1 };
    const pending = mod.setValueAsync('audio', value);
    expect(instances[0].set).toHaveBeenCalledTimes(1);
    expect(instances[0].set.mock.calls[0]).toHaveLength(2);
    expect(instances[0].set.mock.calls[0][0]).toBe('audio');
    expect(instances[0].set.mock.calls[0][1]).toBe(value);
    await expect(pending).resolves.toBeUndefined();
  });

  test('hasValueAsync resolves the result', async () => {
    const { mod, instances } = await loadStore();
    await mod.hasValueAsync('x');
    instances[0].has.mockReturnValueOnce(true).mockReturnValueOnce(false);
    await expect(mod.hasValueAsync('k')).resolves.toBe(true);
    await expect(mod.hasValueAsync('k2')).resolves.toBe(false);
    expect(instances[0].has).toHaveBeenCalledWith('k');
    expect(instances[0].has).toHaveBeenCalledWith('k2');
  });

  test('deleteValueAsync delegates with the same argument', async () => {
    const { mod, instances } = await loadStore();
    await mod.deleteValueAsync('k');
    expect(instances[0].delete).toHaveBeenCalledTimes(1);
    expect(instances[0].delete).toHaveBeenCalledWith('k');
  });

  test('the synchronous API is no longer exported', async () => {
    const { mod } = await loadStore();
    for (const name of ['getValue', 'setValue', 'hasValue', 'deleteValue']) {
      expect(mod[name]).toBeUndefined();
    }
  });

  test('a library exception becomes a rejection with the same error', async () => {
    const error = new Error('get failed');
    const { mod } = await loadStore({
      makeInstance: () => ({
        get: () => {
          throw error;
        },
      }),
    });
    await expect(mod.getValueAsync('k')).rejects.toBe(error);
  });

  test('a constructor exception rejects and the failure is not cached', async () => {
    const error = new Error('ctor failed');
    let fail = true;
    const { mod, ctor } = await loadStore({
      makeInstance: () => {
        if (fail) throw error;
        return { get: vi.fn(() => 'ok') };
      },
    });
    await expect(mod.getValueAsync('k')).rejects.toBe(error);
    fail = false;
    await expect(mod.getValueAsync('k')).resolves.toBe('ok');
    expect(ctor).toHaveBeenCalledTimes(2);
  });
});
