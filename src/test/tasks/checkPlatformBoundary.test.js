const {
  isModuleLoadViolation,
  collectViolations,
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
    "import {\n} from 'fs';",
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
    "const m = {\n  'fs': mockFs,\n};",
    'const m = {\n  "fs": { readFile() {} },\n};',
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

  it('flags a require after a division', () => {
    expect(
      findViolationLines("const n = 4 / 2; const fs = require('fs');")
    ).toEqual([1]);
  });

  it('flags a require inside a template interpolation', () => {
    expect(findViolationLines("const s = `${require('fs')}`;")).toEqual([1]);
  });

  it('reports the right line in JSX after closing tags', () => {
    expect(
      findViolationLines(
        "const a = <p>Hello</p>;\nconst b = <div>x</div>;\nconst fs = require('fs');"
      )
    ).toEqual([3]);
  });

  it('fails explicitly on a file that does not parse', () => {
    expect(() => findViolationLines('const = ;', 'src/js/broken.js')).toThrow(
      /Cannot parse src\/js\/broken.js/
    );
  });

  it('reports the line of the specifier', () => {
    expect(findViolationLines("\n\nimport x from 'fs';\n")).toEqual([3]);
  });

  describe('collectViolations with unusual tracked file names', () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const { spawnSync } = require('child_process');
    const MOCK = "const mocks = { 'fs': 1 };\n";
    const REAL = "const fs = require('fs');\n";
    let root;

    function makeRepo(files) {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'boundary-'));
      fs.mkdirSync(path.join(root, 'src', 'js'), { recursive: true });
      Object.keys(files).forEach(name => {
        fs.writeFileSync(path.join(root, 'src', 'js', name), files[name]);
      });
      const git = args => {
        const r = spawnSync('git', args, { cwd: root });
        expect(r.status).toBe(0);
      };
      git(['init', '-q']);
      git(['add', '.']);
      return root;
    }

    afterEach(() => {
      fs.rmSync(root, { recursive: true, force: true });
    });

    it.each(['\u65e5\u672c\u8a9e.js', 'a:b.js'])(
      'passes for a mock key only in %s',
      name => {
        expect(collectViolations(makeRepo({ [name]: MOCK }))).toEqual([]);
      }
    );

    it('reports a real violation in a non-ASCII file name', () => {
      const name = '\u65e5\u672c\u8a9e.js';
      expect(collectViolations(makeRepo({ [name]: REAL }))).toEqual([
        `src/js/${name}:1:${REAL.trim()}`,
      ]);
    });

    it('reports a real violation in a file name with a colon', () => {
      expect(collectViolations(makeRepo({ 'a:b.js': REAL }))).toEqual([
        `src/js/a:b.js:1:${REAL.trim()}`,
      ]);
    });
  });
});
