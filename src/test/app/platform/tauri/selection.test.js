import fs from 'node:fs';
import path from 'node:path';
import { build } from 'vite';

const root = path.resolve(__dirname, '../../../../..');
const platformDir = path.join(root, 'src/js/app/platform');
const MODULES = ['paths', 'dialog', 'store', 'fs', 'shell', 'exec', 'devtools', 'menu', 'env', 'init', 'assets', 'conversationTemplate', 'auth', 'cloudSave', 'unlocks', 'treePlanting', 'liveEvents'];

// Comments (the first lines of each thin module explain why it exists) do not
// count; what is left must be exactly the re-export of the Tauri module.
function codeOf(file) {
  return fs
    .readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(line => line.trim() !== '' && !line.trim().startsWith('//'))
    .join('\n');
}

describe('platform/<name>.js is the Tauri implementation', () => {
  test.each(MODULES)('%s.js only re-exports ./tauri/%s', name => {
    expect(codeOf(path.join(platformDir, `${name}.js`))).toBe(`export * from './tauri/${name}';`);
    expect(fs.existsSync(path.join(platformDir, 'tauri', `${name}.js`))).toBe(true);
  });

  test('every module file of platform/ is covered', () => {
    const files = fs
      .readdirSync(platformDir)
      .filter(f => f.endsWith('.js') && f !== 'index.js')
      .map(f => f.replace(/\.js$/, ''))
      .sort();
    expect(files).toEqual([...MODULES].sort());
  });

  test('every Tauri module is exposed through platform/', () => {
    const tauriModules = fs
      .readdirSync(path.join(platformDir, 'tauri'))
      .filter(f => f.endsWith('.js'))
      .map(f => f.replace(/\.js$/, ''));
    // errors, state and storeFile are internals of the Tauri modules
    expect(tauriModules.filter(name => !MODULES.includes(name)).sort()).toEqual(['errors', 'state', 'storeFile']);
  });
});

describe('build (vite.config.mjs)', () => {
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

  test('--mode tauri: ES modules, the entry and the game are separate chunks', async () => {
    const files = await bundleFiles('tauri');
    expect(Object.keys(files).filter(f => f.endsWith('.js')).sort()).toEqual([
      'index.js',
      'tauri-game.js',
    ]);
    // No static import of the game: it is loaded only by the dynamic import
    // that follows `await initPlatform()` (see tauriBundle.test.js).
    expect(files['index.js']).not.toMatch(/^import .* from ["']\.\/tauri-game\.js["']/m);
    expect(files['index.js']).toContain('await initPlatform()');
    expect(files['index.js']).toContain('import("./tauri-game.js")');
  }, 60000);

  test('a mode other than tauri fails explicitly', async () => {
    await expect(bundleFiles('production')).rejects.toThrow(/only builds the Tauri frontend.*--mode tauri/);
  }, 60000);

  test('--mode tauri bundles platform/tauri/* and the Tauri JS APIs', async () => {
    // The entry and the game chunk together (see the chunk test above).
    const code = Object.values(await bundleFiles('tauri')).join('\n');
    expect(code).toContain('src/js/app/platform/tauri/store.js');
    expect(code).not.toContain('electron-store');
    expect(code).not.toContain('require("@tauri-apps');
  }, 60000);
});
