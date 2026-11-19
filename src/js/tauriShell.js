/**
 * Window-level behavior for the Tauri build: external links and the DevTools
 * shortcut. Used only by src/js/tauriIndex.jsx (Tauri build mode); the
 * Electron entry (index.jsx) keeps its own link handler and uses the Help
 * menu for DevTools.
 */
import { showAlert } from './app/platform/dialog';
import { openExternal } from './app/platform/shell';
import { toggleDevTools } from './app/platform/devtools';
import { t } from './app/i18n';

// Same selector as the link handler in index.jsx (Electron), also matched
// from child elements. Opening is
// limited to http(s) by the opener capability scope as well.
const EXTERNAL_LINK_SELECTOR = 'a[href^="http"]';

function normalizeExternalUrl(href) {
  const targetUrl = new URL(href);
  const newQuery = new URLSearchParams(targetUrl.searchParams.toString());
  return [
    targetUrl.origin,
    targetUrl.pathname,
    `?${newQuery.toString()}`,
    targetUrl.hash,
  ].join('');
}

async function reportFailure(action, error) {
  const text = t('shell.errors.failed', { action, message: error.message });
  console.error(text, error);
  await showAlert(text);
}

/**
 * Opens clicks on web links in the system default browser. A failure is
 * logged and shown, never swallowed.
 */
export function installExternalLinkHandler(doc) {
  doc.addEventListener(
    'click',
    event => {
      // closest(): a click on an element inside the link (<span>, <img>)
      // counts as a click on the link.
      const link = event.target.closest(EXTERNAL_LINK_SELECTOR);
      if (!link) {
        return;
      }
      event.preventDefault();
      const url = normalizeExternalUrl(link.href);
      openExternal(url).catch(error =>
        reportFailure(t('shell.errors.openLink', { url }), error)
      );
    },
    false
  );
}

/** F12, Ctrl+Shift+I, or Cmd+Option+I (macOS). */
export function isDevToolsShortcut(event) {
  if (event.key === 'F12') {
    return !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
  }
  const isI = event.code === 'KeyI';
  return (
    isI &&
    ((event.ctrlKey && event.shiftKey && !event.metaKey && !event.altKey) ||
      (event.metaKey && event.altKey && !event.ctrlKey && !event.shiftKey))
  );
}

/**
 * Toggles DevTools on the shortcut. Release builds refuse in Rust and the
 * refusal is shown to the user.
 */
export function installDevToolsShortcut(doc) {
  doc.addEventListener('keydown', event => {
    if (!isDevToolsShortcut(event)) {
      return;
    }
    event.preventDefault();
    toggleDevTools().catch(error =>
      reportFailure(t('shell.errors.toggleDevtools'), error)
    );
  });
}
