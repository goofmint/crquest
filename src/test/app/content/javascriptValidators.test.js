jest.mock('../../../js/app/common/analytics', () => ({
  __esModule: true,
  default: { analyticsId: 'test-id' },
}));
jest.mock('../../../js/app/common/world', () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock('../../../js/app/config/config', () => ({
  __esModule: true,
  default: {
    codeStoragePath: '/code',
    codeStorageFileName: 'code.js',
  },
}));
jest.mock('../../../js/app/common/context', () => ({
  getContext: jest.fn(() => ({ levelName: 'javascript' })),
}));

import fs from 'fs';
import os from 'os';
import path from 'path';
import ValidationHelper from '../../../js/app/components/hack_interface/validator/ValidationHelper';

// The validators run the learner's script with `helper.env.TQ_NODE_EXE`; the
// tests use the `node` found on the PATH (process.execPath is not Node when
// jest runs in the Electron runner).
const NODE_EXE = 'node';

const PACKAGE_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'public',
  'content',
  'twilioquest-javascript'
);
const requireValidator = objective =>
  // eslint-disable-next-line global-require, import/no-dynamic-require
  require(path.join(
    PACKAGE_PATH,
    'levels',
    'javascript',
    'objectives',
    objective,
    'validator.js'
  ));
const requireScript = name =>
  // eslint-disable-next-line global-require, import/no-dynamic-require
  require(path.join(PACKAGE_PATH, 'scripts', name));

const READY_WORLD_STATE = {
  room1: { passwordFound: true },
  eastWing: { hadSavedConversation: true },
  southWing: { hadSavedConversation: true },
  northWing: { hadSavedConversation: true },
  beamTwoOnline: true,
  beamThreeOnline: true,
  beamFourOnline: true,
};

let workspace;

beforeEach(() => {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tq-javascript-'));
});

afterEach(() => {
  fs.rmdirSync(workspace, { recursive: true });
});

const writeScript = (name, code) =>
  fs.writeFileSync(path.join(workspace, name), code);

// A real ValidationHelper (real helper.fs / helper.exec / pullVars); only the
// app singletons are mocked.
const makeHelper = ({
  env = {},
  validationFields = {},
  worldState = READY_WORLD_STATE,
} = {}) => {
  const callback = jest.fn();
  const helper = new ValidationHelper(
    {
      context: { levelState: { TQ_JAVASCRIPT_WORLD_STATE: worldState } },
      env: {
        TQ_NODE_EXE: NODE_EXE,
        TQ_JAVASCRIPT_WORKSPACE_PATH: workspace,
        ...env,
      },
      validationFields,
    },
    callback,
    {}
  );
  return { helper, callback };
};

const run = async (objective, options) => {
  const { helper, callback } = makeHelper(options);
  await requireValidator(objective)(helper);
  expect(callback).toHaveBeenCalledTimes(1);
  const [error, result] = callback.mock.calls[0];
  return error ? { ok: false, message: error.message } : { ok: true, ...result };
};

// Objectives that evaluate the learner's file in the validator
// (pullVarsFromUserCodeLocalScope): file name, a correct solution, wrong code.
const VARIABLE_OBJECTIVES = [
  {
    objective: 'js_declare_variable',
    file: 'laserConfiguration.js',
    good: 'const laserStatus = "OFF";',
    wrong: 'const laserStatus = "ON";',
    wrongMessage: /was not set to the string value of "OFF"/,
  },
  {
    objective: 'js_declare_variable_multiple',
    file: 'chestConfiguration.js',
    good: 'const accessLevel = 7; const favoriteRobot = "Cedric"; const verifiedUser = true;',
    wrong:
      'const accessLevel = "7"; const favoriteRobot = "Cedric"; const verifiedUser = true;',
    wrongMessage: /accessLevel/,
  },
  {
    objective: 'arrays',
    file: 'freighterInventory.js',
    good:
      'const inventory = ["Ducktypium Ore", "Uranium Rod", "Ruthenium Isotopes", "Concave Lens", "Refraction Panel"];',
    wrong: 'const inventory = ["a"];',
    wrongMessage: /five items/,
  },
  {
    objective: 'forEach',
    file: 'freightScanner.js',
    good:
      'function scan(items) { let n = 0; items.forEach(i => { if (i === "contraband") n++; }); return n; }',
    wrong: 'function scan(items) { return items.length; }',
    wrongMessage: /not the value we were looking/,
  },
  {
    objective: 'js_declare_function',
    file: 'laserFunction.js',
    good: 'function getLaserSetting() { return "OFF"; }',
    wrong: 'function getLaserSetting() { return "ON"; }',
    wrongMessage: /The correct value is/,
  },
  {
    objective: 'js_function_arguments',
    file: 'politeLasers.js',
    good:
      'function getLaserSetting(word) { return word === "please" ? "OFF" : "ON"; }',
    wrong: 'function getLaserSetting() { return "ON"; }',
    wrongMessage: /"please"/,
  },
  {
    objective: 'loopFilter',
    file: 'freightFilter.js',
    good:
      'function scanAndFilter(items, bad) { return items.filter(i => i !== bad); }',
    wrong: 'function scanAndFilter(items) { return items; }',
    wrongMessage: /not the value we were looking|returning/,
  },
  {
    objective: 'loopGetIndexes',
    file: 'freightScanner2.js',
    good:
      'function scan(items) { const r = []; items.forEach((v, i) => { if (v === "contraband") r.push(i); }); return r; }',
    wrong: 'function scan() { return []; }',
    wrongMessage: /returning/,
  },
  {
    objective: 'loopMap',
    file: 'freightTransformer.js',
    good: 'function transform(items) { return items.map(i => i.toUpperCase()); }',
    wrong: 'function transform(items) { return items; }',
    wrongMessage: /returning/,
  },
  {
    objective: 'loopReduce',
    file: 'freightMass.js',
    good:
      'function calculateMass(items) { return items.reduce((t, i) => t + i.length * 0 + 5, 0); }',
    wrong: 'function calculateMass() { return 1; }',
    wrongMessage: /returning/,
  },
  {
    objective: 'js_split_east_laser',
    file: 'laserPower.js',
    good: 'function calculatePower(a) { return a.reduce((t, n) => t + n * 2, 0); }',
    wrong: 'function calculatePower() { return 1; }',
    wrongMessage: /number we were looking/,
  },
  {
    objective: 'js_split_north_laser',
    file: 'targetingSolution.js',
    good:
      'class TargetingSolution { constructor(c) { this.c = c; } target() { return `(${this.c.x}, ${this.c.y}, ${this.c.z})`; } }',
    wrong:
      'class TargetingSolution { constructor() {} target() { return "x"; } }',
    wrongMessage: /\(x, y, z\)/,
  },
  {
    objective: 'classes',
    file: 'classes.js',
    good:
      'class Materializer { constructor(t) { this.target = t; this.activated = false; } activate() { this.activated = true; } materialize() { return this.activated ? this.target : undefined; } }',
    wrong: 'class Materializer { constructor() {} }',
    wrongMessage: /target from the constructor/,
  },
];

describe.each(VARIABLE_OBJECTIVES)(
  '$objective (learner code evaluated through the helper)',
  ({ objective, file, good, wrong, wrongMessage }) => {
    test('succeeds with a correct solution', async () => {
      writeScript(file, good);
      const result = await run(objective);
      expect(result.message).not.toMatch(/error|problem/i);
      expect(result.ok).toBe(true);
    });

    test('fails with a wrong solution', async () => {
      writeScript(file, wrong);
      const result = await run(objective);
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(wrongMessage);
    });

    test('tells the learner when the file is missing', async () => {
      const result = await run(objective);
      expect(result.ok).toBe(false);
      expect(result.message).toContain(`couldn't find your "${file}"`);
    });

    test('tells the learner when the variable is not defined', async () => {
      writeScript(file, 'const somethingElse = 1;');
      const result = await run(objective);
      expect(result.ok).toBe(false);
      expect(result.message).toContain('was not defined in your');
    });

    test('reports an error thrown by the learner code', async () => {
      writeScript(file, 'throw new Error("boom");');
      const result = await run(objective);
      expect(result.ok).toBe(false);
      expect(result.message).toContain('There was an error executing your JavaScript code');
      expect(result.message).toContain('boom');
    });
  }
);

describe('js_split_east_laser readiness gate', () => {
  test('fails before the engineer conversation without reading the file', async () => {
    const result = await run('js_split_east_laser', { worldState: {} });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/electrical engineer/);
  });
});

// Objectives that run the learner's script with the learner's Node.js
// (executeCodeString -> helper.exec).
const NODE_OBJECTIVES = [
  {
    objective: 'js_unlock_door',
    file: 'sayPlease.js',
    good: 'console.log("please");',
    wrong: 'console.log("nope");',
    wrongMessage: /"magic word"/,
  },
  {
    objective: 'js_basics_cli_args',
    file: 'divideByTwo.js',
    good: 'console.log(Number(process.argv[2]) / 2);',
    wrong: 'console.log(process.argv[2]);',
    wrongMessage: /dividing/,
  },
  {
    objective: 'js_north_bridge',
    file: 'northBridgeControl.js',
    good: 'if (process.argv[2] === "EXTEND") console.log("Extending bridge!");',
    wrong: 'console.log("Extending bridge!");',
    wrongMessage: /print nothing at all/,
  },
  {
    objective: 'js_scientist_bridge',
    file: 'enhancedLifeDetector.js',
    good:
      'const m = { 0: "alive", 1: "flowering", 2: "shedding" }; console.log(m[process.argv[2]] || "other");',
    wrong: 'console.log("other");',
    wrongMessage: /"alive"/,
  },
  {
    objective: 'js_west_bridge',
    file: 'treeLifeDetector.js',
    good: 'console.log(process.argv[2] === "0" ? "alive" : "other");',
    wrong: 'console.log("other");',
    wrongMessage: /"alive"/,
  },
  {
    objective: 'js_south_bridge',
    file: 'shouldWater.js',
    good:
      'if (process.argv[2] === "0" && Number(process.argv[3]) > 10) console.log("WATER");',
    wrong: 'console.log("WATER");',
    wrongMessage: /should not print anything/,
  },
  {
    objective: 'js_split_south_laser',
    file: 'sortOrder.js',
    good:
      'const [a, b] = process.argv.slice(2).map(s => s.toLowerCase()); console.log(a < b ? -1 : a > b ? 1 : 0);',
    wrong: 'console.log(0);',
    wrongMessage: /"-1"/,
  },
  {
    objective: 'fizzBuzz',
    file: 'fizzBuzz.js',
    good:
      'const n = Number(process.argv[2]); let o = ""; if (n % 3 === 0) o += "Java"; if (n % 5 === 0) o += "Script"; console.log(o || n);',
    wrong: 'console.log(process.argv[2]);',
    wrongMessage: /we passed in "24" but got "24"/,
  },
];

describe.each(NODE_OBJECTIVES)(
  '$objective (learner script run with Node.js)',
  ({ objective, file, good, wrong, wrongMessage }) => {
    test('succeeds with a correct script', async () => {
      writeScript(file, good);
      const result = await run(objective);
      expect(result.message).not.toMatch(/error executing/);
      expect(result.ok).toBe(true);
    });

    test('fails with a wrong script', async () => {
      writeScript(file, wrong);
      const result = await run(objective);
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(wrongMessage);
    });

    test('tells the learner when the file is missing', async () => {
      const result = await run(objective);
      expect(result.ok).toBe(false);
      expect(result.message).toContain(`couldn't find your "${file}"`);
    });

    test('reports an error when Node.js cannot be started', async () => {
      writeScript(file, good);
      const result = await run(objective, {
        env: { TQ_NODE_EXE: path.join(workspace, 'no-such-node') },
      });
      expect(result.ok).toBe(false);
      expect(result.message).toContain('There was an error executing your JavaScript code');
      expect(result.message).toContain('There was a problem validating your JavaScript code');
    });
  }
);

describe('objectives checked with assertions (evaluteAssertions)', () => {
  test('arrays2 succeeds and fails', async () => {
    writeScript(
      'addFirstToLast.js',
      'function addFirstToLast(a) { return a.length ? a[0] + a[a.length - 1] : ""; }'
    );
    expect((await run('arrays2')).ok).toBe(true);

    writeScript('addFirstToLast.js', 'function addFirstToLast(a) { return "x"; }');
    const failure = await run('arrays2');
    expect(failure.ok).toBe(false);
    expect(failure.message).toContain('addFirstToLast');
  });

  test('arrays2 reports a missing function', async () => {
    writeScript('addFirstToLast.js', 'const unrelated = 1;');
    const result = await run('arrays2');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('does not exist');
  });

  test('arrayFunctions succeeds and fails', async () => {
    writeScript(
      'getFirstAmountSorted.js',
      'function getFirstAmountSorted(a, n) { return [...a].sort().slice(0, n); }'
    );
    expect((await run('arrayFunctions')).ok).toBe(true);

    writeScript(
      'getFirstAmountSorted.js',
      'function getFirstAmountSorted(a, n) { return a.slice(0, n); }'
    );
    expect((await run('arrayFunctions')).ok).toBe(false);
  });

  test('reports a missing file', async () => {
    const result = await run('arrays2');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('couldn\'t find your "addFirstToLast.js"');
  });
});

describe('executeCodeString', () => {
  const { executeCodeString, NiceError } = requireScript('objectiveValidation');

  test('passes arguments so that process.argv[2] is the first one', async () => {
    const { helper } = makeHelper();
    const result = await executeCodeString(
      helper,
      NODE_EXE,
      'console.log(JSON.stringify(process.argv.slice(2)))',
      [128, 'x y']
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(['128', 'x y']);
  });

  test('returns the output of a failing script instead of throwing', async () => {
    const { helper } = makeHelper();
    const result = await executeCodeString(
      helper,
      NODE_EXE,
      'throw new Error("oops")'
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('oops');
  });

  test('rejects with a NiceError when the program cannot be spawned', async () => {
    const helper = { exec: jest.fn().mockRejectedValue(new Error('ENOENT')) };
    await expect(executeCodeString(helper, 'x', 'code')).rejects.toBeInstanceOf(
      NiceError
    );
    expect(helper.exec).toHaveBeenCalledWith('x', ['-e', 'code', 'validate.js']);
  });

  test('rejects with a NiceError after five seconds without a result', async () => {
    // jest fake timers are not available in the Electron runner.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const timeout = jest.spyOn(global, 'setTimeout').mockImplementation(fn => {
      fn();
      return 0;
    });
    try {
      const helper = { exec: jest.fn(() => new Promise(() => {})) };
      await expect(executeCodeString(helper, 'x', 'code')).rejects.toBeInstanceOf(
        NiceError
      );
      expect(timeout).toHaveBeenCalledWith(expect.any(Function), 5000);
    } finally {
      timeout.mockRestore();
      warn.mockRestore();
    }
  });
});

describe('js_node_env_setup', () => {
  test('stores NODE_EXE for a working node', async () => {
    const { helper, callback } = makeHelper({
      validationFields: { nodePath: ' ' + process.env.TQ_TEST_NODE_PATH + ' ' },
    });
    // validationFields are trimmed by ValidationHelper; use the real helper
    // for exec and stub only the (shell based) executable pre-check.
    helper.isExecutableValid = jest.fn().mockResolvedValue([true, undefined]);
    helper.validationFields.nodePath = 'node';
    await requireValidator('js_node_env_setup')(helper);

    const [error, result] = callback.mock.calls[0];
    expect(error).toBeNull();
    expect(result.message).toMatch(/Looks like you have this version installed/);
    expect(result.message).toMatch(/v\d+\.\d+\.\d+/);
    expect(result.env).toEqual([{ name: 'NODE_EXE', value: 'node' }]);
  });

  test('fails when the executable check fails', async () => {
    const { helper, callback } = makeHelper({
      validationFields: { nodePath: '/nope' },
    });
    helper.isExecutableValid = jest.fn().mockResolvedValue([false, 'not executable']);
    await requireValidator('js_node_env_setup')(helper);
    expect(callback.mock.calls[0][0].message).toBe('not executable');
  });

  test('fails when --version exits non-zero', async () => {
    const { helper, callback } = makeHelper({
      validationFields: { nodePath: 'node' },
    });
    helper.isExecutableValid = jest.fn().mockResolvedValue([true, undefined]);
    helper.exec = jest.fn().mockResolvedValue({ code: 1, stdout: '', stderr: 'x' });
    await requireValidator('js_node_env_setup')(helper);
    expect(callback.mock.calls[0][0].message).toMatch(/something went wrong/);
    expect(helper.exec).toHaveBeenCalledWith('node', ['--version']);
  });

  test('falls back to the generic message when exec rejects', async () => {
    const { helper, callback } = makeHelper({
      validationFields: { nodePath: 'node' },
    });
    helper.isExecutableValid = jest.fn().mockResolvedValue([true, undefined]);
    helper.exec = jest.fn().mockRejectedValue(new Error('spawn failed'));
    jest.spyOn(console, 'log').mockImplementation(() => {});
    await requireValidator('js_node_env_setup')(helper);
    console.log.mockRestore();
    expect(callback.mock.calls[0][0].message).toMatch(/couldn't validate your Node.js installation/);
  });
});

describe('js_node_workspace', () => {
  test('succeeds for an existing directory', async () => {
    const { helper, callback } = makeHelper({
      validationFields: { workspacePath: workspace },
    });
    await requireValidator('js_node_workspace')(helper);
    const [error, result] = callback.mock.calls[0];
    expect(error).toBeNull();
    expect(result.env).toEqual([
      { name: 'JAVASCRIPT_WORKSPACE_PATH', value: workspace },
    ]);
  });

  test('fails for a missing directory and for an empty value', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const missing = makeHelper({
      validationFields: { workspacePath: path.join(workspace, 'nope') },
    });
    await requireValidator('js_node_workspace')(missing.helper);
    expect(missing.callback.mock.calls[0][0].message).toMatch(/couldn't find a directory/);

    const empty = makeHelper({ validationFields: { workspacePath: '' } });
    await requireValidator('js_node_workspace')(empty.helper);
    expect(empty.callback.mock.calls[0][0].message).toMatch(/provide a path/);
    console.log.mockRestore();
  });
});

describe('create_repo', () => {
  const makeRepoHelper = overrides => {
    const made = makeHelper();
    Object.assign(made.helper, overrides);
    return made;
  };

  test('fails when git is not installed', async () => {
    const { helper, callback } = makeRepoHelper({
      commandExists: jest.fn().mockResolvedValue(false),
    });
    await requireValidator('create_repo')(helper);
    expect(callback.mock.calls[0][0].message).toContain('could not!');
    expect(callback.mock.calls[0][0].message).toContain('not found: git');
  });

  test('fails when there is no .git directory', async () => {
    const { helper, callback } = makeRepoHelper({
      commandExists: jest.fn().mockResolvedValue(true),
    });
    await requireValidator('create_repo')(helper);
    expect(callback.mock.calls[0][0].message).toContain(
      "We didn't find a .git directory"
    );
  });

  test('fails when there is no commit yet, succeeds after one', async () => {
    fs.mkdirSync(path.join(workspace, '.git'));
    const noCommits = makeRepoHelper({
      commandExists: jest.fn().mockResolvedValue(true),
      exec: jest.fn().mockResolvedValue({ code: 0, stdout: 'No commits yet', stderr: '' }),
    });
    await requireValidator('create_repo')(noCommits.helper);
    expect(noCommits.callback.mock.calls[0][0].message).toMatch(/initial commit/);
    expect(noCommits.helper.exec).toHaveBeenCalledWith('git', ['status'], {
      cwd: workspace,
    });

    const committed = makeRepoHelper({
      commandExists: jest.fn().mockResolvedValue(true),
      exec: jest.fn().mockResolvedValue({ code: 0, stdout: 'clean', stderr: '' }),
    });
    await requireValidator('create_repo')(committed.helper);
    expect(committed.callback.mock.calls[0][0]).toBeNull();
  });

  test('reports a failing git status', async () => {
    fs.mkdirSync(path.join(workspace, '.git'));
    const { helper, callback } = makeRepoHelper({
      commandExists: jest.fn().mockResolvedValue(true),
      exec: jest.fn().mockResolvedValue({ code: 128, stdout: '', stderr: 'fatal: bad' }),
    });
    await requireValidator('create_repo')(helper);
    expect(callback.mock.calls[0][0].message).toContain('Command failed: git status');
    expect(callback.mock.calls[0][0].message).toContain('fatal: bad');
  });
});
