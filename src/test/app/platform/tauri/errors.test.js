import {
  rejectAsError,
  toError,
} from '../../../../js/app/platform/tauri/errors';

describe('toError', () => {
  test('keeps Error objects unchanged', () => {
    const error = new Error('x');
    expect(toError(error)).toBe(error);
  });

  test('wraps strings and detects a missing path as ENOENT', () => {
    const missing = toError('No such file or directory (os error 2)');
    expect(missing).toBeInstanceOf(Error);
    expect(missing.code).toBe('ENOENT');
    expect(toError('The system cannot find the file specified. (os error 2)').code).toBe('ENOENT');
    expect(toError('The system cannot find the path specified. (os error 3)').code).toBe('ENOENT');
  });

  test('detects a non-directory as ENOTDIR', () => {
    expect(toError('Not a directory (os error 20)').code).toBe('ENOTDIR');
  });

  test('detects a path outside the capability scope as EACCES (#173)', () => {
    const forbidden = toError(
      'forbidden path: /Users/jane/Downloads/test, maybe it is not allowed on the scope for `allow-stat` permission in your capability file'
    );
    expect(forbidden.code).toBe('EACCES');
    expect(forbidden.message).toContain('forbidden path: /Users/jane/Downloads/test');
    expect(toError('Permission denied (os error 13)').code).toBe('EACCES');
    expect(toError('Access is denied. (os error 5)').code).toBe('EACCES');
    expect(toError('Operation not permitted (os error 1)').code).toBe('EACCES');
    // `os error 5` alone is an I/O error on macOS / Linux, not a permission denial.
    expect(toError('Input/output error (os error 5)').code).toBeUndefined();
  });

  test('does not invent a code for other failures', () => {
    const error = toError('disk exploded');
    expect(error.message).toBe('disk exploded');
    expect(error.code).toBeUndefined();
  });

  test('wraps other values explicitly', () => {
    expect(toError({ a: 1 }).message).toContain('{"a":1}');
  });
});

describe('rejectAsError', () => {
  test('passes resolved values through', async () => {
    await expect(rejectAsError(Promise.resolve(3))).resolves.toBe(3);
  });

  test('turns a string rejection into an Error', async () => {
    await expect(rejectAsError(Promise.reject('boom'))).rejects.toBeInstanceOf(Error);
  });
});
