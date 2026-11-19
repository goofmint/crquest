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

describe('contract', () => {
  test('the synchronous API is not exported', async () => {
    const mod = await loadModule();
    for (const name of ['getValue', 'setValue', 'hasValue', 'deleteValue']) {
      expect(mod[name]).toBeUndefined();
    }
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

  test('a failed save restores the previous value before another mutation persists', async () => {
    const store = makeStore();
    store.data.set('settings', { language: 'en' });
    const firstSave = Promise.withResolvers();
    const saving = Promise.withResolvers();
    let persisted;
    store.save.mockImplementationOnce(() => {
      saving.resolve();
      return firstSave.promise;
    }).mockImplementation(async () => {
      persisted = new Map(store.data);
    });
    mocks.load.mockResolvedValue(store);
    const mod = await loadModule();

    const language = mod.setValueAsync('settings', { language: 'ja' });
    const failure = expect(language).rejects.toThrow('disk full');
    await saving.promise;
    const read = mod.getValueAsync('settings');
    const xp = mod.setValueAsync('xp', 7);
    expect(store.set).toHaveBeenCalledTimes(1);

    firstSave.reject('disk full');
    await failure;
    await expect(read).resolves.toEqual({ language: 'en' });
    await xp;
    expect(persisted).toEqual(new Map([
      ['settings', { language: 'en' }],
      ['xp', 7],
    ]));
  });

  test('rolls back the creation of a missing key and deletion of a null value', async () => {
    const store = makeStore();
    store.data.set('present', null);
    store.save.mockRejectedValueOnce('write failed').mockRejectedValueOnce('write failed');
    mocks.load.mockResolvedValue(store);
    const mod = await loadModule();

    await expect(mod.setValueAsync('missing', 1)).rejects.toThrow('write failed');
    await expect(mod.hasValueAsync('missing')).resolves.toBe(false);
    await expect(mod.deleteValueAsync('present')).rejects.toThrow('write failed');
    await expect(mod.getValueAsync('present')).resolves.toBeNull();
    await expect(mod.hasValueAsync('present')).resolves.toBe(true);
  });

  test('closes a cache that cannot be restored before opening a clean store', async () => {
    const dirty = makeStore();
    dirty.data.set('settings', { language: 'en' });
    dirty.set.mockImplementationOnce(async (key, value) => void dirty.data.set(key, value))
      .mockRejectedValueOnce('restore failed');
    dirty.save.mockRejectedValueOnce('save failed');
    const clean = makeStore();
    clean.data.set('settings', { language: 'en' });
    mocks.load.mockResolvedValueOnce(dirty).mockResolvedValueOnce(clean);
    const mod = await loadModule();

    await expect(mod.setValueAsync('settings', { language: 'ja' })).rejects.toThrow('save failed');
    expect(dirty.close).toHaveBeenCalledOnce();
    await mod.setValueAsync('xp', 7);
    expect(mocks.load).toHaveBeenCalledTimes(2);
    expect(dirty.save).toHaveBeenCalledOnce();
    expect(clean.data).toEqual(new Map([
      ['settings', { language: 'en' }],
      ['xp', 7],
    ]));
  });

  test('blocks other operations while restoring and closing the cache both fail', async () => {
    const store = makeStore();
    store.data.set('settings', { language: 'en' });
    store.set.mockImplementationOnce(async (key, value) => void store.data.set(key, value))
      .mockRejectedValueOnce('restore failed')
      .mockRejectedValueOnce('restore failed');
    store.save.mockRejectedValueOnce('save failed');
    store.close.mockRejectedValue('close failed');
    mocks.load.mockResolvedValue(store);
    const mod = await loadModule();

    await expect(mod.setValueAsync('settings', { language: 'ja' })).rejects.toThrow('save failed');
    await expect(mod.setValueAsync('xp', 7)).rejects.toThrow('close failed');
    expect(store.data.has('xp')).toBe(false);
    expect(store.save).toHaveBeenCalledOnce();

    await expect(mod.getValueAsync('settings')).resolves.toEqual({ language: 'en' });
    await mod.setValueAsync('xp', 7);
    expect(store.data.get('xp')).toBe(7);
    expect(store.save).toHaveBeenCalledTimes(2);
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
