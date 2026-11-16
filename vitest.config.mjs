import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Test configuration (the app itself is built by vite.config.mjs, which is
// intentionally NOT used here: it targets Electron's require()).
const rootDir = path.dirname(fileURLToPath(import.meta.url));
const publicModules = path.join(rootDir, 'public', 'node_modules');

// The renderer's dependencies (react, styled-components, yup, dexie, ...) are
// installed in public/node_modules, not in the root node_modules. Resolve bare
// imports that the root cannot satisfy from there, like Jest's `modulePaths`.
function publicNodeModules() {
  return {
    name: 'terminalquest:public-node-modules',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      // npm packages named like Node builtins (`url`, `events`, ...) are
      // installed in node_modules as dependencies of other packages; a bare
      // `url` import in the app means the builtin (as in Electron's require).
      if (builtinModules.includes(source)) {
        return { id: `node:${source}`, external: true };
      }
      if (
        source.startsWith('.') ||
        source.startsWith('\0') ||
        path.isAbsolute(source) ||
        source.startsWith('node:') ||
        source.startsWith('/@') ||
        !importer
      ) {
        return null;
      }
      const resolved = await this.resolve(source, importer, {
        ...options,
        skipSelf: true,
      });
      if (resolved) return resolved;
      return this.resolve(source, path.join(publicModules, '_'), {
        ...options,
        skipSelf: true,
      });
    },
  };
}

export default defineConfig({
  plugins: [publicNodeModules(), react({ jsxRuntime: 'automatic' })],
  // The sources and tests are .js files that contain JSX
  oxc: { include: /\.[jt]sx?$/, lang: 'jsx' },
  resolve: {
    // @testing-library/react (root devDependency) peer-installs its own React
    // under node_modules/. Pin React to the renderer's copy in
    // public/node_modules so that the app, styled-components and the test
    // library share one instance.
    //
    // The package's CommonJS entry would require() its own react-dom, which
    // Vite cannot redirect, so its ES module build is used instead (it is
    // inlined below, so its imports go through the aliases).
    alias: [
      {
        find: /^@testing-library\/react$/,
        replacement: path.join(
          rootDir,
          'node_modules/@testing-library/react/dist/@testing-library/react.esm.js'
        ),
      },
      // The root node_modules has older pug (2) and cheerio (rc.3) for the build
      // tasks; the app (Electron's runtime require, and the Tauri bundle) uses
      // the versions in public/node_modules.
      { find: /^pug$/, replacement: path.join(publicModules, 'pug') },
      { find: /^cheerio$/, replacement: path.join(publicModules, 'cheerio') },
      { find: /^react$/, replacement: path.join(publicModules, 'react') },
      { find: /^react\/(.*)$/, replacement: path.join(publicModules, 'react', '$1') },
      { find: /^react-dom$/, replacement: path.join(publicModules, 'react-dom') },
      { find: /^react-dom\/(.*)$/, replacement: path.join(publicModules, 'react-dom', '$1') },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/test/**/*.test.js'],
    setupFiles: ['src/test/setup.js'],
    server: {
      deps: {
        // Processed by Vite (not loaded natively) so the aliases above apply
        inline: [/@testing-library\/react/],
      },
    },
  },
});
