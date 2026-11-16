vi.mock('../../../js/app/common/analytics', () => ({
  __esModule: true,
  default: { analyticsId: 'test-id' },
}));
vi.mock('../../../js/app/common/world', () => ({
  __esModule: true,
  default: vi.fn(),
}));
// The saved QuestIDE code is read from <codeStoragePath>/<level>/<objective>/code.js
vi.mock('../../../js/app/config/config', async () => {
  const nodeOs = await import('node:os');
  const nodePath = await import('node:path');
  return {
    __esModule: true,
    default: {
      codeStoragePath: nodePath.join(
        nodeOs.tmpdir(),
        `tq-base-validators-${process.pid}`
      ),
      codeStorageFileName: 'code.js',
    },
  };
});
vi.mock('../../../js/app/common/context', () => ({
  getContext: vi.fn(() => ({ levelName: 'challenge-questions' })),
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

// The 10 twilioquest-base (challenge-questions) validators that call the
// learner's function: sum-array, flatten-array, reverse-words,
// check-for-palindrome, balance-brackets, remove-duplicate-characters,
// difference-max-min and 03-debugging-1/2/3. The saved QuestIDE code and the
// test cases run in a real Worker (NodeWorker over worker_threads). Every case
// below (learner code -> pass, or the exact failure message) was also run
// against the former `vm` based validators (pullVarsFromQuestIdeUserCodeLocalScope
// with assert and lodash.isequal) with the same result.

const OBJECTIVES = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'public',
  'content',
  'twilioquest-base',
  'levels',
  'challenge-questions',
  'objectives'
);
const CODE_STORAGE = path.join(os.tmpdir(), `tq-base-validators-${process.pid}`);

const requireValidator = objective =>
  // eslint-disable-next-line global-require, import/no-dynamic-require
  require(path.join(OBJECTIVES, objective, 'validator.js'));

beforeAll(() => {
  vi.stubGlobal('Worker', NodeWorker);
});
afterAll(() => {
  vi.unstubAllGlobals();
});
beforeEach(() => {
  fs.mkdirSync(CODE_STORAGE, { recursive: true });
});
afterEach(() => {
  fs.rmSync(CODE_STORAGE, { recursive: true, force: true });
});

const saveCode = (objective, code) => {
  const directory = path.join(CODE_STORAGE, 'challenge-questions', objective);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'code.js'), code);
};

const run = async (objective, code) => {
  if (code !== undefined) {
    saveCode(objective, code);
  }
  const callback = vi.fn();
  const helper = new ValidationHelper(
    { context: {}, env: {}, validationFields: {} },
    callback,
    {}
  );
  await requireValidator(objective)(helper);
  expect(callback).toHaveBeenCalledTimes(1);
  const [error, result] = callback.mock.calls[0];
  return error ? { ok: false, message: error.message } : { ok: true, ...result };
};

// expectation: true (passes), a string (the exact failure message) or a RegExp
const expectOutcome = (result, expectation) => {
  if (expectation === true) {
    expect(result).toEqual({ ok: true, message: 'You did it!', env: [] });
  } else if (typeof expectation === 'string') {
    expect(result).toEqual({ ok: false, message: expectation });
  } else {
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(expectation);
  }
};

// Cases shared by every validator of a function
const commonCases = name => [
  ['is not defined', 'const somethingElse = 1;', `The function ${name} is not defined!`],
  ['is 0', `const ${name} = 0;`, `The function ${name} is not defined!`],
  ['is an empty string', `var ${name} = '';`, `The function ${name} is not defined!`],
  ['is null', `let ${name} = null;`, `The function ${name} is not defined!`],
  ['is a number', `const ${name} = 5;`, 'testFunction is not a function'],
  ['is an object', `const ${name} = {};`, 'testFunction is not a function'],
  ['has a syntax error', 'function (', /\S/],
  ['throws at the top level', 'throw new Error("boom");', 'boom'],
  ['throws a string at the top level', 'throw "plain text";', 'plain text'],
  [
    'throws when called',
    `function ${name}() { throw new TypeError("bad input"); }`,
    'bad input',
  ],
  [
    'throws a string when called',
    `function ${name}() { throw "plain text"; }`,
    'plain text',
  ],
];

const SIMPLE_VALIDATORS = [
  {
    objective: 'sum-array',
    name: 'sumArray',
    cases: [
      ['is a function declaration', 'function sumArray(a) { return a.reduce((t, n) => t + n, 0); }', true],
      ['is a const arrow function', 'const sumArray = a => a.reduce((t, n) => t + n, 0);', true],
      ['is a var function expression', 'var sumArray = function (a) { return a.reduce((t, n) => t + n, 0); };', true],
      ['is declared after other code', 'const x = 1; let y = [x]; function sumArray(a) { return a.reduce((t, n) => t + n, 0); }', true],
      [
        'returns the length',
        'function sumArray(a) { return a.length; }',
        'Expected "6" from input "1,2,3", but received "3".',
      ],
      [
        'returns a string',
        'const sumArray = a => String(a.reduce((t, n) => t + n, 0));',
        'Expected "6" from input "1,2,3", but received "6".',
      ],
      [
        'returns nothing',
        'function sumArray() {}',
        'Expected "6" from input "1,2,3", but received "undefined".',
      ],
      [
        'rounds a decimal sum',
        'const sumArray = a => Math.round(a.reduce((t, n) => t + n, 0));',
        'Expected "7.5" from input "1.2,2.3,4", but received "8".',
      ],
      [
        'returns -0 for an empty array (strictEqual uses Object.is)',
        'const sumArray = a => (a.length ? a.reduce((t, n) => t + n, 0) : -0);',
        'Expected "0" from input "", but received "0".',
      ],
      [
        'returns NaN for a single element',
        'const sumArray = a => (a.length === 1 ? NaN : a.reduce((t, n) => t + n, 0));',
        'Expected "3" from input "3", but received "NaN".',
      ],
      [
        'returns an object',
        'const sumArray = () => ({ toString() { return "six"; } });',
        'Expected "6" from input "1,2,3", but received "six".',
      ],
    ],
  },
  {
    objective: 'reverse-words',
    name: 'reverseSentence',
    cases: [
      [
        'reverses and fixes the capitalization',
        `function reverseSentence(s) {
          const punctuation = s.slice(-1);
          const words = s.slice(0, -1).split(' ');
          words[0] = words[0].toLowerCase();
          const text = words.reverse().join(' ');
          return text[0].toUpperCase() + text.slice(1) + punctuation;
        }`,
        true,
      ],
      [
        'only reverses the words',
        'const reverseSentence = s => s.split(" ").reverse().join(" ");',
        'Expected "It did you!" from input "You did it!", but received "it! did You".',
      ],
      [
        'returns the input',
        'const reverseSentence = s => s;',
        'Expected "It did you!" from input "You did it!", but received "You did it!".',
      ],
      [
        'returns an array',
        'const reverseSentence = s => s.split(" ");',
        'Expected "It did you!" from input "You did it!", but received "You,did,it!".',
      ],
    ],
  },
  {
    objective: 'check-for-palindrome',
    name: 'isPalindrome',
    cases: [
      [
        'ignores case and spaces',
        `function isPalindrome(s) {
          const t = s.toLowerCase().replace(/[^a-z]/g, '');
          return t === [...t].reverse().join('');
        }`,
        true,
      ],
      [
        'compares the raw string',
        'const isPalindrome = s => s === [...s].reverse().join("");',
        'Expected "true" from input "Never odd or even", but received "false".',
      ],
      [
        'returns a string instead of a boolean',
        'const isPalindrome = () => "yes";',
        'Expected "true" from input "tacocat", but received "yes".',
      ],
      [
        'returns a truthy number',
        'const isPalindrome = () => 1;',
        'Expected "true" from input "tacocat", but received "1".',
      ],
      [
        'always returns true',
        'const isPalindrome = () => true;',
        'Expected "false" from input "heLLo", but received "true".',
      ],
    ],
  },
  {
    objective: 'balance-brackets',
    name: 'balanceBrackets',
    cases: [
      [
        'uses a stack',
        `function balanceBrackets(brackets) {
          const pairs = { ')': '(', ']': '[', '}': '{' };
          const stack = [];
          for (const b of brackets) {
            if (pairs[b]) {
              if (stack.pop() !== pairs[b]) return false;
            } else stack.push(b);
          }
          return stack.length === 0;
        }`,
        true,
      ],
      [
        'always returns true',
        'const balanceBrackets = () => true;',
        'Expected "false" from input "[,(,],)", but received "true".',
      ],
      [
        'always returns false',
        'const balanceBrackets = () => false;',
        'Expected "true" from input "{,}", but received "false".',
      ],
      [
        'only counts the brackets',
        'const balanceBrackets = b => b.length % 2 === 0;',
        'Expected "false" from input "[,(,],)", but received "true".',
      ],
    ],
  },
  {
    objective: 'remove-duplicate-characters',
    name: 'removeDuplicateCharacters',
    cases: [
      ['removes the repeated characters', "const removeDuplicateCharacters = s => s.replace(/(.)\\1+/g, '$1');", true],
      [
        'removes every duplicate',
        'const removeDuplicateCharacters = s => [...new Set(s)].join("");',
        'Expected "aba" from input "aba", but received "ab".',
      ],
      // #108: three or more repeated characters must collapse to one as well
      [
        'removes a repeated pair only once',
        "const removeDuplicateCharacters = s => s.replace(/(.)\\1/g, '$1');",
        'Expected "abc" from input "aaaaaaaaaaaaaaabc", but received "aaaaaaaabc".',
      ],
      [
        'returns the input',
        'const removeDuplicateCharacters = s => s;',
        'Expected "abc" from input "aabbcc", but received "aabbcc".',
      ],
    ],
  },
  {
    objective: 'difference-max-min',
    name: 'differenceMinMax',
    cases: [
      ['subtracts min from max', 'const differenceMinMax = a => Math.max(...a) - Math.min(...a);', true],
      [
        'subtracts the first from the last',
        'const differenceMinMax = a => a[a.length - 1] - a[0];',
        'Expected "100" from input "100,0", but received "-100".',
      ],
      [
        'rounds the result',
        'const differenceMinMax = a => Math.round(Math.max(...a) - Math.min(...a));',
        'Expected "7.8" from input "8,1.2,5,9", but received "8".',
      ],
      [
        'returns a string',
        'const differenceMinMax = a => String(Math.max(...a) - Math.min(...a));',
        'Expected "4" from input "1,2,3,4,5", but received "4".',
      ],
    ],
  },
];

describe.each(SIMPLE_VALIDATORS)(
  '$objective (the saved code is exercised in a Worker)',
  ({ objective, name, cases }) => {
    test.each([...commonCases(name), ...cases])(
      'the learner code %s',
      async (description, code, expectation) => {
        expectOutcome(await run(objective, code), expectation);
      }
    );

    test('reports a missing saved code file', async () => {
      const result = await run(objective);
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/ENOENT/);
    });

    test('reads the saved code of its own objective only', async () => {
      saveCode('some-other-objective', `function ${name}() {}`);
      const result = await run(objective);
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/ENOENT/);
    });
  }
);

describe('flatten-array', () => {
  const FLATTEN = 'function flattenArray(a) { return a.length ? a.flat(Infinity) : "Pure Ducktypium!"; }';
  const NOT_EQUAL =
    'One or more array elements are different or have different types.';

  test.each([
    ...commonCases('flattenArray'),
    ['flattens the array', FLATTEN, true],
    [
      'answers the empty array with a lower case string',
      'const flattenArray = a => (a.length ? a.flat(Infinity) : "pure ducktypium!");',
      true,
    ],
    // Quirk kept from the former validator: a string is compared as a string
    [
      'returns the nested array unflattened (an element differs)',
      'const flattenArray = a => (a.length ? a : "Pure Ducktypium!");',
      NOT_EQUAL,
    ],
    [
      'returns numbers as strings (an element has another type)',
      'const flattenArray = a => (a.length ? a.flat(Infinity).map(String) : "Pure Ducktypium!");',
      NOT_EQUAL,
    ],
    // #108: a string is no longer accepted where an array is expected
    [
      'returns a joined string (not an array)',
      'const flattenArray = a => (a.length ? a.flat(Infinity).join() : "Pure Ducktypium!");',
      'Expected [1,two,3,four] from input [1,two,3,four], but received "1,two,3,four".',
    ],
    [
      'does not answer the empty array with a string',
      'const flattenArray = a => a.flat(Infinity);',
      'Expected "Pure Ducktypium!" from input [], but received [].',
    ],
    [
      'returns nothing',
      'function flattenArray() {}',
      'Expected "Pure Ducktypium!" from input [], but received undefined.',
    ],
    [
      'returns an array for the empty array',
      'const flattenArray = a => a;',
      'Expected "Pure Ducktypium!" from input [], but received [].',
    ],
    [
      'drops an element',
      'const flattenArray = a => (a.length ? a.flat(Infinity).slice(1) : "Pure Ducktypium!");',
      'Expected [1,two,3,four] from input [1,two,3,four], but received [two,3,four].',
    ],
    [
      'returns a number',
      'const flattenArray = a => (a.length ? 7 : "Pure Ducktypium!");',
      'Expected [1,two,3,four] from input [1,two,3,four], but received 7.',
    ],
    [
      'returns null',
      'const flattenArray = a => (a.length ? null : "Pure Ducktypium!");',
      'Expected [1,two,3,four] from input [1,two,3,four], but received null.',
    ],
    [
      'returns an object',
      'const flattenArray = a => (a.length ? { a: 1 } : "Pure Ducktypium!");',
      'Expected [1,two,3,four] from input [1,two,3,four], but received {"a":1}.',
    ],
    [
      'changes an element',
      'const flattenArray = a => (a.length ? a.flat(Infinity).map(x => (x === "four" ? "five" : x)) : "Pure Ducktypium!");',
      NOT_EQUAL,
    ],
    [
      'only fails on the fourth call',
      'const flattenArray = a => { if (a.length === 2) throw new RangeError("deep"); return a.length ? a.flat(Infinity) : "Pure Ducktypium!"; };',
      'deep',
    ],
  ])('the learner code %s', async (description, code, expectation) => {
    expectOutcome(await run('flatten-array', code), expectation);
  });

  test('reports a missing saved code file', async () => {
    const result = await run('flatten-array');
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/ENOENT/);
  });
});

const RESERVOIRS = [
  {
    id: 623,
    label: 'Reservoir-2A-East-Wing',
    radiation: {
      radsCountCurrent: '190',
      monitorSystemGuid: '8453b2e7-0cf3-43fa-8909-cab00f75d413',
    },
    type: 'raw',
    contents: 83,
  },
  {
    id: 21,
    label: 'Reservoir-2B-East-Wing',
    radiation: {
      radsCountCurrent: '48',
      monitorSystemGuid: '55eee6a5-5fb9-4118-b015-7f656b845465',
    },
    type: 'distilled',
    contents: 120,
  },
  {
    id: 617,
    label: 'Reservoir-3F-North-Wing',
    radiation: {
      radsCountCurrent: '39',
      monitorSystemGuid: 'bf0b28be-ae90-406a-8f90-c556b0056f2e',
    },
    type: 'raw',
    contents: 100,
  },
  {
    id: 100,
    label: 'Reservoir-3G-North-Wing',
    radiation: {
      radsCountCurrent: '712',
      monitorSystemGuid: 'e1e73107-f0ad-495d-a11c-e730543f1ad5',
    },
    type: 'raw',
    contents: 98,
  },
];

const RESERVOIRS_WITH_UNMONITORED = [
  RESERVOIRS[0],
  {
    id: 21,
    label: 'Reservoir-2B-East-Wing%50',
    type: 'distilled',
    contents: 120,
  },
  { ...RESERVOIRS[2], label: 'Reservoir-3F-North-Wing%75' },
  { ...RESERVOIRS[3], label: 'Reservoir-3G-North-Wing%50' },
];

const LONGEST_URL =
  'https://www.twilio.com/quest/ducktypium-diagnostics?label=Reservoir-3F-North-Wing%2575&id=617&type=raw&contents=100&rads=39&guid=bf0b28be-ae90-406a-8f90-c556b0056f2e';

// The failure message of the three 03-debugging validators
const diffMessage = (expected, received) => `<div style="text-align:left;overflow: scroll;">
    <span class="highlight">Expected</span>
    <pre>${JSON.stringify(expected, undefined, 2)}</pre>
    </pre><span class="highlight">But received</span><pre>${JSON.stringify(
      received,
      undefined,
      2
    )}</pre>
    </div>`;

const DEBUGGING_VALIDATORS = [
  {
    objective: '03-debugging-1',
    name: 'monitorReservoirs',
    input: RESERVOIRS,
    expected: [RESERVOIRS[2]],
    cases: [
      [
        'filters the raw reservoirs under 50 rads',
        "const monitorReservoirs = r => r.filter(x => Number(x.radiation.radsCountCurrent) < 50 && x.type === 'raw');",
        true,
      ],
      [
        'returns copies with new keys in another order',
        'const monitorReservoirs = r => r.filter(x => x.id === 617).map(x => ({ contents: x.contents, type: x.type, radiation: { monitorSystemGuid: x.radiation.monitorSystemGuid, radsCountCurrent: x.radiation.radsCountCurrent }, label: x.label, id: x.id }));',
        true,
      ],
      [
        'returns every reservoir',
        'const monitorReservoirs = r => r;',
        diffMessage([RESERVOIRS[2]], RESERVOIRS),
      ],
      [
        'returns nothing',
        'function monitorReservoirs() {}',
        diffMessage([RESERVOIRS[2]], undefined),
      ],
      [
        'returns the reservoir instead of an array',
        'const monitorReservoirs = r => r[2];',
        diffMessage([RESERVOIRS[2]], RESERVOIRS[2]),
      ],
      [
        'returns an array with a number as a string',
        'const monitorReservoirs = r => [{ ...r[2], contents: "100" }];',
        diffMessage([RESERVOIRS[2]], [{ ...RESERVOIRS[2], contents: '100' }]),
      ],
      [
        'returns an extra key that is undefined',
        'const monitorReservoirs = r => [{ ...r[2], extra: undefined }];',
        diffMessage([RESERVOIRS[2]], [RESERVOIRS[2]]),
      ],
      [
        'returns instances of a class',
        'class Reservoir { constructor(o) { Object.assign(this, o); } } const monitorReservoirs = r => [new Reservoir(r[2])];',
        diffMessage([RESERVOIRS[2]], [RESERVOIRS[2]]),
      ],
      [
        'returns a sparse array whose hole is compared as undefined',
        'const monitorReservoirs = () => new Array(1);',
        diffMessage([RESERVOIRS[2]], [null]),
      ],
      [
        'returns an array with a hole in the middle',
        'const monitorReservoirs = r => { const a = [r[2]]; a[2] = r[2]; return a; };',
        diffMessage([RESERVOIRS[2]], [RESERVOIRS[2], null, RESERVOIRS[2]]),
      ],
      [
        'returns a result that cannot be shown',
        'const monitorReservoirs = () => { const o = {}; o.o = o; return o; };',
        /circular structure/i,
      ],
    ],
  },
  {
    objective: '03-debugging-2',
    name: 'sumRadLevels',
    input: RESERVOIRS,
    expected: 989,
    cases: [
      [
        'sums the rads',
        "const sumRadLevels = r => r.reduce((t, x) => t + Number(x.radiation.radsCountCurrent), 0);",
        true,
      ],
      [
        'returns a sparse array',
        'const sumRadLevels = () => new Array(1);',
        diffMessage(989, [null]),
      ],
      [
        'returns a Number object (equal to the number)',
        'const sumRadLevels = () => new Number(989);',
        true,
      ],
      [
        'concatenates the rads',
        'const sumRadLevels = r => r.reduce((t, x) => t + x.radiation.radsCountCurrent, 0);',
        diffMessage(989, '01904839712'),
      ],
      [
        'returns NaN',
        'const sumRadLevels = () => NaN;',
        diffMessage(989, NaN),
      ],
      [
        'returns the number as a string',
        'const sumRadLevels = () => "989";',
        diffMessage(989, '989'),
      ],
      [
        'returns nothing',
        'function sumRadLevels() {}',
        diffMessage(989, undefined),
      ],
      [
        'returns null',
        'const sumRadLevels = () => null;',
        diffMessage(989, null),
      ],
      [
        'returns a function (cannot be shown, becomes undefined)',
        'const sumRadLevels = () => () => 989;',
        diffMessage(989, undefined),
      ],
    ],
  },
  {
    objective: '03-debugging-3',
    name: 'findLongestDiagnosticUrl',
    input: RESERVOIRS_WITH_UNMONITORED,
    expected: LONGEST_URL,
    cases: [
      [
        'builds the urls and keeps the longest',
        `const findLongestDiagnosticUrl = reservoirs => {
          let longest = '';
          reservoirs.filter(r => r.radiation).forEach(r => {
            const url = 'https://www.twilio.com/quest/ducktypium-diagnostics?label=' + encodeURIComponent(r.label) + '&id=' + r.id + '&type=' + r.type + '&contents=' + r.contents + '&rads=' + r.radiation.radsCountCurrent + '&guid=' + r.radiation.monitorSystemGuid;
            if (url.length > longest.length) longest = url;
          });
          return longest;
        };`,
        true,
      ],
      [
        'returns the constant',
        `const findLongestDiagnosticUrl = () => "${LONGEST_URL}";`,
        true,
      ],
      [
        'does not encode the label',
        `const findLongestDiagnosticUrl = () => "${LONGEST_URL.replace('%2575', '%75')}";`,
        diffMessage(LONGEST_URL, LONGEST_URL.replace('%2575', '%75')),
      ],
      [
        'returns an array of urls',
        `const findLongestDiagnosticUrl = () => ["${LONGEST_URL}"];`,
        diffMessage(LONGEST_URL, [LONGEST_URL]),
      ],
      [
        'returns nothing',
        'function findLongestDiagnosticUrl() {}',
        diffMessage(LONGEST_URL, undefined),
      ],
    ],
  },
];

describe.each(DEBUGGING_VALIDATORS)(
  '$objective (the saved code is exercised in a Worker)',
  ({ objective, name, input, cases }) => {
    test.each([...commonCases(name), ...cases])(
      'the learner code %s',
      async (description, code, expectation) => {
        expectOutcome(await run(objective, code), expectation);
      }
    );

    test('hands the documented reservoirs to the learner function', async () => {
      const result = await run(
        objective,
        `const ${name} = input => { throw new Error(JSON.stringify(input)); };`
      );
      expect(result).toEqual({ ok: false, message: JSON.stringify(input) });
    });

    test('reports a missing saved code file', async () => {
      const result = await run(objective);
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/ENOENT/);
    });
  }
);
