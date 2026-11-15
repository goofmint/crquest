async function loadMenu(remote) {
  vi.resetModules();
  vi.doMock('electron', () => ({ remote }));
  return import('../../../js/app/platform/menu');
}

function makeRemote({ helpItems = [], withHelp = true } = {}) {
  const calls = [];
  const submenu = {
    items: helpItems,
    append: vi.fn(item => calls.push(['append', item.label])),
  };
  const applicationMenu = {
    items: [
      { role: 'fileMenu', submenu: { items: [], append: vi.fn() } },
      ...(withHelp ? [{ role: 'help', submenu }] : []),
    ],
  };
  const MenuItem = vi.fn(function(options) {
    this.label = options.label;
    this.click = options.click;
  });
  const Menu = {
    getApplicationMenu: vi.fn(() => applicationMenu),
    setApplicationMenu: vi.fn(menu => calls.push(['set', menu])),
  };
  return { remote: { Menu, MenuItem }, Menu, MenuItem, submenu, applicationMenu, calls };
}

describe('addHelpMenuItems (Electron)', () => {
  test('appends the items in order, then sets the application menu last', async () => {
    const env = makeRemote();
    const { addHelpMenuItems } = await loadMenu(env.remote);
    const click1 = vi.fn();
    const click2 = vi.fn();
    const result = addHelpMenuItems([
      { label: 'A', click: click1 },
      { label: 'B', click: click2 },
    ]);
    expect(result).toBeUndefined();
    expect(env.calls).toEqual([
      ['append', 'A'],
      ['append', 'B'],
      ['set', env.applicationMenu],
    ]);
    expect(env.MenuItem).toHaveBeenNthCalledWith(1, { label: 'A', click: click1 });
    expect(env.MenuItem).toHaveBeenNthCalledWith(2, { label: 'B', click: click2 });
    expect(env.Menu.setApplicationMenu).toHaveBeenCalledTimes(1);
  });

  test('does not touch Electron at import time', async () => {
    const env = makeRemote();
    await loadMenu(env.remote);
    expect(env.Menu.getApplicationMenu).not.toHaveBeenCalled();
  });

  test('adds nothing when "Toggle Developer Tools" is already in the Help menu, but still sets the menu', async () => {
    const env = makeRemote({ helpItems: [{ label: 'Toggle Developer Tools' }] });
    const { addHelpMenuItems } = await loadMenu(env.remote);
    addHelpMenuItems([{ label: 'A', click: vi.fn() }]);
    expect(env.submenu.append).not.toHaveBeenCalled();
    expect(env.Menu.setApplicationMenu).toHaveBeenCalledWith(env.applicationMenu);
  });

  test('throws (no fallback) when there is no Help menu', async () => {
    const env = makeRemote({ withHelp: false });
    const { addHelpMenuItems } = await loadMenu(env.remote);
    expect(() => addHelpMenuItems([])).toThrow(TypeError);
    expect(env.Menu.setApplicationMenu).not.toHaveBeenCalled();
  });
});
