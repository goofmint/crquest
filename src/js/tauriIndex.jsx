// Entry of the Tauri build (`vite build --mode tauri`, see vite.config.mjs).
// The platform layer must be initialized before anything else reads paths or
// env, so the game entry is imported only afterwards. A failure of either step
// rejects and is reported by the console.
import { initPlatform } from './app/platform/init';
import { getValueAsync } from './app/platform/store';
import { updateShellTexts } from './app/platform/menu';
import { getLanguage, initializeI18n, t } from './app/i18n';
import {
  installDevToolsShortcut,
  installExternalLinkHandler,
} from './tauriShell';

async function main() {
  await initPlatform();
  let settings;
  try {
    settings = await getValueAsync('settings');
  } catch (error) {
    console.warn('Could not read the saved language:', error);
  }
  await initializeI18n(settings?.language);
  const loading = document.querySelector('#app .__loading');
  if (loading && getLanguage() !== 'en') {
    loading.querySelector('h2').textContent = t('loading.title');
    loading.querySelector('p').replaceChildren(
      t('loading.interact'),
      document.createElement('br'),
      t('loading.move')
    );
  }
  await updateShellTexts();
  installExternalLinkHandler(document);
  installDevToolsShortcut(document);
  await import('./index.jsx');
}

main().catch(error => {
  console.error('TerminalQuest failed to start:', error);
  throw error;
});
