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

  test('does not invent a code for other failures', () => {
    const error = toError('forbidden path: /etc/passwd');
    expect(error.message).toBe('forbidden path: /etc/passwd');
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
