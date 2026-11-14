function loadShell(shell) {
  let mod;
  jest.isolateModules(() => {
    jest.doMock('electron', () => ({ shell }));
    mod = require('../../../js/app/platform/shell');
  });
  return mod;
}

describe('openExternal', () => {
  test('delegates to shell.openExternal with only the url', () => {
    const shell = { openExternal: jest.fn().mockResolvedValue(undefined) };
    loadShell(shell).openExternal('https://example.com/?a=1');
    expect(shell.openExternal).toHaveBeenCalledTimes(1);
    expect(shell.openExternal).toHaveBeenCalledWith('https://example.com/?a=1');
  });

  test('returns the Promise from electron as-is', () => {
    const promise = Promise.resolve();
    const shell = { openExternal: jest.fn().mockReturnValue(promise) };
    expect(loadShell(shell).openExternal('https://example.com')).toBe(promise);
  });

  test('does not swallow rejections', async () => {
    const shell = {
      openExternal: jest.fn().mockRejectedValue(new Error('boom')),
    };
    await expect(loadShell(shell).openExternal('x')).rejects.toThrow('boom');
  });

  test('does not touch electron at import time', () => {
    const shell = { openExternal: jest.fn() };
    loadShell(shell);
    expect(shell.openExternal).not.toHaveBeenCalled();
  });
});

describe('openPath', () => {
  test('delegates to shell.openPath with only the path and resolves', async () => {
    const shell = { openPath: jest.fn().mockResolvedValue('') };
    await expect(loadShell(shell).openPath('/tmp/x')).resolves.toBeUndefined();
    expect(shell.openPath).toHaveBeenCalledTimes(1);
    expect(shell.openPath).toHaveBeenCalledWith('/tmp/x');
  });

  test('rejects with the error string as the message when non-empty', async () => {
    const shell = { openPath: jest.fn().mockResolvedValue('Failed to open path') };
    const promise = loadShell(shell).openPath('/missing');
    await expect(promise).rejects.toThrow('Failed to open path');
    await expect(promise).rejects.toBeInstanceOf(Error);
  });

  test('propagates electron rejections unchanged', async () => {
    const error = new Error('boom');
    const shell = { openPath: jest.fn().mockRejectedValue(error) };
    await expect(loadShell(shell).openPath('x')).rejects.toBe(error);
  });
});
