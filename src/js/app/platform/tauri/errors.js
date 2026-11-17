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

// A path outside the capability scope (`forbidden path: ... not allowed on the
// scope for `allow-stat` permission ...`) or an OS permission error.
const FORBIDDEN_PATTERN =
  /forbidden path|not allowed on the scope|os error 13\b|Permission denied|Access is denied/i;

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
    } else if (FORBIDDEN_PATTERN.test(reason)) {
      error.code = 'EACCES';
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
