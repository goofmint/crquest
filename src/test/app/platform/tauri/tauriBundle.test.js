// Checks of the real output of `vite build --mode tauri` (W1, docs/migration/
// tauri-runtime.md): a Tauri webview has no `require`, so the output must not
// need one, packages must come from where Electron resolves them, and the game
// must still be evaluated only after `await initPlatform()`.
import path from 'node:path';
import { builtinModules } from 'node:module';
import { build } from 'vite';

const root = path.resolve(__dirname, '../../../../..');

describe('--mode tauri output', () => {
  // vite.config.mjs sets process.env.NODE_ENV = 'production' while it loads.
  const originalNodeEnv = process.env.NODE_ENV;
  let files;

  beforeAll(async () => {
    const result = await build({
      configFile: path.join(root, 'vite.config.mjs'),
      mode: 'tauri',
      logLevel: 'silent',
      build: { write: false },
    });
    const outputs = Array.isArray(result) ? result.flatMap(r => r.output) : result.output;
    files = Object.fromEntries(outputs.map(o => [o.fileName, o.code ?? o.source.toString()]));
  }, 120000);

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  const jsFiles = () => Object.entries(files).filter(([name]) => name.endsWith('.js'));

  test('every import/export specifier is a relative file (nothing to resolve at runtime)', () => {
    const specifiers = [];
    for (const [, code] of jsFiles()) {
      for (const m of code.matchAll(/^(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']/gm)) {
        specifiers.push(m[1]);
      }
      for (const m of code.matchAll(/^import\s*["']([^"']+)["']/gm)) specifiers.push(m[1]);
    }
    expect(specifiers.length).toBeGreaterThan(0);
    specifiers.forEach(s => expect(s).toMatch(/^\.\/[\w.-]+\.js$/));
  });

  test('no CommonJS require of a package or a Node module is left in the code', () => {
    const names = [...builtinModules, 'electron', 'react', 'pug', 'lodash.get', 'styled-components'];
    for (const [, code] of jsFiles()) {
      // Comments (JSDoc examples in the sources and packages) mention require()
      const executable = code
        .split('\n')
        .filter(line => !/^\s*(\*|\/\/|\/\*)/.test(line))
        .join('\n');
      for (const name of names) {
        expect(executable).not.toMatch(new RegExp(`(?<![.\\w])require\\(["']${name}["']\\)`));
      }
      expect(executable).not.toMatch(/^(const|var|let) \w+ = require\(/m);
    }
  });

  test('packages are bundled, and resolved from public/node_modules before the root', () => {
    const game = files['tauri-game.js'];
    // pug 3 (public/package.json); the root has pug 2
    expect(game).toContain('// public/node_modules/pug/lib/index.js');
    expect(game).not.toContain('// node_modules/pug/lib/index.js');
    for (const name of ['react', 'react-dom', 'styled-components', 'lodash.merge', 'lodash.isequal', 'dexie']) {
      expect(game).toMatch(new RegExp(`^// public/node_modules/${name}/`, 'm'));
    }
    // Only in the root node_modules
    expect(files['index.js']).toMatch(/^\/\/ node_modules\/@tauri-apps\/api\//m);
  });

  test('the game is not in the entry and is loaded only after initPlatform()', () => {
    const entry = files['index.js'];
    expect(entry).not.toContain('src/js/app/config/config.js');
    expect(entry).not.toContain('src/js/index.jsx');
    expect(files['tauri-game.js']).toContain('src/js/index.jsx');
    const init = entry.indexOf('await initPlatform()');
    const load = entry.indexOf('import("./tauri-game.js")');
    expect(init).toBeGreaterThan(-1);
    expect(load).toBeGreaterThan(init);
    // The only reference to the game chunk is that dynamic import
    expect(entry.match(/tauri-game\.js/g)).toHaveLength(1);
  });

  test('path, events, util, assert and url are browser implementations (W2)', () => {
    const game = files['tauri-game.js'];
    for (const file of [
      'node_modules/path-browserify/index.js',
      'node_modules/events/events.js',
      'node_modules/util/util.js',
      'node_modules/assert/build/assert.js',
      'node_modules/url/url.js',
      'src/js/tauri_shims/url.js',
    ]) {
      expect(game).toContain(`// ${file}`);
    }
    for (const name of ['path', 'events', 'util', 'assert', 'url', 'process']) {
      expect(game).not.toContain(`The Node module "${name}" is not available`);
      expect(game).not.toContain(`The Node module \\"${name}\\" is not available`);
    }
  });

  test('other Node modules fail explicitly instead of being empty objects', () => {
    const game = files['tauri-game.js'];
    for (const name of ['fs', 'electron', 'stream']) {
      expect(game).toContain(`The Node module \\"${name}\\" is not available in the Tauri build`);
    }
    // fs and child_process are never replaced by something that looks like them
    expect(game).not.toContain('node_modules/browserify-fs');
  });

  test('the page loads the entry as a module, after the classic scripts', () => {
    const html = files['index.html'];
    const classic = html.indexOf('<script src="lib/phaser-2.13.2.min.js"></script>');
    const entry = html.indexOf('<script type="module" src="index.js"></script>');
    expect(classic).toBeGreaterThan(-1);
    expect(entry).toBeGreaterThan(classic);
    expect(html).not.toContain('<script src="index.js">');
  });
});
