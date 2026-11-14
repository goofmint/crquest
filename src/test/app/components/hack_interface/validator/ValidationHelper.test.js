jest.mock('../../../../../js/app/platform/fs', () => ({
  readFile: jest.fn(),
  readdir: jest.fn(),
  stat: jest.fn(),
  lstat: jest.fn(),
  existsAsync: jest.fn(),
  listAsync: jest.fn(),
  readAsync: jest.fn(),
  writeAsync: jest.fn(),
  copyAsync: jest.fn(),
  removeAsync: jest.fn(),
}));
jest.mock('../../../../../js/app/platform/exec', () => ({
  exec: jest.fn(),
  run: jest.fn(),
  commandExists: jest.fn(),
  pathExistsSync: jest.fn(),
}));
jest.mock('../../../../../js/app/platform/paths', () => ({
  getAppDataPath: jest.fn(),
}));
jest.mock('../../../../../js/app/common/analytics', () => ({
  __esModule: true,
  default: { analyticsId: 'test-id' },
}));
jest.mock('../../../../../js/app/common/world', () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock('../../../../../js/app/common/fs_utils', () => ({
  staticFileUrl: relativePath =>
    require('url').pathToFileURL(
      require('path').resolve(__dirname, '..', '..', '..', '..', '..', '..', 'public', relativePath)
    ).href,
}));
jest.mock('../../../../../js/app/config/config', () => ({
  __esModule: true,
  default: {
    codeStoragePath: '/code',
    codeStorageFileName: 'code.js',
  },
}));
jest.mock('../../../../../js/app/common/context', () => ({
  getContext: jest.fn(() => ({ levelName: 'current-level' })),
}));

import ValidationHelper from '../../../../../js/app/components/hack_interface/validator/ValidationHelper';
import * as platformFs from '../../../../../js/app/platform/fs';
import * as platformExec from '../../../../../js/app/platform/exec';
import * as platformPaths from '../../../../../js/app/platform/paths';

const makeHelper = () =>
  new ValidationHelper(
    { context: {}, env: {}, validationFields: { a: ' B ' } },
    jest.fn(),
    {}
  );

afterEach(() => jest.resetAllMocks());

describe('Twilio helpers are removed', () => {
  test.each([
    'getTwilioClient',
    'fakeCall',
    'fakeMessage',
    'fakeRequest',
    'findPhoneNumber',
    'createSignature',
    'getTwiML',
  ])('%s is gone', name => {
    expect(makeHelper()[name]).toBeUndefined();
  });

  test('fakeNumber and client are gone, other state stays', () => {
    const helper = makeHelper();
    expect(helper.fakeNumber).toBeUndefined();
    expect(helper.client).toBeUndefined();
    expect(helper.getNormalizedInput('a')).toBe('b');
  });
});

describe('helper.fs', () => {
  test('exposes the platform/fs async API unchanged', async () => {
    const helper = makeHelper();
    const names = [
      'readFile',
      'readdir',
      'stat',
      'lstat',
      'existsAsync',
      'listAsync',
      'readAsync',
      'writeAsync',
      'copyAsync',
      'removeAsync',
    ];
    expect(Object.keys(helper.fs).sort()).toEqual(names.sort());
    names.forEach(name => expect(helper.fs[name]).toBe(platformFs[name]));
    platformFs.existsAsync.mockResolvedValue('dir');
    await expect(helper.fs.existsAsync('/p')).resolves.toBe('dir');
    expect(platformFs.existsAsync).toHaveBeenCalledWith('/p');
  });

  test('has no synchronous members and cannot be mutated', () => {
    const helper = makeHelper();
    expect(helper.fs.exists).toBeUndefined();
    expect(helper.fs.readFileSync).toBeUndefined();
    expect(Object.isFrozen(helper.fs)).toBe(true);
  });
});

describe('helper.platform', () => {
  test('is process.platform', () => {
    expect(makeHelper().platform).toBe(process.platform);
  });
});

describe('helper.exec / helper.commandExists', () => {
  test('exec passes program, args and cwd and returns the result', async () => {
    platformExec.run.mockResolvedValue({ code: 2, stdout: 'o', stderr: 'e' });
    await expect(
      makeHelper().exec('git', ['status'], { cwd: '/w' })
    ).resolves.toEqual({ code: 2, stdout: 'o', stderr: 'e' });
    expect(platformExec.run).toHaveBeenCalledWith('git', ['status'], {
      cwd: '/w',
    });
  });

  test('exec defaults: no args, no cwd', async () => {
    platformExec.run.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    await makeHelper().exec('git');
    expect(platformExec.run).toHaveBeenCalledWith('git', [], {});
  });

  test('exec forwards timeout', async () => {
    platformExec.run.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    await makeHelper().exec('node', ['-v'], { cwd: '/w', timeout: 5000 });
    expect(platformExec.run).toHaveBeenCalledWith('node', ['-v'], {
      cwd: '/w',
      timeout: 5000,
    });
  });

  test('exec rejects on spawn failure', async () => {
    const err = new Error('ENOENT');
    platformExec.run.mockRejectedValue(err);
    await expect(makeHelper().exec('nope')).rejects.toBe(err);
  });

  test('commandExists delegates', async () => {
    platformExec.commandExists.mockResolvedValue(true);
    await expect(makeHelper().commandExists('git')).resolves.toBe(true);
    expect(platformExec.commandExists).toHaveBeenCalledWith('git');
  });
});

describe('isExecutableValid', () => {
  test('empty path', async () => {
    const helper = makeHelper();
    expect(await helper.isExecutableValid(undefined, [])).toEqual([
      false,
      `You didn't enter a file path.`,
    ]);
    expect(await helper.isExecutableValid('  ', [])).toEqual([
      false,
      `You didn't enter a file path.`,
    ]);
  });

  test('missing path', async () => {
    platformExec.pathExistsSync.mockReturnValue(false);
    const [ok, message] = await makeHelper().isExecutableValid('/x/y', []);
    expect(ok).toBe(false);
    expect(message).toContain('The path you provided does not exist!');
    expect(message).toContain('"/x/y"');
    expect(platformExec.exec).not.toHaveBeenCalled();
  });

  test('success runs the quoted path with space-joined args via the shell exec', async () => {
    platformExec.pathExistsSync.mockReturnValue(true);
    platformExec.exec.mockResolvedValue({ stdout: '', stderr: '' });
    expect(
      await makeHelper().isExecutableValid('/usr/bin/node', ['--version', '-p'])
    ).toEqual([true, undefined]);
    expect(platformExec.exec).toHaveBeenCalledWith(
      '"/usr/bin/node" --version -p'
    );
  });

  test.each([
    ['EPERM error', new Error('spawn EPERM')],
    ['Access is denied', new Error('Access is denied.')],
  ])('%s gives the not-executable message', async (_, err) => {
    platformExec.pathExistsSync.mockReturnValue(true);
    platformExec.exec.mockRejectedValue(err);
    const [ok, message] = await makeHelper().isExecutableValid('/p', []);
    expect(ok).toBe(false);
    expect(message).toContain("The path you provided isn't executable!");
    expect(message).toContain('"/p"');
  });

  test('other errors give the generic message', async () => {
    platformExec.pathExistsSync.mockReturnValue(true);
    platformExec.exec.mockRejectedValue(new Error('boom'));
    const [ok, message] = await makeHelper().isExecutableValid('/p', []);
    expect(ok).toBe(false);
    expect(message).toContain(
      'An error occured when we tried to validate we could run your executable!'
    );
    expect(message).toContain('Path: /p');
    expect(message).toContain('Error: Error: boom');
  });
});

describe('getQuestIdeUserCode', () => {
  test('reads the saved code as UTF-8 via platform/fs', async () => {
    platformFs.readFile.mockResolvedValue('code');
    await expect(makeHelper().getQuestIdeUserCode('obj', 'mission')).resolves.toBe(
      'code'
    );
    expect(platformFs.readFile).toHaveBeenCalledWith(
      require('path').join('/code', 'mission', 'obj', 'code.js'),
      'utf8'
    );
  });
});

describe('getAppDataPath', () => {
  test('returns the platform appData path', () => {
    platformPaths.getAppDataPath.mockReturnValue('/appdata');
    expect(makeHelper().getAppDataPath()).toBe('/appdata');
  });

  test('propagates the error when the path is unavailable', () => {
    platformPaths.getAppDataPath.mockImplementation(() => {
      throw new Error('no app');
    });
    expect(() => makeHelper().getAppDataPath()).toThrow('no app');
  });
});

// The code runs in a real Web Worker (public/code_runner/worker.js)
describe('pullVarsFromUserCodeLocalScope', () => {
  test('returns the requested top-level variables (let/const/var)', async () => {
    const vars = await makeHelper().pullVarsFromUserCodeLocalScope(
      'const a = 1; let b = "two"; var c = [1, { d: 3 }];',
      ['a', 'b', 'c']
    );
    expect(vars).toEqual({ a: 1, b: 'two', c: [1, { d: 3 }] });
    expect(vars._error).toBeUndefined();
  });

  test('runs the code exactly once', async () => {
    const vars = await makeHelper().pullVarsFromUserCodeLocalScope(
      'var runs = (typeof runs === "undefined" ? 0 : runs) + 1; var counter = 0; counter++;',
      ['runs', 'counter']
    );
    expect(vars).toEqual({ runs: 1, counter: 1 });
  });

  test('returns an empty object when no keys are requested', async () => {
    expect(await makeHelper().pullVarsFromUserCodeLocalScope('var a = 1;')).toEqual({});
  });

  test('keeps Map, Set and Date values', async () => {
    const vars = await makeHelper().pullVarsFromUserCodeLocalScope(
      'const m = new Map([[1, 2]]); const s = new Set([1]); const d = new Date(0);',
      ['m', 's', 'd']
    );
    expect(Array.from(vars.m)).toEqual([[1, 2]]);
    expect(Array.from(vars.s)).toEqual([1]);
    expect(vars.d.getTime()).toBe(0);
  });

  test('a class instance arrives as a plain object (data only)', async () => {
    const vars = await makeHelper().pullVarsFromUserCodeLocalScope(
      'class P { constructor() { this.x = 1; } get y() { return 2; } hi() {} } const p = new P();',
      ['p']
    );
    expect(vars.p).toEqual({ x: 1 });
  });

  test('records a ReferenceError for a missing variable in _error', async () => {
    const vars = await makeHelper().pullVarsFromUserCodeLocalScope('const a = 1;', [
      'missing',
    ]);
    expect(vars._error.name).toBe('ReferenceError');
  });

  test('keeps variables read before the failing one next to _error', async () => {
    const vars = await makeHelper().pullVarsFromUserCodeLocalScope('const a = 1;', [
      'a',
      'missing',
    ]);
    expect(vars.a).toBe(1);
    expect(vars._error.name).toBe('ReferenceError');
  });

  test('throws when the code itself throws', async () => {
    await expect(
      makeHelper().pullVarsFromUserCodeLocalScope('throw new Error("boom");', ['a'])
    ).rejects.toThrow('boom');
  });

  test('throws a SyntaxError for code that does not parse', async () => {
    await expect(
      makeHelper().pullVarsFromUserCodeLocalScope('const = ;', ['a'])
    ).rejects.toMatchObject({ name: 'SyntaxError' });
  });

  test.each([
    ['function', 'function f() { return 2; }', 'f', /Variable "f" \(function\)/],
    ['class', 'class C {}', 'C', /Variable "C" \(class\)/],
    ['arrow function', 'const g = () => 1;', 'g', /Variable "g" \(function\)/],
    ['symbol', 'const s = Symbol("x");', 's', /Variable "s" \(symbol\)/],
    ['object holding a function', 'const o = { run() {} };', 'o', /Variable "o"/],
  ])('rejects explicitly for a %s', async (name, code, key, message) => {
    const helper = makeHelper();
    const promise = helper.pullVarsFromUserCodeLocalScope(code, [key]);
    await expect(promise).rejects.toThrow(message);
    await expect(helper.pullVarsFromUserCodeLocalScope(code, [key])).rejects.toThrow(
      'cannot be returned from the code runner worker'
    );
  });

  test('a function that is not requested does not matter', async () => {
    const vars = await makeHelper().pullVarsFromUserCodeLocalScope(
      'function f() {} const a = 1;',
      ['a']
    );
    expect(vars).toEqual({ a: 1 });
  });

  test('rejects keys that are not identifiers', async () => {
    await expect(
      makeHelper().pullVarsFromUserCodeLocalScope('var a = 1;', ['a; throw 1'])
    ).rejects.toThrow('"keys" must be an array of variable names');
  });

  test('has no require, window or fetchOverride in scope', async () => {
    const vars = await makeHelper().pullVarsFromUserCodeLocalScope(
      'const r = typeof require; const w = typeof window; const p = typeof process.env;',
      ['r', 'w', 'p']
    );
    expect(vars).toEqual({ r: 'undefined', w: 'undefined', p: 'object' });
  });

  test('pullVarsFromQuestIdeUserCodeLocalScope reads the saved code and delegates', async () => {
    platformFs.readFile.mockResolvedValue('var answer = 42;');
    const vars = await makeHelper().pullVarsFromQuestIdeUserCodeLocalScope(
      ['answer'],
      'obj',
      'mission'
    );
    expect(vars.answer).toBe(42);
  });
});
