import path from 'path';
import { existsAsync } from '../platform/fs';
import { getStaticRootPath, getStaticFileUrl } from '../platform/assets';

/*
Static files (images, levels, content, ...) live in the public folder, which is
the directory of the page Electron loads (public/index.html). The app is a
single bundle, so the location of a source file says nothing about it - these
utilities create paths relative to the page itself.
*/

// Get local filesystem path
export function staticFilePath(relativePath) {
  return path.resolve(getStaticRootPath(), relativePath);
}

// Get the URL of a file of the static root, given its path relative to it
export function staticFileUrl(relativePath) {
  return getStaticFileUrl(relativePath);
}

// Does a static file at the given URL actually exist?
export async function sfExists(relativePath) {
  const p = staticFilePath(relativePath);
  return existsAsync(p);
}
