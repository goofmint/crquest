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
        `tq-api-academy-validators-${process.pid}`
      ),
      codeStorageFileName: 'code.js',
    },
  };
});
vi.mock('../../../js/app/common/context', () => ({
  getContext: vi.fn(() => ({ levelName: 'lovelace_tower' })),
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

// The 4 twilioquest-api-academy (lovelace_tower) validators that call the
// learner's function: api-01-local-function, api-02-async-await,
// api-04-remote-and-local and api-05-get-patch. The saved QuestIDE code and the
// test cases run in a real Worker (NodeWorker over worker_threads). Every case
// below (learner code -> pass, or the exact failure message) was also run
// against the former `vm` based validators (pullVarsFromQuestIdeUserCodeLocalScope,
// helper.fetchOverride) with the same result; the cases that cannot run there
// are marked "worker only".

const OBJECTIVES = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'public',
  'content',
  'twilioquest-api-academy',
  'levels',
  'lovelace_tower',
  'objectives'
);
const CODE_STORAGE = path.join(
  os.tmpdir(),
  `tq-api-academy-validators-${process.pid}`
);

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
  const directory = path.join(CODE_STORAGE, 'lovelace_tower', objective);
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

// expectation: the success message, a string (the exact failure message) or a
// RegExp. The `Expected ...` messages of the former validators went through
// Node's assert.strictEqual, which since Node 12 adds a diff after a custom
// message only in newer Nodes: compare the start for those.
const expectOutcome = (result, expectation, successMessage) => {
  if (expectation === true) {
    expect(result).toEqual({ ok: true, message: successMessage, env: [] });
  } else if (typeof expectation === 'string') {
    expect(result).toEqual({ ok: false, message: expectation });
  } else {
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(expectation);
  }
};

const notDefined = name => `The function ${name} is not defined!`;

// Cases every validator shares
const commonCases = name => [
  ['is not defined', 'const somethingElse = 1;', notDefined(name)],
  ['is 0', `const ${name} = 0;`, notDefined(name)],
  ['is an empty string', `var ${name} = '';`, notDefined(name)],
  ['is null', `let ${name} = null;`, notDefined(name)],
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
];

describe('api-01-local-function', () => {
  const objective = 'api-01-local-function';
  const cases = [
    ...commonCases('swapStrings'),
    [
      'is a function declaration (replaceAll-free split/join)',
      'function swapStrings(s, a, b) { return s.split(a).join(b); }',
      true,
    ],
    [
      'is a const arrow function using a regular expression',
      'const swapStrings = (s, a, b) => s.replace(new RegExp(a, "g"), b);',
      true,
    ],
    [
      'is a var function expression defined after other code',
      'const x = 1; var swapStrings = function (s, a, b) { return s.split(a).join(b); };',
      true,
    ],
    [
      'replaces only the first match',
      'function swapStrings(s, a, b) { return s.replace(a, b); }',
      /^Expected "bar bar bar something something bar" from input "foo foo foo something something bar", "foo", and "bar", but received "bar foo foo something something bar"\./,
    ],
    [
      'returns nothing',
      'function swapStrings() {}',
      /^Expected "bar bar bar something something bar" from input "foo foo foo something something bar", "foo", and "bar", but received "undefined"\./,
    ],
    [
      'returns an object',
      'function swapStrings() { return { toString() { return "obj"; } }; }',
      /but received "obj"\./,
    ],
  ];

  test.each(cases)('%s', async (_name, code, expectation) => {
    expectOutcome(await run(objective, code), expectation, 'Great job!');
  });

  test('fails when the saved code file does not exist', async () => {
    const result = await run(objective);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/ENOENT/);
  });
});

describe('api-02-async-await', () => {
  const objective = 'api-02-async-await';
  const housesDirectory = path.join(OBJECTIVES, objective, 'houses');
  const lastHouse = fs.readdirSync(housesDirectory).slice(-1)[0];
  const readdirPrelude = 'const { readdir } = require("fs").promises;\n';

  const cases = [
    ...commonCases('findLastFileInDir'),
    [
      'returns the last entry (require("fs").promises)',
      `${readdirPrelude}async function findLastFileInDir(d) { const e = await readdir(d); return e[e.length - 1]; }`,
      true,
    ],
    [
      'returns the last entry (require("fs").promises used inline, const arrow)',
      'const findLastFileInDir = async d => { const e = await require("fs").promises.readdir(d); return e.pop(); };',
      true,
    ],
    [
      'returns the last entry (readdir with "utf8")',
      'async function findLastFileInDir(d) { const e = await require("fs").promises.readdir(d, "utf8"); return e[e.length - 1]; }',
      true,
    ],
    [
      'returns the last entry (readdir with { encoding: "utf8" })',
      'async function findLastFileInDir(d) { const e = await require("fs").promises.readdir(d, { encoding: "utf8" }); return e[e.length - 1]; }',
      true,
    ],
    [
      'returns the last entry (directory path with a trailing slash)',
      'async function findLastFileInDir(d) { const e = await require("fs").promises.readdir(d + "/"); return e[e.length - 1]; }',
      true,
    ],
    [
      'returns the last entry without reading the directory',
      `const findLastFileInDir = async () => ${JSON.stringify(lastHouse)};`,
      true,
    ],
    [
      'returns the first entry',
      `${readdirPrelude}async function findLastFileInDir(d) { return (await readdir(d))[0]; }`,
      new RegExp(`^Expected "${lastHouse}" but received "`),
    ],
    [
      'returns nothing',
      'async function findLastFileInDir() {}',
      new RegExp(`^Expected "${lastHouse}" but received "undefined"`),
    ],
    [
      'is a synchronous function',
      `function findLastFileInDir() { return ${JSON.stringify(lastHouse)}; }`,
      true,
    ],
    [
      'rejects',
      'async function findLastFileInDir() { throw new Error("nope"); }',
      'nope',
    ],
  ];

  test.each(cases)('%s', async (_name, code, expectation) => {
    expectOutcome(await run(objective, code), expectation, 'Great job!');
  });

  // The former validator ran the learner's code with the host's real `require`
  test('only the directory of the test is listed by the fs mock', async () => {
    const result = await run(
      objective,
      'const { readdir } = require("fs").promises;\nasync function findLastFileInDir() { return (await readdir("/nowhere")).length; }'
    );
    expect(result.ok).toBe(false);
    expect(result.message).toBe("ENOENT: no such file or directory, scandir '/nowhere'");
  });

  test('worker only: other modules cannot be required', async () => {
    const result = await run(
      objective,
      'const os = require("os");\nasync function findLastFileInDir() {}'
    );
    expect(result).toEqual({ ok: false, message: "Cannot find module 'os'" });
  });
});

describe('api-04-remote-and-local', () => {
  const objective = 'api-04-remote-and-local';
  const books = [
    { author: { name: 'Ada' }, metadata: { pageCount: 4 } },
    { author: { name: 'Grace' }, metadata: { pageCount: 12 } },
    { author: { name: 'Edsger' }, metadata: { pageCount: 20 } },
    { author: { name: 'Barbara' }, metadata: { pageCount: 31 } },
    { author: { name: 'Alan' }, metadata: { pageCount: 120 } },
  ];
  const solution = `
    const books = ${JSON.stringify(books)};
    async function getFilteredAuthors(pageCount) {
      return books.filter(b => b.metadata.pageCount > pageCount).map(b => b.author.name);
    }
  `;

  // the validator itself fetches the books (the learner's fetch is the worker's)
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => ({ json: async () => books }));
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const cases = [
    ...commonCases('getFilteredAuthors'),
    ['filters by the page count', solution, true],
    [
      'is a const arrow function',
      `const getFilteredAuthors = async n => ${JSON.stringify(
        books
      )}.filter(b => b.metadata.pageCount > n).map(b => b.author.name);`,
      true,
    ],
    [
      'is a synchronous function',
      `const books = ${JSON.stringify(
        books
      )}; function getFilteredAuthors(n) { return books.filter(b => b.metadata.pageCount > n).map(b => b.author.name); }`,
      true,
    ],
    [
      'returns every author',
      `async function getFilteredAuthors() { return ${JSON.stringify(
        books.map(book => book.author.name)
      )}; }`,
      'Expected "Grace,Edsger,Barbara,Alan" authors from pageCount input of "5", but received "Ada,Grace,Edsger,Barbara,Alan" instead.',
    ],
    [
      'returns the authors in another order',
      `${solution.replace('.map(', '.reverse().map(')}`,
      'Expected "Grace,Edsger,Barbara,Alan" authors from pageCount input of "5", but received "Alan,Barbara,Edsger,Grace" instead.',
    ],
    [
      'returns nothing',
      'async function getFilteredAuthors() {}',
      "Cannot read properties of undefined (reading 'length')",
    ],
  ];

  test.each(cases)('%s', async (_name, code, expectation) => {
    expectOutcome(await run(objective, code), expectation, 'Good work!');
  });

  test('fetches the books once, from the divination endpoint, on the host', async () => {
    await run(objective, solution);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://twilio.com/quest/magic/divination'
    );
  });

  test('reports a failed request', async () => {
    globalThis.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await run(objective, solution)).toEqual({
      ok: false,
      message: 'Failed to fetch',
    });
  });
});

describe('api-05-get-patch', () => {
  const objective = 'api-05-get-patch';
  const URL_BASE = 'https://twilio.com/quest/magic/divination';
  const ENDPOINT = `${URL_BASE}?target=lovelace_secret_statue`;
  const INSCRIPTION =
    'Creators of the cloud, formed through a simple, strung together: requests may return; the towers supply. Stay locked until I am able to see the magical eye';
  const wrap = body => `
    async function getAndPatchCorruptedInscription(guid) {
      ${body}
    }
  `;
  const patch = (data, extra = '') => `
      const get = await fetch(${JSON.stringify(ENDPOINT)});
      const corrupted = (await get.json()).data.inscription;
      ${extra}
      const response = await fetch(${JSON.stringify(ENDPOINT)}, {
        method: "PATCH",
        body: JSON.stringify(${data}),
      });
      return response.json();
  `;
  const correct = wrap(
    patch(`{ guid, data: { inscription: ${JSON.stringify(INSCRIPTION)} } }`)
  );

  const cases = [
    ...commonCases('getAndPatchCorruptedInscription'),
    ['gets and patches the inscription', correct, true],
    [
      'patches as a const arrow function with a lowercase method',
      `const getAndPatchCorruptedInscription = async guid => { await fetch(${JSON.stringify(
        ENDPOINT
      )}, { method: "patch", body: JSON.stringify({ guid, data: { inscription: ${JSON.stringify(
        INSCRIPTION
      )} } }) }); };`,
      true,
    ],
    [
      'does nothing',
      'async function getAndPatchCorruptedInscription() {}',
      'The inscription is still corrupted! Double check your work and try again.',
    ],
    [
      'only gets the inscription',
      wrap(
        `const response = await fetch(${JSON.stringify(ENDPOINT)}); return response.json();`
      ),
      'The inscription is still corrupted! Double check your work and try again.',
    ],
    [
      'patches the corrupted inscription unchanged',
      wrap(patch('{ guid, data: { inscription: corrupted } }')),
      'The inscription is still corrupted! Double check your work and try again.',
    ],
    [
      'patches without a guid',
      wrap(patch(`{ data: { inscription: ${JSON.stringify(INSCRIPTION)} } }`)),
      'The inscription is still corrupted! Double check your work and try again.',
    ],
    [
      'patches a body that is not JSON',
      wrap(
        `await fetch(${JSON.stringify(ENDPOINT)}, { method: "PATCH", body: "not json" });`
      ),
      'The inscription is still corrupted! Double check your work and try again.',
    ],
    [
      'uses an unexpected method',
      wrap(
        `await fetch(${JSON.stringify(ENDPOINT)}, { method: "DELETE" });`
      ),
      'The inscription is still corrupted! Double check your work and try again.',
    ],
    [
      'rejects',
      wrap('throw new Error("nope");'),
      'nope',
    ],
  ];

  test.each(cases)('%s', async (_name, code, expectation) => {
    expectOutcome(await run(objective, code), expectation, 'Nice going!');
  });

  test('a patch with another guid is not accepted for the validator guid', async () => {
    // the fake server remembers one inscription, whatever the guid: documents
    // that this is the former behaviour
    const result = await run(
      objective,
      wrap(
        patch(
          `{ guid: "other", data: { inscription: ${JSON.stringify(INSCRIPTION)} } }`
        )
      )
    );
    expect(result).toEqual({ ok: true, message: 'Nice going!', env: [] });
  });
});
