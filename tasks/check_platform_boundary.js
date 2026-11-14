// Platform boundary check (Phase 1 task 1-7).
//
// Fails when code under src/js, other than src/js/app/platform, references
// electron, electron-is-dev, fs-jetpack or fs (including node:fs and subpaths
// such as fs/promises) as a quoted module specifier. Quoted specifiers are
// searched instead of import statements so that multi-line imports,
// require(...) and literal dynamic import(...) are all detected.
//
// Out of scope (not searched):
// - main.js: main process entry. The platform contract covers renderer code.
// - tasks/: Node build and development scripts, not part of the app runtime.
// - src/test/: test infrastructure, which may touch Node APIs directly.
// - public/code_runner/: separate window driven over IPC, outside the exec contract.
// - public/levels/: dynamically loaded extension content (validators), not renderer source.
//
// Exit codes: 0 no violations, 1 violations found (all matches printed),
// any other failure (git grep status >= 2, spawn error) throws.

const { spawnSync } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const pattern =
  '[\'"`](electron|electron-is-dev|fs-jetpack|(node:)?fs)(/[^\'"`]*)?[\'"`]';
const args = [
  'grep',
  '-n',
  '-E',
  '-e',
  pattern,
  '--',
  'src/js',
  ':(exclude)src/js/app/platform',
];

const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });

if (result.error) {
  throw result.error;
}
if (result.status === 0) {
  process.stdout.write(result.stdout);
  console.error('Platform boundary violations found.');
  process.exit(1);
}
if (result.status === 1) {
  console.log('Platform boundary check: no violations');
  process.exit(0);
}
throw new Error(
  `git grep failed with status ${result.status}: ${result.stderr}`
);
