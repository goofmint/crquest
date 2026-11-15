/**
 * Platform assets module (Electron). Same exports as tauri/assets.js.
 *
 * Single place for "where are the static files" and "how does the page refer
 * to a file on disk". The Electron implementations return exactly the strings
 * the call sites built inline before (`file-url` output, raw paths).
 *
 * @typedef {Object} PlatformAssets
 * @property {() => string} getStaticRootPath
 *   Absolute path of the static root (the directory of the loaded page,
 *   public/). Tauri: the bundle resource directory. Throws when the page is
 *   not a file: URL (Electron) or before initPlatform() (Tauri).
 * @property {(absolutePath: string) => string} toAssetUrl
 *   URL for an absolute path, for consumers that need a URL (CSS url(), Howler,
 *   <img>). Electron: `fileUrl(absolutePath)`.
 * @property {(absolutePath: string) => string} toAssetSrc
 *   Value that fetch-style consumers (Phaser loaders, <img src>, Howler `src`)
 *   accept for an absolute path. Electron: the path itself, unchanged (they
 *   pass raw paths today). Tauri: the same URL as toAssetUrl. `undefined`
 *   (a file that resolveAbsolutePath() did not find) is returned as it is.
 * @property {(relativePath: string) => string} getStaticFileUrl
 *   URL of a file of the static root given its path relative to it (files the
 *   page ships itself, such as avatars/avatarN.png and code_runner/worker.js).
 *   Electron: `fileUrl(path.resolve(staticRoot, relativePath))`.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import fileUrl from 'file-url';

export function getStaticRootPath() {
  return fileURLToPath(new URL('.', document.baseURI));
}

export function toAssetUrl(absolutePath) {
  return fileUrl(absolutePath);
}

export function toAssetSrc(absolutePath) {
  return absolutePath;
}

export function getStaticFileUrl(relativePath) {
  return fileUrl(path.resolve(getStaticRootPath(), relativePath));
}
