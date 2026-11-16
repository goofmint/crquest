/**
 * Platform assets module (Tauri). Same exports as ../assets.js.
 *
 * - `getStaticRootPath()`: the bundle resource directory, where `content/`,
 *   `levels/` and `avatars/parts/` sit (tauri-resources.md).
 * - `getStaticFileUrl(relativePath)`: an URL relative to the page
 *   (`tauri://localhost/...`), served from the embedded `frontendDist`
 *   (public/). For files the page ships itself (avatars/avatarN.png,
 *   code_runner/worker.js).
 * - `toAssetUrl(absolutePath)` / `toAssetSrc(absolutePath)` (identical here):
 *   a path under the resource directory becomes the page-relative URL of the
 *   same file in `frontendDist` (the resource layout equals public/, D5 (2));
 *   every other absolute path (user data, user extensions) becomes an asset
 *   protocol URL (`convertFileSrc`), which `app.security.assetProtocol` in
 *   tauri.conf.json allows for the resource and user data directories only.
 *   Paths are POSIX (decision D4); Windows is W12.
 */
import path from 'path';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getResourceDirPath } from './paths';

function assertAbsolute(absolutePath) {
  if (typeof absolutePath !== 'string' || !absolutePath.startsWith('/')) {
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
  if (
    typeof relativePath !== 'string' ||
    relativePath === '' ||
    relativePath.startsWith('/') ||
    relativePath.split('/').includes('..')
  ) {
    throw new Error(
      `assets: a relative path inside the static root is required, got ${relativePath}`
    );
  }
  return pageRelativeUrl(relativePath);
}

export function toAssetUrl(absolutePath) {
  assertAbsolute(absolutePath);
  // Normalize first: `..` segments decide whether the file is inside the
  // resource directory, and the normalized path is what gets converted.
  const normalized = path.normalize(absolutePath);
  const root = `${path.normalize(getResourceDirPath()).replace(/\/+$/, '')}/`;
  if (normalized.startsWith(root)) {
    return getStaticFileUrl(normalized.slice(root.length));
  }
  return convertFileSrc(normalized);
}

export function toAssetSrc(absolutePath) {
  // resolveAbsolutePath() returns undefined for a file that does not exist
  // (an optional image); the callers pass that on as "no source", as Electron
  // does.
  return absolutePath === undefined ? undefined : toAssetUrl(absolutePath);
}
