jest.mock('../../../../../js/app/platform/fs', () => ({
  readFile: jest.fn(),
  readdir: jest.fn(),
  stat: jest.fn(),
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
jest.mock('../../../../../js/app/common/analytics', () => ({
  __esModule: true,
  default: { analyticsId: 'test-id' },
}));
jest.mock('../../../../../js/app/common/world', () => ({
  __esModule: true,
  default: jest.fn(),
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
