import fs from 'node:fs';
import path from 'node:path';
import { build } from 'vite';

const root = path.resolve(__dirname, '../../../../..');
const platformDir = path.join(root, 'src/js/app/platform');
const MODULES = ['paths', 'dialog', 'store', 'fs', 'shell', 'exec', 'devtools', 'env', 'init'];

// Additional exports of Tauri modules that the Electron module does not have.
const TAURI_ONLY = {
  store: ['deleteValueAsync', 'getValueAsync', 'hasValueAsync', 'setValueAsync'],
};

function exportedNames(file) {
  const source = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const names = new Set();
  for (const m of source.matchAll(/^export\s+(?:async\s+)?(?:function|const)\s+(\w+)/gm)) {
    names.add(m[1]);
  }
  for (const m of source.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    m[1].split(',').map(s => s.trim()).filter(Boolean).forEach(s => names.add(s.split(/\s+as\s+/).pop()));
  }
  return [...names].sort();
}

describe('Tauri platform parity', () => {
  test.each(MODULES)('%s exports the same names as the Electron module', name => {
    const electron = exportedNames(path.join(platformDir, `${name}.js`));
    const tauri = exportedNames(path.join(platformDir, 'tauri', `${name}.js`));
    expect(electron.length).toBeGreaterThan(0);
    expect(tauri).toEqual([...electron, ...(TAURI_ONLY[name] || [])].sort());
  });

  test('every Electron module file is covered', () => {
    const files = fs
      .readdirSync(platformDir)
      .filter(f => f.endsWith('.js') && f !== 'index.js')
      .map(f => f.replace(/\.js$/, ''))
      .sort();
    expect(files).toEqual([...MODULES].sort());
  });
});

describe('build-time selection (vite.config.mjs)', () => {
  // vite.config.mjs sets process.env.NODE_ENV = 'production' while it loads.
  const originalNodeEnv = process.env.NODE_ENV;
  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  async function bundleFiles(mode) {
    const result = await build({
      configFile: path.join(root, 'vite.config.mjs'),
      mode,
      logLevel: 'silent',
      build: { write: false },
    });
    const outputs = Array.isArray(result) ? result.flatMap(r => r.output) : result.output;
    return Object.fromEntries(outputs.map(o => [o.fileName, o.code]));
  }

  async function bundle(mode) {
    const result = await build({
      configFile: path.join(root, 'vite.config.mjs'),
      mode,
      logLevel: 'silent',
      build: { write: false },
    });
    const outputs = Array.isArray(result) ? result.flatMap(r => r.output) : result.output;
    return outputs.find(o => o.fileName === 'index.js').code;
  }

  test('--mode tauri: the entry has no external require, the game is a separate chunk', async () => {
    const files = await bundleFiles('tauri');
    expect(Object.keys(files).filter(f => f.endsWith('.js')).sort()).toEqual([
      'index.js',
      'tauri-game.js',
    ]);
    const requires = [...files['index.js'].matchAll(/\brequire\(("[^"]*")\)/g)].map(m => m[1]);
    expect(requires).toEqual(['"./tauri-game.js"']);
    expect(files['index.js']).toContain('await initPlatform()');
    expect(files['tauri-game.js']).toContain('require("react")');
  }, 60000);

  test('the default (Electron) build is a single index.js', async () => {
    const files = await bundleFiles('production');
    expect(Object.keys(files).filter(f => f.endsWith('.js'))).toEqual(['index.js']);
  }, 60000);

  test('the default (Electron) build bundles the Electron implementation', async () => {
    const code = await bundle('production');
    expect(code).not.toContain('ERR_TAURI_SYNC_UNSUPPORTED');
    expect(code).not.toContain('platform/tauri/');
    expect(code).toContain('require("electron-store")');
  }, 60000);

  test('--mode tauri bundles platform/tauri/* and the Tauri JS APIs', async () => {
    // The entry and the game chunk together (see the chunk test above).
    const code = Object.values(await bundleFiles('tauri')).join('\n');
    expect(code).toContain('ERR_TAURI_SYNC_UNSUPPORTED');
    expect(code).toContain('src/js/app/platform/tauri/store.js');
    expect(code).not.toContain('require("electron-store")');
    expect(code).not.toContain('require("@tauri-apps');
    expect(code).not.toContain('src/js/app/platform/store.js');
  }, 60000);
});
