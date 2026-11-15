/**
 * `url` for the Tauri build (vite.config.mjs aliases the Node builtin to this
 * file in `--mode tauri` only). The legacy API (`parse`, `format`, `resolve`)
 * comes from the `url` npm package; `URL` / `URLSearchParams` are the
 * webview's own; `fileURLToPath` is the POSIX behavior of Node's, which the
 * npm package does not have. Windows drive-letter paths are not handled
 * (docs/migration/tauri-runtime.md, W12).
 */
import legacyUrl from 'url/url.js';

export const { parse, format, resolve, resolveObject, Url } = legacyUrl;

export const { URL, URLSearchParams } = globalThis;

/**
 * @param {string | URL} urlOrString a `file:` URL
 * @returns {string} the decoded path
 */
export function fileURLToPath(urlOrString) {
  if (typeof urlOrString !== 'string' && !(urlOrString instanceof URL)) {
    throw new TypeError('The "path" argument must be of type string or an instance of URL');
  }
  const url = typeof urlOrString === 'string' ? new URL(urlOrString) : urlOrString;
  if (url.protocol !== 'file:') {
    throw new TypeError('The URL must be of scheme file');
  }
  if (url.hostname !== '') {
    throw new TypeError('File URL host must be "localhost" or empty on posix');
  }
  if (/%2f/i.test(url.pathname)) {
    throw new TypeError('File URL path must not include encoded / characters');
  }
  return decodeURIComponent(url.pathname);
}

export default {
  parse,
  format,
  resolve,
  resolveObject,
  Url,
  URL,
  URLSearchParams,
  fileURLToPath,
};
