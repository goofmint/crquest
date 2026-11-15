vi.mock('../../../../../js/app/common/analytics', () => ({
  __esModule: true,
  default: { analyticsId: 'test-id' },
}));
vi.mock('../../../../../js/app/common/world', () => ({
  __esModule: true,
  default: vi.fn(),
}));
vi.mock('../../../../../js/app/config/config', async () => {
  const nodeOs = await import('node:os');
  const nodePath = await import('node:path');
  return {
    __esModule: true,
    default: {
      codeStoragePath: nodePath.join(nodeOs.tmpdir(), `tq-pullvars-${process.pid}`),
      codeStorageFileName: 'code.js',
    },
  };
});
vi.mock('../../../../../js/app/common/context', () => ({
  getContext: vi.fn(() => ({ levelName: 'current-level' })),
}));
vi.mock('../../../../../js/app/common/fs_utils', async () => {
  const nodePath = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  return {
    staticFileUrl: relativePath =>
      pathToFileURL(
        nodePath.resolve(__dirname, '..', '..', '..', '..', '..', '..', 'public', relativePath)
      ).href,
  };
});

import fs from 'fs';
import os from 'os';
import path from 'path';
import ValidationHelper from '../../../../../js/app/components/hack_interface/validator/ValidationHelper';
import { NodeWorker } from '../../../../utils/nodeWorker';

// pullVarsFromUserCodeLocalScope / pullVarsFromQuestIdeUserCodeLocalScope with
// the real worker script (NodeWorker over worker_threads), replacing the former
// vm based tests (values, an `_error` ReferenceError for a missing variable, a
// thrown error for code that throws). Functions and classes are the one
// deliberate difference: they used to be returned and now reject.

const CODE_STORAGE = path.join(os.tmpdir(), `tq-pullvars-${process.pid}`);

const makeHelper = () =>
  new ValidationHelper(
    { context: {}, env: {}, validationFields: {} },
    vi.fn(),
    {}
  );

beforeAll(() => {
  vi.stubGlobal('Worker', NodeWorker);
});
afterAll(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  fs.rmSync(CODE_STORAGE, { recursive: true, force: true });
});

describe('pullVarsFromUserCodeLocalScope', () => {
  const pull = (code, keys) => makeHelper().pullVarsFromUserCodeLocalScope(code, keys);

  test('returns the requested top-level variables (var, let, const)', async () => {
    const vars = await pull(
      `var s = 'OFF'; let n = 7; const b = true; const list = ['a', 1, null]; const o = { x: { y: [1] } }; const nothing = null;`,
      ['s', 'n', 'b', 'list', 'o', 'nothing']
    );
    expect(vars).toEqual({
      s: 'OFF',
      n: 7,
      b: true,
      list: ['a', 1, null],
      o: { x: { y: [1] } },
      nothing: null,
    });
    expect(vars._error).toBeUndefined();
  });

  test('returns an object with no keys for no keys', async () => {
    expect(await pull('const a = 1;')).toEqual({});
  });

  test('records a ReferenceError for a missing variable in _error and keeps the earlier ones', async () => {
    const vars = await pull('const a = 1;', ['a', 'missing', 'b']);
    expect(vars.a).toBe(1);
    expect(vars._error.name).toBe('ReferenceError');
    expect(vars._error.message).toBe('missing is not defined');
    expect('b' in vars).toBe(false);
  });

  test('a variable in the temporal dead zone is an _error too', async () => {
    const vars = await pull('const x = y; const y = 1;', ['y']).catch(error => error);
    // the code itself throws first
    expect(vars).toBeInstanceOf(Error);
    expect(vars.name).toBe('ReferenceError');
  });

  test('rejects when the code itself throws, keeping the error', async () => {
    const error = await pull('throw new TypeError("boom");', ['a']).catch(e => e);
    expect(error.name).toBe('TypeError');
    expect(error.message).toBe('boom');
  });

  test('rejects on a syntax error', async () => {
    await expect(pull('const = ;', ['a'])).rejects.toMatchObject({ name: 'SyntaxError' });
  });

  test.each([
    ['a function', 'function f() { return 2; }', 'f'],
    ['an arrow function', 'const f = () => 2;', 'f'],
    ['a class', 'class C {}', 'C'],
    ['a symbol', 'const f = Symbol("s");', 'f'],
    ['an object holding a function', 'const f = { run() {} };', 'f'],
  ])('rejects naming the variable when %s is requested (no function-valued pullVars)', async (_name, code, key) => {
    await expect(pull(code, [key])).rejects.toThrow(
      new RegExp(`Variable "${key}" \\((function|class|symbol|object)\\) cannot be returned`)
    );
  });

  test('can still read the data variables of code that also defines functions', async () => {
    expect(await pull('const a = 1; function f() {}', ['a'])).toEqual({ a: 1 });
  });

  test('has an empty process.env and no require / window', async () => {
    const vars = await pull(
      'const env = Object.keys(process.env).length; const hasRequire = typeof require; const hasWindow = typeof window;',
      ['env', 'hasRequire', 'hasWindow']
    );
    expect(vars).toEqual({ env: 0, hasRequire: 'undefined', hasWindow: 'undefined' });
  });

  test('has String.prototype.replaceAll and fetch', async () => {
    const vars = await pull('const r = "a-b-c".replaceAll("-", "+"); const f = typeof fetch;', [
      'r',
      'f',
    ]);
    expect(vars).toEqual({ r: 'a+b+c', f: 'function' });
  });
});

describe('pullVarsFromQuestIdeUserCodeLocalScope', () => {
  const save = (mission, objective, code) => {
    const directory = path.join(CODE_STORAGE, mission, objective);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'code.js'), code);
  };

  test('reads the saved code of the given mission and objective', async () => {
    save('mission', 'obj', 'var answer = 42;');
    expect(
      await makeHelper().pullVarsFromQuestIdeUserCodeLocalScope(['answer'], 'obj', 'mission')
    ).toEqual({ answer: 42 });
  });

  test('defaults to the current level', async () => {
    save('current-level', 'obj', 'var answer = 1;');
    expect(
      await makeHelper().pullVarsFromQuestIdeUserCodeLocalScope(['answer'], 'obj')
    ).toEqual({ answer: 1 });
  });

  test('rejects when the saved code does not exist', async () => {
    await expect(
      makeHelper().pullVarsFromQuestIdeUserCodeLocalScope(['a'], 'nope', 'mission')
    ).rejects.toThrow(/ENOENT/);
  });
});
