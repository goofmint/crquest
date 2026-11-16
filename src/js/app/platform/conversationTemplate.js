/**
 * Conversation template platform module (Electron). Same export as
 * tauri/conversationTemplate.js.
 *
 * Renders a conversation's Pug template. Electron keeps calling
 * `pug.renderFile(absolutePath, context)` exactly as Conversation.jsx did
 * (synchronous read of the file and of every `include`, `context` used both as
 * the template locals and as the Pug options, and `context.filename` set to
 * `absolutePath` by Pug). Nothing is wrapped: errors propagate unchanged.
 *
 * @typedef {Object} PlatformConversationTemplate
 * @property {(absolutePath: string, context: Object) => Promise<string>} renderConversationTemplate
 *   Resolves with the rendered HTML. Rejects when the file or an included
 *   file cannot be read, or when compiling or rendering fails.
 */
import pug from 'pug';

export async function renderConversationTemplate(absolutePath, context) {
  return pug.renderFile(absolutePath, context);
}
