import fs from 'node:fs';
import path from 'node:path';

const menuFile = path.resolve(__dirname, '../../../../js/app/platform/tauri/menu.js');

const mocks = vi.hoisted(() => ({
  calls: [],
  invoke: vi.fn(),
  listen: vi.fn(),
  appDataDir: vi.fn(),
  join: vi.fn(),
  showAlert: vi.fn(),
  toggleDevTools: vi.fn(),
  openPath: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }));
vi.mock('@tauri-apps/api/path', () => ({ appDataDir: mocks.appDataDir, join: mocks.join }));
vi.mock('../../../../js/app/platform/tauri/dialog', () => ({ showAlert: mocks.showAlert }));
vi.mock('../../../../js/app/platform/tauri/devtools', () => ({ toggleDevTools: mocks.toggleDevTools }));
vi.mock('../../../../js/app/platform/tauri/shell', () => ({ openPath: mocks.openPath }));

import { addHelpMenuItems, updateShellTexts } from '../../../../js/app/platform/tauri/menu';
import { initializeI18n } from '../../../../js/app/i18n';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

// addHelpMenuItems does not return its setup; wait for it to settle
const installHelpMenu = async items => {
  addHelpMenuItems(items);
  await flush();
};

describe('Tauri Help menu (#141)', () => {
  let handler;
  let syncClick;
  let items;

  beforeEach(() => {
    Object.values(mocks).forEach(mock => mock.mockReset?.());
    mocks.calls.length = 0;
    mocks.listen.mockImplementation(async (event, callback) => {
      mocks.calls.push(`listen:${event}`);
      handler = callback;
      return () => {};
    });
    mocks.invoke.mockImplementation(async command => {
      mocks.calls.push(`invoke:${command}`);
    });
    mocks.appDataDir.mockResolvedValue('/data/app');
    mocks.join.mockImplementation(async (...parts) => parts.join('/'));
    mocks.showAlert.mockResolvedValue(undefined);
    mocks.openPath.mockResolvedValue(undefined);
    mocks.toggleDevTools.mockResolvedValue(undefined);
    syncClick = vi.fn();
    items = [
      { id: 'help-toggle-devtools', label: 'Toggle Developer Tools', click: vi.fn() },
      { id: 'help-sync-assets', label: '同梱アセットを同期する', click: syncClick },
      { id: 'help-open-user-data', label: 'Open User Data', click: vi.fn() },
      { id: 'help-open-save-file', label: 'Open Save File', click: vi.fn() },
      // A matching English label cannot take the place of the stable ID.
      { id: 'help-show-spector', label: 'Sync Bundled Assets', click: vi.fn() },
    ];
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const click = async id => {
    handler({ payload: id });
    await flush();
  };

  test('listens before it enables the menu', async () => {
    await installHelpMenu(items);
    expect(mocks.calls).toEqual(['listen:help-menu-click', 'invoke:enable_help_menu']);
  });

  test('does not enable the menu when listening fails, and reports it', async () => {
    mocks.listen.mockRejectedValue('listen refused');
    addHelpMenuItems(items);
    await flush();
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.showAlert).toHaveBeenCalledWith(
      'Setting up the Help menu failed: listen refused'
    );
  });

  test('reports a failure of enable_help_menu', async () => {
    mocks.invoke.mockRejectedValue({ not: 'a string' });
    addHelpMenuItems(items);
    await flush();
    expect(mocks.showAlert).toHaveBeenCalledTimes(1);
    expect(mocks.showAlert.mock.calls[0][0]).toMatch(/^Setting up the Help menu failed:/);
  });

  test('fails when the Sync item is not provided', async () => {
    await installHelpMenu(items.filter(i => i.id !== 'help-sync-assets'));
    expect(mocks.listen).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.showAlert).toHaveBeenCalledTimes(1);
    expect(mocks.showAlert.mock.calls[0][0]).toMatch(/Setting up the Help menu failed:.*Sync Bundled Assets/);
  });

  test('addHelpMenuItems returns undefined', () => {
    expect(addHelpMenuItems(items)).toBeUndefined();
  });

  test('Sync Bundled Assets runs the shared callback; only that one', async () => {
    await installHelpMenu(items);
    await click('help-sync-assets');
    expect(syncClick).toHaveBeenCalledTimes(1);
    items.filter(i => i !== items[1]).forEach(i => expect(i.click).not.toHaveBeenCalled());
  });

  test('Toggle Developer Tools toggles the devtools', async () => {
    await installHelpMenu(items);
    await click('help-toggle-devtools');
    expect(mocks.toggleDevTools).toHaveBeenCalledTimes(1);
  });

  test('Open User Data opens the app data directory', async () => {
    await installHelpMenu(items);
    await click('help-open-user-data');
    expect(mocks.openPath).toHaveBeenCalledWith('/data/app');
  });

  test('Open Save File opens config.json in the app data directory', async () => {
    await installHelpMenu(items);
    await click('help-open-save-file');
    expect(mocks.join).toHaveBeenCalledWith('/data/app', 'config.json');
    expect(mocks.openPath).toHaveBeenCalledWith('/data/app/config.json');
  });

  test('a failing action is reported with its title (store file not created yet)', async () => {
    mocks.openPath.mockRejectedValue(new Error('No such file or directory (os error 2)'));
    await installHelpMenu(items);
    await click('help-open-save-file');
    expect(mocks.showAlert).toHaveBeenCalledWith(
      'Opening the save file failed: No such file or directory (os error 2)'
    );
  });

  test('sends the native menu and confirmation texts to Rust', async () => {
    await updateShellTexts();
    expect(mocks.invoke).toHaveBeenCalledWith('set_shell_texts', {
      menuLabels: {
        help: 'Help',
        'help-toggle-devtools': 'Toggle Developer Tools',
        'help-sync-assets': 'Sync Bundled Assets',
        'help-open-user-data': 'Open User Data',
        'help-open-save-file': 'Open Save File',
        'quit-with-confirmation': 'Quit TerminalQuest',
      },
      closeDialog: {
        title: 'TerminalQuest',
        message: 'Are you sure you want to quit TerminalQuest?',
        ok: 'OK',
        cancel: 'Cancel',
      },
    });
  });

  test('sends the selected Japanese labels and confirmation texts', async () => {
    await initializeI18n('ja');
    try {
      await updateShellTexts();
      expect(mocks.invoke).toHaveBeenCalledWith('set_shell_texts', {
        menuLabels: expect.objectContaining({
          help: 'ヘルプ',
          'help-sync-assets': '同梱アセットを同期する',
          'quit-with-confirmation': 'TerminalQuest を終了',
        }),
        closeDialog: {
          title: 'TerminalQuest',
          message: 'TerminalQuest を終了しますか？',
          ok: 'OK',
          cancel: 'キャンセル',
        },
      });
    } finally {
      await initializeI18n('en');
    }
  });

  test('a failing shared callback is reported', async () => {
    syncClick.mockRejectedValue(new Error('sync broke'));
    await installHelpMenu(items);
    await click('help-sync-assets');
    expect(mocks.showAlert).toHaveBeenCalledWith('Sync Bundled Assets failed: sync broke');
  });

  test.each([
    ['null', null, 'Unexpected rejection value: null'],
    ['undefined', undefined, 'Unexpected rejection value: undefined'],
    ['a string', 'plain reason', 'plain reason'],
    ['an Error', new Error('boom'), 'boom'],
    ['a plain object', { code: 1 }, 'Unexpected rejection value: {"code":1}'],
  ])('a callback rejecting with %s still shows the dialog', async (_name, reason, message) => {
    syncClick.mockImplementation(() => Promise.reject(reason));
    await installHelpMenu(items);
    await click('help-sync-assets');
    expect(mocks.showAlert).toHaveBeenCalledWith(`Sync Bundled Assets failed: ${message}`);
  });

  test('an unknown id is reported and nothing runs', async () => {
    await installHelpMenu(items);
    await click('help-other');
    expect(mocks.showAlert).toHaveBeenCalledTimes(1);
    expect(mocks.openPath).not.toHaveBeenCalled();
    expect(syncClick).not.toHaveBeenCalled();
  });

  test('the ids and the event match the backend (help_menu.rs)', () => {
    const rust = fs.readFileSync(
      path.resolve(__dirname, '../../../../../src-tauri/src/help_menu.rs'),
      'utf8'
    );
    const source = fs.readFileSync(menuFile, 'utf8');
    const ids = ['help-toggle-devtools', 'help-sync-assets', 'help-open-user-data', 'help-open-save-file'];
    ids.forEach(id => {
      expect(rust).toContain(`"${id}"`);
      expect(source).toContain(`'${id}'`);
    });
    expect(rust).toContain('"help-menu-click"');
    expect(source).toContain("'help-menu-click'");
    expect(rust).toContain('fn enable_help_menu');
    expect(source).toContain("'enable_help_menu'");
  });

  test('source does not replace the application menu or import electron', () => {
    const source = fs.readFileSync(menuFile, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(source).not.toMatch(/electron|@tauri-apps\/api\/menu|setAsAppMenu|Menu\.default/);
  });
});
