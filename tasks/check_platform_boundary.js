// Platform boundary check (Phase 1 task 1-7).
//
// Fails when code under src/js, other than src/js/app/platform, loads
// electron, electron-is-dev, fs-jetpack or fs (including node:fs and subpaths
// such as fs/promises) as a module. git grep finds candidate lines that
// contain such a quoted specifier; every file with a candidate is then read
// whole and tokenized (findViolationLines), so multi-line imports/requires and
// multi-line comments are judged by their syntax, not line by line.
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
const fs = require('fs');
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

const FORBIDDEN_SPECIFIER = /^(electron|electron-is-dev|fs-jetpack|(node:)?fs)(\/.*)?$/;

const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[A-Za-z0-9_$]/;

// After these tokens a `/` starts a regex literal instead of a division.
const REGEX_PRECEDING_WORDS = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'case',
  'do',
  'else',
  'yield',
  'await',
]);

// Lexical tokenizer, just enough for module-loading detection. Comments
// (including multi-line ones), regex literals and string/template contents
// never yield identifier tokens. Tokens: { type: 'ident' | 'string' | 'punct',
// value, line }. A string that is not closed before the end of its line ends
// there, so an apostrophe in JSX text cannot swallow the rest of the file.
function tokenize(source) {
  const tokens = [];
  let i = 0;
  let line = 1;
  const last = () => tokens[tokens.length - 1];
  const regexAllowed = () => {
    const prev = last();
    if (!prev) return true;
    if (prev.type === 'string') return false;
    if (prev.type === 'ident') return REGEX_PRECEDING_WORDS.has(prev.value);
    return !/^[)\]}]$/.test(prev.value);
  };
  // Skips a template literal starting after its opening backtick. Returns its
  // text without substitutions, or null when it has a `${}` substitution.
  const readTemplate = () => {
    let text = '';
    let hasSubstitution = false;
    while (i < source.length && source[i] !== '`') {
      if (source[i] === '\\') {
        text += source[i + 1] === undefined ? '' : source[i + 1];
        if (source[i + 1] === '\n') line += 1;
        i += 2;
      } else if (source[i] === '$' && source[i + 1] === '{') {
        hasSubstitution = true;
        i += 2;
        let depth = 1;
        while (i < source.length && depth > 0) {
          if (source[i] === '{') depth += 1;
          else if (source[i] === '}') depth -= 1;
          else if (source[i] === '\n') line += 1;
          i += 1;
        }
      } else {
        if (source[i] === '\n') line += 1;
        text += source[i];
        i += 1;
      }
    }
    i += 1;
    return hasSubstitution ? null : text;
  };
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '\n') {
      line += 1;
      i += 1;
    } else if (/\s/.test(ch)) {
      i += 1;
    } else if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
    } else if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      for (let k = i; k < stop; k += 1) if (source[k] === '\n') line += 1;
      i = stop;
    } else if (ch === "'" || ch === '"') {
      const startLine = line;
      let value = '';
      i += 1;
      while (i < source.length && source[i] !== ch && source[i] !== '\n') {
        if (source[i] === '\\') {
          value += source[i + 1] === undefined ? '' : source[i + 1];
          if (source[i + 1] === '\n') line += 1;
          i += 2;
        } else {
          value += source[i];
          i += 1;
        }
      }
      if (source[i] === ch) i += 1;
      tokens.push({ type: 'string', value, line: startLine });
    } else if (ch === '`') {
      const startLine = line;
      i += 1;
      const value = readTemplate();
      tokens.push(
        value === null
          ? { type: 'punct', value: '`', line: startLine }
          : { type: 'string', value, line: startLine }
      );
    } else if (ch === '/' && regexAllowed()) {
      let inClass = false;
      i += 1;
      while (i < source.length && source[i] !== '\n') {
        if (source[i] === '\\') i += 1;
        else if (source[i] === '[') inClass = true;
        else if (source[i] === ']') inClass = false;
        else if (source[i] === '/' && !inClass) break;
        i += 1;
      }
      i += 1;
      while (i < source.length && IDENT_PART.test(source[i])) i += 1;
      tokens.push({ type: 'punct', value: '/regex/', line });
    } else if (IDENT_START.test(ch)) {
      let value = '';
      while (i < source.length && IDENT_PART.test(source[i])) {
        value += source[i];
        i += 1;
      }
      tokens.push({ type: 'ident', value, line });
    } else {
      tokens.push({ type: 'punct', value: ch, line });
      i += 1;
    }
  }
  return tokens;
}

// Returns the line numbers (1-based) of forbidden module specifiers that a
// whole source file loads: `import ... from 'x'` / `export ... from 'x'`
// (the `from 'x'` may be on a later line than `import`), `import 'x'`,
// `require('x')` and `import('x')`, each also with the specifier on a
// separate line.
function findViolationLines(source) {
  const tokens = tokenize(source);
  const lines = [];
  tokens.forEach((token, index) => {
    const prev = tokens[index - 1];
    if (token.type !== 'ident' || (prev && prev.value === '.')) return;
    const next = tokens[index + 1];
    let specifier = null;
    if (token.value === 'from' || token.value === 'import') {
      if (next && next.type === 'string') specifier = next;
    }
    if (token.value === 'require' || token.value === 'import') {
      const arg = tokens[index + 2];
      if (next && next.value === '(' && arg && arg.type === 'string') {
        specifier = arg;
      }
    }
    if (specifier && FORBIDDEN_SPECIFIER.test(specifier.value)) {
      lines.push(specifier.line);
    }
  });
  return lines;
}

function isModuleLoadViolation(source) {
  return findViolationLines(source).length > 0;
}

function main() {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });

  if (result.error) {
    throw result.error;
  }
  if (result.status === 0) {
    const files = [
      ...new Set(
        result.stdout
          .split('\n')
          .filter(line => line !== '')
          .map(line => {
            const match = /^([^:]*):\d+:/.exec(line);
            if (!match) {
              throw new Error(`Unexpected git grep output line: ${line}`);
            }
            return match[1];
          })
      ),
    ];
    const violations = [];
    files.forEach(file => {
      const sourceLines = fs
        .readFileSync(path.join(repoRoot, file), 'utf8')
        .split('\n');
      findViolationLines(sourceLines.join('\n')).forEach(lineNumber => {
        violations.push(`${file}:${lineNumber}:${sourceLines[lineNumber - 1]}`);
      });
    });
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

module.exports = { findViolationLines, isModuleLoadViolation };

if (require.main === module) {
  main();
}
