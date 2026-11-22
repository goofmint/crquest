// Runs in a child Node process started by tauriBoot.test.js with
// `--experimental-vm-modules` (vm.SourceTextModule is behind that flag).
//
// Links and evaluates the REAL split ES modules of `vite build --mode tauri`
// (index.js + tauri-game.js) inside a jsdom window context, the way a Tauri
// webview loads <script type="module" src="index.js">. That context has no
// `require`, `process`, `Buffer`, `module` or `global` (jsdom's window), and
// the bundled Node builtins are the throwing stubs of the build, so any
// startup-time use of them fails here.
//
// What is stubbed (see docs/migration/tauri-runtime.md, #154):
// - the Tauri IPC (`window.__TAURI_INTERNALS__.invoke`): the plugin calls the
//   app makes at startup, backed by an empty store, an empty save, and an audio
//   directory that lists as empty (so the audio gate passes without decoding);
// - IndexedDB: fake-indexeddb (jsdom has none, a webview does);
// - fetch: any call is rejected (the game makes none at startup);
// - canvas (`getContext` returns null) and jsdom's layout-less rendering.
// The classic scripts of index.html (firebase, ace, Phaser) are the real files.
// Everything else (all app code, React, styled-components, ejs, pug, ...) is the
// real bundle.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath as toPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';

const repoRoot = path.resolve(path.dirname(toPath(import.meta.url)), '..', '..', '..');
const CLASSIC_SCRIPTS = [
  'lib/firebase/firebase-app.js',
  'lib/firebase/firebase-firestore.js',
  'lib/ace/ace.js',
  'lib/phaser-2.13.2.min.js',
];

const [outputDir, scenario, stagedDir] = process.argv.slice(2);
const TIMEOUT_MS = 20000;
const POLL_MS = 50;

const logs = [];
// EVERY console.error of the page (logs is only the tail, for diagnosis)
const errors = [];
const ipcCalls = [];
let shellLabels;

const APP_DATA = '/mock/config';
// The bundle resource directory has the layout of public/ (docs/migration/
// tauri-resources.md): the real game content is read from there.
const HOST_RESOURCE_DIR = path.join(repoRoot, 'public');
// The bundled app uses path-browserify (POSIX), so every path it sees and every
// path compared here is in POSIX form, whatever the host OS is. A Windows drive
// letter becomes a leading-slash path (C:\x -> /C:/x) so that it stays absolute.
const toPosix = hostPath => {
  const slashed = hostPath.split(path.sep).join('/');
  // posix.normalize also collapses a UNC prefix (//server/share) the same way
  // the app's POSIX path functions do, so comparisons stay consistent.
  return path.posix.normalize(/^[A-Za-z]:/.test(slashed) ? `/${slashed}` : slashed);
};
const RESOURCE_DIR = toPosix(HOST_RESOURCE_DIR);
const toHostPath = target => path.join(HOST_RESOURCE_DIR, ...target.slice(RESOURCE_DIR.length).split('/'));
const APP_VERSION = '0.0.0-boot-test';
// Audio directories list as empty, so the audio loader treats every track as
// loaded without decoding anything (Web Audio is not part of this test).
const EMPTY_AUDIO_DIRECTORIES = ['levels/common/music', 'levels/common/sfx'].map(directory =>
  path.posix.join(RESOURCE_DIR, directory)
);

const NOT_FOUND = 'No such file or directory (os error 2)';

// A virtual file system for the fs plugin. Reads under the resource directory
// are the real files of public/ (read-only); everything else (the app data
// directory: the extensions folder, saves) is an in-memory overlay that starts
// empty ("fresh state") and receives the writes of the app.
const overlayDirectories = new Set();
const overlayFiles = new Map();

function isUnderResources(target) {
  return target === RESOURCE_DIR || target.startsWith(`${RESOURCE_DIR}/`);
}

function fileInfo(kind) {
  return {
    isFile: kind === 'file',
    isDirectory: kind === 'dir',
    isSymlink: false,
    size: 0,
    mtime: null,
    atime: null,
    birthtime: null,
    readonly: false,
    fileAttributes: null,
    dev: null,
    ino: null,
    mode: null,
    nlink: null,
    uid: null,
    gid: null,
    rdev: null,
    blksize: null,
    blocks: null,
  };
}

function kindOf(target) {
  if (EMPTY_AUDIO_DIRECTORIES.includes(target)) return 'dir';
  if (overlayDirectories.has(target)) return 'dir';
  if (overlayFiles.has(target)) return 'file';
  if (isUnderResources(target)) {
    try {
      return fs.statSync(toHostPath(target)).isDirectory() ? 'dir' : 'file';
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function requireKind(target) {
  const kind = kindOf(target);
  if (!kind) throw NOT_FOUND;
  return kind;
}

function readBytes(target) {
  if (overlayFiles.has(target)) return [...overlayFiles.get(target)];
  if (!isUnderResources(target) || requireKind(target) !== 'file') throw NOT_FOUND;
  return [...fs.readFileSync(toHostPath(target))];
}

function readDirectory(target) {
  if (requireKind(target) !== 'dir') throw 'Not a directory (os error 20)';
  if (EMPTY_AUDIO_DIRECTORIES.includes(target)) return [];
  if (!isUnderResources(target)) {
    return [...overlayDirectories, ...overlayFiles.keys()]
      .filter(entry => path.posix.dirname(entry) === target)
      .map(entry => ({ name: path.posix.basename(entry), isDirectory: overlayDirectories.has(entry), isFile: overlayFiles.has(entry), isSymlink: false }));
  }
  return fs.readdirSync(toHostPath(target), { withFileTypes: true }).map(entry => ({
    name: entry.name,
    isDirectory: entry.isDirectory(),
    isFile: entry.isFile(),
    isSymlink: false,
  }));
}

// One entry per Tauri command the startup path invokes. Anything else is
// rejected (like Tauri, with a string), so an unmocked call is a visible test
// failure and never a silent success.
const ipcHandlers = {
  // BaseDirectory.Config = 3, BaseDirectory.Resource = 11
  'plugin:path|resolve_directory': ({ directory }) => {
    if (directory === 3) return APP_DATA;
    if (directory === 11) return RESOURCE_DIR;
    throw `boot test: no mock for base directory ${directory}`;
  },
  'plugin:app|version': () => APP_VERSION,
  'plugin:app|name': () => 'terminalquest',
  is_dev: () => false,
  // The native labels and Help menu (platform/tauri/menu.js)
  set_shell_texts: payload => {
    shellLabels = payload;
    return null;
  },
  'plugin:event|listen': () => 1,
  // The cloud sync follows the sign-in status: this build is not configured.
  auth_status: () => ({
    state: 'unconfigured',
    provider: null,
    displayName: null,
    offline: false,
    persistence: 'keyring',
    errorCode: null,
    account: null,
  }),
  enable_help_menu: () => null,
  'plugin:store|load': () => 1,
  // A first run: the store file does not exist yet, so the store is empty
  'plugin:store|reload': () => {
    throw NOT_FOUND;
  },
  'plugin:store|get': ({ key }) => {
    if (scenario === 'saved-japanese' && key === 'settings') {
      return [{ avatar: 1, name: 'Player', language: 'ja' }, true];
    }
    return [null, false];
  },
  'plugin:store|set': () => null,
  'plugin:store|save': () => null,
  'plugin:store|has': () => false,
  'plugin:fs|stat': ({ path: target }) => fileInfo(requireKind(target)),
  'plugin:fs|exists': ({ path: target }) => kindOf(target) !== undefined,
  'plugin:fs|read_dir': ({ path: target }) => readDirectory(target),
  'plugin:fs|read_file': ({ path: target }) => readBytes(target),
  'plugin:fs|read_text_file': ({ path: target }) => readBytes(target),
  'plugin:fs|mkdir': ({ path: target }) => {
    overlayDirectories.add(target);
    return null;
  },
};

function invoke(command, args) {
  ipcCalls.push(command);
  const handler = ipcHandlers[command];
  if (!handler) {
    // Tauri rejects with a string
    return Promise.reject(`boot test: no mock for Tauri command ${command} ${JSON.stringify(args)}`);
  }
  try {
    return Promise.resolve(handler(args));
  } catch (error) {
    return Promise.reject(error);
  }
}

function createWindow() {
  const html = fs.readFileSync(path.join(outputDir, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: 'http://tauri.localhost/',
    // No script of the page runs by itself; the modules are linked below
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => null;
  window.__TAURI_INTERNALS__ = {
    invoke,
    transformCallback: () => 0,
    convertFileSrc: (filePath, protocol = 'asset') => `${protocol}://localhost/${encodeURIComponent(filePath)}`,
    metadata: { currentWindow: { label: 'main' }, currentWebview: { windowLabel: 'main', label: 'main' } },
  };
  window.__TAURI_OS_PLUGIN_INTERNALS__ = { platform: 'macos', eol: '\n', version: '1', family: 'unix', arch: 'aarch64', exe_extension: '' };
  // jsdom has no IndexedDB (a webview has); the game's Dexie store uses this
  window.indexedDB = indexedDB;
  window.IDBKeyRange = IDBKeyRange;
  window.console = {
    log: (...a) => logs.push(['log', a.map(String).join(' ')]),
    info: (...a) => logs.push(['info', a.map(String).join(' ')]),
    debug: () => {},
    warn: (...a) => logs.push(['warn', a.map(String).join(' ')]),
    error: (...a) => {
      const message = a.map(x => (x && x.stack) || String(x)).join(' ');
      errors.push(message);
      logs.push(['error', message]);
    },
  };
  // Web platform APIs of a webview that jsdom lacks
  window.TextEncoder = TextEncoder;
  window.TextDecoder = TextDecoder;
  window.fetch = async (url, options) => {
    throw new Error(`boot test: unexpected fetch ${options?.method ?? 'GET'} ${url}`);
  };
  // The classic scripts of index.html that run before index.js (real ones)
  CLASSIC_SCRIPTS.forEach(script => {
    window.eval(fs.readFileSync(path.join(stagedDir, script), 'utf8'));
  });
  return { dom, window };
}

const { dom, window } = createWindow();
const context = dom.getInternalVMContext();

// Sanity check of the environment: nothing of Node leaks into the page
const leaked = vm.runInContext(
  "['require','process','Buffer','module','global','exports'].filter(n => typeof globalThis[n] !== 'undefined')",
  context
);
if (leaked.length) throw new Error(`the page context has Node globals: ${leaked}`);

// Test scenario of tauriBoot.test.js: an early console.error followed by more
// than 40 other logs must still be reported in `errors`
if (scenario === 'early-error') {
  window.console.error('early error');
  for (let i = 0; i < 100; i += 1) window.console.log(`noise ${i}`);
}

const modules = new Map();
function load(identifier) {
  if (modules.has(identifier)) return modules.get(identifier);
  const source = fs.readFileSync(toPath(identifier), 'utf8');
  const module = new vm.SourceTextModule(source, {
    context,
    identifier,
    importModuleDynamically: specifier => importModule(specifier, identifier),
    initializeImportMeta: meta => {
      meta.url = identifier;
    },
  });
  modules.set(identifier, module);
  return module;
}

function resolve(specifier, referencing) {
  if (!specifier.startsWith('.')) throw new Error(`boot test: unexpected non-relative import ${specifier} in ${referencing}`);
  return pathToFileURL(path.resolve(path.dirname(toPath(referencing)), specifier)).href;
}

async function importModule(specifier, referencing) {
  const module = load(resolve(specifier, referencing));
  await module.link((child, ref) => load(resolve(child, ref.identifier)));
  await module.evaluate();
  return module.namespace;
}

function snapshot() {
  const app = window.document.querySelector('#app');
  return {
    loading: Boolean(window.document.querySelector('#app .__loading')),
    title: Boolean(window.document.querySelector('.TitleScreen')),
    titleControls: window.document.querySelector('.TitleScreen .controls')?.textContent.trim(),
    lang: window.document.documentElement.lang,
    appHtml: app ? app.innerHTML.slice(0, 300) : null,
  };
}

async function main() {
  const failures = [];
  window.addEventListener('error', event => failures.push(`window error: ${event.error?.stack ?? event.message}`));
  window.addEventListener('unhandledrejection', event => failures.push(`unhandled rejection: ${event.reason?.stack ?? event.reason}`));
  process.on('unhandledRejection', reason => failures.push(`unhandled rejection: ${reason?.stack ?? reason}`));

  let startError;
  importModule('./index.js', pathToFileURL(path.join(outputDir, 'index.html')).href).catch(error => {
    startError = error;
  });
  const deadline = Date.now() + TIMEOUT_MS;
  while (!startError && failures.length === 0 && Date.now() < deadline) {
    const state = snapshot();
    if (!state.loading && state.title) break;
    await new Promise(resolveWait => setTimeout(resolveWait, POLL_MS));
  }
  const state = snapshot();
  // exit only after the message has been flushed to the parent
  process.send({
    ...state,
    startError: startError ? String(startError.stack ?? startError) : null,
    failures,
    logs: logs.slice(-40),
    errors,
    ipcCalls,
    shellLabels,
    leaked,
  }, () => process.exit(0));
}

main().catch(error => {
  process.send({ fatal: String(error.stack ?? error), logs: logs.slice(-40), errors, ipcCalls }, () => process.exit(1));
});
