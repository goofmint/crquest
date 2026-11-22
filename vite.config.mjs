import fs from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, normalizePath } from 'vite';
import react from '@vitejs/plugin-react';

// The bundle must reference react/jsx-runtime, which exists in every React 19
// build. With NODE_ENV=development in the caller's shell the React plugin would
// emit react/jsx-dev-runtime instead, whose jsxDEV is undefined in React's
// production build (the bundle contains the production build of React).
process.env.NODE_ENV = 'production';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(rootDir, 'src');
const publicDir = path.join(rootDir, 'public');
// Initializes the platform layer, then loads src/js/index.jsx (the game).
const tauriEntry = path.join(srcDir, 'js', 'tauriIndex.jsx');
const htmlSource = path.join(srcDir, 'index.html');
const localConfigPath = path.join(srcDir, 'js', 'app', 'config', 'local_config.js');
const LOCAL_CONFIG_MISSING_ID = '\0local-config-missing';

// Node builtins (and `electron`) do not exist in a Tauri webview. Six of them
// have a browser implementation (below); every other one becomes a module whose
// every property access throws a clear error. Without
// this plugin Vite would replace them with an empty object, so a call would
// fail with an unrelated "x is not a function". Loading such a module does not
// throw, because bundled packages such as pug `require('fs')` at load time
// without using it on every code path.
const UNAVAILABLE_PREFIX = '\0tauri-unavailable:';
const nodeBuiltins = new Set(builtinModules.filter(name => !name.startsWith('_')));

function unavailableModuleName(source) {
  const name = source.startsWith('node:') ? source.slice('node:'.length) : source;
  if (name === 'electron' || nodeBuiltins.has(name)) return name;
  return null;
}

// Browser implementations of Node builtins in the Tauri build (W2,
// docs/migration/tauri-runtime.md). Everything that is not listed here and not
// a builtin of the same name fails explicitly. `fs`, `child_process` and
// `electron` are never provided: the platform layer replaces them.
const requireFromRoot = createRequire(path.join(rootDir, 'package.json'));
const tauriBuiltinReplacements = {
  // Well-known packages (root devDependencies).
  events: requireFromRoot.resolve('events/events.js'),
  util: requireFromRoot.resolve('util/util.js'),
  assert: requireFromRoot.resolve('assert/build/assert.js'),
  // Small in-repo shims: the npm `url` has no fileURLToPath, the npm
  // `process` would report the OS as 'browser', and `path` picks win32 or
  // posix from the OS that initPlatform() read (path-browserify and
  // path-browserify-win32 underneath; decision D4 (b), W12).
  path: path.join(srcDir, 'js', 'tauri_shims', 'path.js'),
  url: path.join(srcDir, 'js', 'tauri_shims', 'url.js'),
  process: path.join(srcDir, 'js', 'tauri_shims', 'process.js'),
};

// pug-filters/lib/run-filter.js requires the npm package `resolve` (Node's
// module resolution on the file system, to find jstransformer-* filters) and
// only calls it when a template uses a filter. Its load-time access of `fs`
// would throw, so it gets the same failing stub as a Node builtin; a template
// with a filter then fails with an explicit error where it uses it.
// (Vite passes module ids with forward slashes, also on Windows, hence normalizePath.)
const runFilterFile = normalizePath(
  path.join(publicDir, 'node_modules', 'pug-filters', 'lib', 'run-filter.js')
);

function tauriUnavailableModules() {
  return {
    name: 'terminalquest:tauri-unavailable-modules',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === 'resolve' && importer && normalizePath(importer) === runFilterFile) {
        return UNAVAILABLE_PREFIX + source;
      }
      const name = unavailableModuleName(source);
      if (!name) return null;
      return tauriBuiltinReplacements[name] ?? UNAVAILABLE_PREFIX + name;
    },
    load(id) {
      if (!id.startsWith(UNAVAILABLE_PREFIX)) return null;
      const name = id.slice(UNAVAILABLE_PREFIX.length);
      const message = `The Node module "${name}" is not available in the Tauri build`;
      return [
        `var name = ${JSON.stringify(name)};`,
        'module.exports = new Proxy({}, {',
        '  get(target, property) {',
        // Bundler interop probes (symbols, __esModule, then) are not uses
        "    if (typeof property === 'symbol' || property === '__esModule' || property === 'then') {",
        '      return undefined;',
        '    }',
        `    throw new Error(${JSON.stringify(message)} + ' (accessed ' + String(property) + ')');`,
        '  },',
        '});',
      ].join('\n');
    },
  };
}

// Bare imports from the app's sources resolve from public/node_modules first,
// where the renderer's dependencies are installed (both the renderer and
// build tooling use pug). Packages that exist only in the root (@tauri-apps/*)
// fall back to the default resolution.
// The ESM build lets Vite resolve EJS's Node imports through the same platform
// stubs as the rest of the renderer.
const ejsModule = path.join(publicDir, 'node_modules', 'ejs', 'lib', 'esm', 'ejs.js');

function resolvePackagesFromPublic() {
  return {
    name: 'terminalquest:resolve-packages-from-public',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer) return null;
      if (source.startsWith('.') || path.isAbsolute(source) || source.startsWith('\0')) {
        return null;
      }
      if (!importer.startsWith(srcDir + path.sep)) return null;
      if (unavailableModuleName(source)) return null;
      if (source === 'ejs') return ejsModule;
      const resolved = await this.resolve(
        source,
        path.join(publicDir, 'package.json'),
        { ...options, skipSelf: true }
      );
      return resolved && !resolved.external ? resolved : null;
    },
  };
}

// Packages touch something that a webview does not have
// (pug, jstransformer and EJS), and
// are patched while bundling.
// Each patch fails the build when the text is not found (the package changed),
// instead of silently shipping the unpatched code.
//
// - pug/lib/index.js (compileBody's `read` wrapper) calls
//   `Buffer.isBuffer(contents)` for every included file, and a webview has no
//   `Buffer` global, so any template with an `include` would throw a
//   ReferenceError. The check is replaced by an equivalent one for the two
//   possible types (a string stays as it is, anything else is a Buffer-like
//   and is converted with toString('utf8')).
// - jstransformer/index.js (pug's filters) does `if (fs.readFile)` on
//   `require('fs')` when it is loaded, which throws with the stub of the
//   unavailable `fs` (see tauriUnavailableModules) and would stop the whole
//   game bundle from loading. The package supports an `fs` without readFile
//   (its else branch, which is what bundlers give it in a browser), so the
//   `require('fs')` is replaced by an empty object.
const tauriPackagePatches = [
  {
    file: normalizePath(path.join(publicDir, 'node_modules', 'pug', 'lib', 'index.js')),
    from: "Buffer.isBuffer(contents)\n        ? contents.toString('utf8')\n        : contents",
    to: "typeof contents === 'string'\n        ? contents\n        : contents.toString('utf8')",
  },
  {
    file: normalizePath(path.join(publicDir, 'node_modules', 'jstransformer', 'index.js')),
    from: "var fs = require('fs');",
    to: 'var fs = {};',
  },
  // The ESM entry resolves fs through the platform stub. Defer accessing the
  // loader until a file-based template is requested; string renders need no fs.
  {
    file: normalizePath(ejsModule),
    from: 'ejs.fileLoader = fs.readFileSync;',
    to: 'ejs.fileLoader = (...args) => fs.readFileSync(...args);',
  },
];

function patchTauriPackages() {
  return {
    name: 'terminalquest:patch-tauri-packages',
    enforce: 'pre',
    transform(code, id) {
      const patch = tauriPackagePatches.find(candidate => candidate.file === normalizePath(id));
      if (!patch) return null;
      // Exactly one occurrence: none means the package changed, several would
      // mean that only the first is patched.
      const occurrences = code.split(patch.from).length - 1;
      if (occurrences !== 1) {
        throw new Error(`${id} contains ${occurrences} (expected 1) occurrences of the text that the Tauri build patches: ${patch.from}`);
      }
      return code.replace(patch.from, () => patch.to);
    },
  };
}

// A Tauri webview has no `require`, so the output is ES modules: index.js (the
// entry, loaded by <script type="module">) and tauri-game.js (the game,
// everything that src/js/index.jsx pulls in). The entry loads the game with
// `await import('./index.jsx')` after `await initPlatform()` (tauriIndex.jsx),
// so the game chunk is not even fetched, let alone evaluated, before the
// platform layer is initialized. Modules used by both stay in the entry; the
// game chunk imports them from it. `inlineDynamicImports` would hoist the game
// into the entry and break that order, and the output must not be wrapped in a
// function (static imports/exports cannot appear there).
const tauriOutput = {
  format: 'es',
  // A fixed name (listed in tasks/clean_build_output.js); the only chunk is
  // the dynamic import of index.jsx.
  chunkFileNames: chunk => (chunk.isDynamicEntry ? 'tauri-game.js' : '[name]-[hash].js'),
};

  // config.js does `require('./local_config')` for the optional, git-ignored
  // src/js/app/config/local_config.js. Bundle it when present; when absent make
  // the require throw "Cannot find module" at runtime, which config.js already
  // catches and logs, exactly like the former Babel build.
  function optionalLocalConfig() {
    return {
      name: 'terminalquest:optional-local-config',
      resolveId(source, importer) {
        if (source !== './local_config' || !importer) return null;
        if (path.dirname(importer) !== path.dirname(localConfigPath)) return null;
        return fs.existsSync(localConfigPath)
          ? localConfigPath
          : LOCAL_CONFIG_MISSING_ID;
      },
      load(id) {
        if (id === LOCAL_CONFIG_MISSING_ID) {
          return "throw new Error(\"Cannot find module './local_config'\");";
        }
        return null;
      },
      buildStart() {
        // Watch mode: creating local_config.js later triggers a rebuild.
        this.addWatchFile(localConfigPath);
      },
    };
  }

  // index.js is an ES module (see build.rolldownOptions), so the page loads it
  // with type="module". The other scripts (ace, phaser)
  // stay classic scripts and run first, as before.
  function moduleScriptHtml() {
    const html = fs.readFileSync(htmlSource, 'utf8');
    const classic = '<script src="index.js"></script>';
    if (!html.includes(classic)) {
      throw new Error(`${htmlSource} has no ${classic}`);
    }
    return html.replace(classic, '<script type="module" src="index.js"></script>');
  }

  // src/index.html is the page of the app (public/index.html). It is a static
  // file (classic <script>/<link> tags that must not be processed by Vite), so
  // it is copied to the output with only the entry script made a module.
  function emitIndexHtml() {
    return {
      name: 'terminalquest:index-html',
      buildStart() {
        this.addWatchFile(htmlSource);
      },
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'index.html',
          source: moduleScriptHtml(),
        });
      },
    };
  }

  // The only build is the Tauri one: `vite build --mode tauri` (npm run
  // build:js:tauri). The Electron build was removed (docs/migration/tauri-runtime.md,
  // "Electron removal"); another mode is a mistake, not something to fall back from.
  export default defineConfig(({ mode }) => {
    if (mode !== 'tauri') {
      throw new Error(
        `vite.config.mjs only builds the Tauri frontend: run vite with --mode tauri (got mode "${mode}"); see npm run build:tauri`
      );
    }
    return {
    root: rootDir,
    publicDir: false,
    logLevel: 'info',
    plugins: [
      // React 19 requires the automatic JSX runtime (react/jsx-runtime is
      // resolved at runtime from public/node_modules like every bare import)
      react({ jsxRuntime: 'automatic' }),
      tauriUnavailableModules(),
      resolvePackagesFromPublic(),
      patchTauriPackages(),
      optionalLocalConfig(),
      emitIndexHtml(),
    ],
    build: {
      outDir: publicDir,
      // public/ also holds static assets (images, lib, levels, content, ...)
      emptyOutDir: false,
      // Electron 11's Chromium. Kept until the WebViews of every Tauri OS are
      // checked for compatibility with a newer target.
      target: 'chrome87',
      minify: false,
      sourcemap: false,
      cssCodeSplit: false,
      rolldownOptions: {
        input: tauriEntry,
        output: {
          // ES modules (see the comment at `tauriOutput`).
          ...tauriOutput,
          entryFileNames: 'index.js',
        },
      },
    },
  };
});
