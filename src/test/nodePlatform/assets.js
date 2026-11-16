// platform/assets for the Vitest run (see vitest.config.mjs): the files are on
// disk next to the page (`document.baseURI`, public/ in the jsdom window is the
// page directory that the tests set), so the paths are file paths and URLs.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function getStaticRootPath() {
  return fileURLToPath(new URL('.', document.baseURI));
}

export function toAssetUrl(absolutePath) {
  return pathToFileURL(absolutePath).href;
}

export function toAssetSrc(absolutePath) {
  return absolutePath;
}

export function getStaticFileUrl(relativePath) {
  return pathToFileURL(path.resolve(getStaticRootPath(), relativePath)).href;
}
