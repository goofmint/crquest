import path from 'path';
import jetpack from 'fs-jetpack';
import * as fsPlatform from '../../../js/app/platform/fs';
import { createModuleLoader } from '../../../js/app/common/moduleLoader';
import {
  getBuiltIn,
  isAllowedBuiltIn,
} from '../../../js/app/common/moduleAllowlist';
import { normalize } from '../../../js/app/common/modulePath';
import vendoredExtensionModules from '../../../js/app/config/vendoredExtensionModules.json';
import bundledExtensionModules from '../../../js/app/config/bundledExtensionModules.json';

const PUBLIC_PATH = path.resolve(__dirname, '..', '..', '..', '..', 'public');
const NAME = 'twilioquest-python';
const PACKAGE_PATH = path.join(PUBLIC_PATH, 'content', NAME);
const OBJECTIVES = path.join(PACKAGE_PATH, 'levels', 'python', 'objectives');

const validator = name => require(path.join(OBJECTIVES, name, 'validator.js'));
const scripts = () =>
  require(path.join(PACKAGE_PATH, 'scripts', 'objectiveValidation.js'));

describe('vendored twilioquest-python layout', () => {
  test('is bundled, vendored, present and no longer an npm dependency', () => {
    expect(bundledExtensionModules).toContain(NAME);
    expect(vendoredExtensionModules).toContain(NAME);
    expect(
      jetpack.read(path.join(PUBLIC_PATH, 'package.json'), 'json').dependencies
    ).not.toHaveProperty([NAME]);
    expect(jetpack.read(path.join(PACKAGE_PATH, 'package.json'), 'json')).toEqual(
      expect.objectContaining({ name: NAME, version: '1.0.7' })
    );
    expect(jetpack.exists(path.join(PACKAGE_PATH, 'LICENSE'))).toBe('file');
    expect(jetpack.exists(path.join(PACKAGE_PATH, 'README.md'))).toBe('file');
    expect(
      jetpack.exists(path.join(PACKAGE_PATH, 'levels', 'python', 'level.json'))
    ).toBe('file');
  });
});

describe('moduleLoader with the vendored twilioquest-python', () => {
  const pkg = jetpack.cwd(PACKAGE_PATH);
  const runtimeEntries = [
    ...pkg.find({ matching: 'objects/*/config.js' }),
    ...pkg.find({ matching: 'levels/*/events.js' }),
    ...pkg.find({ matching: 'levels/**/validator.js' }),
  ]
    .map(relative => path.join(PACKAGE_PATH, relative))
    .sort();

  test('finds the runtime entry files', () => {
    expect(runtimeEntries.length).toBeGreaterThan(20);
  });

  test('loads every runtime entry file with the real allowlist', async () => {
    const failures = [];

    for (const entry of runtimeEntries) {
      const loader = createModuleLoader({
        readFile: fsPlatform.readFile,
        stat: fsPlatform.stat,
        isAllowed: isAllowedBuiltIn,
        getAllowed: getBuiltIn,
      });

      try {
        await loader.load(normalize(entry));
      } catch (error) {
        failures.push(
          `${path.relative(PACKAGE_PATH, entry)}: ${error.code} ${error.message}`
        );
      }
    }

    expect(failures).toEqual([]);
  });

  test('no runtime JS requires a Node-only module', () => {
    const offenders = pkg
      .find({ matching: '**/*.js' })
      .filter(file =>
        /require\(\s*['"`](fs|fs-jetpack|child_process|got|command-exists|util|electron|vm)['"`]\s*\)/.test(
          pkg.read(file)
        )
      );

    expect(offenders).toEqual([]);
  });
});

const PY = '/usr/bin/python3';
const CODE_DIR = path.join('/code');
const APP_DATA = path.join('/appdata');
const VALIDATE_PY = path.join(APP_DATA, 'TwilioQuest', 'python_validator', 'validate.py');

// A fake validation helper: records the callback results and fakes fs / exec.
const createHelper = ({
  env = { TQ_PYTHON_EXE: PY, TQ_PYTHON_CODE_PATH: CODE_DIR },
  validationFields = {},
  fsEntries = {},
  existsDefault = 'file',
  execResults = [],
  defaultExec = { code: 0, stdout: '', stderr: '' },
  executableValid = [true, undefined],
} = {}) => {
  const helper = {
    env,
    validationFields,
    success: jest.fn(),
    fail: jest.fn(),
    getAppDataPath: jest.fn(() => APP_DATA),
    isExecutableValid: jest.fn().mockResolvedValue(executableValid),
    fs: {
      existsAsync: jest.fn(async p => (p in fsEntries ? fsEntries[p] : existsDefault)),
      readAsync: jest.fn(async () => 'print("hi")'),
      writeAsync: jest.fn(async () => undefined),
    },
    exec: jest.fn(async () => defaultExec),
  };
  execResults.forEach(result => {
    if (result instanceof Error) {
      helper.exec.mockRejectedValueOnce(result);
    } else {
      helper.exec.mockResolvedValueOnce(result);
    }
  });
  return helper;
};

const ok = stdout => ({ code: 0, stdout, stderr: '' });

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('scripts/objectiveValidation (child_process / fs-jetpack / electron -> helper)', () => {
  test('checkSetup: existing file and executable path pass', async () => {
    const helper = createHelper();
    await expect(scripts().checkSetup(helper, PY, '/code/a.py')).resolves.toBeUndefined();
    expect(helper.fs.existsAsync).toHaveBeenCalledWith('/code/a.py');
  });

  test('checkSetup: missing file and missing python path are NiceErrors', async () => {
    const { checkSetup } = scripts();
    await expect(
      checkSetup(createHelper({ existsDefault: false }), PY, '/code/a.py')
    ).rejects.toMatchObject({
      name: 'NiceError',
      message: expect.stringContaining('This trial asked you to create a file'),
    });
    await expect(checkSetup(createHelper(), undefined, '/code/a.py')).rejects.toMatchObject({
      name: 'NiceError',
      message: expect.stringContaining("don't have a Python executable path"),
    });
  });

  test('executeScript: runs python with the script and args, resolves stdout', async () => {
    const helper = createHelper({ execResults: [ok('out\n')] });
    await expect(scripts().executeScript(helper, PY, '/code/a.py', ['1', '2'])).resolves.toBe('out\n');
    expect(helper.exec).toHaveBeenCalledWith(PY, ['/code/a.py', '1', '2']);
  });

  test('executeScript: non-zero exit writes error.txt and rejects with a NiceError', async () => {
    const helper = createHelper({
      execResults: [{ code: 1, stdout: '', stderr: 'Traceback boom' }],
    });
    await expect(
      scripts().executeScript(helper, PY, path.join('/code/a.py'), ['x'])
    ).rejects.toMatchObject({
      name: 'NiceError',
      bufferedStderr: 'Traceback boom',
      message: expect.stringContaining('error.txt'),
    });
    expect(helper.fs.writeAsync).toHaveBeenCalledWith(
      path.join('/code', 'error.txt'),
      'Executing script: /code/a.py\nScript arguments: x\nOutput:\nTraceback boom\n'
    );
  });

  test('executeScript: a spawn failure is propagated', async () => {
    const error = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' });
    const helper = createHelper({ execResults: [error] });
    await expect(scripts().executeScript(helper, PY, '/code/a.py')).rejects.toBe(error);
  });

  test('executeScript: rejects with a NiceError after 30 seconds', async () => {
    const helper = createHelper();
    helper.exec.mockReturnValue(new Promise(() => {}));
    const timeout = jest
      .spyOn(global, 'setTimeout')
      .mockImplementation(callback => {
        callback();
        return 0;
      });
    await expect(scripts().executeScript(helper, PY, '/code/a.py')).rejects.toMatchObject({
      name: 'NiceError',
      message: expect.stringContaining("didn't return a response in time"),
    });
    expect(timeout).toHaveBeenCalledWith(expect.any(Function), 30000);
  });

  test('executePythonCode: writes validate.py under appData/TwilioQuest and returns the exit data', async () => {
    const helper = createHelper({
      execResults: [{ code: 1, stdout: 'o', stderr: 'AssertionError: x' }],
    });
    await expect(scripts().executePythonCode(helper, 'CODE', ['a'])).resolves.toEqual({
      exitCode: 1,
      stdout: 'o',
      stderr: 'AssertionError: x',
    });
    expect(helper.fs.writeAsync).toHaveBeenCalledWith(VALIDATE_PY, 'CODE');
    expect(helper.exec).toHaveBeenCalledWith(PY, [VALIDATE_PY, 'a']);
  });

  test('executePythonCode: a spawn failure becomes a NiceError', async () => {
    const helper = createHelper({ execResults: [new Error('spawn ENOENT')] });
    await expect(scripts().executePythonCode(helper, 'CODE')).rejects.toMatchObject({
      name: 'NiceError',
      message: expect.stringContaining('There was a problem validating your Python code'),
    });
  });

  test('executePythonCode: rejects with a NiceError after 5 seconds', async () => {
    const helper = createHelper();
    helper.exec.mockReturnValue(new Promise(() => {}));
    const timeout = jest
      .spyOn(global, 'setTimeout')
      .mockImplementation(callback => {
        callback();
        return 0;
      });
    await expect(scripts().executePythonCode(helper, 'CODE')).rejects.toMatchObject({
      name: 'NiceError',
      message: expect.stringContaining('There was a problem validating your Python code'),
    });
    expect(timeout).toHaveBeenCalledWith(expect.any(Function), 5000);
  });

  test('requires the app data path from the helper (no electron)', async () => {
    const helper = createHelper();
    helper.getAppDataPath.mockImplementation(() => {
      throw new Error('no app');
    });
    await expect(scripts().executePythonCode(helper, 'CODE')).rejects.toThrow('no app');
  });
});

describe('python_basics_install (spawn -> helper.exec)', () => {
  const run = async (execResult, fields = { pythonPath: PY }, executableValid) => {
    const helper = createHelper({
      validationFields: fields,
      execResults: [execResult],
      executableValid,
    });
    await validator('python_basics_install')(helper);
    return helper;
  };

  test('Python 3 on stdout succeeds and sets PYTHON_EXE', async () => {
    const helper = await run(ok('Python 3.9.1\n'));
    expect(helper.exec).toHaveBeenCalledWith(PY, ['--version']);
    expect(helper.success).toHaveBeenCalledWith(
      expect.stringContaining('Python 3.9.1'),
      [{ name: 'PYTHON_EXE', value: PY }]
    );
  });

  test('Python 2 printing the version to stderr is rejected', async () => {
    const helper = await run({ code: 0, stdout: '', stderr: 'Python 2.7.18\n' });
    expect(helper.fail.mock.calls[0][0]).toMatch(/This mission requires/);
    expect(helper.fail.mock.calls[0][0]).toMatch(/Python 2\.7\.18/);
  });

  test('a non-zero exit code fails with the code', async () => {
    const helper = await run({ code: 2, stdout: '', stderr: 'bad' });
    expect(helper.fail.mock.calls[0][0]).toMatch(/Error code: 2/);
    expect(helper.success).not.toHaveBeenCalled();
  });

  test('an invalid executable is reported without running it again', async () => {
    const helper = createHelper({
      validationFields: { pythonPath: PY },
      executableValid: [false, 'not executable'],
    });
    await validator('python_basics_install')(helper);
    expect(helper.fail).toHaveBeenCalledWith('not executable');
    expect(helper.exec).not.toHaveBeenCalled();
  });

  test('a spawn failure is reported as a generic failure', async () => {
    const helper = await run(new Error('spawn EACCES'));
    expect(helper.fail.mock.calls[0][0]).toMatch(/couldn't validate your Python 3 installation/);
  });
});

describe('python_basics_hello', () => {
  test('runs the script and records the code folder', async () => {
    const helper = createHelper({
      validationFields: { programPath: '/code/salutation.py' },
      execResults: [ok('hello')],
    });
    await validator('python_basics_hello')(helper);
    expect(helper.fs.existsAsync).toHaveBeenCalledWith('/code/salutation.py');
    expect(helper.exec).toHaveBeenCalledWith(PY, ['/code/salutation.py']);
    expect(helper.success).toHaveBeenCalledWith(expect.stringContaining('Trial of Salutation'), [
      { name: 'PYTHON_CODE_PATH', value: '/code' },
    ]);
  });

  test('missing path, missing file and a failing script fail', async () => {
    let helper = createHelper({ validationFields: {} });
    await validator('python_basics_hello')(helper);
    expect(helper.fail.mock.calls[0][0]).toMatch(/provide a path to your Python script/);

    helper = createHelper({ validationFields: { programPath: '/x.py' }, existsDefault: false });
    await validator('python_basics_hello')(helper);
    expect(helper.fail.mock.calls[0][0]).toMatch(/couldn't find a file at the path/);

    helper = createHelper({
      validationFields: { programPath: '/x.py' },
      execResults: [{ code: 1, stdout: '', stderr: 'e' }],
    });
    await validator('python_basics_hello')(helper);
    expect(helper.fail.mock.calls[0][0]).toMatch(/error\.txt/);
    expect(helper.success).not.toHaveBeenCalled();
  });
});

describe('validators that append assertion code (fs-jetpack, spawn -> helper)', () => {
  const withAssertions = [
    ['python_basics_variables', 'variables.py'],
    ['python_basics_numbers_math', 'numbers_math.py'],
    ['python_basics_booleans', 'booleans.py'],
    ['python_basics_lists', 'lists.py'],
    ['python_basics_dictionaries', 'dictionaries.py'],
    ['python_basics_functions', 'functions.py'],
    ['python_basics_function_args', 'function_args.py'],
    ['python_basics_functions_return', 'functions_return.py'],
    ['python_basics_challenge', 'challenge.py'],
  ];

  test.each(withAssertions)('%s: succeeds when python exits 0 for the script and the assertions', async name => {
    const helper = createHelper({ defaultExec: ok('Hail, friend! Dio Brando') });
    await validator(name)(helper);
    expect(helper.fail).not.toHaveBeenCalled();
    expect(helper.success).toHaveBeenCalledTimes(1);
    expect(helper.fs.readAsync).toHaveBeenCalled();
    // the learner's script (first call) and our validation script (later)
    expect(helper.exec.mock.calls[0][0]).toBe(PY);
    expect(helper.exec.mock.calls[0][1][0]).toMatch(/\.py$/);
    expect(helper.exec.mock.calls.pop()[1][0]).toBe(VALIDATE_PY);
    expect(helper.fs.writeAsync).toHaveBeenCalledWith(
      VALIDATE_PY,
      expect.stringContaining('print("hi")')
    );
  });

  test.each(withAssertions)('%s: a failing assertion is reported with its text', async name => {
    const helper = createHelper({ defaultExec: ok('') });
    helper.exec.mockImplementation(async (program, args) =>
      args[0] === VALIDATE_PY
        ? { code: 1, stdout: '', stderr: 'Traceback\nAssertionError: nope the value' }
        : ok('')
    );
    await validator(name)(helper);
    expect(helper.success).not.toHaveBeenCalled();
    expect(helper.fail.mock.calls[0][0]).toMatch(/nope the value/);
  });

  test.each(withAssertions)('%s: a missing script fails with the setup message', async name => {
    const helper = createHelper({ existsDefault: false });
    await validator(name)(helper);
    expect(helper.exec).not.toHaveBeenCalled();
    expect(helper.fail.mock.calls[0][0]).toMatch(/This trial asked you to create a file/);
  });
});

describe('validators that check script output', () => {
  test('python_basics_iterate_list: wrong output writes output.txt and fails', async () => {
    const helper = createHelper({ execResults: [ok('Duke\nRuby\nDottie\nSnake\nJoe\n')] });
    await validator('python_basics_iterate_list')(helper);
    expect(helper.fail).toHaveBeenCalled();
    expect(helper.fs.writeAsync).toHaveBeenCalledWith(
      path.join(CODE_DIR, 'output.txt'),
      expect.stringContaining('Script arguments: Duke,Ruby,Dottie,Snake,Joe')
    );
  });

  test('python_basics_iterate_list: correct output succeeds', async () => {
    const helper = createHelper({
      execResults: [ok('1. Duke\n2. Ruby\n3. Dottie\n4. Snake\n5. Joe\n')],
    });
    await validator('python_basics_iterate_list')(helper);
    expect(helper.success).toHaveBeenCalledTimes(1);
  });

  test('python_basics_fizzbuzz: too short output fails, a spawn error is generic', async () => {
    let helper = createHelper({ execResults: [ok('fizzbuzz\n')] });
    await validator('python_basics_fizzbuzz')(helper);
    expect(helper.fail.mock.calls[0][0]).toMatch(/at least four lines/);
    expect(helper.exec.mock.calls[0][1].slice(1)).toEqual(['-3000', '7', '6', '100']);

    helper = createHelper({ execResults: [new Error('spawn ENOENT')] });
    await validator('python_basics_fizzbuzz')(helper);
    expect(helper.fail.mock.calls[0][0]).toMatch(/couldn't successfully run your Python script/);
  });

  test('python_basics_conditional and python_basics_script_args and python_basics_strings run python with checkSetup', async () => {
    for (const name of [
      'python_basics_conditional',
      'python_basics_script_args',
      'python_basics_strings',
    ]) {
      const helper = createHelper({ existsDefault: false });
      await validator(name)(helper);
      expect(helper.exec).not.toHaveBeenCalled();
      expect(helper.fail.mock.calls[0][0]).toMatch(/This trial asked you to create a file/);

      const running = createHelper({ defaultExec: ok('') });
      await validator(name)(running);
      expect(running.exec).toHaveBeenCalled();
      expect(running.exec.mock.calls[0][0]).toBe(PY);
    }
  });
});
