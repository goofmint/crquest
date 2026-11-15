import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';
import { initPlatform } from '../../../../js/app/platform/tauri/init';
import { resetPlatformState } from '../../../../js/app/platform/tauri/state';
import * as paths from '../../../../js/app/platform/tauri/paths';
import { isDev } from '../../../../js/app/platform/tauri/env';

const BASE_DIRECTORY_CONFIG = 3;
const BASE_DIRECTORY_RESOURCE = 11;

function mockBackend({ configDir = '/home/u/.config', resourceDir = '/opt/TerminalQuest', version = '3.12.1', dev = true } = {}) {
  const calls = [];
  mockIPC((cmd, args) => {
    calls.push(cmd);
    if (cmd === 'plugin:path|resolve_directory') {
      if (args.directory === BASE_DIRECTORY_CONFIG) return configDir;
      if (args.directory === BASE_DIRECTORY_RESOURCE) return resourceDir;
      throw new Error(`unexpected directory ${args.directory}`);
    }
    if (cmd === 'plugin:app|version') return version;
    if (cmd === 'is_dev') return dev;
    throw new Error(`unexpected command ${cmd}`);
  });
  return calls;
}

afterEach(() => {
  clearMocks();
  resetPlatformState();
});

describe('before initPlatform', () => {
  test('synchronous getters throw instead of returning a default', () => {
    expect(() => paths.getAppDataPath()).toThrow(/initPlatform/);
    expect(() => paths.getUserDataPath()).toThrow(/initPlatform/);
    expect(() => paths.getResourceDirPath()).toThrow(/initPlatform/);
    expect(() => paths.getAppVersion()).toThrow(/initPlatform/);
    expect(() => isDev()).toThrow(/initPlatform/);
  });
});

describe('after initPlatform', () => {
  test('serves the values synchronously', async () => {
    mockBackend({ configDir: '/home/u/.config', resourceDir: '/opt/TerminalQuest', version: '3.12.1', dev: false });
    await initPlatform();
    expect(paths.getResourceDirPath()).toBe('/opt/TerminalQuest');
    expect(paths.getAppDataPath()).toBe('/home/u/.config');
    expect(paths.getUserDataPath()).toBe('/home/u/.config/terminalquest');
    expect(paths.getAppVersion()).toBe('3.12.1');
    expect(isDev()).toBe(false);
  });

  test('the resource directory is the one resolved for BaseDirectory.Resource, not the config directory', async () => {
    mockBackend({ configDir: '/c', resourceDir: '/r' });
    await initPlatform();
    expect(paths.getResourceDirPath()).toBe('/r');
    expect(paths.getAppDataPath()).toBe('/c');
  });

  test('isDev follows the backend', async () => {
    mockBackend({ dev: true });
    await initPlatform();
    expect(isDev()).toBe(true);
  });

  test('joins Windows paths with a backslash and keeps a trailing separator out', async () => {
    mockBackend({ configDir: 'C:\\Users\\u\\AppData\\Roaming\\' });
    await initPlatform();
    expect(paths.getUserDataPath()).toBe('C:\\Users\\u\\AppData\\Roaming\\terminalquest');
  });

  test('getGamePackageVersion resolves the app version (tauri.conf.json takes it from public/package.json)', async () => {
    mockBackend({ version: '3.12.1' });
    await expect(paths.getGamePackageVersion()).resolves.toBe('3.12.1');
  });

  test('getGamePackageVersion rejects on an empty version', async () => {
    mockBackend({ version: '' });
    await expect(paths.getGamePackageVersion()).rejects.toThrow(/non-empty string/);
  });
});

describe('initPlatform failures', () => {
  test('rejects when the resource directory is empty', async () => {
    mockBackend({ resourceDir: '' });
    await initPlatform();
    expect(() => paths.getResourceDirPath()).toThrow(/non-empty string/);
  });

  test('rejects when a value cannot be read and keeps the state uninitialized', async () => {
    mockIPC(cmd => {
      if (cmd === 'is_dev') throw 'is_dev failed';
      if (cmd === 'plugin:path|resolve_directory') return '/c';
      return '1.0.0';
    });
    await expect(initPlatform()).rejects.toThrow('is_dev failed');
    expect(() => isDev()).toThrow(/initPlatform/);
  });
});
