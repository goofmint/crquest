const path = require('path');

const FIXTURES = path.resolve(__dirname, '..', '..', 'fixtures', 'platform');

async function loadPaths({ remote, fixtureDir }) {
  const staticFilePath = vi.fn(() => path.join(FIXTURES, `${fixtureDir}.json`));
  vi.resetModules();
  vi.doMock('electron', () => ({ remote }));
  vi.doMock('../../../js/app/common/fs_utils', () => ({ staticFilePath }));
  const mod = await import('../../../js/app/platform/paths');
  return Object.assign({ staticFilePath }, mod);
}

function makeRemote(values) {
  return {
    app: {
      getPath: vi.fn((name) => values[name]),
      getVersion: vi.fn(() => values.version),
    },
  };
}

describe('platform paths', () => {
  it('does not touch electron at import time', async () => {
    const remote = makeRemote({});
    await loadPaths({ remote, fixtureDir: 'with-version' });
    expect(remote.app.getPath).not.toHaveBeenCalled();
    expect(remote.app.getVersion).not.toHaveBeenCalled();
  });

  it('returns appData, userData and app version from remote.app', async () => {
    const remote = makeRemote({ appData: '/a', userData: '/u', version: '9.9.9' });
    const paths = await loadPaths({ remote, fixtureDir: 'with-version' });
    expect(paths.getAppDataPath()).toBe('/a');
    expect(paths.getUserDataPath()).toBe('/u');
    expect(paths.getAppVersion()).toBe('9.9.9');
    expect(remote.app.getPath).toHaveBeenCalledWith('appData');
    expect(remote.app.getPath).toHaveBeenCalledWith('userData');
  });

  it('throws when remote or remote.app is missing', async () => {
    const noRemote = await loadPaths({ remote: undefined, fixtureDir: 'with-version' });
    const emptyRemote = await loadPaths({ remote: {}, fixtureDir: 'with-version' });
    ['getAppDataPath', 'getUserDataPath', 'getAppVersion'].forEach((fn) => {
      expect(() => noRemote[fn]()).toThrow('remote.app is not available');
      expect(() => emptyRemote[fn]()).toThrow('remote.app is not available');
    });
  });

  it('throws on empty or non-string values', async () => {
    for (const bad of [undefined, '', 5]) {
      const paths = (await loadPaths({
        remote: makeRemote({ appData: bad, userData: bad, version: bad }),
        fixtureDir: 'with-version',
      }));
      expect(() => paths.getAppDataPath()).toThrow('non-empty string');
      expect(() => paths.getUserDataPath()).toThrow('non-empty string');
      expect(() => paths.getAppVersion()).toThrow('non-empty string');
    }
  });

  it('reads the game version from package.json', async () => {
    const paths = (await loadPaths({ remote: makeRemote({}), fixtureDir: 'with-version' }));
    await expect(paths.getGamePackageVersion()).resolves.toBe('1.2.3');
  });

  it('reads the package.json at staticFilePath("package.json")', async () => {
    const paths = (await loadPaths({ remote: makeRemote({}), fixtureDir: 'with-version' }));
    await paths.getGamePackageVersion();
    expect(paths.staticFilePath).toHaveBeenCalledWith('package.json');
  });

  it('rejects when package.json has no version', async () => {
    const paths = (await loadPaths({ remote: makeRemote({}), fixtureDir: 'no-version' }));
    await expect(paths.getGamePackageVersion()).rejects.toThrow('non-empty string');
  });

  it('rejects when version is an empty string or a number', async () => {
    await expect(
      (await loadPaths({ remote: makeRemote({}), fixtureDir: 'empty-version' })).getGamePackageVersion()
    ).rejects.toThrow('non-empty string');
    await expect(
      (await loadPaths({ remote: makeRemote({}), fixtureDir: 'number-version' })).getGamePackageVersion()
    ).rejects.toThrow('non-empty string');
  });

  it('rejects on JSON parse errors', async () => {
    const paths = (await loadPaths({ remote: makeRemote({}), fixtureDir: 'invalid-json' }));
    await expect(paths.getGamePackageVersion()).rejects.toThrow();
  });

  it('rejects with ENOENT when package.json is missing', async () => {
    const paths = (await loadPaths({ remote: makeRemote({}), fixtureDir: 'does-not-exist' }));
    await expect(paths.getGamePackageVersion()).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
