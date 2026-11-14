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

  test('does not export openPath', () => {
    const shell = { openExternal: jest.fn() };
    expect(loadShell(shell).openPath).toBeUndefined();
  });
});
