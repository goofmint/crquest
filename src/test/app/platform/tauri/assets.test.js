import fs from 'node:fs';
import resourceOnly from '../../../../js/app/config/tauriResourceOnlyDirectories.json';
import path from 'path';
import { mockConvertFileSrc, clearMocks } from '@tauri-apps/api/mocks';
import {
  getStaticRootPath,
  getStaticFileUrl,
  toAssetSrc,
  toAssetUrl,
} from '../../../../js/app/platform/tauri/assets';
import {
  setPlatformState,
  resetPlatformState,
} from '../../../../js/app/platform/tauri/state';

// The Tauri build resolves `path` to the shim (win32 or posix per initialized OS)
vi.mock('path', () => import('../../../../js/tauri_shims/path'));

const RESOURCE = '/opt/TerminalQuest';

beforeEach(() => {
  mockConvertFileSrc('linux');
  setPlatformState({
    appDataPath: '/home/u/.config',
    resourceDirPath: RESOURCE,
    appVersion: '1.0.0',
    isDev: false,
    platform: 'linux',
  });
});
afterEach(() => {
  clearMocks();
  resetPlatformState();
});

describe('platform assets (Tauri)', () => {
  test('throws before initPlatform()', () => {
    resetPlatformState();
    expect(() => getStaticRootPath()).toThrow(/initPlatform/);
    expect(() => toAssetUrl(`${RESOURCE}/levels/a.mp3`)).toThrow(/initPlatform/);
  });

  test('the static root is the resource directory', () => {
    expect(getStaticRootPath()).toBe(RESOURCE);
  });

  test('path.resolve with the static root (absolute) works without cwd', () => {
    expect(path.resolve(getStaticRootPath(), 'levels/common/sfx')).toBe(
      `${RESOURCE}/levels/common/sfx`
    );
    expect(path.resolve(getStaticRootPath(), '.')).toBe(RESOURCE);
  });

  test('files the page ships (avatars/) become page-relative URLs (embedded frontendDist)', () => {
    expect(toAssetSrc(`${RESOURCE}/avatars/parts/body.png`)).toBe(
      new URL('avatars/parts/body.png', document.baseURI).href
    );
    const url = toAssetUrl(`${RESOURCE}/images/app/a b.png`);
    expect(new URL(url).pathname).toBe('/images/app/a%20b.png');
    expect(new URL(url).origin).toBe(new URL(document.baseURI).origin);
  });

  test('content/ and levels/ are not embedded: they use the asset protocol (W12)', () => {
    expect(toAssetUrl(`${RESOURCE}/levels/common/sfx/click 1.mp3`)).toBe(
      `asset://localhost/${encodeURIComponent(`${RESOURCE}/levels/common/sfx/click 1.mp3`)}`
    );
    expect(toAssetSrc(`${RESOURCE}/content/twilioquest-base/a.png`)).toBe(
      `asset://localhost/${encodeURIComponent(`${RESOURCE}/content/twilioquest-base/a.png`)}`
    );
  });

  test('every resource-only directory is left out of the staging directory', () => {
    const { isStaged } = require('../../../../../tasks/stage_tauri_frontend');
    resourceOnly.forEach(name => {
      expect(isStaged(`${name}/x.png`)).toBe(false);
      expect(toAssetUrl(`${RESOURCE}/${name}/x.png`)).toContain('asset://localhost/');
    });
    expect(isStaged('avatars/parts/body.png')).toBe(true);
  });

  test('a resource directory with a trailing slash behaves the same', () => {
    setPlatformState({ resourceDirPath: `${RESOURCE}/`, platform: 'linux' });
    expect(new URL(toAssetUrl(`${RESOURCE}/avatars/a.png`)).pathname).toBe(
      '/avatars/a.png'
    );
  });

  test('other absolute paths (user data, extensions) use the asset protocol', () => {
    expect(toAssetUrl('/home/u/.config/terminalquest/ext/a b.png')).toBe(
      'asset://localhost/%2Fhome%2Fu%2F.config%2Fterminalquest%2Fext%2Fa%20b.png'
    );
    expect(toAssetSrc('/home/u/ext/a.png')).toBe(
      'asset://localhost/%2Fhome%2Fu%2Fext%2Fa.png'
    );
  });

  test('resource-only directory names are case-sensitive on POSIX', () => {
    expect(toAssetUrl(`${RESOURCE}/LEVELS/a.mp3`)).toBe(
      new URL('LEVELS/a.mp3', document.baseURI).href
    );
  });

  test('a path that only shares the resource directory prefix is not a resource', () => {
    expect(toAssetUrl(`${RESOURCE}-other/avatars/a.png`)).toContain('asset://localhost/');
  });

  test('.. that resolves inside the resource directory is a resource', () => {
    const url = toAssetUrl(`${RESOURCE}/avatars/parts/../parts/body.png`);
    expect(new URL(url).pathname).toBe('/avatars/parts/body.png');
    expect(toAssetSrc(`${RESOURCE}/levels/../avatars/parts/body.png`)).toBe(
      new URL('avatars/parts/body.png', document.baseURI).href
    );
    // levels/ is reached through the asset protocol, normalized
    expect(toAssetUrl(`${RESOURCE}/avatars/../levels/a.mp3`)).toBe(
      `asset://localhost/${encodeURIComponent(`${RESOURCE}/levels/a.mp3`)}`
    );
  });

  test('.. that escapes the resource directory goes to the asset protocol, normalized', () => {
    expect(toAssetUrl(`${RESOURCE}/../other/a.png`)).toBe(
      'asset://localhost/%2Fopt%2Fother%2Fa.png'
    );
    expect(toAssetSrc(`${RESOURCE}/levels/../../etc/a.png`)).toBe(
      'asset://localhost/%2Fopt%2Fetc%2Fa.png'
    );
  });

  test('toAssetSrc passes undefined through; toAssetUrl rejects it', () => {
    expect(toAssetSrc(undefined)).toBeUndefined();
    expect(() => toAssetUrl(undefined)).toThrow(/absolute path/);
    expect(() => toAssetUrl('relative/a.png')).toThrow(/absolute path/);
  });

  test('getStaticFileUrl: relative URL of a frontendDist file', () => {
    expect(getStaticFileUrl('code_runner/worker.js')).toBe(
      new URL('code_runner/worker.js', document.baseURI).href
    );
    expect(getStaticFileUrl('avatars/avatar1.png')).toBe(
      new URL('avatars/avatar1.png', document.baseURI).href
    );
  });

  test.each(['', '/abs/a.png', '../a.png', 'a/../../b.png', 'a\\..\\..\\b.png'])(
    'getStaticFileUrl rejects %p',
    value => {
      expect(() => getStaticFileUrl(value)).toThrow(/relative path/);
    }
  );
});

describe('platform assets (Tauri, Windows paths)', () => {
  const WIN_RESOURCE = 'C:\\Program Files\\TerminalQuest';

  beforeEach(() => {
    mockConvertFileSrc('windows');
    setPlatformState({
      appDataPath: 'C:\\Users\\u\\AppData\\Roaming',
      resourceDirPath: WIN_RESOURCE,
      appVersion: '1.0.0',
      isDev: false,
      platform: 'win32',
    });
  });

  test('a drive path with either separator is absolute', () => {
    expect(toAssetUrl('C:\\Users\\u\\ext\\a.png')).toContain('http://asset.localhost/');
    expect(toAssetUrl('C:/Users/u/ext/a.png')).toBe(
      `http://asset.localhost/${encodeURIComponent('C:\\Users\\u\\ext\\a.png')}`
    );
    expect(() => toAssetUrl('Users\\u\\a.png')).toThrow(/absolute path/);
    expect(() => toAssetUrl('a.png')).toThrow(/absolute path/);
  });

  test('page-shipped resource files are page-relative URLs with / separators', () => {
    expect(toAssetUrl(`${WIN_RESOURCE}\\avatars\\parts\\body.png`)).toBe(
      new URL('avatars/parts/body.png', document.baseURI).href
    );
    // mixed separators, trailing separator of the resource directory, drive letter case
    setPlatformState({ resourceDirPath: `${WIN_RESOURCE}\\`, platform: 'win32' });
    expect(toAssetUrl('c:/program files/TerminalQuest/avatars\\parts/body.png')).toBe(
      new URL('avatars/parts/body.png', document.baseURI).href
    );
  });

  test('content/ and levels/ use the asset protocol with the normalized Windows path', () => {
    expect(toAssetUrl('C:/Program Files/TerminalQuest/levels/common/sfx/a b.mp3')).toBe(
      `http://asset.localhost/${encodeURIComponent(`${WIN_RESOURCE}\\levels\\common\\sfx\\a b.mp3`)}`
    );
  });

  test('.. is resolved with Windows semantics', () => {
    expect(toAssetUrl(`${WIN_RESOURCE}\\levels\\..\\avatars\\a.png`)).toBe(
      new URL('avatars/a.png', document.baseURI).href
    );
    expect(toAssetUrl(`${WIN_RESOURCE}\\..\\other\\a.png`)).toBe(
      `http://asset.localhost/${encodeURIComponent('C:\\Program Files\\other\\a.png')}`
    );
    // A path on another drive is not a resource
    expect(toAssetUrl('D:\\Program Files\\TerminalQuest\\avatars\\a.png')).toContain(
      'http://asset.localhost/'
    );
  });

  test('UNC and authority-like paths are rejected, not turned into another host', () => {
    ['\\\\example.com\\a.png', '//example.com/a.png', '\\/example.com/a.png'].forEach(value =>
      expect(() => getStaticFileUrl(value)).toThrow(/relative path/)
    );
    ['\\\\server\\share\\a.png', '//server/share/a.png'].forEach(value =>
      expect(() => toAssetUrl(value)).toThrow(/absolute path/)
    );
  });

  test('resource-only directories are matched case-insensitively on Windows only', () => {
    setPlatformState({ resourceDirPath: 'C:\\Res', platform: 'win32' });
    expect(toAssetUrl('C:\\Res\\LEVELS\\a.mp3')).toBe(
      `http://asset.localhost/${encodeURIComponent('C:\\Res\\LEVELS\\a.mp3')}`
    );
    expect(toAssetUrl('c:\\res\\Content\\a.png')).toContain('http://asset.localhost/');
    expect(toAssetUrl('C:\\Res\\Avatars\\a.png')).toBe(
      new URL('Avatars/a.png', document.baseURI).href
    );
  });

  test('getStaticFileUrl rejects a backslash .., a drive path and a rooted path', () => {
    ['a\\..\\b.png', 'C:\\a.png', '\\a.png', 'C:/a.png'].forEach(value =>
      expect(() => getStaticFileUrl(value)).toThrow(/relative path/)
    );
    expect(getStaticFileUrl('code_runner\\worker.js')).toBe(
      new URL('code_runner/worker.js', document.baseURI).href
    );
  });
});

describe('asset protocol configuration', () => {
  // `path` is mocked in this file (the shim), so no path functions here: vitest runs at the repo root
  const root = process.cwd();
  const conf = JSON.parse(
    fs.readFileSync(`${root}/src-tauri/tauri.conf.json`, 'utf8')
  );
  const cargo = fs.readFileSync(`${root}/src-tauri/Cargo.toml`, 'utf8');

  test('is enabled for the resource and user data directories only', () => {
    expect(conf.app.security.assetProtocol).toEqual({
      enable: true,
      scope: [
        '$RESOURCE/**',
        '$CONFIG/terminalquest/**',
        '$CONFIG/TerminalQuest/**',
      ],
    });
  });

  test('the tauri crate has the protocol-asset feature', () => {
    expect(cargo).toMatch(/^tauri = \{[^}]*"protocol-asset"/m);
  });
});
