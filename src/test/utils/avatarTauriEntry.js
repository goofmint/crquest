// Test entry for the Tauri build of the avatar renderer (avatarTauriBundle.test.js):
// built with vite.config.mjs --mode tauri (so `jimp` is the browser bundle and
// platform/assets is the Tauri one), then evaluated in a jsdom window without
// Node globals. Exposes only what the test drives.
import Jimp from 'jimp';
import { generateDataURI } from '../../js/app/common/avatarRenderer';
import { setPlatformState } from '../../js/app/platform/tauri/state';

window.avatarEntry = { Jimp, generateDataURI, setPlatformState };
