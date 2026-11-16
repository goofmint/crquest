const {
  isModuleLoadViolation,
  findViolationLines,
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
    "/* import 'electron' */",
    "const x = 1; // require('fs')",
    "const url = 'electron';",
  ])('does not flag %s', line => {
    expect(isModuleLoadViolation(line)).toBe(false);
  });

  it('flags a require whose specifier is on the next line', () => {
    expect(findViolationLines("const fs = require(\n  'fs'\n);")).toEqual([2]);
  });

  it('flags a multi-line dynamic import', () => {
    expect(
      findViolationLines("const m = await import(\n  'node:fs'\n);")
    ).toEqual([2]);
  });

  it('flags a multi-line import whose from clause is on a later line', () => {
    expect(
      findViolationLines("import {\n  readFile,\n  writeFile,\n} from\n  'fs';")
    ).toEqual([5]);
  });

  it('ignores a require inside a multi-line block comment', () => {
    expect(
      isModuleLoadViolation("/*\n * note:\n require('fs');\n */\nconst a = 1;")
    ).toBe(false);
  });

  it('ignores module-loading text inside strings and templates', () => {
    expect(isModuleLoadViolation('const example = "require(\'fs\')";')).toBe(
      false
    );
    expect(
      isModuleLoadViolation("const example = `import fs from 'fs'`;")
    ).toBe(false);
    expect(
      isModuleLoadViolation("const example = 'import fs from \\'fs\\'';")
    ).toBe(false);
  });

  it('is not confused by regex literals, member calls and JSX apostrophes', () => {
    expect(
      isModuleLoadViolation("const r = /'/; const s = require('fs');")
    ).toBe(true);
    expect(isModuleLoadViolation("const r = /require\\('fs'\\)/;")).toBe(false);
    expect(isModuleLoadViolation("loader.require('fs');")).toBe(false);
    expect(
      isModuleLoadViolation("const a = <p>don't</p>;\nconst b = require('fs');")
    ).toBe(true);
  });

  it('reports the line of the specifier', () => {
    expect(findViolationLines("\n\nimport x from 'fs';\n")).toEqual([3]);
  });
});
