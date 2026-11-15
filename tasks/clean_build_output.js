/*
Deletes the generated build output inside public/ (see .gitignore): the files
written by `vite build` and `sass`, and the per-file output of the former Babel
build (public/app, public/test). `emptyOutDir` is off in vite.config.mjs because
public/ also holds the static assets, so stale output is removed here instead.
Only the paths listed below are touched.
*/
const path = require('path');
const jetpack = require('fs-jetpack');

const publicDir = path.resolve(__dirname, '..', 'public');

// Relative to public/. Keep in sync with the "generated artifacts" section of
// .gitignore (src/test/tasks/cleanBuildOutput.test.js checks that).
const GENERATED_PATHS = [
  'index.html',
  'index.js',
  'index.js.map',
  'index.css',
  'index.css.map',
  'tauri-game.js',
  'app',
  'test',
];

function cleanBuildOutput() {
  GENERATED_PATHS.forEach(relativePath => {
    jetpack.remove(path.join(publicDir, relativePath));
  });
}

module.exports = { GENERATED_PATHS, cleanBuildOutput };

if (require.main === module) {
  cleanBuildOutput();
}
