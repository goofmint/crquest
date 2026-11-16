import { exec, run, commandExists, pathExists } from '../../../js/app/platform/exec';

// exec.test.js mocks child_process; these tests run real child processes (the
// Node binary running the tests) to pin the behavior the callers depend on.
const NODE = process.execPath;

describe('platform exec with real processes', () => {
  test('run resolves code 0 with stdout and stderr', async () => {
    await expect(
      run(NODE, ['-e', 'console.log("out"); console.error("err")'])
    ).resolves.toEqual({ code: 0, stdout: 'out\n', stderr: 'err\n' });
  });

  test('run treats a non-zero exit code as data', async () => {
    await expect(
      run(NODE, ['-e', 'console.log("partial"); process.exit(3)'])
    ).resolves.toEqual({ code: 3, stdout: 'partial\n', stderr: '' });
  });

  test('run passes args without a shell (no expansion)', async () => {
    const { stdout } = await run(NODE, ['-p', 'process.argv[1]', '$HOME;*']);
    expect(stdout).toBe('$HOME;*\n');
  });

  test('run honors options (cwd, env)', async () => {
    const { stdout } = await run(NODE, ['-p', 'process.env.TQ_PROBE'], {
      env: { ...process.env, TQ_PROBE: 'set' },
    });
    expect(stdout).toBe('set\n');
  });

  test('run rejects when the program cannot be spawned', async () => {
    await expect(run('/nonexistent/program-xyz')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  test('run rejects as killed when the process exceeds the timeout', async () => {
    // Asserts nothing about stdout: it would depend on how fast the child starts.
    await expect(
      run(NODE, ['-e', 'setInterval(() => {}, 1000)'], { timeout: 500 })
    ).rejects.toMatchObject({ killed: true });
  });

  test.skipIf(process.platform === 'win32')('run rejects on a signal exit and keeps the output written before it', async () => {
    // The child ends itself with a signal once its write completed: no timing involved.
    await expect(
      run(NODE, [
        '-e',
        // Signal only after the write has been flushed (pipe writes may be async)
        'process.stdout.write("started\\n", () => process.kill(process.pid, "SIGTERM"))',
      ])
    ).rejects.toMatchObject({ stdout: 'started\n' });
  });

  test('exec resolves stdout and stderr of a shell command', async () => {
    const { stdout, stderr } = await exec(
      `"${NODE}" -e "console.log('a'); console.error('b')"`
    );
    expect(stdout).toBe('a\n');
    expect(stderr).toBe('b\n');
  });

  test('exec rejects with the exit code and the output on failure', async () => {
    await expect(
      exec(`"${NODE}" -e "console.log('x'); process.exit(2)"`)
    ).rejects.toMatchObject({ code: 2, stdout: 'x\n' });
  });

  test.skipIf(process.platform === 'win32')(
    'commandExists finds a POSIX command and reports an unknown one as false',
    async () => {
      await expect(commandExists('sh')).resolves.toBe(true);
      await expect(commandExists('tq-no-such-command-xyz')).resolves.toBe(false);
    }
  );

  test.skipIf(process.platform === 'win32')(
    'commandExists passes the name as an argument, not as shell text',
    async () => {
      await expect(commandExists('sh; exit 0')).resolves.toBe(false);
    }
  );

  test('pathExists reports existing and missing paths', async () => {
    expect(await pathExists(NODE)).toBe(true);
    expect(await pathExists('/nonexistent/path-xyz')).toBe(false);
  });
});
