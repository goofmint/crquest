import path from 'path';
import * as fsPlatform from '../../../js/app/platform/fs';
import {
  createModuleLoader,
  scanRequires,
  loadModule,
  invalidateModule,
  invalidateAllModules,
  isModuleCached,
} from '../../../js/app/common/moduleLoader';
import {
  getBuiltIn,
  isAllowedBuiltIn,
  BUILT_IN_MODULES,
} from '../../../js/app/common/moduleAllowlist';
import * as modulePath from '../../../js/app/common/modulePath';

const FIXTURES = path.resolve(
  __dirname,
  '..',
  '..',
  'fixtures',
  'moduleLoader'
);
const fixture = (...segments) =>
  modulePath.normalize(path.join(FIXTURES, ...segments));

const createLoader = (readFile = fsPlatform.readFile) =>
  createModuleLoader({
    readFile,
    stat: fsPlatform.stat,
    isAllowed: isAllowedBuiltIn,
    getAllowed: getBuiltIn,
  });

describe('moduleLoader', () => {
  let loader;

  beforeEach(() => {
    loader = createLoader();
    delete globalThis.__moduleLoaderFixtureEvaluations;
  });

  describe('resolution', () => {
    it('loads relative modules, extension probing, directory index, package main and JSON', async () => {
      const entry = await loader.load(fixture('entry.js'));

      expect(entry.helper.name).toBe('helper');
      expect(entry.helper.nested).toBe('nested-value');
      expect(entry.helper.parentDir).toBe('dir-index');
      expect(entry.data).toEqual({ answer: 42, list: [1, 2, 3] });
      expect(entry.dirModule).toEqual({ marker: 'dir-index' });
      expect(entry.pkgModule).toEqual({ marker: 'pkg-main' });
    });

    it('resolves relative requires of a module located at the file system root', async () => {
      const files = {
        '/entry.js': "module.exports = require('./child.js');",
        '/child.js': 'module.exports = "root-child";',
      };
      const rootLoader = createModuleLoader({
        readFile: async file => files[file],
        stat: async file => ({
          isFile: () => file in files,
          isDirectory: () => false,
        }),
        isAllowed: isAllowedBuiltIn,
        getAllowed: getBuiltIn,
      });

      await expect(rootLoader.load('/entry.js')).resolves.toBe('root-child');
    });

    it('provides module scope variables', async () => {
      const entry = await loader.load(fixture('entry.js'));

      expect(entry.filename).toBe(fixture('entry.js'));
      expect(entry.dirname).toBe(modulePath.normalize(FIXTURES));
      expect(entry.thisIsExports).toBe(true);
      expect(entry.exportsIsModuleExports).toBe(true);
    });

    it('loads a JSON file as an entry point', async () => {
      await expect(loader.load(fixture('lib', 'data.json'))).resolves.toEqual({
        answer: 42,
        list: [1, 2, 3],
      });
    });

    it('accepts a shebang line', async () => {
      await expect(loader.load(fixture('shebang.js'))).resolves.toBe(
        'shebang-ok'
      );
    });

    it('requires a relative entry point to be absolute', async () => {
      await expect(loader.load('./entry.js')).rejects.toMatchObject({
        code: 'ERR_INVALID_ARG_VALUE',
      });
    });

    it('reports a missing entry file', async () => {
      await expect(loader.load(fixture('nope.js'))).rejects.toMatchObject({
        code: 'MODULE_NOT_FOUND',
        message: expect.stringContaining(fixture('nope.js')),
      });
    });
  });

  describe('built-in allowlist', () => {
    it('provides the allowlisted modules', async () => {
      const exported = await loader.load(fixture('uses-builtins.js'));

      expect(exported.path).toBe(BUILT_IN_MODULES.path);
      expect(typeof exported.assert).toBe('function');
      expect(typeof exported.util.inspect).toBe('function');
      expect(exported.merge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
      expect(exported.isEqual({ a: [1] }, { a: [1] })).toBe(true);
      expect(exported.esprima.parseScript('1 + 1').type).toBe('Program');
      expect(typeof exported.uuid.v4).toBe('function');
      expect(typeof exported.compareVersions).toBe('function');
      expect(typeof exported.uuid.v4).toBe('function');
      expect(typeof exported.compareVersions).toBe('function');
    });

    it.each(['fs', 'child_process', 'electron', 'vm', 'twilio'])(
      'rejects the non-allowlisted module "%s" naming specifier and requiring file',
      async specifier => {
        const file = fixture(`requires-${specifier}.js`);
        const error = await loader.load(file).catch(e => e);

        expect(error.code).toBe('ERR_MODULE_NOT_ALLOWED');
        expect(error.message).toContain(`"${specifier}"`);
        expect(error.message).toContain(file);
      }
    );

    it('registers only explicit entries', () => {
      expect(isAllowedBuiltIn('path')).toBe(true);
      expect(isAllowedBuiltIn('node:path')).toBe(false);
      expect(isAllowedBuiltIn('toString')).toBe(false);
      expect(() => getBuiltIn('fs')).toThrow(
        /not on the built-in module allowlist/
      );
    });
  });

  describe('errors', () => {
    it('names the specifier and the requiring file when a module is missing', async () => {
      const file = fixture('requires-missing.js');
      const error = await loader.load(file).catch(e => e);

      expect(error.code).toBe('MODULE_NOT_FOUND');
      expect(error.message).toContain('"./does-not-exist"');
      expect(error.message).toContain(file);
    });

    it('does not fail loading for an unexecuted lazy require, but throws when it runs', async () => {
      const exported = await loader.load(fixture('lazy-missing.js'));

      expect(exported.works).toBe(true);
      expect(() => exported.fail()).toThrow(
        /Cannot find module "\.\/does-not-exist"/
      );
    });

    it('throws explicitly for a non-literal require that was not preloaded', async () => {
      const exported = await loader.load(fixture('dynamic.js'));

      expect(() => exported()).toThrow(/not found by the static scan/);
    });

    it('wraps a syntax error with the module path', async () => {
      const error = await loader.load(fixture('syntax-error.js')).catch(e => e);

      expect(error.code).toBe('ERR_MODULE_SYNTAX');
      expect(error.message).toContain(fixture('syntax-error.js'));
      expect(error.cause).toBeInstanceOf(SyntaxError);
    });

    it('reports a syntax error in a required module', async () => {
      await expect(
        loader.load(fixture('requires-syntax-error.js'))
      ).rejects.toMatchObject({ code: 'ERR_MODULE_SYNTAX' });
    });

    it('reports a JSON parse error with the path', async () => {
      const error = await loader.load(fixture('broken.json')).catch(e => e);

      expect(error.code).toBe('ERR_MODULE_JSON');
      expect(error.message).toContain(fixture('broken.json'));
      await expect(
        loader.load(fixture('requires-broken-json.js'))
      ).rejects.toMatchObject({ code: 'ERR_MODULE_JSON' });
    });

    it('propagates exceptions thrown by a module and does not cache it', async () => {
      await expect(loader.load(fixture('throws.js'))).rejects.toThrow(
        'boom from module'
      );
      expect(loader.isCached(fixture('throws.js'))).toBe(false);
      await expect(loader.load(fixture('throws.js'))).rejects.toThrow(
        'boom from module'
      );
    });
  });

  describe('cache and invalidation', () => {
    it('evaluates a module once and returns the cached exports', async () => {
      const first = await loader.load(fixture('counter.js'));
      const second = await loader.load(fixture('counter.js'));

      expect(second).toBe(first);
      expect(globalThis.__moduleLoaderFixtureEvaluations).toBe(1);
      expect(loader.isCached(fixture('counter.js'))).toBe(true);
    });

    it('re-reads and re-evaluates a module after invalidate', async () => {
      const first = await loader.load(fixture('counter.js'));

      expect(loader.invalidate(fixture('counter.js'))).toBe(true);
      expect(loader.isCached(fixture('counter.js'))).toBe(false);

      const second = await loader.load(fixture('counter.js'));

      expect(second).not.toBe(first);
      expect(second.evaluations).toBe(2);
    });

    it('invalidates only the given entry and keeps dependencies cached', async () => {
      await loader.load(fixture('entry.js'));
      loader.invalidate(fixture('entry.js'));

      expect(loader.isCached(fixture('lib', 'nested.js'))).toBe(true);
      await expect(loader.load(fixture('entry.js'))).resolves.toMatchObject({
        helper: { nested: 'nested-value' },
      });
    });

    it('picks up changed source after invalidate (in-memory file system)', async () => {
      const files = { [fixture('virtual.js')]: 'module.exports = 1;' };
      const memoryLoader = createLoader(async file => {
        if (!(file in files)) {
          throw Object.assign(new Error('missing'), { code: 'ENOENT' });
        }
        return files[file];
      });

      await expect(memoryLoader.load(fixture('virtual.js'))).resolves.toBe(1);
      files[fixture('virtual.js')] = 'module.exports = 2;';
      await expect(memoryLoader.load(fixture('virtual.js'))).resolves.toBe(1);
      memoryLoader.invalidate(fixture('virtual.js'));
      await expect(memoryLoader.load(fixture('virtual.js'))).resolves.toBe(2);
    });

    it('allows a lazy require after the load finished, also after invalidating a dependency', async () => {
      const lazy = await loader.load(fixture('lazy-require.js'));

      expect(lazy()).toBe('nested-value');
      loader.invalidate(fixture('lib', 'nested.js'));
      await loader.load(fixture('lib', 'nested.js'));
      expect(lazy()).toBe('nested-value');
    });

    it('keeps lazy requires of an already exported function working after invalidating the requiring module', async () => {
      const lazy = await loader.load(fixture('lazy-require.js'));

      loader.invalidate(fixture('lazy-require.js'));

      expect(lazy()).toBe('nested-value');
    });

    it('never returns stale exports when invalidated during an in-flight load', async () => {
      const file = fixture('virtual-stale.js');
      let content = 'module.exports = "old";';
      let calls = 0;
      let releaseFirstRead;
      const staleLoader = createLoader(async () => {
        calls += 1;
        if (calls === 1) {
          const snapshot = content;
          await new Promise(resolve => {
            releaseFirstRead = resolve;
          });
          return snapshot;
        }
        return content;
      });

      const pending = staleLoader.load(file);
      await new Promise(resolve => setTimeout(resolve, 0));
      content = 'module.exports = "new";';
      staleLoader.invalidate(file);
      releaseFirstRead();

      await expect(pending).resolves.toBe('new');
      expect(calls).toBe(2);
      await expect(staleLoader.load(file)).resolves.toBe('new');
    });

    it('never throws when invalidated right after the preload finished', async () => {
      const file = '/race.js';
      for (let ticks = 0; ticks < 12; ticks += 1) {
        const files = { [file]: 'module.exports = "old";' };
        const raceLoader = createModuleLoader({
          readFile: async name => files[name],
          stat: async name => ({
            isFile: () => name in files,
            isDirectory: () => false,
          }),
          isAllowed: isAllowedBuiltIn,
          getAllowed: getBuiltIn,
        });

        const pending = raceLoader.load(file);
        let chain = Promise.resolve();
        for (let i = 0; i < ticks; i += 1) {
          chain = chain.then(() => undefined);
        }
        chain.then(() => {
          files[file] = 'module.exports = "new";';
          raceLoader.invalidate(file);
        });

        // Whatever the interleaving, the load must settle with a real result.
        // eslint-disable-next-line no-await-in-loop
        const result = await pending;
        expect(['old', 'new']).toContain(result);
      }
    });

    it('retries instead of reporting ENOENT of a read made stale by invalidate', async () => {
      const file = '/late.js';
      let calls = 0;
      let failFirstRead;
      const lateLoader = createModuleLoader({
        readFile: async () => {
          calls += 1;
          if (calls === 1) {
            await new Promise((resolve, reject) => {
              failFirstRead = () =>
                reject(Object.assign(new Error('gone'), { code: 'ENOENT' }));
            });
          }
          return 'module.exports = "reloaded";';
        },
        stat: async () => ({ isFile: () => true, isDirectory: () => false }),
        isAllowed: isAllowedBuiltIn,
        getAllowed: getBuiltIn,
      });

      const pending = lateLoader.load(file);
      await new Promise(resolve => setTimeout(resolve, 0));
      lateLoader.invalidate(file);
      failFirstRead();

      await expect(pending).resolves.toBe('reloaded');
      expect(calls).toBe(2);
    });

    it('invalidateAll empties the cache', async () => {
      await loader.load(fixture('entry.js'));
      loader.invalidateAll();

      expect(loader.isCached(fixture('entry.js'))).toBe(false);
      expect(loader.isCached(fixture('lib', 'helper.js'))).toBe(false);
    });

    it('exposes the default loader on the platform file system', async () => {
      const exported = await loadModule(fixture('lib', 'data.json'));

      expect(exported.answer).toBe(42);
      expect(isModuleCached(fixture('lib', 'data.json'))).toBe(true);
      expect(invalidateModule(fixture('lib', 'data.json'))).toBe(true);
      invalidateAllModules();
      expect(isModuleCached(fixture('lib', 'data.json'))).toBe(false);
    });
  });

  describe('circular dependencies', () => {
    it('gives the partial exports to the module that closes the cycle', async () => {
      const a = await loader.load(fixture('cycle', 'a.js'));

      expect(a.late).toBe('a-late');
      expect(a.bSawA).toEqual({ early: 'a-early', late: undefined });
    });
  });

  describe('root directory and edge cases (in-memory file system)', () => {
    const createMemoryLoader = files =>
      createModuleLoader({
        readFile: async name => {
          if (!(name in files)) {
            throw Object.assign(new Error('missing'), { code: 'ENOENT' });
          }
          return files[name];
        },
        stat: async name => {
          const isDirectory = Object.keys(files).some(f =>
            f.startsWith(name === '/' ? '/' : `${name}/`)
          );
          if (!(name in files) && !isDirectory) {
            throw Object.assign(new Error('missing'), { code: 'ENOENT' });
          }
          return {
            isFile: () => name in files,
            isDirectory: () => isDirectory,
          };
        },
        isAllowed: isAllowedBuiltIn,
        getAllowed: getBuiltIn,
      });

    it('resolves require("..") and require("../") to the root directory index', async () => {
      const memoryLoader = createMemoryLoader({
        '/index.js': 'module.exports = "root-index";',
        '/dir/entry.js': 'module.exports = [require(".."), require("../")];',
      });

      await expect(memoryLoader.load('/dir/entry.js')).resolves.toEqual([
        'root-index',
        'root-index',
      ]);
    });

    it('uses the package.json main of the root directory', async () => {
      const memoryLoader = createMemoryLoader({
        '/package.json': '{ "main": "./main.js" }',
        '/main.js': 'module.exports = "root-main";',
        '/dir/entry.js': 'module.exports = require("..");',
      });

      await expect(memoryLoader.load('/dir/entry.js')).resolves.toBe(
        'root-main'
      );
    });

    it('detects a CRLF line continuation inside a require literal', async () => {
      const memoryLoader = createMemoryLoader({
        '/lib/nested.js': 'module.exports = "nested";',
        '/entry.js': 'module.exports = require("./lib/nes\\\r\nted");',
      });

      expect(scanRequires('require("./lib/nes\\\r\nted")')).toEqual([
        './lib/nested',
      ]);
      await expect(memoryLoader.load('/entry.js')).resolves.toBe('nested');
    });

    it('detects LF, CR and U+2028 line continuations', () => {
      ['\n', '\r', '\u2028', '\u2029'].forEach(terminator => {
        expect(scanRequires(`require("a\\${terminator}b")`)).toEqual(['ab']);
      });
    });

    describe('invalidation keeps preloaded data for live instances', () => {
      const setup = () => {
        const files = {
          '/a.js': 'module.exports = () => require("./b");',
          '/b.js':
            'globalThis.__mlEval = (globalThis.__mlEval || 0) + 1; module.exports = "b-v1";',
        };
        delete globalThis.__mlEval;

        return {
          files,
          memoryLoader: createMemoryLoader(files),
        };
      };

      it.each(['invalidate', 'invalidateAll'])(
        'lazy require still works after %s and a fresh load sees new content',
        async method => {
          const { files, memoryLoader } = setup();
          const lazy = await memoryLoader.load('/a.js');

          expect(memoryLoader.isCached('/b.js')).toBe(false);
          if (method === 'invalidate') {
            memoryLoader.invalidate('/b.js');
          } else {
            memoryLoader.invalidateAll();
          }
          files['/b.js'] = 'globalThis.__mlEval += 1; module.exports = "b-v2";';

          // Accepted trade-off: the preloaded (old) version is used.
          expect(lazy()).toBe('b-v1');
          expect(globalThis.__mlEval).toBe(1);

          memoryLoader.invalidate('/b.js');
          memoryLoader.invalidate('/a.js');
          const fresh = await memoryLoader.load('/a.js');

          expect(fresh()).toBe('b-v2');
          expect(globalThis.__mlEval).toBe(2);
        }
      );

      it('evicts the evaluated cache entry (re-evaluates on next load)', async () => {
        const { memoryLoader } = setup();
        const lazy = await memoryLoader.load('/a.js');
        lazy();

        expect(memoryLoader.isCached('/b.js')).toBe(true);
        expect(memoryLoader.invalidate('/b.js')).toBe(true);
        expect(memoryLoader.isCached('/b.js')).toBe(false);
        expect(lazy()).toBe('b-v1');
        expect(globalThis.__mlEval).toBe(2);
      });
    });

    it('does not leak a failed lazily required child in parent.children', async () => {
      const memoryLoader = createMemoryLoader({
        '/bad.js': 'throw new Error("bad child");',
        '/good.js': 'module.exports = 1;',
        '/parent.js': `
          require('./good');
          module.exports = {
            module,
            retry() {
              try { require('./bad'); } catch (e) { return e.message; }
              return null;
            },
          };`,
      });
      const parent = await memoryLoader.load('/parent.js');

      expect(parent.retry()).toBe('bad child');
      expect(parent.retry()).toBe('bad child');
      expect(parent.module.children.map(child => child.filename)).toEqual([
        '/good.js',
      ]);
    });
  });

  describe('atomic publication and versioned cache', () => {
    const deferred = () => {
      const result = {};
      result.promise = new Promise(resolve => {
        result.resolve = resolve;
      });

      return result;
    };
    const makeLoader = (files, hooks = {}) =>
      createModuleLoader({
        readFile: async name => {
          if (hooks.beforeRead) {
            await hooks.beforeRead(name);
          }
          return files[name];
        },
        stat: async name => {
          if (hooks.beforeStat) {
            await hooks.beforeStat(name);
          }
          if (!(name in files)) {
            throw Object.assign(new Error('missing'), { code: 'ENOENT' });
          }
          return { isFile: () => true, isDirectory: () => false };
        },
        isAllowed: isAllowedBuiltIn,
        getAllowed: getBuiltIn,
      });

    it('a live instance never evaluates new source with old resolutions', async () => {
      const files = {
        '/a.js': 'module.exports = () => require("./b");',
        '/b.js': 'module.exports = "b1";',
        '/d.js': 'module.exports = "d";',
      };
      const gate = deferred();
      let gated = false;
      const atomicLoader = makeLoader(files, {
        beforeStat: async name => {
          if (gated && name === '/d.js') {
            await gate.promise;
          }
        },
      });
      const lazy = await atomicLoader.load('/a.js');

      atomicLoader.invalidate('/b.js');
      files['/b.js'] = 'module.exports = require("./d");';
      gated = true;
      const reload = atomicLoader.load('/b.js');
      await new Promise(resolve => setTimeout(resolve, 0));

      // The new b.js is read but its resolutions are still being computed.
      expect(lazy()).toBe('b1');

      gated = false;
      gate.resolve();
      await expect(reload).resolves.toBe('d');
    });

    it('load after a publish re-evaluates a module a live call evaluated from the old source', async () => {
      const files = {
        '/a.js': 'module.exports = () => require("./b");',
        '/b.js': 'module.exports = "b1";',
      };
      const gate = deferred();
      let gated = false;
      const versionLoader = makeLoader(files, {
        beforeRead: async name => {
          if (gated && name === '/b.js') {
            await gate.promise;
          }
        },
      });
      const lazy = await versionLoader.load('/a.js');

      versionLoader.invalidate('/b.js');
      files['/b.js'] = 'module.exports = "b2";';
      gated = true;
      const reload = versionLoader.load('/b.js');
      await new Promise(resolve => setTimeout(resolve, 0));

      // Live call evaluates b from the old preloaded source and caches it.
      expect(lazy()).toBe('b1');

      gated = false;
      gate.resolve();
      await expect(reload).resolves.toBe('b2');
      await expect(versionLoader.load('/b.js')).resolves.toBe('b2');
      expect(lazy()).toBe('b2');
    });

    it('does not re-evaluate a fresh module when concurrent loads share it', async () => {
      const files = {
        '/x.js': 'module.exports = require("./shared");',
        '/y.js': 'module.exports = require("./shared");',
        '/shared.js':
          'globalThis.__mlShared = (globalThis.__mlShared || 0) + 1; module.exports = {};',
      };
      delete globalThis.__mlShared;
      const sharedLoader = makeLoader(files);

      const [x, y] = await Promise.all([
        sharedLoader.load('/x.js'),
        sharedLoader.load('/y.js'),
      ]);

      expect(x).toBe(y);
      expect(globalThis.__mlShared).toBe(1);
    });
  });

  describe('escaped require specifiers', () => {
    it('keys requires by the decoded string value', async () => {
      const exported = await loader.load(fixture('escaped-require.js'));

      expect(exported).toEqual([
        'nested-value',
        'nested-value',
        'nested-value',
        'nested-value',
        'nested-value',
      ]);
    });

    it('decodes string literal escapes', () => {
      expect(
        scanRequires(
          String.raw`require('a\x41\u0042\u{43}\\d\'e\"f\101\0') require("./x\\y")`
        )
      ).toEqual(['aABC\\d\'e"fA\0', './x\\y']);
    });

    it('skips literals with invalid escapes (the module fails to compile anyway)', () => {
      expect(scanRequires(String.raw`require('a\xZZ')`)).toEqual([]);
    });
  });

  describe('scanRequires', () => {
    it('handles comments, trailing commas, hashbang and spread', () => {
      expect(
        scanRequires(
          "#!/usr/bin/env node\nrequire /* c */ ('./child'); require('./t',); require(// x\n'./n'); const o = {...require('./s')};"
        )
      ).toEqual(['./child', './t', './n', './s']);
    });

    it('ignores requires inside comments, strings, templates and regexes', () => {
      expect(
        scanRequires(
          [
            "// require('c1')",
            "/* require('c2') */",
            'const s = "require(\'s1\')";',
            "const t = `require('t1') ${require('t2')} ${`${require('t3')}`}`;",
            "const r = /require('r1')[/]/g; const d = 4 / 2; const e = a / b / c;",
            "require('real');",
          ].join('\n')
        )
      ).toEqual(['t2', 't3', 'real']);
    });

    it('treats a slash after postfix ++/-- as division', () => {
      expect(
        scanRequires("i++ / 2; require('./a'); n-- / 2 / 3; require('./b');")
      ).toEqual(['./a', './b']);
    });

    it('starts a regex after a prefix ++/--, divides after a postfix one', () => {
      expect(scanRequires("++/\"/.lastIndex; require('./dep');")).toEqual([
        './dep',
      ]);
      expect(scanRequires("a = ++/x/.lastIndex / 2; require('./b');")).toEqual([
        './b',
      ]);
      expect(scanRequires("i++ / 2; require('./a');")).toEqual(['./a']);
      expect(scanRequires("x = y-- / 2 / 3; require('./c');")).toEqual(['./c']);
      expect(
        scanRequires(
          "function f() { return ++/re'/.lastIndex; } require('./r');"
        )
      ).toEqual(['./r']);
      expect(scanRequires("x = (a)++ / 2; require('./p');")).toEqual(['./p']);
    });

    it('keeps a regex literal after a prefix or binary + / -', () => {
      expect(
        scanRequires(
          "const v = a + +/x/.lastIndex; const w = a - -/y/.lastIndex; require('./c');"
        )
      ).toEqual(['./c']);
      expect(
        scanRequires("x = a + /require('no')/.test(s); require('./d');")
      ).toEqual(['./d']);
    });

    it('scans sources newer than esprima 4 can parse', () => {
      expect(
        scanRequires(
          'const a = {...b}; const c = d?.e ?? require("./ok"); class X { #p = 1 }'
        )
      ).toEqual(['./ok']);
    });

    it('finds literal requires only', () => {
      expect(
        scanRequires(
          `require('a'); const x = require( "b" ); foo.require('c'); require(name); require("./d")`
        )
      ).toEqual(['a', 'b', './d']);
    });
  });
});

describe('modulePath', () => {
  it('normalizes POSIX paths', () => {
    expect(modulePath.normalize('/a/b/../c/./d//e')).toBe('/a/c/d/e');
    expect(modulePath.dirname('/a/b/c.js')).toBe('/a/b');
    expect(modulePath.dirname('/c.js')).toBe('/');
    expect(modulePath.resolve('/a/b', '../c.js')).toBe('/a/c.js');
    expect(modulePath.resolve('/a/b', '/x/y')).toBe('/x/y');
    expect(modulePath.resolve('/', './child.js')).toBe('/child.js');
    expect(modulePath.resolve('C:/', './x.js')).toBe('C:/x.js');
    expect(() => modulePath.resolve('/', '../x.js')).toThrow(/above its root/);
    expect(modulePath.extname('/a/b.test.js')).toBe('.js');
    expect(modulePath.extname('/a/.hidden')).toBe('');
  });

  it('handles Windows drive-letter paths and backslashes', () => {
    expect(modulePath.isAbsolute('C:\\Users\\me\\x.js')).toBe(true);
    expect(modulePath.normalize('C:\\Users\\me\\..\\x.js')).toBe(
      'C:/Users/x.js'
    );
    expect(modulePath.dirname('C:\\Users\\x.js')).toBe('C:/Users');
    expect(modulePath.dirname('C:\\x.js')).toBe('C:/');
    expect(modulePath.resolve('C:/a/b', '..\\c.json')).toBe('C:/a/c.json');
  });

  it('rejects unsupported or escaping paths', () => {
    expect(() => modulePath.normalize('\\\\server\\share\\x.js')).toThrow(
      /UNC/
    );
    expect(() => modulePath.normalize('C:foo')).toThrow(/Drive-relative/);
    expect(() => modulePath.normalize('/a/../../b')).toThrow(/above its root/);
  });
});
