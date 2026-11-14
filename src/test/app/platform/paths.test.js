const path = require('path');

const FIXTURES = path.resolve(__dirname, '..', '..', 'fixtures', 'platform');

function loadPaths({ remote, fixtureDir }) {
  let mod;
  jest.isolateModules(() => {
    jest.doMock('electron', () => ({ remote }));
    jest.doMock('../../../js/app/common/fs_utils', () => ({
      staticFilePath: jest.fn(() => path.join(FIXTURES, `${fixtureDir}.json`)),
    }));
    mod = require('../../../js/app/platform/paths');
  });
  return mod;
}

function makeRemote(values) {
  return {
    app: {
      getPath: jest.fn((name) => values[name]),
      getVersion: jest.fn(() => values.version),
    },
  };
}

describe('platform paths', () => {
  it('does not touch electron at import time', () => {
    const remote = makeRemote({});
    loadPaths({ remote, fixtureDir: 'with-version' });
    expect(remote.app.getPath).not.toHaveBeenCalled();
    expect(remote.app.getVersion).not.toHaveBeenCalled();
  });

  it('returns appData, userData and app version from remote.app', () => {
    const remote = makeRemote({ appData: '/a', userData: '/u', version: '9.9.9' });
    const paths = loadPaths({ remote, fixtureDir: 'with-version' });
    expect(paths.getAppDataPath()).toBe('/a');
    expect(paths.getUserDataPath()).toBe('/u');
    expect(paths.getAppVersion()).toBe('9.9.9');
    expect(remote.app.getPath).toHaveBeenCalledWith('appData');
    expect(remote.app.getPath).toHaveBeenCalledWith('userData');
  });

  it('throws when remote or remote.app is missing', () => {
    ['getAppDataPath', 'getUserDataPath', 'getAppVersion'].forEach((fn) => {
      expect(() => loadPaths({ remote: undefined, fixtureDir: 'with-version' })[fn]()).toThrow(
        'remote.app is not available'
      );
      expect(() => loadPaths({ remote: {}, fixtureDir: 'with-version' })[fn]()).toThrow(
        'remote.app is not available'
      );
    });
  });

  it('throws on empty or non-string values', () => {
    [undefined, '', 5].forEach((bad) => {
      const paths = loadPaths({
        remote: makeRemote({ appData: bad, userData: bad, version: bad }),
        fixtureDir: 'with-version',
      });
      expect(() => paths.getAppDataPath()).toThrow('non-empty string');
      expect(() => paths.getUserDataPath()).toThrow('non-empty string');
      expect(() => paths.getAppVersion()).toThrow('non-empty string');
    });
  });

  it('reads the game version from package.json', () => {
    const paths = loadPaths({ remote: makeRemote({}), fixtureDir: 'with-version' });
    expect(paths.getGamePackageVersion()).toBe('1.2.3');
  });

  it('throws when package.json has no version', () => {
    const paths = loadPaths({ remote: makeRemote({}), fixtureDir: 'no-version' });
    expect(() => paths.getGamePackageVersion()).toThrow('non-empty string');
  });

  it('propagates JSON parse errors', () => {
    const paths = loadPaths({ remote: makeRemote({}), fixtureDir: 'invalid-json' });
    expect(() => paths.getGamePackageVersion()).toThrow();
  });
});
