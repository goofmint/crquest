import { pathToFileURL } from 'node:url';
import { fileURLToPath as nodeFileURLToPath } from 'node:url';
import legacyUrl, {
  fileURLToPath,
  parse,
  format,
  resolve,
  URL as ShimURL,
  URLSearchParams as ShimURLSearchParams,
} from '../../js/tauri_shims/url';
import process, {
  env,
  platform,
  browser,
  nextTick,
  cwd,
} from '../../js/tauri_shims/process';

describe('tauri_shims/url', () => {
  test.each([
    'file:///Users/me/game/public/',
    'file:///Users/me/with%20space/%E3%82%B2%E3%83%BC%E3%83%A0/index.html',
    'file:///',
  ])('fileURLToPath matches Node for %s', href => {
    expect(fileURLToPath(href)).toBe(nodeFileURLToPath(href));
    expect(fileURLToPath(new URL(href))).toBe(nodeFileURLToPath(href));
  });

  test('fileURLToPath round-trips a POSIX path', () => {
    const file = '/Users/me/a b/c#d.txt';
    expect(fileURLToPath(pathToFileURL(file))).toBe(file);
  });

  test('fileURLToPath rejects what Node rejects', () => {
    expect(() => fileURLToPath('tauri://localhost/index.html')).toThrow('must be of scheme file');
    expect(() => fileURLToPath('http://tauri.localhost/')).toThrow('must be of scheme file');
    expect(() => fileURLToPath('file://host/etc')).toThrow('host');
    expect(() => fileURLToPath('file:///a%2Fb')).toThrow('encoded / ');
    expect(() => fileURLToPath(42)).toThrow(TypeError);
    expect(() => fileURLToPath(undefined)).toThrow(TypeError);
  });

  test('has the legacy API and the web URL classes', () => {
    expect(parse('http://a.example/b?c=1').pathname).toBe('/b');
    expect(format({ protocol: 'http', host: 'a.example', pathname: '/b' })).toBe('http://a.example/b');
    expect(resolve('http://a.example/b/c', '../d')).toBe('http://a.example/d');
    expect(ShimURL).toBe(URL);
    expect(ShimURLSearchParams).toBe(URLSearchParams);
    expect(legacyUrl.fileURLToPath).toBe(fileURLToPath);
  });
});

describe('tauri_shims/process', () => {
  test('has no host information (there is no made-up OS name)', () => {
    expect(platform).toBeUndefined();
    expect(process.platform).toBeUndefined();
    expect(browser).toBe(true);
    expect(env).toEqual({});
    expect(() => cwd()).toThrow('not available in the Tauri build');
  });

  test('nextTick runs the callback asynchronously with its arguments', async () => {
    const calls = [];
    nextTick((a, b) => calls.push([a, b]), 1, 2);
    expect(calls).toEqual([]);
    await Promise.resolve();
    expect(calls).toEqual([[1, 2]]);
  });
});
