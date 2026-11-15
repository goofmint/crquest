import {
  createModuleLoader,
  scanRequires,
} from '../../../js/app/common/moduleLoader';
import {
  getBuiltIn,
  isAllowedBuiltIn,
} from '../../../js/app/common/moduleAllowlist';

// In-memory file system. `files` maps absolute paths to source text; an entry
// whose value is an Error is thrown when that file is read or stat'ed.
function createMemoryLoader(files) {
  const missing = () => Object.assign(new Error('missing'), { code: 'ENOENT' });
  return createModuleLoader({
    readFile: async name => {
      if (!(name in files)) throw missing();
      if (files[name] instanceof Error) throw files[name];
      return files[name];
    },
    stat: async name => {
      const isDirectory = Object.keys(files).some(f => f.startsWith(`${name}/`));
      if (!(name in files) && !isDirectory) throw missing();
      if (files[name] instanceof Error) throw files[name];
      return {
        isFile: () => name in files,
        isDirectory: () => isDirectory,
      };
    },
    isAllowed: isAllowedBuiltIn,
    getAllowed: getBuiltIn,
  });
}

describe('moduleLoader error reporting (in-memory file system)', () => {
  describe('package.json of a required directory', () => {
    it('reports a package.json that is not valid JSON with its path', async () => {
      const loader = createMemoryLoader({
        '/entry.js': 'module.exports = require("./pkg");',
        '/pkg/package.json': '{ not json',
        '/pkg/index.js': 'module.exports = 1;',
      });
      await expect(loader.load('/entry.js')).rejects.toMatchObject({
        code: 'ERR_MODULE_JSON',
        message: expect.stringContaining('/pkg/package.json'),
      });
    });

    it('reports a "main" entry that does not exist', async () => {
      const loader = createMemoryLoader({
        '/entry.js': 'module.exports = require("./pkg");',
        '/pkg/package.json': '{ "main": "./lib/gone.js" }',
        '/pkg/index.js': 'module.exports = "index must not be used";',
      });
      await expect(loader.load('/entry.js')).rejects.toMatchObject({
        code: 'MODULE_NOT_FOUND',
        message: expect.stringContaining('"./lib/gone.js"'),
      });
    });

    it('uses index.js when package.json declares no main', async () => {
      const loader = createMemoryLoader({
        '/entry.js': 'module.exports = require("./pkg");',
        '/pkg/package.json': '{ "name": "pkg" }',
        '/pkg/index.js': 'module.exports = "index";',
      });
      await expect(loader.load('/entry.js')).resolves.toBe('index');
    });
  });

  describe('file system errors other than "not found"', () => {
    it('propagates a failing stat of a required file', async () => {
      const denied = Object.assign(new Error('denied'), { code: 'EACCES' });
      const loader = createMemoryLoader({
        '/entry.js': 'module.exports = require("./secret");',
        '/secret.js': denied,
      });
      await expect(loader.load('/entry.js')).rejects.toBe(denied);
    });

    it('propagates a failing read of the entry file unchanged', async () => {
      const denied = Object.assign(new Error('denied'), { code: 'EACCES' });
      const loader = createModuleLoader({
        readFile: async () => {
          throw denied;
        },
        stat: async () => ({ isFile: () => true, isDirectory: () => false }),
        isAllowed: isAllowedBuiltIn,
        getAllowed: getBuiltIn,
      });
      await expect(loader.load('/entry.js')).rejects.toBe(denied);
    });

    it('reports a missing entry file as MODULE_NOT_FOUND', async () => {
      const loader = createMemoryLoader({});
      await expect(loader.load('/entry.js')).rejects.toMatchObject({
        code: 'MODULE_NOT_FOUND',
        message: expect.stringContaining('/entry.js'),
      });
    });
  });

  describe('the require function given to a module', () => {
    it.each([undefined, null, 42, {}, ''])(
      'rejects the specifier %p',
      async specifier => {
        const loader = createMemoryLoader({
          '/entry.js': `module.exports = () => require(${JSON.stringify(specifier)});`,
        });
        // JSON.stringify(undefined) is undefined: the call is require(undefined)
        const run = await loader.load('/entry.js');
        expect(run).toThrow(
          expect.objectContaining({ code: 'ERR_INVALID_ARG_TYPE' })
        );
      }
    );

    it('require.resolve returns the absolute path or the built-in name', async () => {
      // Only literal require("...") calls are preloaded, so each specifier is
      // also required once.
      const loader = createMemoryLoader({
        '/dir/entry.js': [
          'require("./dep"); require("path");',
          'module.exports = [require.resolve("./dep"), require.resolve("path")];',
        ].join('\n'),
        '/dir/dep.js': 'module.exports = 1;',
      });
      await expect(loader.load('/dir/entry.js')).resolves.toEqual([
        '/dir/dep.js',
        'path',
      ]);
    });

    it('require.resolve of a specifier that was not preloaded fails explicitly', async () => {
      const loader = createMemoryLoader({
        '/entry.js': 'module.exports = () => require.resolve("./never-required");',
        '/never-required.js': 'module.exports = 1;',
      });
      const run = await loader.load('/entry.js');
      expect(run).toThrow(
        expect.objectContaining({ code: 'ERR_MODULE_NOT_PRELOADED' })
      );
    });
  });
});

describe('scanRequires with malformed unicode escapes', () => {
  it.each([
    ['an out-of-range code point', String.raw`require('a\u{110000}')`],
    ['non-hex digits in braces', String.raw`require('a\u{zz}')`],
    ['an unterminated brace', String.raw`require('a\u{41')`],
    ['a short \\u escape', String.raw`require('a\u12')`],
    ['a short \\x escape', String.raw`require('a\x4')`],
  ])('skips a literal with %s', (_label, source) => {
    expect(scanRequires(source)).toEqual([]);
  });

  it('decodes well-formed braced and 4-digit escapes', () => {
    expect(scanRequires(String.raw`require('\u{1F600}') require('A')`)).toEqual([
      '\u{1F600}',
      'A',
    ]);
  });
});
