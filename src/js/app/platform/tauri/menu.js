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
 * `addHelpMenuItems(items)` takes the same `{ label, click }` list as the
 * Electron module and returns undefined (not awaited by the caller). Setup is
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
import { showAlert } from './dialog';
import { toggleDevTools } from './devtools';
import { openPath } from './shell';
import { rejectAsError } from './errors';
import { STORE_FILE } from './storeFile';

const HELP_MENU_EVENT = 'help-menu-click';
const ENABLE_COMMAND = 'enable_help_menu';
const SYNC_LABEL = 'Sync Bundled Assets';

async function openAppDataDirectory() {
  await openPath(await rejectAsError(appDataDir()));
}

async function openStoreFile() {
  const appData = await rejectAsError(appDataDir());
  await openPath(await rejectAsError(join(appData, STORE_FILE)));
}

function createActions(items) {
  const sync = items.find(item => item.label === SYNC_LABEL);
  if (!sync) {
    throw new Error(`The menu item "${SYNC_LABEL}" was not provided`);
  }
  return {
    'help-toggle-devtools': { title: 'Toggling the developer tools', run: toggleDevTools },
    'help-sync-assets': { title: SYNC_LABEL, run: sync.click },
    'help-open-user-data': { title: 'Opening the user data directory', run: openAppDataDirectory },
    'help-open-save-file': { title: 'Opening the save file', run: openStoreFile },
  };
}

async function reportFailure(title, error) {
  console.error(`${title} failed:`, error);
  await showAlert(`${title} failed: ${error.message}`);
}

/** Resolves once the listener is installed and the items are enabled. */
async function installHelpMenu(items) {
  const actions = createActions(items);
  await rejectAsError(
    listen(HELP_MENU_EVENT, event => {
      const action = actions[event.payload];
      if (!action) {
        reportFailure(
          'Help menu',
          new Error(`Unknown menu item id: ${JSON.stringify(event.payload)}`)
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
    reportFailure('Setting up the Help menu', error).catch(console.error)
  );
}
