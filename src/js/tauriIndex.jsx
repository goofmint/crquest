// Entry of the Tauri build (`vite build --mode tauri`, see vite.config.mjs).
// The platform layer must be initialized before anything else reads paths or
// env, so the game entry is imported only afterwards. A failure of either step
// rejects and is reported by the console; there is no fallback.
import { initPlatform } from './app/platform/init';
import {
  installDevToolsShortcut,
  installExternalLinkHandler,
} from './tauriShell';

async function main() {
  await initPlatform();
  installExternalLinkHandler(document);
  installDevToolsShortcut(document);
  await import('./index.jsx');
}

main().catch(error => {
  console.error('TerminalQuest failed to start:', error);
  throw error;
});
