const MODULE_PATH = '../../../js/app/platform/store';

function loadStore({ makeInstance } = {}) {
  const instances = [];
  const ctor = jest.fn(function Store(...args) {
    const instance = makeInstance
      ? makeInstance(...args)
      : {
          get: jest.fn(),
          set: jest.fn(),
          has: jest.fn(),
          delete: jest.fn(),
        };
    instances.push(instance);
    return instance;
  });
  let mod;
  jest.isolateModules(() => {
    jest.doMock('electron-store', () => ({ __esModule: true, default: ctor }));
    mod = require(MODULE_PATH);
  });
  return { mod, ctor, instances };
}

describe('platform store', () => {
  test('does not create a Store at import time', () => {
    const { ctor } = loadStore();
    expect(ctor).not.toHaveBeenCalled();
  });

  test('creates the Store once, with no arguments, across operations', () => {
    const { mod, ctor } = loadStore();
    mod.getValue('a');
    mod.setValue('a', 1);
    mod.hasValue('a');
    mod.deleteValue('a');
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(ctor.mock.calls[0]).toEqual([]);
  });

  test('getValue delegates and returns the result untouched', () => {
    const { mod, instances } = loadStore();
    const value = { nested: [1, 2] };
    mod.getValue('first');
    instances[0].get.mockReturnValueOnce(value);
    expect(mod.getValue('audio')).toBe(value);
    expect(instances[0].get).toHaveBeenLastCalledWith('audio');
    expect(instances[0].get.mock.calls[1]).toHaveLength(1);
  });

  test('getValue returns undefined as is', () => {
    const { mod } = loadStore();
    expect(mod.getValue('missing')).toBeUndefined();
  });

  test('setValue delegates with the same arguments', () => {
    const { mod, instances } = loadStore();
    const value = { a: 1 };
    mod.setValue('audio', value);
    expect(instances[0].set).toHaveBeenCalledTimes(1);
    expect(instances[0].set.mock.calls[0]).toHaveLength(2);
    expect(instances[0].set.mock.calls[0][0]).toBe('audio');
    expect(instances[0].set.mock.calls[0][1]).toBe(value);
  });

  test('hasValue delegates and returns the result', () => {
    const { mod, instances } = loadStore();
    mod.hasValue('x');
    instances[0].has.mockReturnValueOnce(true).mockReturnValueOnce(false);
    expect(mod.hasValue('k')).toBe(true);
    expect(mod.hasValue('k2')).toBe(false);
    expect(instances[0].has).toHaveBeenCalledWith('k');
    expect(instances[0].has).toHaveBeenCalledWith('k2');
  });

  test('deleteValue delegates with the same argument', () => {
    const { mod, instances } = loadStore();
    mod.deleteValue('k');
    expect(instances[0].delete).toHaveBeenCalledTimes(1);
    expect(instances[0].delete).toHaveBeenCalledWith('k');
  });

  test('propagates the same exception thrown by get', () => {
    const error = new Error('get failed');
    const { mod } = loadStore({
      makeInstance: () => ({
        get: () => {
          throw error;
        },
      }),
    });
    expect(() => mod.getValue('k')).toThrow(error);
  });

  test('propagates the constructor exception and does not cache the failure', () => {
    const error = new Error('ctor failed');
    let fail = true;
    const { mod, ctor } = loadStore({
      makeInstance: () => {
        if (fail) throw error;
        return { get: jest.fn(() => 'ok') };
      },
    });
    expect(() => mod.getValue('k')).toThrow(error);
    fail = false;
    expect(mod.getValue('k')).toBe('ok');
    expect(ctor).toHaveBeenCalledTimes(2);
  });
});
