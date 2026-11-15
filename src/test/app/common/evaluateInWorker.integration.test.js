import path from 'path';
import { pathToFileURL } from 'url';
import { evaluateInWorker } from '../../../js/app/common/codeRunnerWorker';
import { NodeWorker } from '../../utils/nodeWorker';

// Runs the real public/code_runner/worker.js in a real worker thread (see
// codeRunnerWorker.integration.test.js) and exercises evaluateInWorker: the
// test function is sent to the worker and runs there next to the user's code.
const WORKER_URL = pathToFileURL(
  path.resolve(__dirname, '..', '..', '..', '..', 'public', 'code_runner', 'worker.js')
).href;

beforeAll(() => {
  vi.stubGlobal('Worker', NodeWorker);
});
afterAll(() => {
  vi.unstubAllGlobals();
});

const evaluate = options => evaluateInWorker({ workerUrl: WORKER_URL, ...options });

describe('evaluateInWorker results', () => {
  it('calls the functions and classes of the user code and returns data', async () => {
    const result = await evaluate({
      code: `
        function add(a, b) { return a + b; }
        const double = n => n * 2;
        class Counter { constructor(start) { this.n = start; } inc() { return ++this.n; } }
      `,
      test: ({ a, b }) => {
        const counter = new Counter(a);
        counter.inc();
        return {
          sum: add(a, b),
          doubled: double(b),
          count: counter.n,
          isInstance: counter instanceof Counter,
          arity: add.length,
          isClass: /^class\b/.test(Counter.toString()),
          proto: Object.getOwnPropertyNames(Counter.prototype),
        };
      },
      args: { a: 2, b: 5 },
    });
    expect(result).toEqual({
      sum: 7,
      doubled: 10,
      count: 3,
      isInstance: true,
      arity: 2,
      isClass: true,
      proto: ['constructor', 'inc'],
    });
  });

  it('sees top-level var, let, const, function and class declarations', async () => {
    const result = await evaluate({
      code: 'var a = 1; let b = 2; const c = 3; function d() { return 4; } class E {}',
      test: () => [a, b, c, d(), typeof E],
    });
    expect(result).toEqual([1, 2, 3, 4, 'function']);
  });

  it('accepts the source text of a function, with a trailing line comment', async () => {
    await expect(
      evaluate({
        code: 'const x = 21;',
        test: '() => x * 2 // doubled',
      })
    ).resolves.toBe(42);
    await expect(
      evaluate({ code: 'const x = 21;', test: 'async function () { return x; }' })
    ).resolves.toBe(21);
  });

  it('passes args (default {}) and keeps them separate from user variables', async () => {
    await expect(
      evaluate({ code: '', test: args => args })
    ).resolves.toEqual({});
    await expect(
      evaluate({
        code: 'const args = "user";',
        test: given => [given, args],
        args: ['mine', { nested: [1, 2.5, null, true] }],
      })
    ).resolves.toEqual([['mine', { nested: [1, 2.5, null, true] }], 'user']);
  });

  it('awaits a promise returned by the test function and by async user code', async () => {
    const result = await evaluate({
      code: 'const slow = value => new Promise(resolve => setTimeout(() => resolve(value), 20));',
      test: async () => (await slow('a')) + (await slow('b')),
    });
    expect(result).toBe('ab');
  });

  it('returns undefined when the test function returns nothing', async () => {
    await expect(evaluate({ code: '', test: () => {} })).resolves.toBeUndefined();
  });

  it('returns structured-cloneable data such as Map, Set, Date and class instances as data', async () => {
    const result = await evaluate({
      code: 'class P { constructor() { this.x = 1; } }',
      test: () => ({ map: new Map([[1, 2]]), set: new Set([3]), date: new Date(0), p: new P() }),
    });
    expect(result.map.get(1)).toBe(2);
    expect(result.set.has(3)).toBe(true);
    expect(result.date.getTime()).toBe(0);
    expect(result.p).toEqual({ x: 1 });
  });

  it('runs the user code exactly once, before the test, and is isolated per call', async () => {
    const code = 'globalThis.runs = (globalThis.runs || 0) + 1;';
    await expect(evaluate({ code, test: () => runs })).resolves.toBe(1);
    await expect(evaluate({ code, test: () => runs })).resolves.toBe(1);
  });

  it('lets the test reproduce instanceof, prototype, length and toString checks', async () => {
    const result = await evaluate({
      code: 'class A {} class B extends A { m(x, y) {} } function f(a, b, c) {}',
      test: () => ({
        inherits: new B() instanceof A,
        proto: Object.getPrototypeOf(B) === A,
        length: [f.length, B.prototype.m.length],
        text: f.toString(),
      }),
    });
    expect(result).toEqual({
      inherits: true,
      proto: true,
      length: [3, 2],
      text: 'function f(a, b, c) {}',
    });
  });
});

describe('evaluateInWorker environment', () => {
  it('exposes process.env as the given strings (empty by default) and no host APIs', async () => {
    await expect(
      evaluate({ code: '', test: () => Object.keys(process.env) })
    ).resolves.toEqual([]);
    await expect(
      evaluate({ code: '', test: () => process.env.NAME, env: { NAME: 'value' } })
    ).resolves.toBe('value');
    await expect(
      evaluate({
        code: '',
        test: () => [typeof require, typeof window, typeof module],
      })
    ).resolves.toEqual(['undefined', 'undefined', 'undefined']);
  });

  it('rejects an env that is not a map of strings before starting a worker', async () => {
    await expect(
      evaluate({ code: '', test: () => 1, env: { A: 1 } })
    ).rejects.toThrow('env.A must be a string');
  });
});

describe('evaluateInWorker errors', () => {
  it('rejects with name, message and stack when the user code throws', async () => {
    const error = await evaluate({
      code: 'function broken() { throw new RangeError("boom"); }\nbroken();',
      test: () => 1,
    }).catch(e => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('RangeError');
    expect(error.message).toBe('boom');
    expect(error.stack).toContain('script.js:1');
    expect(String(error)).toBe('RangeError: boom');
  });

  it('rejects when the user code has a syntax error', async () => {
    const error = await evaluate({ code: 'function (', test: () => 1 }).catch(e => e);
    expect(error.name).toBe('SyntaxError');
  });

  it('does not run the test when the user code throws', async () => {
    const error = await evaluate({
      code: 'throw new Error("first");',
      test: () => {
        throw new Error('second');
      },
    }).catch(e => e);
    expect(error.message).toBe('first');
  });

  it('rejects with the thrown error when the test function throws', async () => {
    const error = await evaluate({
      code: 'function f() { return null.x; }',
      test: () => f(),
    }).catch(e => e);
    expect(error.name).toBe('TypeError');
    expect(error.message).toMatch(/null/);
  });

  it('rejects when the async test function rejects', async () => {
    const error = await evaluate({
      code: '',
      test: async () => {
        throw new TypeError('late');
      },
    }).catch(e => e);
    expect(error.name).toBe('TypeError');
    expect(error.message).toBe('late');
  });

  it('keeps a thrown string as the bare message', async () => {
    const error = await evaluate({ code: 'throw "text";', test: () => 1 }).catch(e => e);
    expect(String(error)).toBe('text');
  });

  it('fails explicitly when the test function uses a variable of the host scope', async () => {
    const hostVariable = 5;
    const error = await evaluate({ code: '', test: () => hostVariable }).catch(e => e);
    expect(error.name).toBe('ReferenceError');
    expect(error.message).toMatch(/hostVariable/);
  });

  it('fails explicitly when the result cannot be cloned', async () => {
    const asFunction = await evaluate({
      code: 'function f() {}',
      test: () => f,
    }).catch(e => e);
    expect(asFunction.message).toMatch(/result of the test function \(function\) cannot be returned/);

    const asClass = await evaluate({
      code: 'class C {}',
      test: () => ({ nested: [C] }),
    }).catch(e => e);
    expect(asClass.message).toMatch(/cannot be returned/);

    const asSymbol = await evaluate({ code: '', test: () => Symbol('s') }).catch(e => e);
    expect(asSymbol.message).toMatch(/cannot be returned/);

    const awaited = await evaluate({
      code: '',
      test: async () => () => 1,
    }).catch(e => e);
    expect(awaited.message).toMatch(/cannot be returned/);
  });

  it('serializes the result once: getters run a single time', async () => {
    const counted = await evaluate({
      code: 'let n = 0;',
      test: () => ({
        get count() {
          n += 1;
          return n;
        },
      }),
    });
    expect(counted.count).toBe(1);

    const failsLater = await evaluate({
      code: 'let n = 0;',
      test: () => ({
        get value() {
          n += 1;
          if (n > 1) throw new Error('second read');
          return n;
        },
      }),
    });
    expect(failsLater.value).toBe(1);
  });

  it('reports an error thrown by a getter of the result as that error', async () => {
    const error = await evaluate({
      code: '',
      test: () => ({
        get bad() {
          throw new RangeError('getter');
        },
      }),
    }).catch(e => e);
    expect(error.name).toBe('RangeError');
    expect(error.message).toBe('getter');
  });

  it('times out an infinite loop in the user code and in the test, killing the worker', async () => {
    const started = Date.now();
    const inCode = await evaluate({
      code: 'while (true) {}',
      test: () => 1,
      timeoutMs: 300,
    }).catch(e => e);
    expect(inCode.message).toMatch(/timed out after 300 ms/);

    const inTest = await evaluate({
      code: '',
      test: () => {
        for (;;) {}
      },
      timeoutMs: 300,
    }).catch(e => e);
    expect(inTest.message).toMatch(/timed out after 300 ms/);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('times out a test function that never settles', async () => {
    const error = await evaluate({
      code: '',
      test: () => new Promise(() => {}),
      timeoutMs: 200,
    }).catch(e => e);
    expect(error.message).toMatch(/timed out after 200 ms/);
  });

  it('ignores console output of the code', async () => {
    await expect(
      evaluate({ code: 'console.log("noise"); console.error("more");', test: () => 'ok' })
    ).resolves.toBe('ok');
  });

  it('reports a worker that fails to load', async () => {
    const error = await evaluateInWorker({
      workerUrl: pathToFileURL(path.resolve(__dirname, 'no-such-worker.js')).href,
      code: '',
      test: () => 1,
    }).catch(e => e);
    expect(error.message).toMatch(/Code runner worker failed/);
  });
});

describe('evaluateInWorker argument validation', () => {
  const rejects = (options, message) =>
    expect(evaluate({ code: '', test: () => 1, ...options })).rejects.toThrow(message);

  it('requires a worker url and a string of code', async () => {
    await expect(
      evaluateInWorker({ code: '', test: () => 1 })
    ).rejects.toThrow('workerUrl is required');
    await rejects({ code: 5 }, 'code must be a string');
  });

  it('requires a function or non-empty source text as the test', async () => {
    await rejects({ test: undefined }, 'test must be a function or the source text');
    await rejects({ test: '  ' }, 'test must be a function or the source text');
    await rejects({ test: 5 }, 'test must be a function or the source text');
  });

  it('rejects native and bound functions, whose source cannot run in the worker', async () => {
    await rejects({ test: Math.max }, 'not a native or bound function');
    await rejects({ test: (() => 1).bind(null) }, 'not a native or bound function');
  });

  it('rejects arguments that are not JSON compatible, naming the path', async () => {
    await rejects({ args: { f: () => 1 } }, 'args.f must be JSON compatible (found function)');
    await rejects({ args: [1, undefined] }, 'args[1] must be JSON compatible (found undefined)');
    await rejects({ args: { n: NaN } }, 'args.n must be JSON compatible (NaN is not)');
    await rejects({ args: { n: Infinity } }, 'args.n must be JSON compatible');
    await rejects({ args: { d: new Date() } }, 'args.d must be JSON compatible (found a non-plain object)');
    await rejects({ args: { m: new Map() } }, 'non-plain object');
    await rejects({ args: 10n }, 'args must be JSON compatible (found bigint)');
    await rejects({ args: Symbol('s') }, 'found symbol');
    const cycle = {};
    cycle.self = cycle;
    await rejects({ args: cycle }, 'args.self must be JSON compatible (it contains a cycle)');
  });

  it('accepts shared (non cyclic) references', async () => {
    const shared = { v: 1 };
    await expect(
      evaluate({ code: '', test: a => a, args: [shared, shared] })
    ).resolves.toEqual([{ v: 1 }, { v: 1 }]);
  });
});
