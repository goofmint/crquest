/**
 * Conversation template platform module (Tauri). Same export as
 * ../conversationTemplate.js.
 *
 * A Tauri webview has no synchronous file access, but Pug reads `include` /
 * `extends` files synchronously while it compiles. The `read` plugin hook of
 * Pug 3 is used to bridge this: it serves files from a map; for a file that
 * is not in the map yet it throws a marker error carrying the path Pug
 * resolved. The file is then read with the asynchronous platform fs, added to
 * the map, and the compile is retried. Pug itself still does all the
 * resolving, nesting and error reporting, and every retry adds one file, so
 * the loop ends.
 *
 * Differences from Electron: files are read through platform/fs (the
 * capability scopes apply); the read error of a missing file has the same
 * `code` (ENOENT) and the same " at <file> line <n>" suffix added by Pug, but
 * the rest of its message is the platform fs message. Like Electron,
 * `context.filename` is set to `absolutePath`.
 */
import pug from 'pug';
import { readFile } from './fs';

function missingTemplateError(path) {
  const error = new Error(`Template "${path}" has not been read yet`);
  error.missingTemplate = path;
  return error;
}

export async function compileConversationTemplate(absolutePath, context) {
  // path -> { source } | { failure }
  const files = new Map();

  async function load(path) {
    try {
      files.set(path, { source: await readFile(path, 'utf8') });
    } catch (error) {
      files.set(path, { failure: error });
    }
  }

  const plugin = {
    read(path) {
      const file = files.get(path);
      if (!file) throw missingTemplateError(path);
      if (file.failure) {
        // A new error each time: Pug appends the location to the message
        const error = new Error(file.failure.message);
        error.code = file.failure.code;
        throw error;
      }
      return file.source;
    },
  };

  await load(absolutePath);
  const root = files.get(absolutePath);
  if (root.failure) throw root.failure;

  context.filename = absolutePath;
  const options = { ...context, plugins: [plugin] };
  for (;;) {
    try {
      const render = pug.compile(root.source, options);
      return () => render(options);
    } catch (error) {
      if (!error.missingTemplate) throw error;
      await load(error.missingTemplate);
    }
  }
}

export async function renderConversationTemplate(absolutePath, context) {
  const render = await compileConversationTemplate(absolutePath, context);
  return render();
}
