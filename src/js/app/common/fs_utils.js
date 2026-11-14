import path from 'path';
import { fileURLToPath } from 'url';
import fileUrl from 'file-url';
import { existsAsync } from '../platform/fs';

/*
Static files (images, levels, content, ...) live in the public folder, which is
the directory of the page Electron loads (public/index.html). The app is a
single bundle, so the location of a source file says nothing about it - these
utilities create paths relative to the page itself.
*/

// Directory of the loaded page (the static root); throws if it is not a
// file: URL
function staticRootPath() {
  return fileURLToPath(new URL('.', document.baseURI));
}

// Get local filesystem path
export function staticFilePath(relativePath) {
  return path.resolve(staticRootPath(), relativePath);
}

// Get local file URL
export function staticFileUrl(relativePath) {
  const p = staticFilePath(relativePath);
  return fileUrl(p);
}

// Does a static file at the given URL actually exist?
export async function sfExists(relativePath) {
  const p = staticFilePath(relativePath);
  return existsAsync(p);
}
