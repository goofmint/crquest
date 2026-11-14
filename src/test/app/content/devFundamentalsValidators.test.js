import jetpack from 'fs-jetpack';
import fs from 'fs';
import os from 'os';
import path from 'path';

// The validators of twilioquest-dev-fundamentals only talk to the file system
// and to commands through `helper`. The helper here is backed by the real Node
// fs (on a temporary directory) so the checks are real; exec is a mock.
const OBJECTIVES = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'public',
  'content',
  'twilioquest-dev-fundamentals',
  'levels',
  'tower_of_knowledge',
  'objectives'
);

const validatorOf = name =>
  require(path.join(OBJECTIVES, name, 'validator.js'));

// Same contract as platform/fs existsAsync: false | 'dir' | 'file' | 'other'.
const existsAsync = async target => {
  try {
    const stats = await fs.promises.stat(target);
    if (stats.isDirectory()) return 'dir';
    return stats.isFile() ? 'file' : 'other';
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
};

const makeHelper = ({
  fields = {},
  env = {},
  platform = 'linux',
  exec,
} = {}) => {
  const result = {};
  const helper = {
    env,
    platform,
    fs: {
      existsAsync,
      stat: fs.promises.stat,
      lstat: fs.promises.lstat,
    },
    exec: exec || jest.fn(),
    getNormalizedInput: key => fields[key] || '',
    getFilePathPartsArray: filePath => filePath.split(path.sep),
    formatPathPartsForOs: (...parts) => parts.join(path.sep),
    areArrayContentsEqual: (a, b) =>
      a.length === b.length && a.every((item, index) => item === b[index]),
    success: (message, envOut = []) => {
      result.success = { message, env: envOut };
    },
    fail: error => {
      result.fail = typeof error === 'string' ? error : error.message;
    },
  };
  return { helper, result };
};

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tq-devfund-'));
});
afterEach(() => {
  jetpack.remove(dir);
});

describe('fs-02-pwd', () => {
  const validate = validatorOf('fs-02-pwd');

  test('passes for an existing directory and stores it', async () => {
    const { helper, result } = makeHelper({ fields: { pwd: dir } });
    await validate(helper);
    expect(result.fail).toBeUndefined();
    expect(result.success.env).toEqual([
      { name: 'DEV_FUNDAMENTALS_FILE_SYSTEM_PWD', value: dir },
    ]);
  });

  test('fails for a missing path and for an empty input', async () => {
    const missing = path.join(dir, 'nope');
    let ctx = makeHelper({ fields: { pwd: missing } });
    await validate(ctx.helper);
    expect(ctx.result.fail).toBe(
      `TwilioQuest cannot locate the path you entered, "${missing}", on your computer.`
    );

    ctx = makeHelper();
    await validate(ctx.helper);
    expect(ctx.result.fail).toMatch(/present working directory in the Hack/);
  });

  test('reports an unexpected fs error instead of treating it as missing', async () => {
    const ctx = makeHelper({ fields: { pwd: dir } });
    ctx.helper.fs.existsAsync = async () => {
      throw new Error('EACCES: denied');
    };
    await validate(ctx.helper);
    expect(ctx.result.fail).toMatch(/An error occurred[\s\S]*EACCES: denied/);
  });
});

describe('fs-03-ls', () => {
  const validate = validatorOf('fs-03-ls');

  test('passes for an existing entry in the pwd', async () => {
    fs.writeFileSync(path.join(dir, 'a.txt'), '');
    const { helper, result } = makeHelper({
      fields: { directoryOrFileName: 'a.txt' },
      env: { TQ_DEV_FUNDAMENTALS_FILE_SYSTEM_PWD: dir },
    });
    await validate(helper);
    expect(result.success.message).toContain(path.join(dir, 'a.txt'));
  });

  test('fails when the entry does not exist', async () => {
    const { helper, result } = makeHelper({
      fields: { directoryOrFileName: 'b.txt' },
      env: { TQ_DEV_FUNDAMENTALS_FILE_SYSTEM_PWD: dir },
    });
    await validate(helper);
    expect(result.fail).toMatch(
      /cannot locate the directory or file you entered, "b.txt"/
    );
  });
});

describe('fs-05-mkdir', () => {
  const validate = validatorOf('fs-05-mkdir');
  const env = () => ({ TQ_DEV_FUNDAMENTALS_FILE_SYSTEM_PWD: dir });

  test('passes for a new directory inside the pwd', async () => {
    const sub = path.join(dir, 'new');
    fs.mkdirSync(sub);
    const { helper, result } = makeHelper({
      fields: { newDirPath: sub },
      env: env(),
    });
    await validate(helper);
    expect(result.success.env).toEqual([
      { name: 'DEV_FUNDAMENTALS_FILE_SYSTEM_NEW_DIR', value: sub },
    ]);
  });

  test('fails for a missing path, an outside directory and a file', async () => {
    let ctx = makeHelper({
      fields: { newDirPath: path.join(dir, 'x') },
      env: env(),
    });
    await validate(ctx.helper);
    expect(ctx.result.fail).toMatch(
      /cannot locate a directory at the path you entered/
    );

    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'tq-devfund-out-'));
    ctx = makeHelper({ fields: { newDirPath: outside }, env: env() });
    await validate(ctx.helper);
    expect(ctx.result.fail).toMatch(
      /should be created within the present working directory/
    );
    jetpack.remove(outside);

    const file = path.join(dir, 'f.txt');
    fs.writeFileSync(file, '');
    ctx = makeHelper({ fields: { newDirPath: file }, env: env() });
    await validate(ctx.helper);
    expect(ctx.result.fail).toMatch(/it's not a directory/);
  });

  test('a symbolic link to a directory is not a directory (lstat)', async () => {
    const target = path.join(dir, 'target');
    const link = path.join(dir, 'link');
    fs.mkdirSync(target);
    fs.symlinkSync(target, link);
    const { helper, result } = makeHelper({
      fields: { newDirPath: link },
      env: env(),
    });
    await validate(helper);
    expect(result.fail).toMatch(/it's not a directory/);
  });
});

describe('fs-06-touch', () => {
  const validate = validatorOf('fs-06-touch');
  const env = () => ({ TQ_DEV_FUNDAMENTALS_FILE_SYSTEM_NEW_DIR: dir });

  test('passes for a new file and stores its path', async () => {
    fs.writeFileSync(path.join(dir, 'n.txt'), '');
    const { helper, result } = makeHelper({
      fields: { newFileName: 'n.txt' },
      env: env(),
    });
    await validate(helper);
    expect(result.success.env).toEqual([
      {
        name: 'DEV_FUNDAMENTALS_FILE_SYSTEM_NEW_FILE',
        value: path.join(dir, 'n.txt'),
      },
    ]);
  });

  test('fails for a missing file and for a directory', async () => {
    let ctx = makeHelper({ fields: { newFileName: 'n.txt' }, env: env() });
    await validate(ctx.helper);
    expect(ctx.result.fail).toMatch(/could not find the file "n.txt"/);

    fs.mkdirSync(path.join(dir, 'd'));
    ctx = makeHelper({ fields: { newFileName: 'd' }, env: env() });
    await validate(ctx.helper);
    expect(ctx.result.fail).toMatch(/but it isn't a file/);
  });
});

describe('fs-07-rm', () => {
  const validate = validatorOf('fs-07-rm');

  test('passes once the file is gone, fails while it exists', async () => {
    const file = path.join(dir, 'gone.txt');
    const env = {
      TQ_DEV_FUNDAMENTALS_FILE_SYSTEM_NEW_DIR: dir,
      TQ_DEV_FUNDAMENTALS_FILE_SYSTEM_NEW_FILE: file,
    };
    fs.writeFileSync(file, '');
    let ctx = makeHelper({ env });
    await validate(ctx.helper);
    expect(ctx.result.fail).toMatch(/"gone.txt" still exists/);

    fs.unlinkSync(file);
    ctx = makeHelper({ env });
    await validate(ctx.helper);
    expect(ctx.result.fail).toBeUndefined();
    expect(ctx.result.success.message).toMatch(/file was deleted/);
  });
});

describe('fs-08-hidden', () => {
  const validate = validatorOf('fs-08-hidden');
  const env = () => ({ TQ_DEV_FUNDAMENTALS_FILE_SYSTEM_NEW_DIR: dir });

  test('posix: passes for .sneaky.txt without running a command', async () => {
    fs.writeFileSync(path.join(dir, '.sneaky.txt'), '');
    const { helper, result } = makeHelper({ env: env(), platform: 'darwin' });
    await validate(helper);
    expect(result.success.message).toMatch(/sneaky hidden file/);
    expect(helper.exec).not.toHaveBeenCalled();
  });

  test('posix: a visible sneaky.txt and a missing file fail differently', async () => {
    fs.writeFileSync(path.join(dir, 'sneaky.txt'), '');
    let ctx = makeHelper({ env: env(), platform: 'linux' });
    await validate(ctx.helper);
    expect(ctx.result.fail).toMatch(
      /isn't hidden! Make sure the file has a period/
    );

    fs.unlinkSync(path.join(dir, 'sneaky.txt'));
    ctx = makeHelper({ env: env(), platform: 'linux' });
    await validate(ctx.helper);
    expect(ctx.result.fail).toMatch(/could not find ".sneaky.txt"/);
  });

  test('win32: passes when powershell lists the file', async () => {
    fs.writeFileSync(path.join(dir, 'sneaky.txt'), '');
    const exec = jest.fn().mockResolvedValue({
      code: 0,
      stdout: 'a\r\nsneaky.txt\r\n',
      stderr: '',
    });
    const { helper, result } = makeHelper({
      env: env(),
      platform: 'win32',
      exec,
    });
    await validate(helper);
    expect(exec).toHaveBeenCalledWith(
      'powershell.exe',
      ['-Command', '(ls -ah).Name'],
      { cwd: dir }
    );
    expect(result.success).toBeDefined();
  });

  test('win32: fails when the file is not hidden, and reports a failed command', async () => {
    fs.writeFileSync(path.join(dir, 'sneaky.txt'), '');
    let exec = jest
      .fn()
      .mockResolvedValue({ code: 0, stdout: 'other.txt\r\n', stderr: '' });
    let ctx = makeHelper({ env: env(), platform: 'win32', exec });
    await validate(ctx.helper);
    expect(ctx.result.fail).toMatch(/"attrib" command with the "\+h" option/);

    exec = jest.fn().mockResolvedValue({ code: 1, stdout: '', stderr: 'boom' });
    ctx = makeHelper({ env: env(), platform: 'win32', exec });
    await validate(ctx.helper);
    expect(ctx.result.fail).toMatch(
      /An error occurred[\s\S]*Command failed[\s\S]*boom/
    );

    exec = jest
      .fn()
      .mockRejectedValue(new Error('spawn powershell.exe ENOENT'));
    ctx = makeHelper({ env: env(), platform: 'win32', exec });
    await validate(ctx.helper);
    expect(ctx.result.fail).toMatch(/An error occurred[\s\S]*ENOENT/);
  });
});
