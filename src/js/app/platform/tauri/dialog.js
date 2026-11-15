/**
 * Platform dialog module (Tauri). Same exports as ../dialog.js, on
 * @tauri-apps/plugin-dialog.
 *
 * Differences from Electron: the message box has no "question" type (the
 * confirm box uses kind 'info'), and a directory chooser has no button label
 * (`buttonLabel` is accepted and ignored). The chosen directory is added to
 * the fs plugin's runtime scope (recursively) by the plugin.
 */
import { confirm, message, open } from '@tauri-apps/plugin-dialog';
import { rejectAsError } from './errors';

export async function showConfirm(text) {
  const accepted = await rejectAsError(
    confirm(text, { kind: 'info', okLabel: 'OK', cancelLabel: 'Cancel' })
  );
  return accepted === true;
}

export async function showAlert(text) {
  await rejectAsError(message(text, { kind: 'warning', okLabel: 'OK' }));
}

export async function showDirectoryDialog({ title, defaultPath }) {
  const options = {
    title,
    directory: true,
    multiple: false,
    recursive: true,
  };
  if (defaultPath) {
    options.defaultPath = defaultPath;
  }
  const result = await rejectAsError(open(options));
  if (result === null) {
    return undefined;
  }
  if (typeof result !== 'string') {
    throw new Error('Tauri open dialog returned neither a path nor null');
  }
  return result;
}
