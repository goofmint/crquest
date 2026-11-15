/**
 * Runs `callback` once the document's DOM is available.
 *
 * Electron evaluates the bundle from a script at the end of the page, while
 * `document.readyState` is 'loading', so the callback runs on
 * DOMContentLoaded as it always did. The Tauri build loads the game with a
 * dynamic import after `await initPlatform()`, when DOMContentLoaded has
 * already fired; waiting for the event would never call the callback, so it
 * runs immediately when the state is no longer 'loading'.
 */
export function onDocumentReady(doc, callback) {
  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', callback);
    return;
  }
  callback();
}
