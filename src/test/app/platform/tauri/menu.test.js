import fs from 'node:fs';
import path from 'node:path';

const menuFile = path.resolve(__dirname, '../../../../js/app/platform/tauri/menu.js');

describe('addHelpMenuItems (Tauri, decision D2: explicit no-op)', () => {
  async function load() {
    vi.resetModules();
    const invoke = vi.fn();
    const menuApi = { Menu: { new: vi.fn(), default: vi.fn() } };
    vi.doMock('@tauri-apps/api/core', () => ({ invoke }));
    vi.doMock('@tauri-apps/api/menu', () => menuApi);
    const mod = await import('../../../../js/app/platform/tauri/menu');
    return { mod, invoke, menuApi };
  }

  test('returns undefined and calls no Tauri API (the macOS quit menu of close.rs stays)', async () => {
    const { mod, invoke, menuApi } = await load();
    expect(mod.addHelpMenuItems([{ label: 'A', click: vi.fn() }])).toBeUndefined();
    expect(invoke).not.toHaveBeenCalled();
    expect(menuApi.Menu.new).not.toHaveBeenCalled();
    expect(menuApi.Menu.default).not.toHaveBeenCalled();
  });

  test('does not click-invoke the items', async () => {
    const { mod } = await load();
    const click = vi.fn();
    mod.addHelpMenuItems([{ label: 'A', click }]);
    expect(click).not.toHaveBeenCalled();
  });

  test('source does not import electron or the Tauri menu API', () => {
    const source = fs.readFileSync(menuFile, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(source).not.toMatch(/electron|@tauri-apps/);
  });
});
