// platform/conversationTemplate for the Vitest run (see vitest.config.mjs):
// pug 3 reads the template from disk.
import pug from 'pug';

export async function renderConversationTemplate(absolutePath, context) {
  return pug.renderFile(absolutePath, context);
}
