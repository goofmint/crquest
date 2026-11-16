// Platform boundary check (Phase 1 task 1-7).
//
// Fails when code under src/js, other than src/js/app/platform, loads
// electron, electron-is-dev, fs-jetpack or fs (including node:fs and subpaths
// such as fs/promises) as a module. git grep finds candidate lines that
// contain such a quoted specifier; every file with a candidate is then read
// whole and parsed with @babel/parser (findViolationLines), so multi-line forms, comments, strings,
// regexes and template interpolation are judged by the AST, not line by line.
// A file that cannot be parsed is an error (exit non-zero), never skipped.
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
const parser = require('@babel/parser');

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

// Specifier text of a string literal, or of a template literal without
// substitutions; null for anything else (a computed specifier cannot be judged).
function specifierOf(node) {
  if (!node) return null;
  if (node.type === 'StringLiteral') return node.value;
  if (
    node.type === 'TemplateLiteral' &&
    node.expressions.length === 0 &&
    node.quasis.length === 1
  ) {
    return node.quasis[0].value.cooked;
  }
  return null;
}

// The specifier node a module-loading construct loads, or null when `node`
// is not one: static import, export ... from, require('x') and dynamic
// import('x') (a CallExpression on `Import`, or an ImportExpression).
function loadedSpecifierNode(node) {
  switch (node.type) {
    case 'ImportDeclaration':
    case 'ExportNamedDeclaration':
    case 'ExportAllDeclaration':
      return node.source;
    case 'ImportExpression':
      return node.source;
    case 'CallExpression':
      if (
        (node.callee.type === 'Identifier' && node.callee.name === 'require') ||
        node.callee.type === 'Import'
      ) {
        return node.arguments[0] || null;
      }
      return null;
    default:
      return null;
  }
}

function visit(node, onNode) {
  if (Array.isArray(node)) {
    node.forEach(child => visit(child, onNode));
    return;
  }
  if (!node || typeof node.type !== 'string') return;
  onNode(node);
  Object.keys(node).forEach(key => {
    if (
      key === 'loc' ||
      key === 'leadingComments' ||
      key === 'trailingComments'
    ) {
      return;
    }
    const child = node[key];
    if (child && typeof child === 'object') visit(child, onNode);
  });
}

// Parses a whole source file (JSX allowed) and returns the line numbers
// (1-based) of the specifiers of forbidden module loads. Comments, strings,
// regexes, division, JSX and multi-line forms are the parser's business.
// Template interpolation is executed code, so `${require('fs')}` counts. A file
// that does not parse throws an error naming it.
function findViolationLines(source, filename = '<source>') {
  let ast;
  try {
    ast = parser.parse(source, {
      sourceType: 'module',
      allowReturnOutsideFunction: true,
      plugins: ['jsx'],
    });
  } catch (error) {
    throw new Error(`Cannot parse ${filename}: ${error.message}`);
  }
  const lines = [];
  visit(ast.program, node => {
    const specifierNode = loadedSpecifierNode(node);
    const specifier = specifierOf(specifierNode);
    if (specifier !== null && FORBIDDEN_SPECIFIER.test(specifier)) {
      lines.push(specifierNode.loc.start.line);
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
      findViolationLines(sourceLines.join('\n'), file).forEach(lineNumber => {
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
