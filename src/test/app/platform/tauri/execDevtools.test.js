import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';
import { commandExists, exec, pathExists, run } from '../../../../js/app/platform/tauri/exec';
import { openDevTools, toggleDevTools } from '../../../../js/app/platform/tauri/devtools';

const fsMocks = vi.hoisted(() => ({ stat: vi.fn() }));
vi.mock('@tauri-apps/plugin-fs', () => fsMocks);

afterEach(() => {
  clearMocks();
  fsMocks.stat.mockReset();
});

function backend(handler) {
  const calls = [];
  mockIPC((cmd, payload) => {
    calls.push({ cmd, payload });
    return handler(cmd, payload);
  });
  return calls;
}

describe('run', () => {
  test('invokes run_command with camelCase options and resolves any exit code', async () => {
    const calls = backend(() => ({ code: 3, stdout: 'o', stderr: 'e' }));
    await expect(
      run('/usr/bin/git', ['status'], { cwd: '/repo', env: { A: '1' }, timeout: 500, maxBuffer: 10 })
    ).resolves.toEqual({ code: 3, stdout: 'o', stderr: 'e' });
    expect(calls).toEqual([
      {
        cmd: 'run_command',
        payload: {
          program: '/usr/bin/git',
          args: ['status'],
          cwd: '/repo',
          env: { A: '1' },
          timeoutMs: 500,
          maxBuffer: 10,
        },
      },
    ]);
  });

  test('args default to an empty array', async () => {
    const calls = backend(() => ({ code: 0, stdout: '', stderr: '' }));
    await run('git');
    expect(calls[0].payload.args).toEqual([]);
  });

  test('a spawn failure rejects with a Node-like error', async () => {
    backend(() => {
      throw { kind: 'spawn', code: 'ENOENT', message: 'spawn x ENOENT', stdout: '', stderr: '', killed: false };
    });
    const error = await run('x').catch(e => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ code: 'ENOENT', killed: false, signal: null, kind: 'spawn' });
  });

  test('a timeout rejects with killed and keeps the partial output', async () => {
    backend(() => {
      throw { kind: 'timeout', code: null, message: 't', stdout: 'part', stderr: '', killed: true };
    });
    const error = await run('node', [], { timeout: 1 }).catch(e => e);
    expect(error).toMatchObject({ killed: true, code: null, stdout: 'part', kind: 'timeout' });
  });

  test('a program that is not allowed rejects with kind notAllowed', async () => {
    backend(() => {
      throw { kind: 'notAllowed', code: null, message: 'program is not allowed: sh', stdout: '', stderr: '', killed: false };
    });
    await expect(run('sh')).rejects.toMatchObject({ kind: 'notAllowed' });
  });

  test('an ACL rejection (string) becomes an Error', async () => {
    backend(() => {
      throw 'run_command not allowed. Command not found';
    });
    await expect(run('git')).rejects.toThrow(/not allowed/);
  });
});

describe('commandExists', () => {
  test('rejects an empty or non-string name without calling the backend', async () => {
    const calls = backend(() => true);
    await expect(commandExists('')).rejects.toThrow(/non-empty command name/);
    await expect(commandExists('  ')).rejects.toThrow(/non-empty command name/);
    await expect(commandExists(undefined)).rejects.toThrow(/non-empty command name/);
    expect(calls).toEqual([]);
  });

  test('resolves the boolean from the backend', async () => {
    const calls = backend(() => false);
    await expect(commandExists('git')).resolves.toBe(false);
    expect(calls).toEqual([{ cmd: 'command_exists', payload: { name: 'git' } }]);
  });

  test('a name that is not allowed rejects', async () => {
    backend(() => {
      throw { kind: 'notAllowed', code: null, message: 'program is not allowed: rm', stdout: '', stderr: '', killed: false };
    });
    await expect(commandExists('rm')).rejects.toMatchObject({ kind: 'notAllowed' });
  });
});

describe('exec (no shell)', () => {
  test('runs the quoted-path form through run_command with split arguments', async () => {
    const calls = backend(() => ({ code: 0, stdout: 'v1', stderr: '' }));
    await expect(exec('"/opt/my tools/git" --version -v')).resolves.toEqual({ stdout: 'v1', stderr: '' });
    expect(calls[0].cmd).toBe('run_command');
    expect(calls[0].payload).toMatchObject({ program: '/opt/my tools/git', args: ['--version', '-v'] });
  });

  test('supports a command without arguments and passes options on', async () => {
    const calls = backend(() => ({ code: 0, stdout: '', stderr: '' }));
    await exec('"C:\\Program Files\\Git\\cmd\\git.exe" ', { timeout: 5 });
    expect(calls[0].payload).toMatchObject({
      program: 'C:\\Program Files\\Git\\cmd\\git.exe',
      args: [],
      timeoutMs: 5,
    });
  });

  test('a non-zero exit rejects like Node exec', async () => {
    backend(() => ({ code: 2, stdout: 'out', stderr: 'bad' }));
    const error = await exec('"/bin/git" --nope').catch(e => e);
    expect(error.message).toBe('Command failed: "/bin/git" --nope\nbad');
    expect(error).toMatchObject({ code: 2, stdout: 'out', stderr: 'bad', killed: false });
  });

  test('a spawn failure keeps its message (used for EPERM / access denied detection)', async () => {
    backend(() => {
      throw { kind: 'spawn', code: 'EACCES', message: 'spawn x EACCES', stdout: '', stderr: '', killed: false };
    });
    await expect(exec('"/x" --version')).rejects.toThrow('spawn x EACCES');
  });

  test.each([
    ['git --version'],
    ["'/bin/git' --version"],
    ['"/bin/git" --version; rm -rf /'],
    ['"/bin/git" $(whoami)'],
    ['"/bin/git" "quoted arg"'],
    ['"/bin/git" a|b'],
    ['"/bin/git" a>b'],
    ['"/bin/git"--version'],
    ['""'],
    ['"/bin/git'],
    [undefined],
  ])('rejects %p without running anything', async command => {
    const calls = backend(() => ({ code: 0, stdout: '', stderr: '' }));
    await expect(exec(command)).rejects.toThrow(/platform exec on Tauri/);
    expect(calls).toEqual([]);
  });
});

describe('pathExists', () => {
  const info = kind => ({ isFile: kind === 'file', isDirectory: kind === 'dir', isSymlink: false, size: 1, mtime: null });

  test('true for an existing file or directory, via stat of the path as given', async () => {
    fsMocks.stat.mockResolvedValueOnce(info('file')).mockResolvedValueOnce(info('dir'));
    await expect(pathExists('/a b/tool')).resolves.toBe(true);
    await expect(pathExists('/a b')).resolves.toBe(true);
    expect(fsMocks.stat).toHaveBeenNthCalledWith(1, '/a b/tool');
  });

  test('false when the path does not exist (ENOENT only)', async () => {
    fsMocks.stat.mockRejectedValue('No such file or directory (os error 2)');
    await expect(pathExists('/x')).resolves.toBe(false);
  });

  test('any other failure (for example a path outside the scope) rejects', async () => {
    fsMocks.stat.mockRejectedValue('forbidden path: /x, maybe it is not allowed on the scope');
    await expect(pathExists('/x')).rejects.toThrow(/forbidden path/);
  });

  test('has no synchronous variant', async () => {
    expect((await import('../../../../js/app/platform/tauri/exec')).pathExistsSync).toBeUndefined();
  });
});

describe('devtools', () => {
  test('dispatch the Rust commands and resolve with their result', async () => {
    const calls = backend(() => null);
    await expect(openDevTools()).resolves.toBeNull();
    await expect(toggleDevTools()).resolves.toBeNull();
    expect(calls.map(c => c.cmd)).toEqual(['open_devtools', 'toggle_devtools']);
  });

  test('a refusal (release build) rejects with an Error', async () => {
    backend(() => {
      throw 'DevTools are not available in release builds';
    });
    await expect(toggleDevTools()).rejects.toThrow('DevTools are not available in release builds');
    await expect(openDevTools()).rejects.toBeInstanceOf(Error);
  });
});
