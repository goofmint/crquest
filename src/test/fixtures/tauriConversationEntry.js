// Entry of the VM test (tauriConversationBundle.test.js), built with
// `--mode tauri` like the game: the Tauri conversation renderer and cheerio,
// exactly as Conversation.jsx imports them.
import cheerio from 'cheerio';
import { renderConversationTemplate } from '../../js/app/platform/conversationTemplate';

import { setPlatformState } from '../../js/app/platform/tauri/state';

// `path` (used by pug) follows the OS that initPlatform() read
setPlatformState({ platform: 'darwin' });

globalThis.__conversation = { cheerio, renderConversationTemplate };
