/**
 * Error helpers shared by the Tauri platform modules.
 *
 * Tauri plugins reject with plain strings (or objects for our own commands),
 * not Node errors. Callers of the platform layer rely on Error objects, and
 * some on `error.code === 'ENOENT'`, so rejections are converted here.
 * Nothing is swallowed and no value is replaced.
 */

// "No such file or directory (os error 2)" (Unix), "The system cannot find the
// file specified. (os error 2)" / "... path specified. (os error 3)" (Windows).
const NOT_FOUND_PATTERN =
  /os error (2|3)\b|No such file or directory|cannot find the (file|path) specified/i;

const NOT_DIRECTORY_PATTERN = /os error (20|267)\b|Not a directory|directory name is invalid/i;

export function toError(reason) {
  if (reason instanceof Error) {
    return reason;
  }
  if (typeof reason === 'string') {
    const error = new Error(reason);
    if (NOT_FOUND_PATTERN.test(reason)) {
      error.code = 'ENOENT';
    } else if (NOT_DIRECTORY_PATTERN.test(reason)) {
      error.code = 'ENOTDIR';
    }
    return error;
  }
  return new Error(`Unexpected rejection value: ${JSON.stringify(reason)}`);
}

/** Awaits `promise`; a rejection is rethrown as an Error (see toError). */
export async function rejectAsError(promise) {
  try {
    return await promise;
  } catch (reason) {
    throw toError(reason);
  }
}

/**
 * Error for members that are synchronous in the Electron contract and cannot
 * be implemented synchronously with Tauri's asynchronous plugins.
 * @param {string} module   e.g. 'fs'
 * @param {string} member   e.g. 'readFileSync'
 * @param {string} instead  what to use instead
 */
export function unsupportedSync(module, member, instead) {
  const error = new Error(
    `platform/${module}.${member} is synchronous and is not available on Tauri. ${instead}`
  );
  error.code = 'ERR_TAURI_SYNC_UNSUPPORTED';
  return error;
}
