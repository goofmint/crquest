// Firebase removal guard (#193).
//
// Fails when runtime code, build configuration or dependencies refer to
// Firebase again: its hosts (including the former API base URLs), the Web /
// Admin SDK, or the old environment variables. The plain word "Firebase" in a
// comment or a document (history, migration notes) is fine; only references that
// could connect or load something count.
//
// Scanned: src (except src/test, whose tests assert the absence with these very
// patterns), src-tauri (sources, capabilities, configs, not target/), tasks,
// public (except the generated bundles, see .gitignore), package.json,
// package-lock.json (dependency names), vite.config.mjs, .env*.template.
// Not scanned: docs/ (history), supabase/ (the CLI's default config.toml names a
// Firebase third-party-auth template).
//
//   node tasks/check_firebase.js     exit 0: clean, 1: references found

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

const PATTERNS = [
  ['a Firebase / Google API host', /(firebaseapp\.com|firebaseio\.com|firebasestorage|firebase\.google\.com|firestore\.googleapis\.com|appspot\.com)/i],
  ['the former API base URL', /twilioquest-(prod|dev)\b(?!-)/i],
  ['the former API path', /(\/quest\/api\/v1|quest\/tracking\/trees|api\/v1\/(teams|operations)\/joinCode|user-sync)/],
  ['the Firebase SDK or Admin SDK', /(firebase-admin|firebase-app|firebase-firestore|lib\/firebase|window\.firebase|\bfirebase\.(initializeApp|firestore|auth)\b|from\s+['"]@?firebase|require\(\s*['"]@?firebase)/i],
  ['an old Firebase environment variable', /\bFIREBASE_[A-Z_]+\b/],
];

const ROOT_FILES = ['package.json', 'vite.config.mjs'];
const ROOT_DIRS = ['src', 'src-tauri', 'tasks', 'public'];
const SKIP_DIRS = new Set(['node_modules', 'target', '.git', 'test', 'tauri-dist', 'gen']);
// This file (it holds the patterns) and the generated bundles (gitignored; see
// .gitignore: a stale local build is not a source).
const SKIP_PATHS = new Set(['tasks/check_firebase.js', 'public/index.html', 'public/index.js', 'public/index.js.map', 'public/tauri-game.js', 'public/app']);
const TEXT_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.json', '.html', '.rs', '.toml', '.yml', '.yaml', '.pug', '.ejs', '.template']);

function* walk(relative) {
  const absolute = path.join(repoRoot, relative);
  if (!fs.existsSync(absolute)) return;
  if (SKIP_PATHS.has(relative.split(path.sep).join('/'))) return;
  const stat = fs.statSync(absolute);
  if (stat.isDirectory()) {
    const name = path.basename(relative);
    // `src/test` holds the tests that assert the absence of these references.
    if (SKIP_DIRS.has(name) && !(name === 'test' && relative !== path.join('src', 'test'))) return;
    for (const entry of fs.readdirSync(absolute)) yield* walk(path.join(relative, entry));
  } else if (TEXT_EXTENSIONS.has(path.extname(relative))) {
    yield relative;
  }
}

function dependencyNames() {
  const names = new Set();
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  for (const key of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    Object.keys(pkg[key] || {}).forEach(n => names.add(n));
  }
  const lockPath = path.join(repoRoot, 'package-lock.json');
  if (fs.existsSync(lockPath)) {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    Object.keys(lock.packages || {}).forEach(k => names.add(k.replace(/^.*node_modules\//, '')));
  }
  return [...names];
}

/** Returns `[{ file, line, rule }]`; nothing for a clean tree. */
function findFirebaseReferences({ files } = {}) {
  const found = [];
  const targets = files || [
    ...ROOT_FILES,
    ...fs.readdirSync(repoRoot).filter(n => /^\.env.*template$/.test(n)),
    ...ROOT_DIRS.flatMap(dir => [...walk(dir)]),
  ];
  for (const file of targets) {
    const absolute = path.join(repoRoot, file);
    if (!fs.existsSync(absolute)) continue;
    // The lock file is checked by dependency names below, not by text.
    const lines = fs.readFileSync(absolute, 'utf8').split('\n');
    lines.forEach((text, index) => {
      for (const [rule, pattern] of PATTERNS) {
        if (pattern.test(text)) found.push({ file, line: index + 1, rule });
      }
    });
  }
  if (!files) {
    for (const name of dependencyNames()) {
      if (/^(@firebase\/|firebase$|firebase-)/.test(name)) {
        found.push({ file: 'package.json / package-lock.json', line: 0, rule: `dependency ${name}` });
      }
    }
  }
  return found;
}

if (require.main === module) {
  const found = findFirebaseReferences();
  if (found.length === 0) {
    console.log('check:firebase: no Firebase references in runtime code, configuration or dependencies.');
  } else {
    for (const { file, line, rule } of found) console.error(`${file}:${line}: ${rule}`);
    console.error(`check:firebase: ${found.length} reference(s). See docs/supabase/firebase-removal.md.`);
    process.exit(1);
  }
}

module.exports = { findFirebaseReferences, PATTERNS };
