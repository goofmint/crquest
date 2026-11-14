jest.mock('child_process', () => ({ exec: jest.fn(), execFile: jest.fn() }));
jest.mock('fs', () => ({ existsSync: jest.fn() }));

const childProcess = require('child_process');
const nodeFs = require('fs');
const platformExec = require('../../../js/app/platform/exec');

afterEach(() => jest.resetAllMocks());

describe('exec (shell string)', () => {
  test('resolves { stdout, stderr } and passes command and options through', async () => {
    childProcess.exec.mockImplementation((cmd, opts, cb) => cb(null, 'o', 'e'));
    await expect(platformExec.exec('echo hi', { cwd: '/x' })).resolves.toEqual({
      stdout: 'o',
      stderr: 'e',
    });
    expect(childProcess.exec).toHaveBeenCalledWith(
      'echo hi',
      { cwd: '/x' },
      expect.any(Function)
    );
  });

  test('rejects with the original error', async () => {
    const err = Object.assign(new Error('Command failed'), { code: 1 });
    childProcess.exec.mockImplementation((cmd, opts, cb) => cb(err, '', ''));
    await expect(platformExec.exec('false')).rejects.toBe(err);
  });

  test('keeps stdout and stderr on the rejected error', async () => {
    const err = Object.assign(new Error('Command failed'), { code: 2 });
    childProcess.exec.mockImplementation((cmd, opts, cb) =>
      cb(err, 'partial out', 'some err')
    );
    await expect(platformExec.exec('false')).rejects.toMatchObject({
      code: 2,
      stdout: 'partial out',
      stderr: 'some err',
    });
  });
});

describe('run (no shell)', () => {
  test('resolves code 0 with output', async () => {
    childProcess.execFile.mockImplementation((p, a, o, cb) => cb(null, 'out', ''));
    await expect(
      platformExec.run('git', ['status'], { cwd: '/repo' })
    ).resolves.toEqual({ code: 0, stdout: 'out', stderr: '' });
    expect(childProcess.execFile).toHaveBeenCalledWith(
      'git',
      ['status'],
      { cwd: '/repo' },
      expect.any(Function)
    );
  });

  test('non-zero exit is data', async () => {
    const err = Object.assign(new Error('failed'), { code: 3 });
    childProcess.execFile.mockImplementation((p, a, o, cb) => cb(err, 'o', 'e'));
    await expect(platformExec.run('x')).resolves.toEqual({
      code: 3,
      stdout: 'o',
      stderr: 'e',
    });
  });

  test('spawn failure rejects', async () => {
    const err = Object.assign(new Error('spawn x ENOENT'), { code: 'ENOENT' });
    childProcess.execFile.mockImplementation((p, a, o, cb) => cb(err, '', ''));
    await expect(platformExec.run('x')).rejects.toBe(err);
  });

  test('keeps stdout and stderr on a rejected spawn/timeout error', async () => {
    const err = Object.assign(new Error('timed out'), { killed: true, code: null });
    childProcess.execFile.mockImplementation((p, a, o, cb) =>
      cb(err, 'so far', 'warn')
    );
    await expect(platformExec.run('x')).rejects.toMatchObject({
      stdout: 'so far',
      stderr: 'warn',
    });
  });

  test('killed (timeout) rejects even when the child exited with a numeric code', async () => {
    const err = Object.assign(new Error('timed out'), { killed: true, code: 2 });
    childProcess.execFile.mockImplementation((p, a, o, cb) => cb(err, 'o', 'e'));
    await expect(platformExec.run('x')).rejects.toBe(err);
  });

  test('signal kill rejects', async () => {
    const err = Object.assign(new Error('killed'), { code: null, signal: 'SIGTERM' });
    childProcess.execFile.mockImplementation((p, a, o, cb) => cb(err, '', ''));
    await expect(platformExec.run('x')).rejects.toBe(err);
  });
});

describe('commandExists', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  afterEach(() => Object.defineProperty(process, 'platform', originalPlatform));

  test('POSIX: true on exit 0, false on non-zero, name passed as argv', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    childProcess.execFile.mockImplementationOnce((p, a, o, cb) => cb(null, '/bin/git\n', ''));
    await expect(platformExec.commandExists('git')).resolves.toBe(true);
    expect(childProcess.execFile.mock.calls[0].slice(0, 2)).toEqual([
      '/bin/sh',
      ['-c', 'command -v -- "$1"', 'sh', 'git'],
    ]);
    childProcess.execFile.mockImplementationOnce((p, a, o, cb) =>
      cb(Object.assign(new Error('x'), { code: 1 }), '', '')
    );
    await expect(platformExec.commandExists('nope')).resolves.toBe(false);
  });

  test('Windows uses where', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    childProcess.execFile.mockImplementation((p, a, o, cb) => cb(null, 'C:\\git.exe', ''));
    await expect(platformExec.commandExists('git')).resolves.toBe(true);
    expect(childProcess.execFile.mock.calls[0].slice(0, 2)).toEqual(['where', ['git']]);
  });

  test('rejects on empty name and on lookup failure', async () => {
    await expect(platformExec.commandExists('  ')).rejects.toThrow();
    const err = Object.assign(new Error('spawn'), { code: 'ENOENT' });
    childProcess.execFile.mockImplementation((p, a, o, cb) => cb(err, '', ''));
    await expect(platformExec.commandExists('git')).rejects.toBe(err);
  });
});

test('pathExistsSync is fs.existsSync', () => {
  nodeFs.existsSync.mockReturnValue(true);
  expect(platformExec.pathExistsSync('/a')).toBe(true);
});
