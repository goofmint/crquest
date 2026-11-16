/**
 * Platform assets module (Tauri). Same exports as ../assets.js.
 *
 * - `getStaticRootPath()`: the bundle resource directory, where `content/`,
 *   `levels/` and `avatars/parts/` sit (tauri-resources.md).
 * - `getStaticFileUrl(relativePath)`: an URL relative to the page
 *   (`tauri://localhost/...`), served from the embedded `frontendDist`
 *   (the staging directory of tasks/stage_tauri_frontend.js). For files the
 *   page ships itself (avatars/avatarN.png, code_runner/worker.js).
 * - `toAssetUrl(absolutePath)` / `toAssetSrc(absolutePath)` (identical here):
 *   a path under the resource directory that is also in `frontendDist`
 *   becomes the page-relative URL of that file (the resource layout equals
 *   public/, D5 (2)). `content/` and `levels/` (tauriResourceOnlyDirectories.json)
 *   are not embedded (W12), so they, and every other absolute path (user
 *   data, user extensions), become an asset protocol URL (`convertFileSrc`),
 *   which `app.security.assetProtocol` in tauri.conf.json allows for the
 *   resource and user data directories only.
 *   Path semantics (win32 / posix) follow the OS (tauri_shims/path.js, D4 (b)).
 *   Not handled on Windows: UNC paths and the case of `$CONFIG` in the
 *   asset scope (manual checklist in docs/migration/tauri-runtime.md).
 */
import path from 'path';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getResourceDirPath } from './paths';
import resourceOnlyDirectories from '../../config/tauriResourceOnlyDirectories.json';

// A separator of either platform: a Windows relative path may use both.
const SEPARATORS = /[\\/]/;

// UNC (two backslashes, then host) and authority-like (`//host`) paths are not supported
const AUTHORITY_LIKE = /^[\\/]{2}/;

function assertAbsolute(absolutePath) {
  if (
    typeof absolutePath !== 'string' ||
    AUTHORITY_LIKE.test(absolutePath) ||
    !path.isAbsolute(absolutePath)
  ) {
    throw new Error(`assets: an absolute path is required, got ${absolutePath}`);
  }
}

function pageRelativeUrl(relativePath) {
  const encoded = relativePath.split('/').map(encodeURIComponent).join('/');
  return new URL(encoded, document.baseURI).href;
}

export function getStaticRootPath() {
  return getResourceDirPath();
}

export function getStaticFileUrl(relativePath) {
  // Separators first: every check below, and the URL, see the same string
  const normalized =
    typeof relativePath === 'string' ? relativePath.split(SEPARATORS).join('/') : relativePath;
  if (
    typeof normalized !== 'string' ||
    normalized === '' ||
    normalized.startsWith('/') ||
    path.isAbsolute(normalized) ||
    normalized.split('/').includes('..')
  ) {
    throw new Error(
      `assets: a relative path inside the static root is required, got ${relativePath}`
    );
  }
  return pageRelativeUrl(normalized);
}

/**
 * The path of `absolutePath` relative to the resource directory, as segments,
 * or null when it is outside it (`path.relative` compares the way the OS does).
 */
function resourceSegments(normalizedPath) {
  const relative = path.relative(getResourceDirPath(), normalizedPath);
  if (relative === '' || path.isAbsolute(relative)) return null;
  const segments = relative.split(SEPARATORS);
  return segments[0] === '..' ? null : segments;
}

export function toAssetUrl(absolutePath) {
  assertAbsolute(absolutePath);
  // Normalize first: `..` segments decide whether the file is inside the
  // resource directory, and the normalized path is what gets converted.
  const normalized = path.normalize(absolutePath);
  const segments = resourceSegments(normalized);
  // On Windows `path.relative` keeps the input's casing, and the file system ignores it
  const caseInsensitive = path.sep === '\\';
  const first = caseInsensitive ? segments?.[0].toLowerCase() : segments?.[0];
  if (segments && !resourceOnlyDirectories.includes(first)) {
    return getStaticFileUrl(segments.join('/'));
  }
  return convertFileSrc(normalized);
}

export function toAssetSrc(absolutePath) {
  // resolveAbsolutePath() returns undefined for a file that does not exist
  // (an optional image); the callers pass that on as "no source", as Electron
  // does.
  return absolutePath === undefined ? undefined : toAssetUrl(absolutePath);
}
