/**
 * CommonJS module loader that does not use Node's `require`, `vm` or `path`,
 * so that it can run in a Tauri webview. Source is read through the platform
 * file system layer and evaluated with `new Function`.
 *
 * Phase 3 tasks 3-2 / 3-3. Nothing calls it yet (assetLoader's
 * `requireFromExtension` still uses Node `require`); switching over is a
 * separate ticket.
 *
 * Sync/async: the platform file system is asynchronous but CommonJS `require`
 * is synchronous. So loading has two phases:
 * 1. `load(path)` (async) walks the static dependency graph: it scans each
 *    source for `require('literal')` calls, resolves every specifier and reads
 *    every needed file. The outcome per (requiring file, specifier) is
 *    recorded, successes and failures alike.
 * 2. Evaluation (sync): `require` inside a module only looks the recorded
 *    outcome up. A recorded failure is thrown at the moment the module really
 *    calls that `require` (like Node, an unexecuted lazy `require` of a
 *    missing module does not break loading). Nothing is skipped silently.
 *
 * Scanning: `scanRequires` uses a small hand-written lexical tokenizer, not a
 * parser. esprima 4 was tried first and rejected: it fails to parse 31 of the
 * 478 JS files of the bundled extensions (object spread in many
 * `objects/*\/config.js` that the game really loads, plus a few real syntax
 * errors), and a regex fallback would be silent. The tokenizer skips comments,
 * strings, template literals and regex literals, so `require /* c *\/ ('x')`,
 * `require('x',)` and `foo.require('x')` (a property, ignored) are handled
 * correctly without needing a full grammar.
 *
 * `require` with a non-literal argument (for example a template string) is not
 * seen by the scan. Such a call throws ERR_MODULE_NOT_PRELOADED unless the
 * same specifier from the same file was recorded; there is no way to read a
 * file synchronously here.
 *
 * Resolution (Node order, subset): a relative (`./`, `../`) or absolute
 * specifier is tried as the exact file, `.js`, `.json`, then as a directory
 * (package.json `main`, `index.js`, `index.json`). `.node`/`.mjs`/`.cjs` are
 * not supported. A bare specifier is never searched in node_modules: it must
 * be on the allowlist (moduleAllowlist.js) or the loader throws.
 *
 * Cache: modules are cached by absolute path before evaluation, so circular
 * requires receive the partial `exports` (as in Node). A module that throws
 * while evaluating is removed from the cache.
 *
 * Publication and versions: a preload reads sources and builds resolution
 * tables in private staging maps and publishes both to the shared maps in one
 * synchronous step, only if it completed and no invalidate happened meanwhile;
 * a failed or stale preload publishes nothing. Each published source gets an
 * increasing version; an evaluated module is valid only if it was evaluated
 * from the currently published version, so a `load` after a publish never
 * returns exports evaluated from older source (for example by a live lazy
 * require that ran during the read).
 *
 * Invalidation contract: `invalidate(path)` / `invalidateAll()` evict ONLY the
 * evaluated-module cache (the equivalent of `delete require.cache[path]`).
 * They do NOT discard the preloaded sources and resolution tables, because
 * live module instances may still need them for lazy `require` calls (a
 * synchronous `require` cannot read files). Every fresh `load()` re-reads and
 * re-preloads from the file system, overwriting older preloaded data, so
 * hot-reload callers do `invalidate` then `load`. Consequence: a lazy require
 * executed later by an existing instance can return the version preloaded
 * before the invalidation (stale until the next `load`); this is the accepted
 * trade-off. Preloaded sources stay in memory for the loader's lifetime.
 * Modules that already hold old exports keep them.
 *
 * An invalidate while a `load` is still reading files bumps a generation
 * counter; that in-flight preload then writes nothing and the load restarts
 * from scratch (also when its read failed), so it never publishes stale data.
 *
 * Error codes (`error.code`): MODULE_NOT_FOUND, ERR_MODULE_NOT_ALLOWED,
 * ERR_MODULE_NOT_PRELOADED, ERR_MODULE_SYNTAX, ERR_MODULE_JSON (internal: ERR_MODULE_STALE_LOAD).
 *
 * Paths: see modulePath.js (forward slashes, drive-letter support, no UNC).
 * Entry paths given to `load` must be absolute.
 */
import * as platformFs from '../platform/fs';
import { getBuiltIn, isAllowedBuiltIn } from './moduleAllowlist';
import { isAbsolute, normalize, dirname, resolve } from './modulePath';

const IDENTIFIER_START = /[A-Za-z_$\u0080-\uFFFF]/;
const IDENTIFIER_PART = /[A-Za-z0-9_$\u0080-\uFFFF]/;
const NUMBER_PATTERN = /^(?:0[xXoObB][0-9a-fA-F_]+n?|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?n?)/;
// After these keywords a `/` starts a regular expression, not a division.
const REGEX_PRECEDING_KEYWORDS = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'case',
  'do',
  'else',
  'yield',
  'await',
]);
const SIMPLE_ESCAPES = {
  n: '\n',
  r: '\r',
  t: '\t',
  b: '\b',
  f: '\f',
  v: '\v',
};
const LINE_TERMINATORS = ['\n', '\r', '\u2028', '\u2029'];
const BOM = '﻿';

function createError(code, message) {
  const error = new Error(message);
  error.code = code;

  return error;
}

const isRelativeSpecifier = specifier =>
  specifier === '.' ||
  specifier === '..' ||
  specifier.startsWith('./') ||
  specifier.startsWith('../') ||
  specifier.startsWith('.\\') ||
  specifier.startsWith('..\\');

const isPathSpecifier = specifier =>
  isRelativeSpecifier(specifier) || isAbsolute(specifier);

const stripBom = text => (text.startsWith(BOM) ? text.slice(1) : text);

/**
 * Decodes the raw text between the quotes of a JavaScript string literal the
 * way the engine does: simple escapes, `\xHH`, `\uHHHH`, `\u{H...}`, legacy
 * octal escapes (sloppy mode, which module code runs in unless it opts out),
 * line continuations, and any other escaped character standing for itself.
 * A dedicated decoder is used instead of evaluating code or JSON.parse
 * (JSON lacks `\x`, `\'`, octal and line continuations).
 *
 * @param {string} raw - literal text without the surrounding quotes
 * @returns {string | null} decoded value, or null for an invalid escape
 *   (the module is then a syntax error and fails when evaluated)
 */
function decodeStringLiteral(raw) {
  let result = '';
  let index = 0;

  while (index < raw.length) {
    const char = raw[index];
    index += 1;
    if (char !== '\\') {
      result += char;
      continue;
    }

    const next = raw[index];
    index += 1;

    if (next === 'x') {
      const hex = raw.slice(index, index + 2);
      if (!/^[0-9a-fA-F]{2}$/.test(hex)) {
        return null;
      }
      result += String.fromCharCode(parseInt(hex, 16));
      index += 2;
    } else if (next === 'u') {
      let hex;
      if (raw[index] === '{') {
        const end = raw.indexOf('}', index);
        hex = end === -1 ? '' : raw.slice(index + 1, end);
        if (!/^[0-9a-fA-F]+$/.test(hex) || parseInt(hex, 16) > 0x10ffff) {
          return null;
        }
        index = end + 1;
      } else {
        hex = raw.slice(index, index + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
          return null;
        }
        index += 4;
      }
      result += String.fromCodePoint(parseInt(hex, 16));
    } else if (/[0-7]/.test(next)) {
      const maxLength = next <= '3' ? 3 : 2;
      let octal = next;
      while (
        octal.length < maxLength &&
        index < raw.length &&
        /[0-7]/.test(raw[index])
      ) {
        octal += raw[index];
        index += 1;
      }
      result += String.fromCharCode(parseInt(octal, 8));
    } else if (next === '\r' && raw[index] === '\n') {
      index += 1; // line continuation (CRLF)
    } else if (LINE_TERMINATORS.includes(next)) {
      // line continuation: contributes nothing
    } else if (Object.prototype.hasOwnProperty.call(SIMPLE_ESCAPES, next)) {
      result += SIMPLE_ESCAPES[next];
    } else {
      result += next;
    }
  }

  return result;
}

/**
 * Lexical tokenizer, just enough to find `require(...)` calls reliably:
 * comments, string literals, template literals (with nested `${}`), regular
 * expression literals and numbers are consumed as units, so text inside them
 * is never mistaken for code. Token types: `name`, `string` (value = decoded
 * string or null for an invalid escape), `punct`, `template`, `other`.
 * Unterminated comments/strings/templates simply end the token list: the
 * module then fails to compile with ERR_MODULE_SYNTAX when it is evaluated.
 *
 * @param {string} source
 * @returns {{type: string, value: string | null}[]}
 */
function tokenize(source) {
  const tokens = [];
  // Open `{` and `${` contexts, so that a `}` can resume a template literal.
  const stack = [];
  let index = source.startsWith('#!') ? source.search(/[\n\r]|$/) : 0;

  const previous = () => tokens[tokens.length - 1];
  const slashStartsRegex = () => {
    const last = previous();
    if (!last) {
      return true;
    }
    if (last.type === 'name') {
      return REGEX_PRECEDING_KEYWORDS.has(last.value);
    }
    if (last.type === 'punct') {
      return ![')', ']'].includes(last.value);
    }

    return false;
  };

  // Consumes template text from `index` up to the closing backtick or `${`.
  const lexTemplateBody = () => {
    while (index < source.length) {
      const char = source[index];
      if (char === '\\') {
        index += 2;
      } else if (char === '`') {
        index += 1;
        tokens.push({ type: 'template', value: null });
        return;
      } else if (char === '$' && source[index + 1] === '{') {
        index += 2;
        stack.push('template');
        tokens.push({ type: 'punct', value: '${' });
        return;
      } else {
        index += 1;
      }
    }
  };

  while (index < source.length) {
    const char = source[index];
    const rest = source.slice(index, index + 2);

    if (/\s/.test(char) || char === '﻿') {
      index += 1;
    } else if (rest === '//') {
      const end = source.slice(index).search(/[\n\r\u2028\u2029]/);
      index = end === -1 ? source.length : index + end;
    } else if (rest === '/*') {
      const end = source.indexOf('*/', index + 2);
      index = end === -1 ? source.length : end + 2;
    } else if (char === '"' || char === "'") {
      let end = index + 1;
      while (
        end < source.length &&
        source[end] !== char &&
        !/[\n\r]/.test(source[end])
      ) {
        if (source[end] !== '\\') {
          end += 1;
        } else if (source[end + 1] === '\r' && source[end + 2] === '\n') {
          end += 3; // CRLF line continuation
        } else {
          end += 2;
        }
      }
      if (source[end] !== char) {
        return tokens; // unterminated string
      }
      tokens.push({
        type: 'string',
        value: decodeStringLiteral(source.slice(index + 1, end)),
      });
      index = end + 1;
    } else if (char === '`') {
      index += 1;
      lexTemplateBody();
    } else if (IDENTIFIER_START.test(char)) {
      let end = index + 1;
      while (end < source.length && IDENTIFIER_PART.test(source[end])) {
        end += 1;
      }
      tokens.push({ type: 'name', value: source.slice(index, end) });
      index = end;
    } else if (
      /\d/.test(char) ||
      (char === '.' && /\d/.test(source[index + 1]))
    ) {
      const match = NUMBER_PATTERN.exec(source.slice(index));
      index += match ? match[0].length : 1;
      tokens.push({ type: 'other', value: null });
    } else if (char === '/' && slashStartsRegex()) {
      let end = index + 1;
      let inClass = false;
      while (end < source.length && !/[\n\r]/.test(source[end])) {
        if (source[end] === '\\') {
          end += 1;
        } else if (source[end] === '[') {
          inClass = true;
        } else if (source[end] === ']') {
          inClass = false;
        } else if (source[end] === '/' && !inClass) {
          break;
        }
        end += 1;
      }
      end += 1;
      while (end < source.length && IDENTIFIER_PART.test(source[end])) {
        end += 1;
      }
      index = end;
      tokens.push({ type: 'other', value: null });
    } else if (source.startsWith('...', index)) {
      tokens.push({ type: 'punct', value: '...' });
      index += 3;
    } else if (char === '}' && stack[stack.length - 1] === 'template') {
      stack.pop();
      index += 1;
      lexTemplateBody();
    } else {
      if (char === '{') {
        stack.push('brace');
      } else if (char === '}') {
        stack.pop();
      }
      tokens.push({ type: 'punct', value: char });
      index += 1;
    }
  }

  return tokens;
}

/**
 * Finds `require('literal')` calls: the identifier `require` (not a property
 * access such as `foo.require`), `(`, a string literal, then `)` or `,`
 * (comments/whitespace between tokens and a trailing comma are fine).
 * Non-literal arguments are not reported.
 *
 * @param {string} source
 * @returns {string[]} distinct decoded specifiers passed to `require('...')`
 */
function scanRequires(source) {
  const tokens = tokenize(source);
  const specifiers = new Set();

  tokens.forEach((token, position) => {
    if (token.type !== 'name' || token.value !== 'require') {
      return;
    }
    const before = tokens[position - 1];
    if (before && before.type === 'punct' && before.value === '.') {
      return;
    }
    const open = tokens[position + 1];
    const literal = tokens[position + 2];
    const after = tokens[position + 3];
    if (
      open &&
      open.type === 'punct' &&
      open.value === '(' &&
      literal &&
      literal.type === 'string' &&
      literal.value !== null &&
      after &&
      after.type === 'punct' &&
      (after.value === ')' || after.value === ',')
    ) {
      specifiers.add(literal.value);
    }
  });

  return Array.from(specifiers);
}

/**
 * @typedef {Object} ModuleLoaderDependencies
 * @property {(path: string, encoding: string) => Promise<string>} readFile
 *   Reads a file; rejects (with `code: 'ENOENT'` when missing) on failure.
 * @property {(path: string) => Promise<{isFile: () => boolean, isDirectory: () => boolean}>} stat
 *   Rejects with `code: 'ENOENT'` when the path does not exist.
 * @property {(specifier: string) => boolean} isAllowed - bare specifier allowlist check
 * @property {(specifier: string) => *} getAllowed - implementation of an allowed specifier
 */

/**
 * @param {ModuleLoaderDependencies} dependencies
 */
function createModuleLoader({ readFile, stat, isAllowed, getAllowed }) {
  /** @type {Map<string, Object>} absolute path -> module object */
  const moduleCache = new Map();
  /**
   * Published sources: absolute path -> { text, version, invalidated }.
   * `version` grows monotonically with every publication; `invalidated` is set
   * by invalidate/invalidateAll (the source may still be evaluated by a live
   * instance's lazy require, but the evaluated result is then not trusted by
   * a later publication, see `publish`).
   * @type {Map<string, {text: string, version: number, invalidated: boolean}>}
   */
  const sources = new Map();
  /** Evaluation info of cached modules: module -> { version, fromInvalidated } */
  const evaluations = new WeakMap();
  let sourceVersion = 0;
  /** @type {Map<string, Map<string, Object>>} requiring file -> specifier -> outcome */
  const resolutions = new Map();
  // Bumped by invalidate/invalidateAll. A load that started under an older
  // generation never writes shared state: it restarts (see `load`).
  let generation = 0;

  async function statOrNull(absolutePath) {
    try {
      return await stat(absolutePath);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
        return null;
      }
      throw error;
    }
  }

  async function isFile(absolutePath) {
    const stats = await statOrNull(absolutePath);

    return Boolean(stats) && stats.isFile();
  }

  async function isDirectory(absolutePath) {
    const stats = await statOrNull(absolutePath);

    return Boolean(stats) && stats.isDirectory();
  }

  async function resolveFile(base) {
    // A root ("/" or "C:/") is only a directory: no "/.js" style candidates.
    const candidates = base.endsWith('/')
      ? [base]
      : [base, `${base}.js`, `${base}.json`];

    for (const candidate of candidates) {
      if (await isFile(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  async function resolveDirectory(base) {
    if (!(await isDirectory(base))) {
      return null;
    }

    const packageJsonPath = resolve(base, 'package.json');
    if (await isFile(packageJsonPath)) {
      let packageJson;
      try {
        packageJson = JSON.parse(
          stripBom(await readFile(packageJsonPath, 'utf8'))
        );
      } catch (error) {
        throw createError(
          'ERR_MODULE_JSON',
          `Failed to read ${packageJsonPath}: ${error.message}`
        );
      }

      if (typeof packageJson.main === 'string' && packageJson.main !== '') {
        const mainBase = resolve(base, packageJson.main);
        const mainResolved =
          (await resolveFile(mainBase)) || (await resolveIndex(mainBase));
        if (!mainResolved) {
          throw createError(
            'MODULE_NOT_FOUND',
            `Cannot find the "main" entry "${packageJson.main}" declared in ${packageJsonPath}`
          );
        }

        return mainResolved;
      }
    }

    return resolveIndex(base);
  }

  async function resolveIndex(directory) {
    for (const name of ['index.js', 'index.json']) {
      const candidate = resolve(directory, name);
      if (await isFile(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  /**
   * Computes the outcome for one specifier required from `fromFile`:
   * `{ builtIn: specifier }`, `{ path }` or `{ error }`.
   */
  async function resolveSpecifier(specifier, fromFile) {
    if (!isPathSpecifier(specifier)) {
      if (isAllowed(specifier)) {
        return { builtIn: specifier };
      }

      return {
        error: createError(
          'ERR_MODULE_NOT_ALLOWED',
          `Module "${specifier}" is not allowed (required from "${fromFile}"). ` +
            'Only relative/absolute paths and allowlisted built-in modules can be required.'
        ),
      };
    }

    const base = resolve(dirname(fromFile), specifier);
    const wantsDirectory =
      /[\\/]$/.test(specifier) || /(^|[\\/])\.\.?$/.test(specifier);
    const found = wantsDirectory
      ? await resolveDirectory(base)
      : (await resolveFile(base)) || (await resolveDirectory(base));

    if (found) {
      return { path: found };
    }

    return {
      error: createError(
        'MODULE_NOT_FOUND',
        `Cannot find module "${specifier}" (required from "${fromFile}"; looked for "${base}")`
      ),
    };
  }

  async function readSource(absolutePath) {
    return stripBom(await readFile(absolutePath, 'utf8'));
  }

  /**
   * Reads `absolutePath` and, recursively, everything its source statically
   * requires. Failures of dependencies are recorded; failure to read the
   * file itself rejects.
   */
  function assertCurrent(startedGeneration) {
    if (startedGeneration !== generation) {
      throw createError(
        'ERR_MODULE_STALE_LOAD',
        'Module cache was invalidated while loading'
      );
    }
  }

  // A cached module is valid only while it was evaluated from the currently
  // published source version of its path.
  function isFresh(absolutePath) {
    const cached = moduleCache.get(absolutePath);
    const record = sources.get(absolutePath);

    return (
      Boolean(cached) &&
      Boolean(record) &&
      evaluations.get(cached).version === record.version
    );
  }

  /**
   * Publishes a finished preload in one synchronous step (no await between the
   * writes): sources and resolution tables always change together, so a live
   * instance never sees new source with old resolutions. A staged module whose
   * evaluated instance is fresh and was evaluated from a never-invalidated
   * source is not republished (concurrent loads keep evaluating once).
   */
  function publish(staged) {
    staged.sources.forEach((text, absolutePath) => {
      const cached = moduleCache.get(absolutePath);
      if (isFresh(absolutePath) && !evaluations.get(cached).fromInvalidated) {
        return;
      }
      sourceVersion += 1;
      sources.set(absolutePath, {
        text,
        version: sourceVersion,
        invalidated: false,
      });
      resolutions.set(absolutePath, staged.resolutions.get(absolutePath));
    });
  }

  /**
   * Reads `absolutePath` and everything it statically requires into the
   * private `staged` maps (nothing shared is written here).
   */
  async function preload(absolutePath, visited, startedGeneration, staged) {
    if (visited.has(absolutePath)) {
      return;
    }
    visited.add(absolutePath);

    if (isFresh(absolutePath)) {
      return;
    }

    const source = await readSource(absolutePath);
    assertCurrent(startedGeneration);
    staged.sources.set(absolutePath, source);

    const outcomes = new Map();

    if (!absolutePath.endsWith('.json')) {
      for (const specifier of scanRequires(source)) {
        let outcome;
        try {
          outcome = await resolveSpecifier(specifier, absolutePath);
        } catch (error) {
          outcome = { error };
        }
        assertCurrent(startedGeneration);
        outcomes.set(specifier, outcome);
      }
    }

    // A dependency that cannot be read is recorded as that require's outcome,
    // so it only throws if (and when) the module really requires it.
    for (const outcome of outcomes.values()) {
      if (outcome.path) {
        try {
          await preload(outcome.path, visited, startedGeneration, staged);
        } catch (error) {
          if (error.code === 'ERR_MODULE_STALE_LOAD') {
            throw error;
          }
          outcome.path = undefined;
          outcome.error = error;
        }
      }
    }

    assertCurrent(startedGeneration);
    staged.resolutions.set(absolutePath, outcomes);
  }

  function evaluateJson(module, source) {
    try {
      module.exports = JSON.parse(source);
    } catch (error) {
      throw createError(
        'ERR_MODULE_JSON',
        `Failed to parse JSON module "${module.filename}": ${error.message}`
      );
    }
  }

  function evaluateScript(module, source, requireFn) {
    const body = source.startsWith('#!') ? `//${source}` : source;
    let wrapper;

    try {
      wrapper = new Function(
        'exports',
        'require',
        'module',
        '__filename',
        '__dirname',
        `${body}\n//# sourceURL=${module.filename}`
      );
    } catch (error) {
      if (error instanceof SyntaxError) {
        const syntaxError = createError(
          'ERR_MODULE_SYNTAX',
          `Syntax error in module "${module.filename}": ${error.message}`
        );
        syntaxError.cause = error;
        throw syntaxError;
      }
      throw error;
    }

    wrapper.call(
      module.exports,
      module.exports,
      requireFn,
      module,
      module.filename,
      dirname(module.filename)
    );
  }

  // `fileOutcomes` is the resolution table captured when the module instance
  // was evaluated. Keeping it per instance (separate from the shared
  // `resolutions` used by new loads) lets lazy requires of already exported
  // functions keep working after `invalidate`.
  function lookupOutcome(specifier, fromFile, fileOutcomes) {
    const outcome = fileOutcomes.get(specifier);

    if (!outcome) {
      throw createError(
        'ERR_MODULE_NOT_PRELOADED',
        `Cannot require "${specifier}" from "${fromFile}": it was not found by the ` +
          'static scan (non-literal require) so it could not be preloaded.'
      );
    }
    if (outcome.error) {
      throw outcome.error;
    }

    return outcome;
  }

  function createRequire(module, fileOutcomes) {
    const requireFn = specifier => {
      if (typeof specifier !== 'string' || specifier === '') {
        throw createError(
          'ERR_INVALID_ARG_TYPE',
          `require expects a non-empty string (required from "${module.filename}")`
        );
      }
      const outcome = lookupOutcome(specifier, module.filename, fileOutcomes);

      if (outcome.builtIn !== undefined) {
        return getAllowed(outcome.builtIn);
      }

      return requireResolved(outcome.path, module);
    };

    requireFn.resolve = specifier => {
      const outcome = lookupOutcome(specifier, module.filename, fileOutcomes);

      return outcome.builtIn !== undefined ? outcome.builtIn : outcome.path;
    };

    return requireFn;
  }

  function requireResolved(absolutePath, parent) {
    const cached = moduleCache.get(absolutePath);
    if (cached && isFresh(absolutePath)) {
      return cached.exports;
    }

    const record = sources.get(absolutePath);
    if (!record) {
      throw createError(
        'ERR_MODULE_NOT_PRELOADED',
        `Source of "${absolutePath}" is not loaded (required from "${
          parent ? parent.filename : 'the entry point'
        }").`
      );
    }
    const fileOutcomes = resolutions.get(absolutePath);
    if (!fileOutcomes) {
      throw createError(
        'ERR_MODULE_NOT_PRELOADED',
        `Dependencies of "${absolutePath}" were not resolved before evaluation.`
      );
    }
    const source = record.text;

    const module = {
      id: absolutePath,
      filename: absolutePath,
      exports: {},
      loaded: false,
      parent: parent || null,
      children: [],
    };
    if (parent) {
      parent.children.push(module);
    }
    moduleCache.set(absolutePath, module);
    evaluations.set(module, {
      version: record.version,
      fromInvalidated: record.invalidated,
    });

    try {
      if (absolutePath.endsWith('.json')) {
        evaluateJson(module, source);
      } else {
        evaluateScript(module, source, createRequire(module, fileOutcomes));
      }
    } catch (error) {
      moduleCache.delete(absolutePath);
      if (parent) {
        const position = parent.children.indexOf(module);
        if (position !== -1) {
          parent.children.splice(position, 1);
        }
      }
      throw error;
    }

    module.loaded = true;

    return module.exports;
  }

  /**
   * Loads the module at an absolute path (and its static dependencies) and
   * returns its `module.exports`. A cached module is returned as is.
   *
   * @param {string} entryPath - absolute path of an existing file (exact name; no probing)
   * @returns {Promise<*>}
   */
  async function load(entryPath) {
    if (typeof entryPath !== 'string' || !isAbsolute(entryPath)) {
      throw createError(
        'ERR_INVALID_ARG_VALUE',
        `load requires an absolute path, received: ${String(entryPath)}`
      );
    }
    const absolutePath = normalize(entryPath);

    // An invalidate during the asynchronous preload makes everything read so
    // far possibly stale. Such a preload writes nothing and is restarted from
    // scratch (re-reading the files) so that the caller never gets stale
    // exports. Every invalidate restarts every in-flight load, also for
    // unrelated paths (conservative).
    let preloaded = isFresh(absolutePath);
    while (!preloaded) {
      const startedGeneration = generation;
      try {
        const staged = { sources: new Map(), resolutions: new Map() };
        await preload(absolutePath, new Set(), startedGeneration, staged);
        // Publish only a complete preload that is still current.
        assertCurrent(startedGeneration);
        publish(staged);
        preloaded = true;
      } catch (error) {
        // A failure of a stale read (for example ENOENT of a file that exists
        // again after the invalidate) must not be reported: retry first.
        if (
          startedGeneration === generation &&
          error.code !== 'ERR_MODULE_STALE_LOAD'
        ) {
          if (error.code === 'ENOENT') {
            throw createError(
              'MODULE_NOT_FOUND',
              `Cannot find module "${absolutePath}"`
            );
          }
          throw error;
        }
      }
      preloaded = preloaded || isFresh(absolutePath);
    }

    return requireResolved(absolutePath, null);
  }

  /**
   * Evicts one evaluated module from the cache (like `delete
   * require.cache[path]`); the next `load` re-reads and re-evaluates it.
   * Preloaded sources/resolutions are kept (see the invalidation contract).
   *
   * @param {string} entryPath - absolute path
   * @returns {boolean} whether the module was cached
   */
  function invalidate(entryPath) {
    const absolutePath = normalize(entryPath);
    generation += 1;
    const record = sources.get(absolutePath);
    if (record) {
      record.invalidated = true;
    }

    return moduleCache.delete(absolutePath);
  }

  /** Evicts every evaluated module (preloaded data is kept, see above). */
  function invalidateAll() {
    generation += 1;
    sources.forEach(record => {
      record.invalidated = true;
    });
    moduleCache.clear();
  }

  /**
   * @param {string} entryPath - absolute path
   * @returns {boolean}
   */
  function isCached(entryPath) {
    return isFresh(normalize(entryPath));
  }

  return { load, invalidate, invalidateAll, isCached };
}

const defaultLoader = createModuleLoader({
  readFile: platformFs.readFile,
  stat: platformFs.stat,
  isAllowed: isAllowedBuiltIn,
  getAllowed: getBuiltIn,
});

const loadModule = defaultLoader.load;
const invalidateModule = defaultLoader.invalidate;
const invalidateAllModules = defaultLoader.invalidateAll;
const isModuleCached = defaultLoader.isCached;

export {
  createModuleLoader,
  scanRequires,
  loadModule,
  invalidateModule,
  invalidateAllModules,
  isModuleCached,
};
