/**
 * The "which save?" question, shown as an overlay (components/CloudSaveChoice).
 * The engine waits on the returned promise; the overlay answers through
 * `submitChoice`. If the sign-in changes while the overlay is open, the engine
 * calls `dismissChoice`: the answer is 'dismissed', the overlay closes, and
 * nothing is written on either side.
 */
import { setContext } from '../context';

export const CHOICE_OVERLAY_KEY = 'cloudSaveChoice';

let pending = null;

/** @returns {Promise<'cloud' | 'local' | 'cancel' | 'dismissed'>} */
export function requestChoice(summaries) {
  dismissChoice();
  return new Promise(resolve => {
    pending = resolve;
    setContext({ overlayComponent: { key: CHOICE_OVERLAY_KEY, props: summaries } });
  });
}

export function submitChoice(choice) {
  const resolve = pending;
  pending = null;
  if (resolve) resolve(choice);
}

export function dismissChoice() {
  const resolve = pending;
  if (!resolve) return;
  pending = null;
  resolve('dismissed');
  setContext({ overlayComponent: '' });
}
