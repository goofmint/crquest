import path from 'path';
import jetpack from 'fs-jetpack';
import { scanRequires } from '../../../js/app/common/moduleLoader';
import { isAllowedBuiltIn } from '../../../js/app/common/moduleAllowlist';

// Every JavaScript file shipped under public/content (the vendored game
// content) may only require relative files, JSON, and modules on the loader's
// allowlist: nothing in the content may depend on Node-only APIs (fs,
// child_process, vm, electron, ...), because the content has to run in a
// webview without Node (Phase 5, task 5h). The per-package vendored*.test.js
// files check that the entry points load; this test scans EVERY file.

const CONTENT_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'public',
  'content'
);

// Known exceptions. Each entry is `<path under public/content>: <specifier>`.
// The test fails when a new violation appears AND when one of these stops
// being a violation (remove it from the list then).
const KNOWN_DISALLOWED_REQUIRES = [
  // Build-time script (not loaded at runtime, see content-layout.md): it needs
  // fs and is kept for provenance only.
  'twilioquest-base/scripts/extendTilesetIds.js: fs',
  // Learner-facing example code shown in the QuestIDE (it is executed in the
  // code runner, not loaded by the game). It needs a Node API the planned Web
  // Worker does not offer: product decision pending, see
  // content-twilioquest-api-academy.md (section 5).
  'twilioquest-api-academy/levels/lovelace_tower/objectives/api-02-async-await/example.js: fs',
];

// `require(...)` calls whose argument is not a string literal cannot be
// preloaded by the loader.
const KNOWN_NON_LITERAL_REQUIRES = [
  // objects/tq-npc/builder.js: require(`./animations/${npcName}`), tracked for
  // the ticket that switches requireFromExtension to the loader.
  'twilioquest-base/objects/tq-npc/builder.js',
];

// A `require(` call is literal only if its WHOLE argument is a single string
// literal (a template literal without `${}` counts). `require('f' + 's')`,
// `require(name)` and `require(`./x/${name}`)` are all non-literal.
const REQUIRE_CALL = /(?:^|[^.\w$])require\s*\(/g;
const SINGLE_LITERAL_ARGUMENT = /^\s*(?:'[^'\\\n]*'|"[^"\\\n]*"|`[^`$\\]*`)\s*,?\s*\)/;

export const hasNonLiteralRequire = source => {
  REQUIRE_CALL.lastIndex = 0;
  let match = REQUIRE_CALL.exec(source);
  while (match) {
    const rest = source.slice(match.index + match[0].length);
    if (!SINGLE_LITERAL_ARGUMENT.test(rest)) {
      return true;
    }
    match = REQUIRE_CALL.exec(source);
  }
  return false;
};

const isRelative = specifier =>
  specifier.startsWith('./') || specifier.startsWith('../');

const toPosix = file => file.split(path.sep).join('/');

const contentFiles = () =>
  jetpack
    .cwd(CONTENT_PATH)
    .find({ matching: ['**/*.js', '!**/node_modules/**'] })
    .map(toPosix)
    .sort();

describe('public/content requires', () => {
  const files = contentFiles();

  test('the vendored content is present', () => {
    expect(files.length).toBeGreaterThan(400);
    [
      'twilioquest-base',
      'twilioquest-dev-fundamentals',
      'twilioquest-javascript',
      'twilioquest-python',
      'twilioquest-open-source',
      'twilioquest-api-academy',
      'owls-nest-extension',
    ].forEach(name => {
      expect(files.some(file => file.startsWith(`${name}/`))).toBe(true);
    });
  });

  test('only relative files and allowlisted modules are required (known exceptions listed)', () => {
    const violations = [];
    files.forEach(file => {
      scanRequires(jetpack.cwd(CONTENT_PATH).read(file)).forEach(specifier => {
        if (!isRelative(specifier) && !isAllowedBuiltIn(specifier)) {
          violations.push(`${file}: ${specifier}`);
        }
      });
    });

    expect(violations.sort()).toEqual([...KNOWN_DISALLOWED_REQUIRES].sort());
  });

  test('no require has a non-literal argument (known exceptions listed)', () => {
    const nonLiteral = files.filter(file =>
      hasNonLiteralRequire(jetpack.cwd(CONTENT_PATH).read(file))
    );

    expect(nonLiteral).toEqual(KNOWN_NON_LITERAL_REQUIRES);
  });
});

describe('hasNonLiteralRequire', () => {
  test.each([
    ["require('fs')", false],
    ['require("./a.json")', false],
    ["require( 'a' )", false],
    ['require(`./a`)', false],
    ["const x = require('a'), y = require('b');", false],
    ["require('f' + 's')", true],
    ['require("c" + "hild_process")', true],
    ['require(name)', true],
    ['require(`./animations/${name}`)', true],
    ["obj.require(name)", false],
    ["// no calls here", false],
  ])('%s', (source, expected) => {
    expect(hasNonLiteralRequire(source)).toBe(expected);
  });
});
