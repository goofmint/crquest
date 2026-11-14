/**
 * Pure path helpers for the CommonJS module loader (moduleLoader.js).
 *
 * Deliberately independent of Node's `path` so that the loader can run in a
 * webview without Node. Everything is computed on forward-slash paths:
 * backslashes are converted to `/` on input, and the result always uses `/`
 * (Node and Tauri both accept forward slashes on Windows).
 *
 * Supported absolute forms: POSIX (`/a/b`) and Windows drive paths (`C:\a\b`
 * or `C:/a/b`, normalized to `C:/a/b`).
 *
 * Limitations (rejected with an explicit error, never guessed):
 * - UNC paths (`\\server\share`) and paths starting with `//`.
 * - Drive-relative paths such as `C:foo`.
 * - `..` that would climb above the root.
 * - Windows paths are case-sensitive here (module cache keys are compared as
 *   written), unlike the real Windows file system.
 */

const ROOT_PATTERN = /^(?:[A-Za-z]:)?\//;
const DRIVE_RELATIVE_PATTERN = /^[A-Za-z]:(?!\/)/;

const toForwardSlashes = p => p.replace(/\\/g, '/');

function assertSupported(p, forwardSlashed) {
  if (forwardSlashed.startsWith('//')) {
    throw new Error(`UNC paths are not supported: "${p}"`);
  }
  if (DRIVE_RELATIVE_PATTERN.test(forwardSlashed)) {
    throw new Error(`Drive-relative paths are not supported: "${p}"`);
  }
}

/**
 * @param {string} p
 * @returns {boolean} true for `/x`, `C:/x` and `C:\x`
 */
function isAbsolute(p) {
  const forwardSlashed = toForwardSlashes(p);
  assertSupported(p, forwardSlashed);

  return ROOT_PATTERN.test(forwardSlashed);
}

/**
 * Normalizes `.`/`..`/duplicate separators. Absolute inputs keep their root
 * (`/` or `C:/`); relative inputs stay relative.
 *
 * @param {string} p
 * @returns {string}
 */
function normalize(p) {
  const forwardSlashed = toForwardSlashes(p);
  assertSupported(p, forwardSlashed);

  const rootMatch = ROOT_PATTERN.exec(forwardSlashed);
  const root = rootMatch ? rootMatch[0] : '';
  const segments = [];

  forwardSlashed
    .slice(root.length)
    .split('/')
    .forEach(segment => {
      if (segment === '' || segment === '.') {
        return;
      }
      if (segment === '..') {
        if (segments.length > 0 && segments[segments.length - 1] !== '..') {
          segments.pop();
          return;
        }
        if (root) {
          throw new Error(`Path "${p}" climbs above its root`);
        }
      }
      segments.push(segment);
    });

  return root + segments.join('/');
}

/**
 * @param {string} p - absolute path
 * @returns {string} directory part (the root itself for a root-level entry)
 */
function dirname(p) {
  const normalized = normalize(p);
  const rootMatch = ROOT_PATTERN.exec(normalized);
  if (!rootMatch) {
    throw new Error(`dirname requires an absolute path: "${p}"`);
  }
  const root = rootMatch[0];
  const index = normalized.lastIndexOf('/');

  return index < root.length ? root : normalized.slice(0, index);
}

/**
 * Resolves `target` against the absolute directory `fromDirectory`.
 * An absolute `target` is only normalized.
 *
 * @param {string} fromDirectory - absolute directory
 * @param {string} target
 * @returns {string} absolute normalized path
 */
function resolve(fromDirectory, target) {
  if (isAbsolute(target)) {
    return normalize(target);
  }
  if (!isAbsolute(fromDirectory)) {
    throw new Error(
      `resolve requires an absolute directory: "${fromDirectory}"`
    );
  }

  const directory = normalize(fromDirectory);
  // A root ("/" or "C:/") already ends with a separator: do not double it,
  // otherwise "//x" would be rejected as a UNC path.
  const separator = directory.endsWith('/') ? '' : '/';

  return normalize(`${directory}${separator}${target}`);
}

/**
 * @param {string} p
 * @returns {string} extension including the dot of the last segment, or ''
 */
function extname(p) {
  const base = toForwardSlashes(p)
    .split('/')
    .pop();
  const index = base.lastIndexOf('.');

  return index <= 0 ? '' : base.slice(index);
}

export { isAbsolute, normalize, dirname, resolve, extname, toForwardSlashes };
