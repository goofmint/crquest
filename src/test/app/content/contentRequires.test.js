import path from 'path';
import jetpack from 'fs-jetpack';
import {
  scanRequires,
  scanNonLiteralRequires,
} from '../../../js/app/common/moduleLoader';
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
  // Learner-facing example code shown in the QuestIDE: it is content for the
  // learner, not host code, and the game never loads it. The learner's own
  // `require("fs").promises.readdir` is provided to the validator's Web Worker by
  // the `fs` mock of evaluateInQuestIdeUserCodeLocalScope (validator.js of the
  // objective); the QuestIDE runner's Worker has no `require`, a known gap, see
  // validation-helper-worker.md and content-twilioquest-api-academy.md.
  'twilioquest-api-academy/levels/lovelace_tower/objectives/api-02-async-await/example.js: fs',
];

// `require(...)` calls whose argument is not a constant string cannot be
// preloaded by the loader (see scanNonLiteralRequires for the exact rule).
// Known exceptions: `<path under public/content>: <number of such calls>`.
// An additional call in an already listed file raises its count and fails the
// test; so does a listed file that no longer has exactly that many.
const KNOWN_NON_LITERAL_REQUIRES = {
  // objects/tq-npc/builder.js: require(`./animations/${npcName}`). Handled by
  // the explicit preload hint in moduleRequireHints.js (kept in sync by
  // moduleRequireHints.test.js).
  'twilioquest-base/objects/tq-npc/builder.js': 1,
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

  test('no require has a non-literal argument (known exceptions listed with their count)', () => {
    const counts = {};
    files.forEach(file => {
      const calls = scanNonLiteralRequires(
        jetpack.cwd(CONTENT_PATH).read(file)
      );
      if (calls.length > 0) {
        counts[file] = calls.length;
      }
    });

    expect(counts).toEqual(KNOWN_NON_LITERAL_REQUIRES);
  });
});
