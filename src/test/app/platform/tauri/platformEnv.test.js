import { initPlatform } from '../../../../js/app/platform/tauri/init';
import { resetPlatformState } from '../../../../js/app/platform/tauri/state';
import { getPlatform } from '../../../../js/app/platform/tauri/env';
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';

const BASE_DIRECTORY_CONFIG = 3;

function mockBackend() {
  mockIPC((cmd, args) => {
    if (cmd === 'plugin:path|resolve_directory') {
      return args.directory === BASE_DIRECTORY_CONFIG ? '/c' : '/r';
    }
    if (cmd === 'plugin:app|version') return '1.0.0';
    if (cmd === 'is_dev') return false;
    throw new Error(`unexpected command ${cmd}`);
  });
}

function setOsPlugin(platform) {
  globalThis.window = globalThis.window ?? globalThis;
  window.__TAURI_OS_PLUGIN_INTERNALS__ = { platform };
}

afterEach(() => {
  clearMocks();
  resetPlatformState();
  delete window.__TAURI_OS_PLUGIN_INTERNALS__;
});

describe('getPlatform (Tauri)', () => {
  test('throws before initPlatform', () => {
    expect(() => getPlatform()).toThrow(/initPlatform/);
  });

  test.each([
    ['macos', 'darwin'],
    ['windows', 'win32'],
    ['linux', 'linux'],
  ])('maps the OS plugin value %s to Node\'s %s', async (tauriName, nodeName) => {
    mockBackend();
    setOsPlugin(tauriName);
    await initPlatform();
    expect(getPlatform()).toBe(nodeName);
  });

  test.each(['ios', 'android', 'freebsd', 'solaris', 'Linux', '', 'toString'])(
    'rejects the unsupported value %j and stays uninitialized',
    async value => {
      mockBackend();
      setOsPlugin(value);
      await expect(initPlatform()).rejects.toThrow(/Unsupported operating system/);
      expect(() => getPlatform()).toThrow(/initPlatform/);
    }
  );

  test('rejects (as an Error) when the plugin value is not available', async () => {
    mockBackend();
    delete window.__TAURI_OS_PLUGIN_INTERNALS__;
    await expect(initPlatform()).rejects.toBeInstanceOf(Error);
    expect(() => getPlatform()).toThrow(/initPlatform/);
  });
});
