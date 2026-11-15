import { showAlert } from '../platform/dialog';

/**
 * Reports a failure to the console and to the user in a dialog. It does not
 * swallow the failure: callers decide whether to stop or rethrow. A failure of
 * the dialog itself is logged to the console only.
 * @param {string} message
 * @param {Error} error
 * @returns {Promise<void>}
 */
export async function reportFailure(message, error) {
  console.error(message, error);
  try {
    await showAlert(`${message}\n${error && error.message ? error.message : String(error)}`);
  } catch (dialogError) {
    console.error('Could not show the failure dialog', dialogError);
  }
}
