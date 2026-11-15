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
    mod.getValue('a');
    mod.setValue('a', 1);
    mod.hasValue('a');
    mod.deleteValue('a');
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(ctor.mock.calls[0]).toEqual([]);
  });

  test('getValue delegates and returns the result untouched', async () => {
    const { mod, instances } = await loadStore();
    const value = { nested: [1, 2] };
    mod.getValue('first');
    instances[0].get.mockReturnValueOnce(value);
    expect(mod.getValue('audio')).toBe(value);
    expect(instances[0].get).toHaveBeenLastCalledWith('audio');
    expect(instances[0].get.mock.calls[1]).toHaveLength(1);
  });

  test('getValue returns undefined as is', async () => {
    const { mod } = await loadStore();
    expect(mod.getValue('missing')).toBeUndefined();
  });

  test('setValue delegates with the same arguments', async () => {
    const { mod, instances } = await loadStore();
    const value = { a: 1 };
    mod.setValue('audio', value);
    expect(instances[0].set).toHaveBeenCalledTimes(1);
    expect(instances[0].set.mock.calls[0]).toHaveLength(2);
    expect(instances[0].set.mock.calls[0][0]).toBe('audio');
    expect(instances[0].set.mock.calls[0][1]).toBe(value);
  });

  test('hasValue delegates and returns the result', async () => {
    const { mod, instances } = await loadStore();
    mod.hasValue('x');
    instances[0].has.mockReturnValueOnce(true).mockReturnValueOnce(false);
    expect(mod.hasValue('k')).toBe(true);
    expect(mod.hasValue('k2')).toBe(false);
    expect(instances[0].has).toHaveBeenCalledWith('k');
    expect(instances[0].has).toHaveBeenCalledWith('k2');
  });

  test('deleteValue delegates with the same argument', async () => {
    const { mod, instances } = await loadStore();
    mod.deleteValue('k');
    expect(instances[0].delete).toHaveBeenCalledTimes(1);
    expect(instances[0].delete).toHaveBeenCalledWith('k');
  });

  test('propagates the same exception thrown by get', async () => {
    const error = new Error('get failed');
    const { mod } = (await loadStore({
      makeInstance: () => ({
        get: () => {
          throw error;
        },
      }),
    }));
    expect(() => mod.getValue('k')).toThrow(error);
  });

  test('propagates the constructor exception and does not cache the failure', async () => {
    const error = new Error('ctor failed');
    let fail = true;
    const { mod, ctor } = (await loadStore({
      makeInstance: () => {
        if (fail) throw error;
        return { get: vi.fn(() => 'ok') };
      },
    }));
    expect(() => mod.getValue('k')).toThrow(error);
    fail = false;
    expect(mod.getValue('k')).toBe('ok');
    expect(ctor).toHaveBeenCalledTimes(2);
  });
});
