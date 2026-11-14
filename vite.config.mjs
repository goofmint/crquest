import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(rootDir, 'src');
const publicDir = path.join(rootDir, 'public');
const entry = path.join(srcDir, 'js', 'index.jsx');
const htmlSource = path.join(srcDir, 'index.html');
const localConfigPath = path.join(srcDir, 'js', 'app', 'config', 'local_config.js');
const LOCAL_CONFIG_MISSING_ID = '\0local-config-missing';

// Everything that is not a project file is resolved at runtime by Electron's
// renderer `require` (Node builtins, `electron`, and the packages installed in
// public/node_modules). Only the app's own sources are bundled.
function isExternal(id) {
  return !(
    id.startsWith('.') ||
    path.isAbsolute(id) ||
    id.startsWith('\0') ||
    // Transform helpers (class fields for chrome87) are bundled, not required
    id.startsWith('@oxc-project/runtime/')
  );
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

export default defineConfig({
  root: rootDir,
  publicDir: false,
  logLevel: 'info',
  plugins: [
    // React 16.8: no react/jsx-runtime, so keep the classic runtime
    react({ jsxRuntime: 'classic' }),
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
});
