import fs from 'node:fs';
import path from 'node:path';

const tauriDir = path.resolve(__dirname, '../../../../../src-tauri');
const extensionsSource = fs.readFileSync(
  path.resolve(__dirname, '../../../../js/app/common/extensions.js'),
  'utf8'
);
const BUNDLED_ASSET_DIRECTORY = /const BUNDLED_ASSET_DIRECTORY = '([^']+)'/.exec(extensionsSource)[1];
const read = file => fs.readFileSync(path.join(tauriDir, file), 'utf8');

// Sync Bundled Assets (assetLoader.js) removes and writes
// <extension directory>/.bundled/{tilesets,objects}; on Unix a `**` scope does
// not match a leading-dot name, so src-tauri/src/bundled_scope.rs allows
// <dir>/.bundled for every chosen directory (#141). The glob behaviour itself
// is tested in Rust (`cargo test`).
describe('Sync Bundled Assets destination scope (#141)', () => {
  const rust = read('src/bundled_scope.rs');
  const lib = read('src/lib.rs');

  test('the Rust constant is the directory the sync writes to', () => {
    expect(BUNDLED_ASSET_DIRECTORY).toBe('.bundled');
    expect(rust).toContain(`BUNDLED_DIRECTORY: &str = "${BUNDLED_ASSET_DIRECTORY}"`);
  });

  test('the plugin is registered after fs and before persisted-scope', () => {
    const fsAt = lib.indexOf('tauri_plugin_fs::init()');
    const bundledAt = lib.indexOf('bundled_scope::init()');
    const persistedAt = lib.indexOf('tauri_plugin_persisted_scope::init()');
    expect(fsAt).toBeGreaterThanOrEqual(0);
    expect(bundledAt).toBeGreaterThan(fsAt);
    expect(persistedAt).toBeGreaterThan(bundledAt);
  });

  test('both the fs and the asset protocol scopes are covered', () => {
    expect(rust).toContain('follow(&app.fs_scope())');
    expect(rust).toContain('follow(&app.asset_protocol_scope())');
  });

  test('leading-dot names are not exposed globally', () => {
    const config = fs.readFileSync(path.join(tauriDir, 'tauri.conf.json'), 'utf8');
    const capabilities = read('capabilities/platform.json');
    expect(config).not.toMatch(/requireLiteralLeadingDot/i);
    expect(capabilities).not.toMatch(/require_?literal_?leading_?dot/i);
    expect(capabilities).not.toMatch(/"\*\*"|"path":\s*"\*\*\//);
  });
});
