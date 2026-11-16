import fs from 'node:fs';
import nodePath from 'node:path';
import path from 'path-browserify';
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

const RESOURCE = '/opt/TerminalQuest';

beforeEach(() => {
  mockConvertFileSrc('linux');
  setPlatformState({
    appDataPath: '/home/u/.config',
    resourceDirPath: RESOURCE,
    appVersion: '1.0.0',
    isDev: false,
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

  test('resource files become page-relative URLs (embedded frontendDist)', () => {
    const url = toAssetUrl(`${RESOURCE}/levels/common/sfx/click 1.mp3`);
    expect(new URL(url).pathname).toBe('/levels/common/sfx/click%201.mp3');
    expect(new URL(url).origin).toBe(new URL(document.baseURI).origin);
    expect(toAssetSrc(`${RESOURCE}/avatars/parts/body.png`)).toBe(
      new URL('avatars/parts/body.png', document.baseURI).href
    );
  });

  test('a resource directory with a trailing slash behaves the same', () => {
    setPlatformState({ resourceDirPath: `${RESOURCE}/` });
    expect(new URL(toAssetUrl(`${RESOURCE}/levels/a.mp3`)).pathname).toBe(
      '/levels/a.mp3'
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

  test('a path that only shares the resource directory prefix is not a resource', () => {
    expect(toAssetUrl(`${RESOURCE}-other/a.png`)).toContain('asset://localhost/');
  });

  test('.. that resolves inside the resource directory is a resource', () => {
    const url = toAssetUrl(`${RESOURCE}/levels/common/../common/sfx/a.mp3`);
    expect(new URL(url).pathname).toBe('/levels/common/sfx/a.mp3');
    expect(toAssetSrc(`${RESOURCE}/levels/../avatars/parts/body.png`)).toBe(
      new URL('avatars/parts/body.png', document.baseURI).href
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

  test.each(['', '/abs/a.png', '../a.png', 'a/../../b.png'])(
    'getStaticFileUrl rejects %p',
    value => {
      expect(() => getStaticFileUrl(value)).toThrow(/relative path/);
    }
  );
});

describe('asset protocol configuration', () => {
  const root = nodePath.resolve(__dirname, '../../../../..');
  const conf = JSON.parse(
    fs.readFileSync(nodePath.join(root, 'src-tauri/tauri.conf.json'), 'utf8')
  );
  const cargo = fs.readFileSync(nodePath.join(root, 'src-tauri/Cargo.toml'), 'utf8');

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
