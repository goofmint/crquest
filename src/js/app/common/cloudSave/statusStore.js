/**
 * The latest cloud sync status, readable by the UI without importing the
 * engine (which pulls in the game context). Values are the `STATUS` strings of
 * syncEngine.js.
 */
let current = 'signed_out';
const listeners = new Set();

export function getSyncStatus() {
  return current;
}

export function setSyncStatus(status) {
  if (status === current) return;
  current = status;
  listeners.forEach(listener => listener(status));
}

/** Returns the unsubscribe function. */
export function subscribeSyncStatus(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
