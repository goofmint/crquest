// Platform boundary check (Phase 1 task 1-7).
//
// Fails when code under src/js, other than src/js/app/platform, loads
// electron, electron-is-dev, fs-jetpack or fs (including node:fs and subpaths
// such as fs/promises) as a module. git grep finds candidate lines that
// contain such a quoted specifier; isModuleLoadViolation then judges each one.
// Only module-loading syntax counts: static `import ... from 'x'`,
// `import 'x'`, `export ... from 'x'` (also the `from 'x'` line of a
// multi-line import/export), `require('x')` and dynamic `import('x')`.
// Comment-only text and plain strings (for example a mock table key such as
// `'fs': ...`) are not violations.
//
// Out of scope (not searched):
// - tasks/: Node build and development scripts, not part of the app runtime.
// - src/test/: test infrastructure, which may touch Node APIs directly.
// - public/code_runner/: the code runner's worker script, outside the exec contract.
// - public/levels/: dynamically loaded extension content (validators), not renderer source.
//
// Exit codes: 0 no violations, 1 violations found (all matches printed),
// any other failure (git grep status >= 2, spawn error) throws.

const { spawnSync } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const SPECIFIER =
  '[\'"`](electron|electron-is-dev|fs-jetpack|(node:)?fs)(/[^\'"`]*)?[\'"`]';
const pattern = SPECIFIER;
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


// Module-loading syntaxes followed directly by a forbidden specifier.
const LOAD_PATTERNS = [
  `\\bfrom\\s*${SPECIFIER}`,
  `\\bimport\\s*${SPECIFIER}`,
  `\\bimport\\s*\\(\\s*${SPECIFIER}`,
  `\\brequire\\s*\\(\\s*${SPECIFIER}`,
].map(source => new RegExp(source));

// Removes comment text (// ... and /* ... */ on one line) while leaving
// string contents untouched. A line that starts inside a multi-line block
// comment (leading `*`) is a comment line and yields an empty string.
function stripComments(line) {
  if (/^\s*\*/.test(line)) {
    return '';
  }
  let result = '';
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];
    if (quote) {
      result += ch;
      if (ch === '\\') {
        result += next === undefined ? '' : next;
        i += 1;
      } else if (ch === quote) {
        quote = null;
      }
    } else if (ch === '/' && next === '/') {
      break;
    } else if (ch === '/' && next === '*') {
      const end = line.indexOf('*/', i + 2);
      if (end === -1) {
        break;
      }
      i = end + 1;
    } else {
      if (ch === "'" || ch === '"' || ch === '`') {
        quote = ch;
      }
      result += ch;
    }
  }
  return result;
}

// Judges the source text of one candidate line (without file:line: prefix).
function isModuleLoadViolation(sourceLine) {
  const code = stripComments(sourceLine);
  return LOAD_PATTERNS.some(re => re.test(code));
}

// Judges one `git grep -n` output line ("path:lineNumber:text").
function isViolationGrepLine(grepLine) {
  const match = /^[^:]*:\d+:(.*)$/.exec(grepLine);
  if (!match) {
    throw new Error(`Unexpected git grep output line: ${grepLine}`);
  }
  return isModuleLoadViolation(match[1]);
}

function main() {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });

  if (result.error) {
    throw result.error;
  }
  if (result.status === 0) {
    const violations = result.stdout
      .split('\n')
      .filter(line => line !== '')
      .filter(isViolationGrepLine);
    if (violations.length > 0) {
      process.stdout.write(`${violations.join('\n')}\n`);
      console.error('Platform boundary violations found.');
      process.exit(1);
    }
    console.log('Platform boundary check: no violations');
    process.exit(0);
  }
  if (result.status === 1) {
    console.log('Platform boundary check: no violations');
    process.exit(0);
  }
  throw new Error(
    `git grep failed with status ${result.status}: ${result.stderr}`
  );
}

module.exports = { isModuleLoadViolation, isViolationGrepLine };

if (require.main === module) {
  main();
}
