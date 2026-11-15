/**
 * File system platform module (Tauri). Same export names as ../fs.js, on
 * @tauri-apps/plugin-fs. Access is limited by the capability scopes
 * (src-tauri/capabilities/platform.json): a path outside them rejects.
 *
 * Differences from Electron / fs-jetpack:
 * - Synchronous members (`exists`, `list`, `read`, `remove`, `readFileSync`)
 *   cannot exist on Tauri: they throw `ERR_TAURI_SYNC_UNSUPPORTED` (use the
 *   `*Async` / promise forms).
 * - Plugin errors are strings; they are rethrown as Error objects, and a
 *   missing path carries `code: 'ENOENT'` (see errors.js). Other Node error
 *   codes are not reproduced.
 * - `readFile` / `readAsync(path, 'buffer')` return a `Uint8Array`, not a
 *   Buffer. Only UTF-8 text is supported (`encoding` must be 'utf8' or
 *   'utf-8').
 * - `stat` / `lstat` return `{ isFile(), isDirectory(), isSymbolicLink(),
 *   size, mtime, mtimeMs }` (mtime is a Date; mtimeMs is NaN when unknown).
 * - `listAsync` requires a path (there is no working directory to default to).
 * - `copyAsync` copies files and directories recursively; without
 *   `overwrite: true` an existing target (file or directory) rejects with
 *   `code: 'EEXIST'`, and a destination that is the source or inside it
 *   rejects before anything is created. Only ENOENT counts as "missing" in
 *   the jetpack-style functions; every other error propagates.
 */
import {
  copyFile,
  lstat as pluginLstat,
  mkdir,
  readDir,
  readFile as pluginReadFile,
  readTextFile,
  remove as pluginRemove,
  stat as pluginStat,
  writeFile,
  writeTextFile,
} from '@tauri-apps/plugin-fs';
import { rejectAsError, unsupportedSync } from './errors';


function assertPath(path) {
  if (typeof path !== 'string' || path === '') {
    throw new TypeError(
      `path must be a non-empty string, got ${typeof path === 'string' ? 'an empty string' : typeof path}`
    );
  }
  return path;
}

function assertUtf8(options) {
  const encoding = typeof options === 'string' ? options : options?.encoding;
  if (encoding === undefined || encoding === null) {
    return false;
  }
  if (!/^utf-?8$/i.test(encoding)) {
    throw new Error(`Unsupported encoding on Tauri: ${encoding} (only utf8)`);
  }
  return true;
}

function dirName(path) {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  if (index < 0) {
    throw new Error(`Cannot determine the parent directory of "${path}"`);
  }
  return index === 0 ? path.slice(0, 1) : path.slice(0, index);
}

function joinPath(base, name) {
  const separator = base.includes('\\') && !base.includes('/') ? '\\' : '/';
  return `${base.replace(/[\\/]+$/, '')}${separator}${name}`;
}

function toStats(info) {
  const mtime = info.mtime === null || info.mtime === undefined ? null : info.mtime;
  return {
    isFile: () => info.isFile,
    isDirectory: () => info.isDirectory,
    isSymbolicLink: () => info.isSymlink,
    size: info.size,
    mtime,
    mtimeMs: mtime ? mtime.getTime() : NaN,
  };
}

function enoent(path) {
  const error = new Error(`ENOENT: no such file or directory, '${path}'`);
  error.code = 'ENOENT';
  return error;
}

function alreadyExists(path) {
  const error = new Error(`EEXIST: file already exists, '${path}'`);
  error.code = 'EEXIST';
  return error;
}

// --- Node fs.promises family -------------------------------------------

export async function readFile(path, options) {
  assertPath(path);
  if (assertUtf8(options)) {
    return rejectAsError(readTextFile(path));
  }
  return rejectAsError(pluginReadFile(path));
}

export async function readdir(path) {
  assertPath(path);
  const entries = await rejectAsError(readDir(path));
  return entries.map(entry => entry.name);
}

export async function stat(path) {
  assertPath(path);
  return toStats(await rejectAsError(pluginStat(path)));
}

export async function lstat(path) {
  assertPath(path);
  return toStats(await rejectAsError(pluginLstat(path)));
}

// --- fs-jetpack family (missing path is a normal value) -----------------

// Only ENOENT means "missing". Every other error (permission, forbidden path,
// I/O) propagates.
async function orMissing(promise) {
  try {
    return await rejectAsError(promise);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

export async function existsAsync(path) {
  assertPath(path);
  const info = await orMissing(pluginStat(path));
  if (info === undefined) return false;
  if (info.isDirectory) return 'dir';
  if (info.isFile) return 'file';
  return 'other';
}

export async function listAsync(path) {
  assertPath(path);
  const kind = await existsAsync(path);
  if (kind === false) {
    return undefined;
  }
  if (kind !== 'dir') {
    const error = new Error(`ENOTDIR: not a directory, '${path}'`);
    error.code = 'ENOTDIR';
    throw error;
  }
  return readdir(path);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const reviveDates = (key, value) =>
  typeof value === 'string' && ISO_DATE.test(value) ? new Date(value) : value;

export async function readAsync(path, returnAs = 'utf8') {
  assertPath(path);
  if (!['utf8', 'buffer', 'json', 'jsonWithDates'].includes(returnAs)) {
    throw new Error(`Unknown return type: ${returnAs}`);
  }
  if (returnAs === 'buffer') {
    return orMissing(pluginReadFile(path));
  }
  const text = await orMissing(readTextFile(path));
  if (text === undefined || returnAs === 'utf8') {
    return text;
  }
  try {
    return JSON.parse(text, returnAs === 'jsonWithDates' ? reviveDates : undefined);
  } catch (error) {
    throw new Error(`JSON parsing failed while reading ${path} [${error.message}]`);
  }
}

export async function writeAsync(path, data) {
  assertPath(path);
  let content;
  if (typeof data === 'string' || data instanceof Uint8Array) {
    content = data;
  } else if (data !== null && typeof data === 'object') {
    content = JSON.stringify(data, null, 2);
  } else {
    throw new TypeError(
      `Unsupported data type to write: ${data === null ? 'null' : typeof data}`
    );
  }
  await rejectAsError(mkdir(dirName(path), { recursive: true }));
  if (typeof content === 'string') {
    await rejectAsError(writeTextFile(path, content));
  } else {
    await rejectAsError(writeFile(path, content));
  }
}

// Lexical normalization for the "destination inside source" check: forward
// slashes, no trailing slash, `.` and `..` resolved, lower-cased (a
// case-insensitive file system must not slip through; the cost is a
// conservative rejection on case-sensitive ones).
function comparablePath(path) {
  const segments = [];
  for (const segment of path.replace(/\\/g, '/').split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') segments.pop();
    else segments.push(segment);
  }
  return `/${segments.join('/')}`.toLowerCase();
}

function assertDestinationOutsideSource(from, to) {
  const source = comparablePath(from);
  const destination = comparablePath(to);
  if (destination === source || destination.startsWith(`${source}/`)) {
    throw new Error(
      `Cannot copy "${from}" onto itself or into itself ("${to}")`
    );
  }
}

async function copyEntry(from, to) {
  const kind = await existsAsync(from);
  if (kind === false) {
    throw enoent(from);
  }
  if (kind === 'dir') {
    await rejectAsError(mkdir(to, { recursive: true }));
    for (const name of await readdir(from)) {
      await copyEntry(joinPath(from, name), joinPath(to, name));
    }
    return;
  }
  await rejectAsError(mkdir(dirName(to), { recursive: true }));
  await rejectAsError(copyFile(from, to));
}

export async function copyAsync(from, to, options = {}) {
  assertPath(from);
  assertPath(to);
  assertDestinationOutsideSource(from, to);
  const sourceKind = await existsAsync(from);
  if (sourceKind === false) {
    throw enoent(from);
  }
  // Same rule for a file and a directory destination: an existing target is
  // an error unless `overwrite: true` (the check precedes any mutation).
  if (options.overwrite !== true && (await existsAsync(to)) !== false) {
    throw alreadyExists(to);
  }
  await copyEntry(from, to);
}

export async function removeAsync(path) {
  assertPath(path);
  // lstat: a symbolic link (also a dangling one) is removed itself.
  if ((await orMissing(pluginLstat(path))) === undefined) {
    return;
  }
  await rejectAsError(pluginRemove(path, { recursive: true }));
}

// --- Synchronous members: not available ---------------------------------

export function exists() {
  throw unsupportedSync('fs', 'exists', 'Use existsAsync.');
}

export function list() {
  throw unsupportedSync('fs', 'list', 'Use listAsync.');
}

export function read() {
  throw unsupportedSync('fs', 'read', 'Use readAsync.');
}

export function remove() {
  throw unsupportedSync('fs', 'remove', 'Use removeAsync.');
}

export function readFileSync() {
  throw unsupportedSync('fs', 'readFileSync', 'Use readFile (asynchronous).');
}

