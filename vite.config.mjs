import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The bundle must reference react/jsx-runtime, which exists in every React 19
// build. With NODE_ENV=development in the caller's shell the React plugin would
// emit react/jsx-dev-runtime instead, whose jsxDEV is undefined in React's
// production build (the Electron renderer loads whichever build NODE_ENV picks).
process.env.NODE_ENV = 'production';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(rootDir, 'src');
const publicDir = path.join(rootDir, 'public');
const entry = path.join(srcDir, 'js', 'index.jsx');
const htmlSource = path.join(srcDir, 'index.html');
const localConfigPath = path.join(srcDir, 'js', 'app', 'config', 'local_config.js');
const LOCAL_CONFIG_MISSING_ID = '\0local-config-missing';
const platformDir = path.join(srcDir, 'js', 'app', 'platform');
const tauriPlatformDir = path.join(platformDir, 'tauri');
// Electron implementations that have a Tauri counterpart in platform/tauri/
// with the same file name (docs/migration/tauri-platform.md).
const platformModules = [
  'paths',
  'dialog',
  'store',
  'fs',
  'shell',
  'exec',
  'devtools',
  'env',
  'init',
];

// Everything that is not a project file is resolved at runtime by Electron's
// renderer `require` (Node builtins, `electron`, and the packages installed in
// public/node_modules). Only the app's own sources are bundled.
function isExternal(id) {
  return !(
    // Tauri build only (see platformTarget): the Tauri JS APIs have no
    // runtime `require`, so they are bundled.
    (platformTarget === 'tauri' && id.startsWith('@tauri-apps/')) ||
    id.startsWith('.') ||
    path.isAbsolute(id) ||
    id.startsWith('\0') ||
    // Transform helpers (class fields for chrome87) are bundled, not required
    id.startsWith('@oxc-project/runtime/')
  );
}

// Which platform layer implementation is bundled: `vite build` (Electron, the
// default) or `vite build --mode tauri`.
let platformTarget = 'electron';

// In the Tauri build every import of platform/<name> (Electron
// implementation) is redirected to platform/tauri/<name>. The Electron build
// has no such redirect, so its bundle is unchanged.
function selectPlatformImplementation() {
  return {
      name: 'terminalquest:select-platform',
      enforce: 'pre',
      resolveId(source, importer) {
        if (platformTarget !== 'tauri' || !importer || !source.startsWith('.')) {
          return null;
        }
        const target = path.resolve(path.dirname(importer), source);
        const name = path.basename(target).replace(/\.js$/, '');
        if (
          path.dirname(target) !== platformDir ||
          !platformModules.includes(name)
        ) {
          return null;
        }
        return path.join(tauriPlatformDir, `${name}.js`);
      },
    };
  }

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

  // src/index.html is the page loaded by main.js (public/index.html). It is a
  // static file (classic <script>/<link> tags that must not be processed by
  // Vite), so it is copied to the output unchanged.
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
          source: fs.readFileSync(htmlSource),
        });
      },
    };
  }

  export default defineConfig(({ mode }) => {
    platformTarget = mode === 'tauri' ? 'tauri' : 'electron';
    return {
    root: rootDir,
    publicDir: false,
    logLevel: 'info',
    plugins: [
      // React 19 requires the automatic JSX runtime (react/jsx-runtime is
      // resolved at runtime from public/node_modules like every bare import)
      react({ jsxRuntime: 'automatic' }),
      selectPlatformImplementation(),
      optionalLocalConfig(),
      emitIndexHtml(),
    ],
    build: {
      outDir: publicDir,
      // public/ also holds static assets (images, lib, levels, content, ...)
      emptyOutDir: false,
      target: 'chrome87', // Electron 11
      minify: false,
      sourcemap: false,
      cssCodeSplit: false,
      rolldownOptions: {
        input: entry,
        external: isExternal,
        output: {
          format: 'cjs',
          entryFileNames: 'index.js',
          // Keep the bundle's top-level bindings out of the global scope of the
          // classic <script> (other scripts such as ace/phaser define globals),
          // and keep strict mode, which ES modules had implicitly.
          banner: "(function () {\n'use strict';",
          footer: '})();',
        },
      },
    },
  };
});
