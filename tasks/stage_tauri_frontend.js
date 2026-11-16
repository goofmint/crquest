/*
Creates the Tauri-only `frontendDist` (tauri-dist/, see src-tauri/tauri.conf.json):
a copy of public/ without what the Tauri build does not serve to the page.
public/ itself (the page and its build output) is not touched.

Left out:
- content/ and levels/ (tauriResourceOnlyDirectories.json, about 47MB): they are
  shipped as `bundle.resources` and read from `$RESOURCE`; the page reaches them
  through the asset protocol (platform/tauri/assets.js), so embedding them as
  well only duplicated them in the binary (docs/migration/tauri-resources.md).
- node_modules/: the Tauri build bundles every package. Only the files listed in
  RUNTIME_NODE_MODULES_FILES are copied, because src/index.html links them.
- package.json and package-lock.json (not read at run time: the version comes
  from tauri.conf.json), and every file or directory whose name starts with a
  dot (.DS_Store and the like).

Run it after the Tauri build (`npm run build:tauri` does).
*/
const fs = require('fs');
const path = require('path');
const resourceOnlyDirectories = require('../src/js/app/config/tauriResourceOnlyDirectories.json');

const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const stagingDir = path.join(rootDir, 'tauri-dist');

// Relative to public/, '/' separated.
const RUNTIME_NODE_MODULES_FILES = ['node_modules/animate.css/animate.min.css'];
const GENERATED_FILES = ['index.html', 'index.js', 'tauri-game.js', 'index.css'];
const EXCLUDED_TOP_LEVEL_ENTRIES = [
  ...resourceOnlyDirectories,
  'node_modules',
  'package.json',
  'package-lock.json',
];

// `relativePath` is relative to public/ and uses '/'.
function isStaged(relativePath) {
  const segments = relativePath.split('/');
  if (segments.some(segment => segment.startsWith('.'))) return false;
  return !EXCLUDED_TOP_LEVEL_ENTRIES.includes(segments[0]);
}

function stageTauriFrontend(source = publicDir, target = stagingDir) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, {
    recursive: true,
    filter: sourcePath => {
      const relativePath = path.relative(source, sourcePath).split(path.sep).join('/');
      return relativePath === '' || isStaged(relativePath);
    },
  });
  RUNTIME_NODE_MODULES_FILES.forEach(relativePath => {
    const from = path.join(source, ...relativePath.split('/'));
    if (!fs.existsSync(from)) {
      throw new Error(`${from} does not exist (index.html links it): run npm install`);
    }
    const to = path.join(target, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  });
}

module.exports = { stageTauriFrontend, isStaged, RUNTIME_NODE_MODULES_FILES, stagingDir };

if (require.main === module) {
  // The build output must be there: public/ is what the Tauri build wrote to
  GENERATED_FILES.forEach(file => {
    if (!fs.existsSync(path.join(publicDir, file))) {
      throw new Error(`public/${file} does not exist: run the Tauri build (npm run build:tauri) first`);
    }
  });
  stageTauriFrontend();
}
