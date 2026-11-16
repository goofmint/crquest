/**
 * `path` for the Tauri build (vite.config.mjs aliases the Node builtin `path`
 * and `node:path` to this file in `--mode tauri` only; also what an
 * extension's `require('path')` gets, through moduleAllowlist.js).
 *
 * Node's `path` follows the OS the process runs on. A webview has no such
 * process, so each call picks `win32` or `posix` from the OS that
 * `initPlatform()` read (platform/tauri/env `getPlatform()`, 'darwin' |
 * 'linux' | 'win32'). Before `initPlatform()` has finished every function, and
 * `sep` / `delimiter`, throws: there is no default OS.
 *
 * - posix: `path-browserify` (Node's implementation).
 * - win32: `path-browserify-win32` (Node's `path.win32`).
 * - `resolve()` needs an absolute path among its arguments, as it did with
 *   `path-browserify` alone (a webview has no working directory). The win32
 *   implementation would silently resolve against a root instead, so this is
 *   checked here for both.
 * - `path.win32` / `path.posix` are exposed unchanged (explicit semantics).
 * - `sep` / `delimiter` are properties of the default export (the object that
 *   `import path from 'path'` and `require('path')` of an extension give);
 *   an ES module cannot export a changing binding, so there are no named
 *   `sep` / `delimiter` exports.
 */
import posix from 'path-browserify';
import win32Path from 'path-browserify-win32';
import { getPlatform } from '../app/platform/tauri/env';

const { win32 } = win32Path;

const IMPLEMENTATION_BY_PLATFORM = Object.freeze({
  win32,
  darwin: posix,
  linux: posix,
});

function current() {
  const platform = getPlatform();
  if (!Object.hasOwn(IMPLEMENTATION_BY_PLATFORM, platform)) {
    throw new Error(`path: unsupported platform ${JSON.stringify(platform)}`);
  }
  return IMPLEMENTATION_BY_PLATFORM[platform];
}

export function resolve(...segments) {
  const implementation = current();
  if (!segments.some(segment => typeof segment === 'string' && implementation.isAbsolute(segment))) {
    throw new Error(
      'path.resolve() needs an absolute path: there is no working directory in the Tauri build'
    );
  }
  return implementation.resolve(...segments);
}

export function normalize(path) {
  return current().normalize(path);
}

export function isAbsolute(path) {
  return current().isAbsolute(path);
}

export function join(...segments) {
  return current().join(...segments);
}

export function relative(from, to) {
  return current().relative(from, to);
}

export function toNamespacedPath(path) {
  return current().toNamespacedPath(path);
}

export function dirname(path) {
  return current().dirname(path);
}

export function basename(path, extension) {
  return current().basename(path, extension);
}

export function extname(path) {
  return current().extname(path);
}

export function format(pathObject) {
  return current().format(pathObject);
}

export function parse(path) {
  return current().parse(path);
}

export { posix, win32 };

const pathApi = {
  resolve,
  normalize,
  isAbsolute,
  join,
  relative,
  toNamespacedPath,
  dirname,
  basename,
  extname,
  format,
  parse,
  posix,
  win32,
  get sep() {
    return current().sep;
  },
  get delimiter() {
    return current().delimiter;
  },
};

export default pathApi;
