/**
 * The store file of the Tauri build: `config.json` under the app data
 * directory (`$APPDATA/<identifier>`), resolved by tauri-plugin-store itself
 * (store.js). Shared with the "Open Save File" menu item (menu.js), which opens
 * the real file. It is NOT the `config.saveFilePath` of config.js, which keeps
 * the Electron location (`$CONFIG/terminalquest/config.json`).
 */
export const STORE_FILE = 'config.json';
