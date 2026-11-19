vi.mock('../../../js/app/common/analytics', () => ({
  __esModule: true,
  default: { analyticsId: 'test-id' },
}));
vi.mock('../../../js/app/common/world', () => ({
  __esModule: true,
  default: vi.fn(),
}));
vi.mock('../../../js/app/config/config', () => ({
  __esModule: true,
  default: {
    codeStoragePath: '/code',
    codeStorageFileName: 'code.js',
  },
}));
vi.mock('../../../js/app/common/context', () => ({
  getContext: vi.fn(() => ({ levelName: 'javascript' })),
}));
// staticFileUrl needs the page URL of the Electron renderer; the worker script
// is located directly instead
vi.mock('../../../js/app/common/fs_utils', async () => {
  const nodePath = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  return {
    staticFileUrl: relativePath =>
      pathToFileURL(
        nodePath.resolve(__dirname, '..', '..', '..', '..', 'public', relativePath)
      ).href,
  };
});

import fs from 'fs';
import os from 'os';
import path from 'path';
import ValidationHelper from '../../../js/app/components/hack_interface/validator/ValidationHelper';
import { NodeWorker } from '../../utils/nodeWorker';

// The 12 twilioquest-javascript validators that call the learner's functions or
// classes: forEach, js_declare_function, js_function_arguments, loopFilter,
// loopGetIndexes, loopMap, loopReduce, js_split_east_laser,
// js_split_north_laser, classes, instantiation and js_split_west_laser. They run the learner's code and their test
// cases in a real Worker (NodeWorker over worker_threads). Every case below
// (learner code -> pass, or the failure message it must produce) was also run
// against the former `vm` based validators on main with the same result (and
// the same message text), except the last describe, which a vm context cannot
// reproduce.

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

const READY_WORLD_STATE = {
  eastWing: { hadSavedConversation: true },
  northWing: { hadSavedConversation: true },
  beamTwoOnline: true,
  beamThreeOnline: true,
  beamFourOnline: true,
};

let workspace;

beforeAll(() => {
  vi.stubGlobal('Worker', NodeWorker);
});
afterAll(() => {
  vi.unstubAllGlobals();
});
beforeEach(() => {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tq-javascript-fn-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(workspace, { recursive: true, force: true });
});

const run = async (objective, file, code, messages = {}) => {
  if (code !== undefined) {
    fs.writeFileSync(path.join(workspace, file), code);
  }
  const callback = vi.fn();
  const helper = new ValidationHelper(
    {
      context: { levelState: { TQ_JAVASCRIPT_WORLD_STATE: READY_WORLD_STATE } },
      env: { TQ_JAVASCRIPT_WORKSPACE_PATH: workspace },
      validationFields: {},
    },
    callback,
    {},
    messages
  );
  await requireValidator(objective)(helper);
  expect(callback).toHaveBeenCalledTimes(1);
  const [error, result] = callback.mock.calls[0];
  return error ? { ok: false, message: error.message } : { ok: true, ...result };
};

const THROWS = 'There was an error executing your JavaScript code';

test.each([
  [
    'the first call',
    "function construct(name) { return { name, material: 'human', assemble: false, duration: 999 }; }",
    ['「assemble」の値は true にしてください。', '「duration」の値は 1000 にしてください。'],
  ],
  [
    'the second call',
    "function construct() { return { name: 'Gene', material: 'human', assemble: true, duration: 1000 }; }",
    ['「name」の値は Irene にしてください。'],
  ],
])('localizes property mismatches for %s of construct', async (_, code, details) => {
  const messages = JSON.parse(fs.readFileSync(path.join(
    PACKAGE_PATH, 'levels/javascript/objectives/instantiation/messages.ja.json'
  ), 'utf8'));
  const result = await run('instantiation', 'construction.js', code, messages);

  expect(result.ok).toBe(false);
  expect(result.message).toContain(details.join('<br/>'));
});

// Cases shared by every validator of a function: [description, code, expectation]
// expectation: true (passes) or a RegExp the failure message must match
const commonFunctionCases = name => [
  ['is not a function', `const ${name} = 5;`, /callable function/],
  ['is a string', `var ${name} = "scan";`, /callable function/],
  ['is not defined', 'const somethingElse = 1;', /was not defined in your/],
  ['has a syntax error', 'function (', new RegExp(`${THROWS}[\\s\\S]*SyntaxError`)],
  ['throws at the top level', 'throw new Error("boom");', new RegExp(`${THROWS}[\\s\\S]*Error: boom`)],
  ['throws a string at the top level', 'throw "plain text";', new RegExp(`${THROWS}[\\s\\S]*plain text`)],
  [
    'throws when called',
    `function ${name}() { throw new TypeError("bad input"); }`,
    new RegExp(`error executing your ${name} function[\\s\\S]*TypeError: bad input`),
  ],
  [
    'does not return anything',
    `function ${name}() {}`,
    /not yet returning a value/,
  ],
  [
    'returns null',
    `function ${name}() { return null; }`,
    /not yet returning a value/,
  ],
];

const FUNCTION_VALIDATORS = [
  {
    objective: 'forEach',
    file: 'freightScanner.js',
    name: 'scan',
    cases: [
      [
        'counts contraband (function declaration)',
        'function scan(items) { let n = 0; items.forEach(i => { if (i === "contraband") n++; }); return n; }',
        true,
      ],
      [
        'counts contraband (const arrow function)',
        'const scan = items => items.filter(i => i === "contraband").length;',
        true,
      ],
      [
        'counts contraband (let + function expression, var helper)',
        'var helper = i => i === "contraband"; let scan = function(items) { return items.filter(helper).length; };',
        true,
      ],
      ['does not return a number', 'function scan() { return "a"; }', /not returning a number/],
      ['returns a number that is wrong', 'function scan(items) { return items.length; }', /not the value we were looking/],
      ['returns a boolean-like number', 'function scan() { return true; }', /not the value we were looking/],
      [
        'only fails on the second call',
        'function scan(items) { if (items.length) { throw new Error("later"); } return 0; }',
        /error executing your scan function[\s\S]*Error: later/,
      ],
    ],
  },
  {
    objective: 'js_declare_function',
    file: 'laserFunction.js',
    name: 'getLaserSetting',
    cases: [
      ['returns "OFF"', 'function getLaserSetting() { return "OFF"; }', true],
      ['returns "OFF" (arrow function)', 'const getLaserSetting = () => "OFF";', true],
      ['returns a number', 'function getLaserSetting() { return 1; }', /not returning a string value/],
      [
        'returns another string',
        'function getLaserSetting() { return "ON"; }',
        /returned the value\s+<span class="highlight">"ON"<\/span>\. The correct value is/,
      ],
    ],
  },
  {
    objective: 'js_function_arguments',
    file: 'politeLasers.js',
    name: 'getLaserSetting',
    cases: [
      [
        'is polite',
        'function getLaserSetting(word) { return word === "please" ? "OFF" : "ON"; }',
        true,
      ],
      [
        'is polite (arrow function)',
        'const getLaserSetting = word => (word === "please" ? "OFF" : "ON");',
        true,
      ],
      ['returns a number', 'function getLaserSetting() { return 1; }', /not returning a string value/],
      [
        'returns "OFF" for a number',
        'function getLaserSetting() { return "OFF"; }',
        /returned the value\s+<span class="highlight">"OFF"<\/span>\. The correct value is\s+<span class="highlight">"ON"/,
      ],
      [
        'is wrong for the second argument (the message shows the first result)',
        'function getLaserSetting(word) { return word === 1 ? "ON" : "nope"; }',
        /returned the value\s+<span class="highlight">"ON"<\/span>\. The correct value is\s+<span class="highlight">"ON"/,
      ],
      [
        'never accepts "please"',
        'function getLaserSetting() { return "ON"; }',
        /passed the string "please", it should return/,
      ],
    ],
  },
  {
    objective: 'loopFilter',
    file: 'freightFilter.js',
    name: 'scanAndFilter',
    cases: [
      [
        'filters',
        'function scanAndFilter(items, bad) { return items.filter(i => i !== bad); }',
        true,
      ],
      [
        'filters with a loop',
        'function scanAndFilter(items, bad) { const out = []; for (const i of items) { if (i !== bad) out.push(i); } return out; }',
        true,
      ],
      ['returns a string', 'function scanAndFilter() { return "a"; }', /not returning an array/],
      ['returns an unfiltered array', 'function scanAndFilter(items) { return items; }', /not the array we were looking/],
      ['returns an empty array', 'function scanAndFilter() { return []; }', /not the array we were looking/],
      [
        'only returns an array for the first call',
        'function scanAndFilter(items) { return items.length ? undefined : []; }',
        /error executing your scanAndFilter function[\s\S]*TypeError/,
      ],
    ],
  },
  {
    objective: 'loopGetIndexes',
    file: 'freightScanner2.js',
    name: 'scan',
    cases: [
      [
        'finds the indexes',
        'function scan(items) { const r = []; items.forEach((v, i) => { if (v === "contraband") r.push(i); }); return r; }',
        true,
      ],
      ['returns a number', 'function scan() { return 3; }', /not returning an array/],
      ['returns an empty array', 'function scan() { return []; }', /not the array we were looking/],
      [
        'is right for the first two calls only',
        'function scan(items) { return items.length === 4 ? [0] : items.map((_, i) => i).filter(i => items[i] === "contraband"); }',
        /not the array we were looking/,
      ],
    ],
  },
  {
    objective: 'loopMap',
    file: 'freightTransformer.js',
    name: 'transform',
    cases: [
      ['maps', 'function transform(items) { return items.map(i => i.toUpperCase()); }', true],
      ['returns a string', 'function transform() { return "LOUD"; }', /not returning an array/],
      ['does not transform', 'function transform(items) { return items; }', /not the array we were looking/],
      [
        'transforms to lower case',
        'function transform(items) { return items.map(i => i.toLowerCase()); }',
        /not the array we were looking/,
      ],
    ],
  },
  {
    objective: 'loopReduce',
    file: 'freightMass.js',
    name: 'calculateMass',
    cases: [
      ['reduces', 'function calculateMass(items) { return items.reduce((t, i) => t + i.length, 0); }', true],
      ['does not return a number', 'function calculateMass() { return "heavy"; }', /not returning a number/],
      ['returns a wrong number', 'function calculateMass() { return 1; }', /not the number we were looking/],
      ['returns only a zero', 'function calculateMass() { return 0; }', /not the number we were looking/],
    ],
  },
  {
    objective: 'js_split_east_laser',
    file: 'laserPower.js',
    name: 'calculatePower',
    cases: [
      ['sums doubled', 'function calculatePower(a) { return a.reduce((t, n) => t + n * 2, 0); }', true],
      ['does not return a number', 'function calculatePower() { return "high"; }', /not returning a number/],
      ['returns a wrong number', 'function calculatePower() { return 1; }', /not the number we were looking/],
    ],
  },
  {
    objective: 'instantiation',
    file: 'construction.js',
    name: 'construct',
    cases: [
      [
        'returns the object',
        "function construct(name) { return { name, material: 'human', assemble: true, duration: 1000 }; }",
        true,
      ],
      [
        'returns more keys than needed (const arrow function)',
        "const construct = name => ({ name, material: 'human', assemble: true, duration: 1000, extra: 1 });",
        true,
      ],
      ['returns a string', 'function construct() { return "Gene"; }', /not returning an object/],
      ['returns a number', 'function construct() { return 1; }', /not returning an object/],
      [
        'misses keys',
        'function construct(name) { return { name }; }',
        /missing some keys[\s\S]*The keys material,assemble,duration were missing!/,
      ],
      [
        'has a wrong value on the first call',
        "function construct(name) { return { name, material: 'robot', assemble: true, duration: 1000 }; }",
        /Not all of the keys[\s\S]*"material" should have been human\.\s*$/,
      ],
      [
        'has several wrong values (strict comparison)',
        "function construct(name) { return { name, material: 'human', assemble: 'true', duration: '1000' }; }",
        /"assemble" should have been true\.<br\/>"duration" should have been 1000\.\s*$/,
      ],
      [
        'has a wrong value only on the second call',
        "function construct() { return { name: 'Gene', material: 'human', assemble: true, duration: 1000 }; }",
        /"name" should have been Irene\.\s*$/,
      ],
      [
        'only fails on the second call',
        "function construct(name) { if (name === 'Irene') { throw new Error('later'); } return { name, material: 'human', assemble: true, duration: 1000 }; }",
        /error executing your construct function[\s\S]*Error: later/,
      ],
    ],
  },
];

describe.each(FUNCTION_VALIDATORS)(
  '$objective (the learner function is exercised in a Worker)',
  ({ objective, file, name, cases }) => {
    test.each([...commonFunctionCases(name), ...cases])(
      'the learner code %s',
      async (description, code, expectation) => {
        const result = await run(objective, file, code);
        if (expectation === true) {
          expect(result.message).not.toMatch(/error|problem/i);
          expect(result.ok).toBe(true);
        } else {
          expect(result.ok).toBe(false);
          expect(result.message).toMatch(expectation);
        }
      }
    );

    test('tells the learner when the file is missing', async () => {
      const result = await run(objective, file);
      expect(result.ok).toBe(false);
      expect(result.message).toContain(`couldn't find your "${file}"`);
    });
  }
);

// Exact output for the ReferenceError / validation failure messages, which are
// the same for every function validator
describe('js_split_east_laser readiness gate', () => {
  test('fails before the engineer conversation without starting a Worker', async () => {
    const Spy = vi.fn();
    vi.stubGlobal('Worker', Spy);
    try {
      const callback = vi.fn();
      const helper = new ValidationHelper(
        {
          context: { levelState: { TQ_JAVASCRIPT_WORLD_STATE: {} } },
          env: { TQ_JAVASCRIPT_WORKSPACE_PATH: workspace },
          validationFields: {},
        },
        callback,
        {}
      );
      await requireValidator('js_split_east_laser')(helper);
      expect(callback.mock.calls[0][0].message).toMatch(/electrical engineer/);
      expect(Spy).not.toHaveBeenCalled();
    } finally {
      vi.stubGlobal('Worker', NodeWorker);
    }
  });
});

const DUCKTYPIUM = `class Ducktypium {
  constructor(color) {
    if (!['red', 'yellow', 'blue'].includes(color)) throw new Error('bad color');
    this.color = color;
    this.calibrationSequence = [];
  }
  refract(other) {
    const mine = this.color;
    if (other === mine) return this.color;
    const key = [mine, other].sort().join();
    return { 'blue,yellow': 'green', 'red,yellow': 'orange', 'blue,red': 'purple' }[key];
  }
  calibrate(sequence) {
    this.calibrationSequence = [...sequence].sort((a, b) => a - b).map(n => n * 3);
  }
}`;

const CLASS_VALIDATORS = [
  {
    objective: 'js_split_north_laser',
    file: 'targetingSolution.js',
    name: 'TargetingSolution',
    cases: [
      [
        'formats the target',
        'class TargetingSolution { constructor(c) { this.c = c; } target() { return `(${this.c.x}, ${this.c.y}, ${this.c.z})`; } }',
        true,
      ],
      [
        'formats the target with trailing whitespace (trimmed)',
        'class TargetingSolution { constructor(c) { this.c = c; } target() { return `(${this.c.x}, ${this.c.y}, ${this.c.z}) \n`; } }',
        true,
      ],
      [
        'is a class expression',
        'const TargetingSolution = class { constructor(c) { this.c = c; } target() { return `(${this.c.x}, ${this.c.y}, ${this.c.z})`; } };',
        true,
      ],
      [
        'is a constructor function that does not look like a class',
        'function TargetingSolution() {}',
        /it's not a\s+class/,
      ],
      [
        'has no target function',
        'class TargetingSolution { constructor() {} }',
        /should have an "target" function/,
      ],
      [
        'has a target that is not a function',
        'class TargetingSolution { constructor() { this.target = "x"; } }',
        /should have an "target" function/,
      ],
      [
        'formats the target wrongly',
        'class TargetingSolution { constructor() {} target() { return "x"; } }',
        /did not return\s+a string in the specified format/,
      ],
      [
        'has a constructor that throws',
        'class TargetingSolution { constructor() { throw new Error("ctor"); } }',
        /error executing your TargetingSolution constructor or functions[\s\S]*Error: ctor/,
      ],
      [
        'has a target that returns a non string',
        'class TargetingSolution { constructor() {} target() { return 1; } }',
        /error executing your TargetingSolution constructor or functions[\s\S]*TypeError/,
      ],
    ],
  },
  {
    objective: 'classes',
    file: 'classes.js',
    name: 'Materializer',
    cases: [
      [
        'is correct',
        'class Materializer { constructor(t) { this.target = t; this.activated = false; } activate() { this.activated = true; } materialize() { return this.activated ? this.target : undefined; } }',
        true,
      ],
      [
        'is a class expression with a field-less setup',
        'const Materializer = class { constructor(t) { this.target = t; this.activated = false; } activate() { this.activated = true; } materialize() { if (this.activated) return this.target; } };',
        true,
      ],
      [
        'is a constructor function that does not look like a class',
        'function Materializer() {}',
        /it's not a\s+class/,
      ],
      [
        'does not read the target',
        'class Materializer { constructor() {} }',
        /target from the constructor/,
      ],
      [
        'starts activated',
        'class Materializer { constructor(t) { this.target = t; this.activated = true; } }',
        /start with a property of "activated"/,
      ],
      [
        'has no activate function',
        'class Materializer { constructor(t) { this.target = t; this.activated = false; } }',
        /should have an "activate" function/,
      ],
      [
        'has no materialize function',
        'class Materializer { constructor(t) { this.target = t; this.activated = false; } activate() {} }',
        /should have an "materialize" function/,
      ],
      [
        'does not set activated',
        'class Materializer { constructor(t) { this.target = t; this.activated = false; } activate() {} materialize() {} }',
        /"activate" function should set activated to\s+true/,
      ],
      [
        'does not materialize the target',
        'class Materializer { constructor(t) { this.target = t; this.activated = false; } activate() { this.activated = true; } materialize() { return "other"; } }',
        /should return your target, "Gene" when it is activated/,
      ],
      [
        'materializes when it is not activated',
        'class Materializer { constructor(t) { this.target = t; this.activated = false; } activate() { this.activated = true; } materialize() { return this.target; } }',
        /should return undefined when it is not activated/,
      ],
      [
        'shares state between instances',
        'let shared = false; class Materializer { constructor(t) { this.target = t; this.activated = false; } activate() { shared = true; this.activated = true; } materialize() { return shared ? this.target : undefined; } }',
        /should return undefined when it is not activated/,
      ],
      [
        'has a constructor that throws',
        'class Materializer { constructor() { throw new Error("ctor"); } }',
        /error executing your Materialize constructor or functions[\s\S]*Error: ctor/,
      ],
    ],
  },
  {
    objective: 'js_split_west_laser',
    file: 'ducktypium.js',
    name: 'Ducktypium',
    cases: [
      ['is correct', DUCKTYPIUM, true],
      [
        'accepts any color',
        DUCKTYPIUM.replace("throw new Error('bad color')", 'void 0'),
        /should only accept "red", "yellow", or "blue"/,
      ],
      [
        'does not set the color',
        DUCKTYPIUM.replace('this.color = color;', ''),
        /set the "color" property of the new/,
      ],
      [
        'starts with a calibration sequence',
        DUCKTYPIUM.replace('this.calibrationSequence = [];', 'this.calibrationSequence = [1];'),
        /set the "calibrationSequence" property of the\s+new Ducktypium instance to an empty array/,
      ],
      [
        'has no calibrationSequence',
        DUCKTYPIUM.replace('this.calibrationSequence = [];', ''),
        /set the "calibrationSequence" property of the\s+new Ducktypium instance to an empty array/,
      ],
      [
        'has no refract method',
        DUCKTYPIUM.replace('refract(', 'refractLight('),
        /does not have a "refract" instance method/,
      ],
      [
        'has no calibrate method',
        DUCKTYPIUM.replace('calibrate(', 'calibrateLaser('),
        /does not have a "calibrate" instance method/,
      ],
      [
        'does not return the same color',
        DUCKTYPIUM.replace('if (other === mine) return this.color;', ''),
        /should return the Ducktypium object's color\s+property if the same color/,
      ],
      [
        'combines the colors wrongly (blue and yellow)',
        DUCKTYPIUM.replace("'blue,yellow': 'green'", "'blue,yellow': 'teal'"),
        /should return color you get when its "color"\s+property is combined/,
      ],
      [
        'combines the colors wrongly (red and yellow)',
        DUCKTYPIUM.replace("'red,yellow': 'orange'", "'red,yellow': 'brown'"),
        /should return color you get when its "color"\s+property is combined/,
      ],
      [
        'does not follow the color property after it changed',
        DUCKTYPIUM.replace('const mine = this.color;', 'const mine = "blue";'),
        /should return color you get when its "color"\s+property is combined/,
      ],
      [
        'does not calibrate in order',
        DUCKTYPIUM.replace('.sort((a, b) => a - b)', ''),
        /should set the "calibrationSequence" property of\s+the Ducktypium instance/,
      ],
      [
        'has a constructor that throws for a valid color',
        DUCKTYPIUM.replace('this.color = color;', 'if (color === "blue") throw new Error("ctor");'),
        /error executing your Ducktypium constructor or functions[\s\S]*Error: ctor/,
      ],
    ],
  },
];

describe.each(CLASS_VALIDATORS)(
  '$objective (the learner class is exercised in a Worker)',
  ({ objective, file, name, cases }) => {
    const common = [
      ['is a number instead of a class', `const ${name} = 5;`, /it's not a\s+class/],
      ['is not defined', 'const somethingElse = 1;', /was not defined in your/],
      ['has a syntax error', 'class {', new RegExp(`${THROWS}[\\s\\S]*SyntaxError`)],
      ['throws at the top level', 'throw new Error("boom");', new RegExp(`${THROWS}[\\s\\S]*Error: boom`)],
    ];
    test.each([...common, ...cases])(
      'the learner code %s',
      async (description, code, expectation) => {
        const result = await run(objective, file, code);
        if (expectation === true) {
          expect(result.message).not.toMatch(/error|problem/i);
          expect(result.ok).toBe(true);
        } else {
          expect(result.ok).toBe(false);
          expect(result.message).toMatch(expectation);
        }
      }
    );

    test('tells the learner when the file is missing', async () => {
      const result = await run(objective, file);
      expect(result.ok).toBe(false);
      expect(result.message).toContain(`couldn't find your "${file}"`);
    });
  }
);

// Only a Worker has a real global object: reading a variable that throws
// something other than a ReferenceError (the former vm context had no such case)
describe('an error that is not a ReferenceError while reading the learner variable', () => {
  test.each([
    ['forEach', 'freightScanner.js', 'scan'],
    ['classes', 'classes.js', 'Materializer'],
  ])('%s reports it as a validation problem', async (objective, file, name) => {
    const result = await run(
      objective,
      file,
      `Object.defineProperty(globalThis, '${name}', { get() { throw new RangeError('no way'); } });`
    );
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(
      /There was a problem validating your code[\s\S]*RangeError: no way/
    );
  });
});
