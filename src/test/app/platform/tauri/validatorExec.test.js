// The validator-facing exec contract on Tauri (W11, #142): what `helper.exec`,
// `helper.commandExists` and `isExecutableValid` send to the Rust commands, and
// which programs the content validators name against the capability allowlist
// (src-tauri/capabilities/platform.json, the same patterns exec.rs reads).
import fs from 'node:fs';
import path from 'node:path';
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';

vi.mock('../../../../js/app/platform/fs', () => ({
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
vi.mock('../../../../js/app/platform/exec', () => import('../../../../js/app/platform/tauri/exec'));
vi.mock('../../../../js/app/platform/env', () => ({ getPlatform: vi.fn(() => 'darwin') }));
vi.mock('../../../../js/app/platform/paths', () => ({ getAppDataPath: vi.fn() }));
vi.mock('../../../../js/app/common/fs_utils', () => ({ staticFileUrl: vi.fn(p => p) }));
vi.mock('../../../../js/app/common/analytics', () => ({ __esModule: true, default: { analyticsId: 'x' } }));
vi.mock('../../../../js/app/common/world', () => ({ __esModule: true, default: vi.fn() }));
vi.mock('../../../../js/app/config/config', () => ({
  __esModule: true,
  default: { codeStoragePath: '/code', codeStorageFileName: 'code.js' },
}));
vi.mock('../../../../js/app/common/context', () => ({ getContext: vi.fn() }));

import ValidationHelper from '../../../../js/app/components/hack_interface/validator/ValidationHelper';

const root = path.resolve(__dirname, '../../../../..');

const makeHelper = () =>
  new ValidationHelper({ context: {}, env: {}, validationFields: {} }, vi.fn(), {});

function backend(handler) {
  const calls = [];
  mockIPC((cmd, payload) => {
    calls.push({ cmd, payload });
    return handler(cmd, payload);
  });
  return calls;
}

afterEach(() => clearMocks());

describe('isExecutableValid on Tauri', () => {
  test('a valid path: path_exists, then the strictly parsed command through run_command', async () => {
    const calls = backend(cmd => (cmd === 'path_exists' ? true : { code: 0, stdout: 'v', stderr: '' }));
    await expect(makeHelper().isExecutableValid('/opt/my tools/python3', ['--version'])).resolves.toEqual([
      true,
      undefined,
    ]);
    expect(calls.map(c => c.cmd)).toEqual(['path_exists', 'run_command']);
    expect(calls[0].payload).toEqual({ path: '/opt/my tools/python3' });
    expect(calls[1].payload).toMatchObject({ program: '/opt/my tools/python3', args: ['--version'] });
  });

  test('a missing path is reported to the learner and nothing is run', async () => {
    const calls = backend(() => false);
    const [valid, message] = await makeHelper().isExecutableValid('/nope/git', ['--version']);
    expect(valid).toBe(false);
    expect(message).toContain('The path you provided does not exist!');
    expect(message).toContain('/nope/git');
    expect(calls.map(c => c.cmd)).toEqual(['path_exists']);
  });

  test('a bare name is "does not exist", like Electron fs.existsSync of a relative path', async () => {
    backend(() => false);
    const [valid, message] = await makeHelper().isExecutableValid('git', ['--version']);
    expect(valid).toBe(false);
    expect(message).toContain('does not exist');
  });

  test('a non-zero exit is reported with the error text (Command failed)', async () => {
    backend(cmd => (cmd === 'path_exists' ? true : { code: 2, stdout: '', stderr: 'boom' }));
    const [valid, message] = await makeHelper().isExecutableValid('/usr/bin/node', ['--version']);
    expect(valid).toBe(false);
    expect(message).toContain('An error occured when we tried to validate we could run your executable!');
    expect(message).toContain('Command failed');
  });

  test('a path whose file name is not allowed rejects (it could not run anyway)', async () => {
    backend(() => {
      throw { kind: 'notAllowed', message: 'program is not allowed: /bin/ls', stdout: '', stderr: '' };
    });
    await expect(makeHelper().isExecutableValid('/bin/ls', ['--version'])).rejects.toMatchObject({
      kind: 'notAllowed',
    });
  });

  test('a blank path never reaches Rust', async () => {
    const calls = backend(() => true);
    const [valid, message] = await makeHelper().isExecutableValid('  ', ['--version']);
    expect(valid).toBe(false);
    expect(message).toContain("You didn't enter a file path.");
    expect(calls).toEqual([]);
  });
});

describe('helper.exec / helper.commandExists on Tauri', () => {
  test('exec passes program, args, cwd and timeout as run_command arguments (no shell)', async () => {
    const calls = backend(() => ({ code: 1, stdout: 'o', stderr: 'e' }));
    await expect(
      makeHelper().exec('git', ['status', '--short; rm -rf /'], { cwd: '/repo', timeout: 5000 })
    ).resolves.toEqual({ code: 1, stdout: 'o', stderr: 'e' });
    expect(calls).toEqual([
      {
        cmd: 'run_command',
        payload: {
          program: 'git',
          args: ['status', '--short; rm -rf /'],
          cwd: '/repo',
          env: undefined,
          timeoutMs: 5000,
          maxBuffer: undefined,
        },
      },
    ]);
  });

  test('a program outside the allowlist rejects with the Rust failure kind', async () => {
    backend(() => {
      throw { kind: 'notAllowed', message: 'program is not allowed: ls', stdout: '', stderr: '' };
    });
    await expect(makeHelper().exec('ls', [])).rejects.toMatchObject({ kind: 'notAllowed' });
  });

  test('commandExists asks command_exists with the bare name', async () => {
    const calls = backend(() => true);
    await expect(makeHelper().commandExists('git')).resolves.toBe(true);
    expect(calls).toEqual([{ cmd: 'command_exists', payload: { name: 'git' } }]);
  });
});

describe('the programs that content validators name', () => {
  const patterns = JSON.parse(
    fs.readFileSync(path.join(root, 'src-tauri/capabilities/platform.json'), 'utf8')
  )
    .permissions.find(p => p.identifier === 'allow-run-command')
    .allow.map(entry => entry.program);

  // exec.rs `wildcard_match`: `*` matches any run, ASCII case-insensitive
  const matches = (pattern, text) =>
    new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i').test(text);
  const stem = program => program.split(/[/\\]/).pop().replace(/\.exe$/i, '');
  const allowed = program => patterns.some(pattern => matches(pattern, stem(program)));

  function* validatorFiles(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) yield* validatorFiles(full);
      else if (entry.name.endsWith('.js')) yield full;
    }
  }

  const literalPrograms = () => {
    const found = new Map();
    for (const file of validatorFiles(path.join(root, 'public/content'))) {
      const source = fs.readFileSync(file, 'utf8');
      for (const m of source.matchAll(/helper\.(?:exec|commandExists)\(\s*(['"])([^'"]+)\1/g)) {
        found.set(m[2], [...(found.get(m[2]) ?? []), path.relative(root, file)]);
      }
    }
    return found;
  };

  test('every literal program is allowed, except the known Windows-only powershell.exe', () => {
    const found = literalPrograms();
    expect(found.has('git')).toBe(true);
    const refused = [...found.keys()].filter(program => !allowed(program)).sort();
    // fs-08-hidden (win32 only) runs powershell.exe. PowerShell is a shell
    // (`-Command`), so it is deliberately NOT allowlisted; see
    // docs/migration/tauri-runtime.md (W11, remaining).
    expect(refused).toEqual(['powershell.exe']);
  });

  test('the allowlist covers what a learner types for node, python and git', () => {
    for (const program of [
      '/opt/homebrew/bin/node',
      '/usr/bin/python3',
      '/usr/local/bin/python3.12',
      'C:\\Python312\\python.exe',
      'C:\\Program Files\\Git\\cmd\\git.exe',
    ]) {
      expect(allowed(program)).toBe(true);
    }
    for (const program of ['/usr/bin/py', 'C:\\Windows\\py.exe', '/bin/sh', 'powershell.exe', 'npm.cmd']) {
      expect(allowed(program)).toBe(false);
    }
  });
});
