vi.mock('../../../../../js/app/platform/fs', () => ({
  readFile: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  lstat: vi.fn(),
  existsAsync: vi.fn(),
  listAsync: vi.fn(),
  readAsync: vi.fn(),
  writeAsync: vi.fn(),
  copyAsync: vi.fn(),
  removeAsync: vi.fn(),
}));
vi.mock('../../../../../js/app/platform/exec', () => ({
  exec: vi.fn(),
  run: vi.fn(),
  commandExists: vi.fn(),
  pathExists: vi.fn(),
}));
vi.mock('../../../../../js/app/platform/env', () => ({
  getPlatform: vi.fn(() => process.platform),
}));
vi.mock('../../../../../js/app/platform/paths', () => ({
  getAppDataPath: vi.fn(),
}));
vi.mock('../../../../../js/app/common/fs_utils', () => ({
  staticFileUrl: vi.fn(relativePath => `file:///static/${relativePath}`),
}));
vi.mock('../../../../../js/app/common/codeRunnerWorker', async importOriginal => ({
  ...(await importOriginal()),
  evaluateInWorker: vi.fn(),
  pullVarsInWorker: vi.fn(),
}));
vi.mock('../../../../../js/app/common/treePlanting', () => ({
  recordTreePlanting: vi.fn(),
}));
vi.mock('../../../../../js/app/common/analytics', () => ({
  __esModule: true,
  default: { analyticsId: 'test-id' },
}));
vi.mock('../../../../../js/app/common/world', () => ({
  __esModule: true,
  default: vi.fn(),
}));
vi.mock('../../../../../js/app/config/config', () => ({
  __esModule: true,
  default: {
    codeStoragePath: '/code',
    codeStorageFileName: 'code.js',
  },
}));
vi.mock('../../../../../js/app/common/context', () => ({
  getContext: vi.fn(() => ({ levelName: 'current-level' })),
}));

import ValidationHelper from '../../../../../js/app/components/hack_interface/validator/ValidationHelper';
import { recordTreePlanting } from '../../../../../js/app/common/treePlanting';
import * as platformFs from '../../../../../js/app/platform/fs';
import * as platformExec from '../../../../../js/app/platform/exec';
import * as platformPaths from '../../../../../js/app/platform/paths';
import { getPlatform } from '../../../../../js/app/platform/env';
import { staticFileUrl } from '../../../../../js/app/common/fs_utils';
import {
  evaluateInWorker,
  pullVarsInWorker,
  WORKER_RELATIVE_PATH,
} from '../../../../../js/app/common/codeRunnerWorker';

const makeHelper = () =>
  new ValidationHelper(
    { context: {}, env: {}, validationFields: { a: ' B ' } },
    vi.fn(),
    {}
  );

afterEach(() => vi.resetAllMocks());

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

  test.each(['darwin', 'win32', 'linux'])('is whatever platform/env reports (%s)', value => {
    getPlatform.mockReturnValueOnce(value);
    expect(makeHelper().platform).toBe(value);
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
    platformExec.pathExists.mockResolvedValue(false);
    const [ok, message] = await makeHelper().isExecutableValid('/x/y', []);
    expect(ok).toBe(false);
    expect(message).toContain('The path you provided does not exist!');
    expect(message).toContain('"/x/y"');
    expect(platformExec.exec).not.toHaveBeenCalled();
  });

  test('passes the untrimmed original path to the existence check and the exec', async () => {
    platformExec.pathExists.mockResolvedValue(true);
    platformExec.exec.mockResolvedValue({ stdout: '', stderr: '' });
    await makeHelper().isExecutableValid(' /a b/tool ', ['-v']);
    expect(platformExec.pathExists).toHaveBeenCalledWith(' /a b/tool ');
    expect(platformExec.exec).toHaveBeenCalledWith('" /a b/tool " -v');
  });

  test('a rejection of the existence check propagates (not reported as missing)', async () => {
    platformExec.pathExists.mockRejectedValue(new Error('forbidden path'));
    await expect(makeHelper().isExecutableValid('/p', [])).rejects.toThrow('forbidden path');
    expect(platformExec.exec).not.toHaveBeenCalled();
  });

  test('success runs the quoted path with space-joined args via the shell exec', async () => {
    platformExec.pathExists.mockResolvedValue(true);
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
    platformExec.pathExists.mockResolvedValue(true);
    platformExec.exec.mockRejectedValue(err);
    const [ok, message] = await makeHelper().isExecutableValid('/p', []);
    expect(ok).toBe(false);
    expect(message).toContain("The path you provided isn't executable!");
    expect(message).toContain('"/p"');
  });

  test('other errors give the generic message', async () => {
    platformExec.pathExists.mockResolvedValue(true);
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

describe('evalQuestIdeUserCode is removed (#27)', () => {
  test('the direct eval helper no longer exists', () => {
    expect(makeHelper().evalQuestIdeUserCode).toBeUndefined();
  });
});

describe('pullVarsFromUserCodeLocalScope (Worker, data only)', () => {
  beforeEach(() => {
    staticFileUrl.mockReturnValue('file:///static/code_runner/worker.js');
  });

  test('pulls the variables in the code runner worker and returns them as is', async () => {
    const vars = { a: 1, _error: new ReferenceError('x is not defined') };
    pullVarsInWorker.mockResolvedValue(vars);
    const result = await makeHelper().pullVarsFromUserCodeLocalScope('const a = 1;', [
      'a',
      'x',
    ]);
    expect(result).toBe(vars);
    expect(staticFileUrl).toHaveBeenCalledWith(WORKER_RELATIVE_PATH);
    expect(pullVarsInWorker).toHaveBeenCalledWith({
      workerUrl: 'file:///static/code_runner/worker.js',
      code: 'const a = 1;',
      keys: ['a', 'x'],
    });
  });

  test('defaults keys to []', async () => {
    pullVarsInWorker.mockResolvedValue({});
    await makeHelper().pullVarsFromUserCodeLocalScope('');
    expect(pullVarsInWorker.mock.calls[0][0].keys).toEqual([]);
  });

  test('rejects when the worker rejects (code that throws, a function-valued variable)', async () => {
    pullVarsInWorker.mockRejectedValue(new Error('boom'));
    await expect(
      makeHelper().pullVarsFromUserCodeLocalScope('throw new Error("boom");', ['a'])
    ).rejects.toThrow('boom');
  });

  test('pullVarsFromQuestIdeUserCodeLocalScope reads the saved code and delegates', async () => {
    platformFs.readFile.mockResolvedValue('var answer = 42;');
    pullVarsInWorker.mockResolvedValue({ answer: 42 });
    const vars = await makeHelper().pullVarsFromQuestIdeUserCodeLocalScope(
      ['answer'],
      'obj',
      'mission'
    );
    expect(vars).toEqual({ answer: 42 });
    expect(platformFs.readFile).toHaveBeenCalledWith(
      expect.stringContaining('mission'),
      'utf8'
    );
    expect(pullVarsInWorker.mock.calls[0][0]).toMatchObject({
      code: 'var answer = 42;',
      keys: ['answer'],
    });
  });

  test('vm and fetchOverride are gone (#26, #40)', () => {
    expect(makeHelper().fetchOverride).toBeUndefined();
    expect(evaluateInWorker).not.toHaveBeenCalled();
  });
});

describe('evaluateInUserCodeLocalScope', () => {
  const testFn = ({ n }) => n;

  beforeEach(() => {
    staticFileUrl.mockReturnValue('file:///static/code_runner/worker.js');
  });

  test('runs the code and the test function in the code runner worker', async () => {
    evaluateInWorker.mockResolvedValue({ ok: true });
    const result = await makeHelper().evaluateInUserCodeLocalScope('const n = 1;', testFn, {
      n: 1,
    });
    expect(result).toEqual({ ok: true });
    expect(staticFileUrl).toHaveBeenCalledWith(WORKER_RELATIVE_PATH);
    expect(evaluateInWorker).toHaveBeenCalledWith({
      workerUrl: 'file:///static/code_runner/worker.js',
      code: 'const n = 1;',
      test: testFn,
      args: { n: 1 },
    });
  });

  test('passes {} when there are no args', async () => {
    evaluateInWorker.mockResolvedValue(1);
    await makeHelper().evaluateInUserCodeLocalScope('', testFn);
    expect(evaluateInWorker.mock.calls[0][0].args).toEqual({});
  });

  test('propagates the rejection of the worker', async () => {
    evaluateInWorker.mockRejectedValue(new Error('boom'));
    await expect(
      makeHelper().evaluateInUserCodeLocalScope('', testFn)
    ).rejects.toThrow('boom');
  });

  test('passes mocks to the worker only when given', async () => {
    evaluateInWorker.mockResolvedValue(1);
    const mocks = { fs: { directories: { '/d': ['a'] } } };
    await makeHelper().evaluateInUserCodeLocalScope('', testFn, { n: 1 }, mocks);
    expect(evaluateInWorker.mock.calls[0][0].mocks).toBe(mocks);
    await makeHelper().evaluateInUserCodeLocalScope('', testFn, { n: 1 });
    expect('mocks' in evaluateInWorker.mock.calls[1][0]).toBe(false);
  });

  test('evaluateInQuestIdeUserCodeLocalScope reads the saved code and delegates', async () => {
    platformFs.readFile.mockResolvedValue('var answer = 42;');
    evaluateInWorker.mockResolvedValue(42);
    const result = await makeHelper().evaluateInQuestIdeUserCodeLocalScope(
      testFn,
      { n: 2 },
      'obj',
      'mission'
    );
    expect(result).toBe(42);
    expect(platformFs.readFile).toHaveBeenCalledWith(
      expect.stringContaining('mission'),
      'utf8'
    );
    expect(evaluateInWorker.mock.calls[0][0]).toMatchObject({
      code: 'var answer = 42;',
      test: testFn,
      args: { n: 2 },
    });
  });

  test('evaluateInQuestIdeUserCodeLocalScope passes mocks on', async () => {
    platformFs.readFile.mockResolvedValue('');
    evaluateInWorker.mockResolvedValue(1);
    const mocks = { fetch: () => () => {} };
    await makeHelper().evaluateInQuestIdeUserCodeLocalScope(
      testFn,
      {},
      'obj',
      'mission',
      mocks
    );
    expect(evaluateInWorker.mock.calls[0][0].mocks).toBe(mocks);
  });
});

describe('recordTreePlanting', () => {
  test('records the planting of the level and objective that the validator runs for', async () => {
    recordTreePlanting.mockResolvedValue('recorded');
    const helper = new ValidationHelper(
      { context: {}, env: {}, validationFields: {} },
      vi.fn(),
      { levelName: 'fog_owl' },
      {},
      'owl_plant_tree1'
    );
    await expect(helper.recordTreePlanting()).resolves.toBe('recorded');
    expect(recordTreePlanting).toHaveBeenCalledWith({ missionId: 'fog_owl', targetId: 'owl_plant_tree1' });
  });

  test('an objective that was already complete records nothing new', async () => {
    const helper = new ValidationHelper(
      { context: {}, env: {}, validationFields: {} },
      vi.fn(),
      { levelName: 'fog_owl' },
      {},
      'owl_plant_tree1',
      true
    );
    recordTreePlanting.mockClear();
    await expect(helper.recordTreePlanting()).resolves.toBe('already_recorded');
    expect(recordTreePlanting).not.toHaveBeenCalled();
  });
});
