const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('@tauri-apps/plugin-store', () => ({ load: mocks.load }));

function makeStore() {
  const data = new Map();
  return {
    data,
    get: vi.fn(async key => data.get(key)),
    set: vi.fn(async (key, value) => void data.set(key, value)),
    has: vi.fn(async key => data.has(key)),
    delete: vi.fn(async key => data.delete(key)),
    save: vi.fn(async () => {}),
    reload: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
}

async function loadModule() {
  vi.resetModules();
  return import('../../../../js/app/platform/tauri/store');
}

beforeEach(() => mocks.load.mockReset());

describe('synchronous members', () => {
  test.each(['getValue', 'setValue', 'hasValue', 'deleteValue'])('%s throws explicitly', async name => {
    const mod = await loadModule();
    expect(() => mod[name]('k', 1)).toThrow(/not available on Tauri/);
    try {
      mod[name]('k');
    } catch (error) {
      expect(error.code).toBe('ERR_TAURI_SYNC_UNSUPPORTED');
    }
    expect(mocks.load).not.toHaveBeenCalled();
  });
});

describe('async variants', () => {
  test('load config.json lazily, once, with autosave off', async () => {
    const store = makeStore();
    mocks.load.mockResolvedValue(store);
    const mod = await loadModule();
    expect(mocks.load).not.toHaveBeenCalled();
    await mod.setValueAsync('a', 1);
    await mod.getValueAsync('a');
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(mocks.load).toHaveBeenCalledWith('config.json', { autoSave: false });
  });

  test('set persists and saves; get returns it; missing key is undefined', async () => {
    const store = makeStore();
    mocks.load.mockResolvedValue(store);
    const mod = await loadModule();
    await mod.setValueAsync('audio', { volume: 1 });
    expect(store.set).toHaveBeenCalledWith('audio', { volume: 1 });
    expect(store.save).toHaveBeenCalledTimes(1);
    await expect(mod.getValueAsync('audio')).resolves.toEqual({ volume: 1 });
    await expect(mod.getValueAsync('missing')).resolves.toBeUndefined();
    await expect(mod.hasValueAsync('audio')).resolves.toBe(true);
    await expect(mod.hasValueAsync('missing')).resolves.toBe(false);
  });

  test('delete removes the key and saves; deleting a missing key is fine', async () => {
    const store = makeStore();
    mocks.load.mockResolvedValue(store);
    const mod = await loadModule();
    await mod.setValueAsync('k', 1);
    await mod.deleteValueAsync('k');
    await expect(mod.hasValueAsync('k')).resolves.toBe(false);
    await expect(mod.deleteValueAsync('never')).resolves.toBeUndefined();
    expect(store.save).toHaveBeenCalledTimes(3);
  });

  test('rejects values that cannot be serialized', async () => {
    mocks.load.mockResolvedValue(makeStore());
    const mod = await loadModule();
    await expect(mod.setValueAsync('k', undefined)).rejects.toBeInstanceOf(TypeError);
    await expect(mod.setValueAsync('k', () => {})).rejects.toBeInstanceOf(TypeError);
  });

  test('reloads from disk with ignoreDefaults so read errors are reported', async () => {
    const store = makeStore();
    mocks.load.mockResolvedValue(store);
    const mod = await loadModule();
    await mod.getValueAsync('a');
    expect(store.reload).toHaveBeenCalledWith({ ignoreDefaults: true });
  });

  test('a missing file on first run is tolerated', async () => {
    const store = makeStore();
    store.reload.mockRejectedValue('No such file or directory (os error 2)');
    mocks.load.mockResolvedValue(store);
    const mod = await loadModule();
    await expect(mod.getValueAsync('a')).resolves.toBeUndefined();
    expect(store.close).not.toHaveBeenCalled();
  });

  test('a corrupt or unreadable file rejects, closes the store and is not cached', async () => {
    const bad = makeStore();
    bad.reload.mockRejectedValue('expected value at line 1 column 1');
    const good = makeStore();
    mocks.load.mockResolvedValueOnce(bad).mockResolvedValueOnce(good);
    const mod = await loadModule();
    await expect(mod.setValueAsync('a', 1)).rejects.toThrow('expected value');
    expect(bad.set).not.toHaveBeenCalled();
    expect(bad.save).not.toHaveBeenCalled();
    expect(bad.close).toHaveBeenCalledTimes(1);
    await expect(mod.getValueAsync('a')).resolves.toBeUndefined();
    expect(mocks.load).toHaveBeenCalledTimes(2);
  });

  test('concurrent first calls share one load', async () => {
    const store = makeStore();
    mocks.load.mockResolvedValue(store);
    const mod = await loadModule();
    await Promise.all([mod.getValueAsync('a'), mod.hasValueAsync('b')]);
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });

  test('a failed load is not cached', async () => {
    const store = makeStore();
    mocks.load.mockRejectedValueOnce('cannot open').mockResolvedValue(store);
    const mod = await loadModule();
    await expect(mod.getValueAsync('a')).rejects.toThrow('cannot open');
    await expect(mod.getValueAsync('a')).resolves.toBeUndefined();
    expect(mocks.load).toHaveBeenCalledTimes(2);
  });
});
