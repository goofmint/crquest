// Runs code built with `--mode tauri` (the real vite.config.mjs, with
// moduleAllowlist.js as the entry) in a vm context that has no `require`, no
// `process`, no `Buffer` and no Node module system, like a Tauri webview, to
// check the browser implementations of path/events/util/assert/url (W2).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { build } from 'vite';

const root = path.resolve(__dirname, '../../../../..');

describe('Node builtin replacements in the Tauri build', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  let api;

  beforeAll(async () => {
    // The build removes unused exports of an entry, so the entry stores the
    // module in a global instead
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tq-builtins-'));
    const entry = path.join(dir, 'entry.js');
    const allowlist = path.join(root, 'src/js/app/common/moduleAllowlist.js');
    fs.writeFileSync(
      entry,
      `import * as allowlist from ${JSON.stringify(allowlist)};\nglobalThis.api = allowlist;\n`
    );
    let outputs;
    try {
      const result = await build({
        configFile: path.join(root, 'vite.config.mjs'),
        mode: 'tauri',
        logLevel: 'silent',
        build: { write: false, rolldownOptions: { input: entry } },
      });
      outputs = Array.isArray(result) ? result.flatMap(r => r.output) : result.output;
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    const chunks = outputs.filter(o => o.type === 'chunk');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].code).not.toMatch(/^(import|export) /m);
    const context = vm.createContext({ URL, URLSearchParams, queueMicrotask, console });
    vm.runInContext(chunks[0].code, context);
    api = context.api;
  }, 120000);

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  test('the context has no Node module system', () => {
    const context = vm.createContext({});
    expect(vm.runInContext('typeof require + typeof process + typeof Buffer', context)).toBe(
      'undefinedundefinedundefined'
    );
  });

  test('the extension allowlist loads and exposes path, assert and util', () => {
    expect(api.isAllowedBuiltIn('path')).toBe(true);
    expect(api.isAllowedBuiltIn('fs')).toBe(false);
    const { path: posix, assert, util } = api.BUILT_IN_MODULES;
    expect(posix.join('/a', 'b', '../c.txt')).toBe('/a/c.txt');
    expect(posix.basename('/a/b/c.txt', '.txt')).toBe('c');
    expect(posix.extname('c.tar.gz')).toBe('.gz');
    expect(posix.dirname('/a/b/c')).toBe('/a/b');
    expect(posix.resolve('/a', 'b', '..', 'c')).toBe('/a/c');
    expect(posix.sep).toBe('/');
    expect(() => assert.strictEqual(1, 2)).toThrow();
    expect(() => assert.deepStrictEqual({ a: [1] }, { a: [1] })).not.toThrow();
    expect(util.format('%s=%d', 'a', 1)).toBe('a=1');
    expect(util.inspect({ a: 1 })).toBe('{ a: 1 }');
  });

  test('path.resolve has no process.cwd() to fall back to: relative-only input throws', () => {
    // The path-browserify implementation needs a cwd for a relative result
    expect(() => api.BUILT_IN_MODULES.path.resolve('a', 'b')).toThrow();
  });
});
