async function loadShell(shell) {
  vi.resetModules();
  vi.doMock('electron', () => ({ shell }));
  return import('../../../js/app/platform/shell');
}

describe('openExternal', () => {
  test('delegates to shell.openExternal with only the url', async () => {
    const shell = { openExternal: vi.fn().mockResolvedValue(undefined) };
    (await loadShell(shell)).openExternal('https://example.com/?a=1');
    expect(shell.openExternal).toHaveBeenCalledTimes(1);
    expect(shell.openExternal).toHaveBeenCalledWith('https://example.com/?a=1');
  });

  test('returns the Promise from electron as-is', async () => {
    const promise = Promise.resolve();
    const shell = { openExternal: vi.fn().mockReturnValue(promise) };
    expect((await loadShell(shell)).openExternal('https://example.com')).toBe(promise);
  });

  test('does not swallow rejections', async () => {
    const shell = {
      openExternal: vi.fn().mockRejectedValue(new Error('boom')),
    };
    await expect((await loadShell(shell)).openExternal('x')).rejects.toThrow('boom');
  });

  test('does not touch electron at import time', async () => {
    const shell = { openExternal: vi.fn() };
    await loadShell(shell);
    expect(shell.openExternal).not.toHaveBeenCalled();
  });
});

describe('openPath', () => {
  test('delegates to shell.openPath with only the path and resolves', async () => {
    const shell = { openPath: vi.fn().mockResolvedValue('') };
    await expect((await loadShell(shell)).openPath('/tmp/x')).resolves.toBeUndefined();
    expect(shell.openPath).toHaveBeenCalledTimes(1);
    expect(shell.openPath).toHaveBeenCalledWith('/tmp/x');
  });

  test('rejects with the error string as the message when non-empty', async () => {
    const shell = { openPath: vi.fn().mockResolvedValue('Failed to open path') };
    const promise = (await loadShell(shell)).openPath('/missing');
    await expect(promise).rejects.toThrow('Failed to open path');
    await expect(promise).rejects.toBeInstanceOf(Error);
  });

  test('propagates electron rejections unchanged', async () => {
    const error = new Error('boom');
    const shell = { openPath: vi.fn().mockRejectedValue(error) };
    await expect((await loadShell(shell)).openPath('x')).rejects.toBe(error);
  });
});
