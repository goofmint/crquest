async function loadDevtools(remote) {
  vi.resetModules();
  vi.doMock('electron', () => ({ remote }));
  return import('../../../js/app/platform/devtools');
}

function makeRemote(win) {
  return { BrowserWindow: { getFocusedWindow: vi.fn(() => win) } };
}

function makeWindow() {
  return {
    webContents: { openDevTools: vi.fn(), toggleDevTools: vi.fn() },
  };
}

describe('openDevTools', () => {
  test('opens devtools of the focused window with no args and returns undefined', async () => {
    const win = makeWindow();
    const result = (await loadDevtools(makeRemote(win))).openDevTools();
    expect(win.webContents.openDevTools).toHaveBeenCalledTimes(1);
    expect(win.webContents.openDevTools).toHaveBeenCalledWith();
    expect(win.webContents.toggleDevTools).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  test('throws a descriptive Error when no window is focused', async () => {
    const { openDevTools } = (await loadDevtools(makeRemote(null)));
    expect(() => openDevTools()).toThrow('No focused window: cannot open DevTools');
  });

  test('looks up the focused window on every call', async () => {
    const remote = makeRemote(null);
    const { openDevTools } = await loadDevtools(remote);
    expect(remote.BrowserWindow.getFocusedWindow).not.toHaveBeenCalled();
    expect(() => openDevTools()).toThrow();
    const win = makeWindow();
    remote.BrowserWindow.getFocusedWindow.mockReturnValue(win);
    openDevTools();
    expect(remote.BrowserWindow.getFocusedWindow).toHaveBeenCalledTimes(2);
    expect(win.webContents.openDevTools).toHaveBeenCalledTimes(1);
  });
});

describe('toggleDevTools', () => {
  test('toggles devtools of the focused window with no args and returns undefined', async () => {
    const win = makeWindow();
    const result = (await loadDevtools(makeRemote(win))).toggleDevTools();
    expect(win.webContents.toggleDevTools).toHaveBeenCalledTimes(1);
    expect(win.webContents.toggleDevTools).toHaveBeenCalledWith();
    expect(win.webContents.openDevTools).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  test('throws a descriptive Error when no window is focused', async () => {
    const { toggleDevTools } = (await loadDevtools(makeRemote(null)));
    expect(() => toggleDevTools()).toThrow('No focused window: cannot toggle DevTools');
  });
});
