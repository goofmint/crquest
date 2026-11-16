const {
  isModuleLoadViolation,
  isViolationGrepLine,
} = require('../../../tasks/check_platform_boundary');

describe('check_platform_boundary judging', () => {
  it.each([
    "import fs from 'fs';",
    "import { readFile } from 'node:fs';",
    "import * as p from 'fs/promises';",
    "import jetpack from 'fs-jetpack';",
    "import { ipcRenderer } from 'electron';",
    "import isDev from 'electron-is-dev';",
    "import 'fs';",
    "} from 'fs';",
    "export { readFile } from 'node:fs';",
    "export * from 'fs-jetpack';",
    "const fs = require('fs');",
    'const j = require("fs-jetpack");',
    "const { app } = require( 'electron' );",
    "const m = await import('node:fs/promises');",
    "import('fs').then(x => x); // comment",
    "/* c */ const fs = require('fs');",
  ])('flags %s', line => {
    expect(isModuleLoadViolation(line)).toBe(true);
  });

  it.each([
    "      'fs': mockFs,",
    '      "fs": { readFile() {} },',
    "const mocks = { fs: 1, 'fs-jetpack': 2 };",
    "// import fs from 'fs';",
    "  // const fs = require('fs');",
    " * require('fs') is not allowed here",
    "/* import 'electron' */",
    "const x = 1; // require('fs')",
    "const url = 'electron';",
  ])('does not flag %s', line => {
    expect(isModuleLoadViolation(line)).toBe(false);
  });

  it('judges git grep output lines by their source text', () => {
    expect(isViolationGrepLine("src/js/a.js:3:import fs from 'fs';")).toBe(true);
    expect(isViolationGrepLine("src/js/a.js:3:  'fs': mock,")).toBe(false);
  });

  it('throws on a malformed git grep line', () => {
    expect(() => isViolationGrepLine('garbage')).toThrow();
  });
});
