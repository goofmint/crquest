async function loadEnv(value) {
  vi.resetModules();
  vi.doMock('electron-is-dev', () => ({ default: value }));
  return import('../../../js/app/platform/env');
}

describe('isDev', () => {
  test.each([true, false])('returns the electron-is-dev value (%s)', async value => {
    const { isDev } = await loadEnv(value);
    expect(typeof isDev).toBe('function');
    expect(isDev()).toBe(value);
    expect(isDev()).toBe(value);
  });

  test('does not recompute after load', async () => {
    let current = true;
    vi.resetModules();
    vi.doMock('electron-is-dev', () => ({ default: current }));
    const mod = await import('../../../js/app/platform/env');
    current = false;
    expect(mod.isDev()).toBe(true);
  });
});

describe('getPlatform (Electron)', () => {
  const original = Object.getOwnPropertyDescriptor(process, 'platform');
  afterEach(() => Object.defineProperty(process, 'platform', original));

  test('is process.platform, read on every call', async () => {
    const { getPlatform } = await loadEnv(false);
    expect(getPlatform()).toBe(process.platform);
    for (const value of ['darwin', 'win32', 'linux']) {
      Object.defineProperty(process, 'platform', { ...original, value });
      expect(getPlatform()).toBe(value);
    }
  });
});
