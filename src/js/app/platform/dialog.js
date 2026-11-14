/**
 * Platform dialog module.
 *
 * Single place for Electron's `remote.dialog` calls that used to live in
 * src/js/index.js (window.confirm / window.alert) and
 * src/js/app/components/menu/settings/Extensions.jsx (directory chooser).
 * Nothing touches Electron at import time; `remote.dialog` is looked up on
 * every call. Dialog errors are not caught and propagate to the caller. No
 * fallback values are used: an unusable `remote` / `dialog` or a result
 * without a `filePaths` array throws an Error.
 *
 * Differs from the #5 contract (generic `showMessageBoxSync(null, options)` /
 * `showOpenDialog(options)` pass-through): it is replaced by purpose-specific
 * functions that build the existing options internally.
 *
 * @typedef {Object} PlatformDialog
 * @property {(message: string) => boolean} showConfirmSync
 *   Synchronous, blocking question box with buttons ['OK', 'Cancel'].
 *   Returns true only when the button index is 0 (OK).
 * @property {(message: string) => undefined} showAlertSync
 *   Synchronous, blocking warning box with an 'OK' button. Returns undefined.
 * @property {(params: {title: string, buttonLabel: string, defaultPath?: string}) => Promise<string | undefined>} showDirectoryDialog
 *   Opens a directory chooser (`message` is set to `title`; `defaultPath` is
 *   only passed when truthy). Resolves with `filePaths[0]`, which is
 *   undefined when nothing was chosen. `canceled` is not inspected.
 */
import { remote } from 'electron';

function getDialog() {
  if (!remote || !remote.dialog) {
    throw new Error('Electron remote.dialog is not available');
  }
  return remote.dialog;
}

function showConfirmSync(message) {
  const buttonIdx = getDialog().showMessageBoxSync(null, {
    type: 'question',
    buttons: ['OK', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    detail: message,
    message: '',
  });
  return buttonIdx === 0;
}

function showAlertSync(message) {
  getDialog().showMessageBoxSync(null, {
    type: 'warning',
    buttons: ['OK'],
    defaultId: 0,
    cancelId: 0,
    detail: message,
    message: '',
  });
}

async function showDirectoryDialog({ title, buttonLabel, defaultPath }) {
  const dialogOptions = {
    title,
    message: title,
    buttonLabel,
    properties: ['openDirectory'],
  };

  if (defaultPath) {
    dialogOptions.defaultPath = defaultPath;
  }

  const result = await getDialog().showOpenDialog(dialogOptions);
  if (!result || !Array.isArray(result.filePaths)) {
    throw new Error('Electron showOpenDialog returned no filePaths array');
  }
  return result.filePaths[0];
}

export { showConfirmSync, showAlertSync, showDirectoryDialog };
