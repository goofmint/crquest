/**
 * Platform menu module (Tauri). Same exports as ../menu.js.
 *
 * The menu itself is built by the backend (src-tauri/src/help_menu.rs), not
 * here: replacing the application menu from JavaScript would replace the macOS
 * menu that src-tauri/src/close.rs builds (Cmd+Q confirmation). The backend
 * adds the Help items disabled and forwards a click as the `help-menu-click`
 * event whose payload is the item id. This module listens first and only then
 * calls `enable_help_menu`, so no click can arrive without a listener.
 * HELP_MENU_EVENT and the ids mirror help_menu.rs; keep both in sync.
 *
 * `addHelpMenuItems(items)` takes an `{ id, label, click }` list and returns
 * undefined (not awaited by the caller). Setup is
 * asynchronous, so a failure is reported (console and dialog), never dropped.
 * - "Sync Bundled Assets": the shared `click` of `items`. The setup fails when
 *   it is missing.
 * - "Toggle Developer Tools": the platform `toggleDevTools` (the backend adds
 *   the item in debug builds only).
 * - "Open User Data" / "Open Save File": the shared callbacks open the
 *   Electron compatibility paths (`config.userDataPath`, `config.saveFilePath`),
 *   which are not where the Tauri build keeps its data, so they are not used.
 *   The app data directory and its `config.json` store file are opened
 *   (capability: opener:allow-open-path for those two paths only). A store
 *   file that does not exist yet (nothing saved) is reported.
 * - Other items of `items` (the dev-only Spector.js ones) are not in the Tauri
 *   menu.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { appDataDir, join } from '@tauri-apps/api/path';
import { t } from '../../i18n';
import { showAlert } from './dialog';
import { toggleDevTools } from './devtools';
import { openPath } from './shell';
import { rejectAsError, toError } from './errors';
import { STORE_FILE } from './storeFile';

const HELP_MENU_EVENT = 'help-menu-click';
const ENABLE_COMMAND = 'enable_help_menu';
const SYNC_ID = 'help-sync-assets';
const MENU_LABELS = {
  help: 'shell.menu.help',
  'help-toggle-devtools': 'shell.menu.toggleDevtools',
  [SYNC_ID]: 'shell.menu.syncAssets',
  'help-open-user-data': 'shell.menu.openUserData',
  'help-open-save-file': 'shell.menu.openSaveFile',
  'quit-with-confirmation': 'shell.menu.quit',
};

export function getHelpMenuLabel(id) {
  return t(MENU_LABELS[id]);
}

export async function updateShellTexts() {
  const menuLabels = Object.fromEntries(
    Object.keys(MENU_LABELS).map(id => [id, getHelpMenuLabel(id)])
  );
  const closeDialog = {
    title: t('shell.dialog.quitTitle'),
    message: t('shell.dialog.quitMessage'),
    ok: t('shell.dialog.ok'),
    cancel: t('shell.dialog.cancel'),
  };
  try {
    await rejectAsError(invoke('set_shell_texts', { menuLabels, closeDialog }));
  } catch (error) {
    console.error(failureText(t('shell.errors.updateTexts'), error.message), error);
  }
}

async function openAppDataDirectory() {
  await openPath(await rejectAsError(appDataDir()));
}

async function openStoreFile() {
  const appData = await rejectAsError(appDataDir());
  await openPath(await rejectAsError(join(appData, STORE_FILE)));
}

function createActions(items) {
  const sync = items.find(item => item.id === SYNC_ID);
  if (!sync) {
    throw new Error(t('shell.errors.missingMenuItem', { item: getHelpMenuLabel(SYNC_ID) }));
  }
  return {
    'help-toggle-devtools': { title: 'shell.errors.toggleHelpDevtools', run: toggleDevTools },
    [SYNC_ID]: { title: 'shell.errors.syncAssets', run: sync.click },
    'help-open-user-data': { title: 'shell.errors.openUserData', run: openAppDataDirectory },
    'help-open-save-file': { title: 'shell.errors.openSaveFile', run: openStoreFile },
  };
}

function failureText(action, message) {
  return t('shell.errors.failed', { action, message });
}

async function reportFailure(titleKey, reason) {
  // A rejection can be null, undefined, a string or any object
  const error = toError(reason);
  const text = failureText(t(titleKey), error.message);
  console.error(text, error);
  await showAlert(text);
}

/** Resolves once the listener is installed and the items are enabled. */
async function installHelpMenu(items) {
  const actions = createActions(items);
  await rejectAsError(
    listen(HELP_MENU_EVENT, event => {
      const action = Object.hasOwn(actions, event.payload) && actions[event.payload];
      if (!action) {
        reportFailure(
          'shell.errors.helpMenu',
          new Error(t('shell.errors.unknownMenuId', { id: JSON.stringify(event.payload) }))
        ).catch(console.error);
        return;
      }
      Promise.resolve()
        .then(action.run)
        .catch(error => reportFailure(action.title, error))
        .catch(console.error);
    })
  );
  await rejectAsError(invoke(ENABLE_COMMAND));
}

export function addHelpMenuItems(items) {
  installHelpMenu(items).catch(error =>
    reportFailure('shell.errors.setupHelp', error).catch(console.error)
  );
}
