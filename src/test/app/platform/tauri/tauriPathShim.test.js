import nodePath from 'node:path';
import pathShim, * as named from '../../../../js/tauri_shims/path';
import {
  setPlatformState,
  resetPlatformState,
} from '../../../../js/app/platform/tauri/state';

// The shim of `path` for the Tauri build (vite.config.mjs aliases `path` and
// `node:path` to it): win32 or posix per call, from the initialized OS.
const use = platform => setPlatformState({ platform });

afterEach(() => resetPlatformState());

describe('path shim (Tauri)', () => {
  test('throws before initPlatform() (no default OS)', () => {
    expect(() => pathShim.join('a', 'b')).toThrow(/initPlatform/);
    expect(() => named.basename('a')).toThrow(/initPlatform/);
    expect(() => pathShim.sep).toThrow(/initPlatform/);
    expect(() => pathShim.delimiter).toThrow(/initPlatform/);
  });

  test('rejects an OS that is not darwin, linux or win32', () => {
    use('freebsd');
    expect(() => pathShim.join('a')).toThrow(/unsupported platform/);
  });

  test.each(['darwin', 'linux'])('%s: POSIX semantics, same results as Node posix', platform => {
    use(platform);
    expect(pathShim.sep).toBe('/');
    expect(pathShim.delimiter).toBe(':');
    expect(pathShim.join('/a', 'b', '../c')).toBe(nodePath.posix.join('/a', 'b', '../c'));
    expect(pathShim.normalize('/a//b/./c/..')).toBe('/a/b');
    expect(pathShim.isAbsolute('/a')).toBe(true);
    expect(pathShim.isAbsolute('C:\\a')).toBe(false);
    expect(pathShim.relative('/a/b', '/a/c')).toBe('../c');
    expect(pathShim.basename('/a/b.txt', '.txt')).toBe('b');
    expect(pathShim.extname('x.tar.gz')).toBe('.gz');
    expect(pathShim.dirname('/a/b')).toBe('/a');
    expect(pathShim.parse('/a/b.txt')).toEqual(nodePath.posix.parse('/a/b.txt'));
    expect(pathShim.format({ dir: '/a', base: 'b.txt' })).toBe('/a/b.txt');
    expect(pathShim.resolve('/a', 'b', '..', 'c')).toBe('/a/c');
  });

  test('win32: Windows semantics, same results as Node win32', () => {
    use('win32');
    const { win32 } = nodePath;
    expect(pathShim.sep).toBe('\\');
    expect(pathShim.delimiter).toBe(';');
    expect(pathShim.join('C:\\Users', 'me', '..', 'you')).toBe(win32.join('C:\\Users', 'me', '..', 'you'));
    expect(pathShim.normalize('C:/a//b/./c/..')).toBe('C:\\a\\b');
    expect(pathShim.isAbsolute('C:\\a')).toBe(true);
    expect(pathShim.isAbsolute('C:/a')).toBe(true);
    expect(pathShim.isAbsolute('a\\b')).toBe(false);
    expect(pathShim.relative('C:\\a\\b', 'C:\\a\\c')).toBe('..\\c');
    expect(pathShim.relative('C:\\A\\b', 'c:\\a\\B\\x')).toBe('x');
    expect(pathShim.basename('C:\\a\\b.txt', '.txt')).toBe('b');
    expect(pathShim.dirname('C:\\a\\b')).toBe('C:\\a');
    expect(pathShim.parse('C:\\a\\b.txt')).toEqual(win32.parse('C:\\a\\b.txt'));
    expect(pathShim.resolve('C:\\a', 'b', '..', 'c')).toBe('C:\\a\\c');
    expect(pathShim.resolve('C:/a', 'D:\\b')).toBe('D:\\b');
  });

  test('toNamespacedPath: unchanged on POSIX, delegated on win32', () => {
    ['linux', 'darwin'].forEach(platform => {
      use(platform);
      expect(pathShim.toNamespacedPath('/a/b')).toBe('/a/b');
      expect(pathShim.toNamespacedPath('C:\\a')).toBe('C:\\a');
    });
    use('win32');
    expect(pathShim.toNamespacedPath('C:\\a\\b')).toBe(nodePath.win32.toNamespacedPath('C:\\a\\b'));
  });

  test('the OS is read at every call, not once', () => {
    use('linux');
    expect(pathShim.join('a', 'b')).toBe('a/b');
    use('win32');
    expect(pathShim.join('a', 'b')).toBe('a\\b');
  });

  test('explicit implementations ignore the OS', () => {
    use('win32');
    expect(pathShim.posix.join('a', 'b')).toBe('a/b');
    expect(named.posix).toBe(pathShim.posix);
    use('linux');
    expect(pathShim.win32.join('a', 'b')).toBe('a\\b');
    expect(named.win32).toBe(pathShim.win32);
  });

  test.each(['linux', 'win32'])('%s: resolve() without an absolute path throws', platform => {
    use(platform);
    expect(() => pathShim.resolve('a', 'b')).toThrow(/absolute path/);
    expect(() => pathShim.resolve()).toThrow(/absolute path/);
  });

  test('exposes the public API of Node path (apart from matchesGlob)', () => {
    use('linux');
    const expected = Object.keys(nodePath).filter(name => name !== 'matchesGlob' && name !== '_makeLong');
    expected.forEach(name => expect(pathShim).toHaveProperty(name));
  });
});
