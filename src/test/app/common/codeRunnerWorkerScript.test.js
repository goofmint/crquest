import fs from 'fs';
import path from 'path';
import vm from 'vm';

// Worker-side logic (public/code_runner/worker.js), evaluated in a fresh vm
// context whose global plays the part of the DedicatedWorkerGlobalScope.
const workerSource = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', '..', 'public', 'code_runner', 'worker.js'),
  'utf8'
);

function createScope({ withReplaceAll = true } = {}) {
  const listeners = {};
  const posted = [];
  const nativeConsoleCalls = [];
  const scope = {
    postMessage: message => posted.push(message),
    addEventListener: (type, handler) => {
      listeners[type] = handler;
    },
    console: {
      log: (...args) => nativeConsoleCalls.push(['log', args]),
      info: (...args) => nativeConsoleCalls.push(['info', args]),
      warn: (...args) => nativeConsoleCalls.push(['warn', args]),
      error: (...args) => nativeConsoleCalls.push(['error', args]),
    },
  };
  scope.self = scope;
  vm.createContext(scope);
  if (!withReplaceAll) {
    vm.runInContext('delete String.prototype.replaceAll', scope);
  }
  vm.runInContext(workerSource, scope, { filename: 'worker.js' });

  return {
    scope,
    posted,
    nativeConsoleCalls,
    listeners,
    send: data => listeners.message({ data }),
    run: (code, env = {}) => listeners.message({ data: { type: 'run', code, env } }),
    evaluate: code => vm.runInContext(code, scope),
  };
}

// Messages posted by the worker, ignoring anything but log messages
const logsOf = harness => harness.posted.map(m => [m.logLevel, ...m.arguments]);

describe('worker.js', () => {
  describe('console forwarding', () => {
    it.each(['log', 'info', 'warn', 'error'])('posts console.%s', level => {
      const h = createScope();
      h.run(`console.${level}('a', 1, true, null)`);
      expect(h.posted).toEqual([
        { type: 'log', logLevel: level, arguments: ['a', 1, true, null] },
      ]);
    });

    it('calls the original console method before forwarding', () => {
      const h = createScope();
      h.run(`console.log('x', 2)`);
      expect(h.nativeConsoleCalls).toEqual([['log', ['x', 2]]]);
    });

    it('forwards multiple calls in order', () => {
      const h = createScope();
      h.run(`console.log(1); console.warn(2); console.info(3)`);
      expect(logsOf(h)).toEqual([['log', 1], ['warn', 2], ['info', 3]]);
    });

    it('posts a call without arguments', () => {
      const h = createScope();
      h.run(`console.log()`);
      expect(h.posted).toEqual([{ type: 'log', logLevel: 'log', arguments: [] }]);
    });
  });

  describe('serialization of console arguments', () => {
    const serialized = code => {
      const h = createScope();
      h.run(code);
      expect(h.posted).toHaveLength(1);
      return h.posted[0].arguments[0];
    };

    it('keeps undefined and null', () => {
      const h = createScope();
      h.run('console.log(undefined, null)');
      expect(h.posted[0].arguments).toEqual([undefined, null]);
    });

    it('turns bigint and symbol into strings', () => {
      const h = createScope();
      h.run(`console.log(10n, Symbol('s'))`);
      expect(h.posted[0].arguments).toEqual(['10n', 'Symbol(s)']);
    });

    it('describes functions by name', () => {
      const h = createScope();
      h.run(`function foo() {} console.log(foo, () => 1, class A {})`);
      expect(h.posted[0].arguments).toEqual([
        '[Function: foo]',
        '[Function (anonymous)]',
        '[Function: A]',
      ]);
    });

    it('turns Errors into { message, stack }', () => {
      const value = serialized(`console.log(new TypeError('bad'))`);
      expect(Object.keys(value).sort()).toEqual(['message', 'stack']);
      expect(value.message).toBe('bad');
      expect(value.stack).toMatch(/^TypeError: bad/);
    });

    it('handles Errors nested in objects and arrays', () => {
      const value = serialized(`console.log({ e: [new Error('inner')] })`);
      expect(value.e[0].message).toBe('inner');
    });

    it('handles an Error with an empty or missing stack', () => {
      const value = serialized(
        `const e = new Error('m'); e.stack = undefined; console.log(e)`
      );
      expect(value).toEqual({ message: 'm', stack: '' });
    });

    it('serializes plain objects and arrays deeply', () => {
      const value = serialized(`console.log({ a: 1, b: [1, { c: 'x' }], d: { e: null } })`);
      expect(value).toEqual({ a: 1, b: [1, { c: 'x' }], d: { e: null } });
    });

    it('marks circular references', () => {
      const value = serialized(`const a = { name: 'a' }; a.self = a; a.list = [a]; console.log(a)`);
      expect(value).toEqual({ name: 'a', self: '[Circular]', list: ['[Circular]'] });
    });

    it('does not flag a shared (non-circular) reference twice', () => {
      const value = serialized(`const s = { v: 1 }; console.log({ a: s, b: s })`);
      expect(value).toEqual({ a: { v: 1 }, b: { v: 1 } });
    });

    it('replaces functions and symbols nested in objects', () => {
      const value = serialized(`console.log({ f() {}, g: () => 1, big: 5n })`);
      expect(value).toEqual({
        f: '[Function: f]',
        g: '[Function: g]',
        big: '5n',
      });
    });

    it('serializes Date, RegExp, Map, Set, typed arrays and ArrayBuffer', () => {
      const value = serialized(`console.log([
        new Date(0), new Date(NaN), /a+/gi,
        new Map([['k', { v: 1 }]]), new Set([1, 2]),
        new Uint8Array([1, 2]), new ArrayBuffer(4)
      ])`);
      expect(value).toEqual([
        '1970-01-01T00:00:00.000Z',
        'Invalid Date',
        '/a+/gi',
        [['k', { v: 1 }]],
        [1, 2],
        [1, 2],
        '[ArrayBuffer: 4 bytes]',
      ]);
    });

    it('reports a throwing getter instead of failing the whole call', () => {
      const value = serialized(
        `console.log({ ok: 1, get bad() { throw new Error('nope'); } })`
      );
      expect(value).toEqual({ ok: 1, bad: '[Getter threw: nope]' });
    });

    it('ignores non-enumerable and symbol-keyed properties', () => {
      const value = serialized(
        `const o = { a: 1 }; Object.defineProperty(o, 'hidden', { value: 2 }); o[Symbol('s')] = 3; console.log(o)`
      );
      expect(value).toEqual({ a: 1 });
    });

    it('caps nesting depth', () => {
      const value = serialized(
        `let o = {}; const root = o; for (let i = 0; i < 40; i++) { o.n = {}; o = o.n; } console.log(root)`
      );
      let depth = 0;
      let node = value;
      while (node && typeof node === 'object') {
        node = node.n;
        depth++;
      }
      expect(node).toBe('[Max depth exceeded]');
      expect(depth).toBeLessThan(40);
    });

    it('only produces JSON-like values (primitives, arrays, plain objects)', () => {
      const h = createScope();
      h.run(`const o = { f() {}, s: Symbol('x'), e: new Error('e'), m: new Map([[1, () => 2]]) }; o.o = o; console.log(o, () => 1, Symbol('y'), 3n)`);
      const isCloneSafe = value => {
        if (value === null || ['string', 'number', 'boolean', 'undefined'].includes(typeof value)) {
          return true;
        }
        if (typeof value !== 'object') {
          return false;
        }
        // Arrays and plain objects of the vm realm: check structurally
        const proto = Object.getPrototypeOf(value);
        const isArray = Array.isArray(value);
        const plain = proto !== null && Object.getPrototypeOf(proto) === null;
        return (isArray || plain) && Object.values(value).every(isCloneSafe);
      };
      expect(isCloneSafe(h.posted[0].arguments)).toBe(true);
    });

    it('reports a Proxy whose trap throws without breaking the call', () => {
      const h = createScope();
      h.run(
        `console.log('before', new Proxy({}, { ownKeys() { throw new Error('trap'); } }), 'after')`
      );
      expect(h.posted).toHaveLength(1);
      expect(h.posted[0].logLevel).toBe('log');
      expect(h.posted[0].arguments).toEqual(['before', '[Unserializable: trap]', 'after']);
    });

    it('survives a Proxy whose getPrototypeOf / toStringTag traps throw (the get trap is hit first)', () => {
      const h = createScope();
      h.run(
        `const p = new Proxy({}, { getPrototypeOf() { throw new Error('proto'); }, get() { throw new Error('get'); } });
         console.log(p, [p]); console.log('after')`
      );
      expect(h.posted).toHaveLength(2);
      expect(h.posted[0].arguments[0]).toBe('[Unserializable: get]');
      expect(h.posted[0].arguments[1]).toEqual(['[Unserializable: get]']);
      expect(h.posted[1].arguments).toEqual(['after']);
    });

    it('does not call an overridden Array map on the input', () => {
      const h = createScope();
      h.run(
        `const a = [1, 2]; a.map = () => [() => 1]; console.log(a); console.log('after')`
      );
      expect(h.posted).toHaveLength(2);
      expect(h.posted[0].arguments[0]).toEqual([1, 2]);
      expect(h.posted[1].arguments).toEqual(['after']);
    });

    it('ignores overridden methods and properties on built-in values', () => {
      const h = createScope();
      h.run(`
        const d = new Date(0); d.getTime = () => { throw new Error('d'); }; d.toISOString = () => 'x';
        const m = new Map([[1, 2]]); m.entries = () => { throw new Error('m'); };
        const s = new Set([3]); s.values = () => { throw new Error('s'); };
        const r = /a/; r.toString = () => 'x';
        const u = new Uint8Array([1]); Object.defineProperty(u, 'length', { value: 99 });
        console.log(d, m, s, r, u);
      `);
      expect(h.posted[0].arguments).toEqual([
        '1970-01-01T00:00:00.000Z',
        [[1, 2]],
        [3],
        '/a/',
        [1],
      ]);
    });

    it('survives a function whose name getter throws or is not a string', () => {
      const h = createScope();
      h.run(`
        function f() {} Object.defineProperty(f, 'name', { get() { throw new Error('n'); } });
        function g() {} Object.defineProperty(g, 'name', { value: 5 });
        console.log(f, g);
      `);
      expect(h.posted[0].arguments).toEqual(['[Function (anonymous)]', '[Function (anonymous)]']);
    });

    it('survives array elements whose getters throw', () => {
      const h = createScope();
      h.run(`const a = [1, 2]; Object.defineProperty(a, 1, { get() { throw new Error('g'); } }); console.log(a)`);
      expect(h.posted[0].arguments[0]).toEqual([1, '[Getter threw: g]']);
    });

    describe('node budget', () => {
      it('finishes quickly and truncates exponentially shared references', () => {
        const h = createScope();
        const start = Date.now();
        h.run(`
          let node = { v: 1 };
          for (let level = 0; level < 9; level++) {
            const parent = {};
            for (let i = 0; i < 10; i++) parent['k' + i] = node;
            node = parent;
          }
          console.log(node); console.log('after');
        `);
        expect(Date.now() - start).toBeLessThan(5000);
        expect(h.posted).toHaveLength(2);
        expect(JSON.stringify(h.posted[0].arguments)).toContain('[Truncated: too many nodes]');
        expect(h.posted[1].arguments).toEqual(['after']);
      });

      it('truncates a huge array without iterating all of it', () => {
        const h = createScope();
        h.run(`console.log(new Array(1e9).fill(0, 0, 0).length, Array.from({ length: 200000 }, () => 1))`);
        const [length, list] = h.posted[0].arguments;
        expect(length).toBe(1e9);
        expect(list.length).toBeLessThanOrEqual(100001);
        expect(list[list.length - 1]).toBe('[Truncated: too many nodes]');
      });

      it('shares one budget across all arguments of a call', () => {
        const h = createScope();
        h.run(`const big = Array.from({ length: 60000 }, () => ({})); console.log(big, big)`);
        const [first, second] = h.posted[0].arguments;
        expect(first).not.toContain('[Truncated: too many nodes]');
        expect(second[second.length - 1]).toBe('[Truncated: too many nodes]');
      });

      it('counts failed array reads, so throwing getters cannot evade the budget', () => {
        const h = createScope();
        const start = Date.now();
        h.run(`
          const a = new Array(500000);
          for (let i = 0; i < a.length; i++) Object.defineProperty(a, i, { get() { throw new Error('g'); } });
          console.log(a); console.log('after');
        `);
        expect(Date.now() - start).toBeLessThan(20000);
        const list = h.posted[0].arguments[0];
        expect(list.length).toBeLessThanOrEqual(100001);
        expect(list[0]).toBe('[Getter threw: g]');
        expect(list[list.length - 1]).toBe('[Truncated: too many nodes]');
        expect(h.posted[1].arguments).toEqual(['after']);
      });

      it('keeps successful reads counted once (exactly the budget of elements fit)', () => {
        const h = createScope();
        // 1 node for the array + 99999 elements = 100000
        h.run(`console.log(Array.from({ length: 99999 }, () => 1))`);
        const list = h.posted[0].arguments[0];
        expect(list).toHaveLength(99999);
        expect(list).not.toContain('[Truncated: too many nodes]');
      });

      it.each([
        ['Map', `new Map(Array.from({ length: 300000 }, (_, i) => [i, i]))`],
        ['Set', `new Set(Array.from({ length: 300000 }, (_, i) => i))`],
      ])('truncates a large %s at the budget', (_, expr) => {
        const h = createScope();
        h.run(`console.log(${expr})`);
        const list = h.posted[0].arguments[0];
        expect(list.length).toBeLessThanOrEqual(100001);
        expect(list[list.length - 1]).toBe('[Truncated: too many nodes]');
      });

      it('serializes a Set of 10^6 numbers quickly and truncated', () => {
        const h = createScope();
        h.run(`const s = new Set(); for (let i = 0; i < 1e6; i++) s.add(i); const t = Date.now(); console.log(s); console.log(Date.now() - t < 2000)`);
        expect(h.posted[0].arguments[0]).toHaveLength(100000);
        expect(h.posted[0].arguments[0][99999]).toBe('[Truncated: too many nodes]');
        expect(h.posted[1].arguments).toEqual([true]);
      });

      it('small Map and Set still serialize completely', () => {
        const h = createScope();
        h.run(`console.log(new Map([['a', { b: 1 }]]), new Set([1, 2, 3]), new Map(), new Set())`);
        expect(h.posted[0].arguments).toEqual([[['a', { b: 1 }]], [1, 2, 3], [], []]);
      });

      it('leaves normal values untouched and resets per call', () => {
        const h = createScope();
        h.run(`const big = Array.from({ length: 60000 }, () => ({})); console.log(big); console.log(big); console.log({ a: [1, { b: 2 }] })`);
        expect(h.posted[0].arguments[0]).not.toContain('[Truncated: too many nodes]');
        expect(h.posted[1].arguments[0]).not.toContain('[Truncated: too many nodes]');
        expect(h.posted[2].arguments[0]).toEqual({ a: [1, { b: 2 }] });
      });
    });
  });

  describe('env', () => {
    it('exposes env as process.env', () => {
      const h = createScope();
      h.run(`console.log(process.env.TQ_A, process.env.TQ_B, Object.keys(process.env).length)`, {
        TQ_A: 'one',
        TQ_B: 'two',
      });
      expect(h.posted[0].arguments).toEqual(['one', 'two', 2]);
    });

    it('exposes a copy, not the sent object', () => {
      const h = createScope();
      const env = { A: '1' };
      h.run(`process.env.A = 'changed'; process.env.NEW = 'x'`, env);
      expect(env).toEqual({ A: '1' });
    });

    it('leaves unset variables undefined', () => {
      const h = createScope();
      h.run(`console.log(process.env.MISSING)`, {});
      expect(h.posted[0].arguments).toEqual([undefined]);
    });

    it('provides no other process members and no require', () => {
      const h = createScope();
      h.run(`console.log(Object.keys(process), typeof require, typeof module)`);
      expect(h.posted[0].arguments).toEqual([['env'], 'undefined', 'undefined']);
    });

    it.each([
      ['a number', { A: 1 }, 'env.A must be a string'],
      ['undefined', { A: undefined }, 'env.A must be a string'],
      ['null env', null, 'env must be a plain object'],
      ['array env', [], 'env must be a plain object'],
    ])('reports %s explicitly and does not run the code', (_, env, message) => {
      const h = createScope();
      h.run(`console.log('should not run')`, env);
      expect(h.posted).toHaveLength(1);
      expect(h.posted[0].logLevel).toBe('error');
      expect(h.posted[0].arguments[0].message).toBe(`Code runner worker: ${message}`);
    });
  });

  describe('user code errors', () => {
    it('reports a thrown Error with the legacy prefix and { message, stack }', () => {
      const h = createScope();
      h.run(`function boom() { throw new Error('kaboom'); }\nboom();`);
      expect(h.posted).toHaveLength(1);
      const [prefix, detail] = h.posted[0].arguments;
      expect(h.posted[0].logLevel).toBe('error');
      expect(prefix).toBe('There was a problem executing your code:');
      expect(detail.message).toBe('kaboom');
      expect(detail.stack).toMatch(/at boom \(script\.js:1:/);
      expect(detail.stack).toMatch(/\n\s+at script\.js:2:1$/);
    });

    it('rewrites eval frames to "at script.js" and drops runner frames', () => {
      const h = createScope();
      h.run(`[1].map(() => { throw new Error('x'); });`);
      const { stack } = h.posted[0].arguments[1];
      expect(stack).toContain('at script.js:1:');
      expect(stack).not.toMatch(/eval/);
      expect(stack).not.toMatch(/worker\.js/);
    });

    it('reports a SyntaxError', () => {
      const h = createScope();
      h.run(`let = = 1;`);
      const [prefix, detail] = h.posted[0].arguments;
      expect(prefix).toBe('There was a problem executing your code:');
      expect(detail.message).toMatch(/Unexpected/);
      expect(detail.stack).toMatch(/SyntaxError/);
    });

    it.each([
      ['null', 'null', 'null'],
      ['undefined', 'undefined', 'undefined'],
      ['a string', `'plain string'`, 'plain string'],
      ['a number', '42', '42'],
    ])('does not crash when %s is thrown', (_, expr, message) => {
      const h = createScope();
      h.run(`throw ${expr};`);
      expect(h.posted).toHaveLength(1);
      expect(h.posted[0].arguments[0]).toBe('There was a problem executing your code:');
      expect(h.posted[0].arguments[1]).toEqual({ message, stack: '' });
    });

    it('stack-less thrown values keep the explicit prefix', () => {
      const h = createScope();
      h.run(`throw { message: 'obj', stack: 5 };`);
      expect(h.posted[0].arguments[1]).toEqual({ message: 'obj', stack: '' });
    });

    it('runs the code as a global script (this === global, declarations are global)', () => {
      const h = createScope();
      h.run(`var v = 5; function f() { return 6; } console.log(this === globalThis, typeof v, f())`);
      expect(h.posted[0].arguments).toEqual([true, 'number', 6]);
    });

    it('does not see worker internals', () => {
      const h = createScope();
      h.run(`console.log(typeof scope, typeof send, typeof run)`);
      expect(h.posted[0].arguments).toEqual(['undefined', 'undefined', 'undefined']);
    });
  });

  describe('uncaught errors and rejections', () => {
    it('reports an error event as { message, stack } and prevents default', () => {
      const h = createScope();
      h.run('');
      const preventDefault = jest.fn();
      h.listeners.error({
        error: h.evaluate(`new Error('async boom')`),
        message: 'Uncaught Error: async boom',
        preventDefault,
      });
      expect(h.posted).toHaveLength(1);
      expect(h.posted[0].logLevel).toBe('error');
      expect(h.posted[0].arguments[0].message).toBe('async boom');
      expect(h.posted[0].arguments[0].stack).toMatch(/Error: async boom/);
      expect(preventDefault).toHaveBeenCalledTimes(1);
    });

    it('falls back to the event message when there is no error object', () => {
      const h = createScope();
      h.listeners.error({ error: null, message: 'Script error.', preventDefault() {} });
      expect(h.posted[0].arguments[0]).toEqual({ message: 'Script error.', stack: '' });
    });

    it('reports an unhandled rejection with an Error reason', () => {
      const h = createScope();
      const preventDefault = jest.fn();
      h.listeners.unhandledrejection({
        reason: h.evaluate(`new RangeError('rejected')`),
        preventDefault,
      });
      expect(h.posted[0].logLevel).toBe('error');
      expect(h.posted[0].arguments[0].message).toBe('rejected');
      expect(preventDefault).toHaveBeenCalledTimes(1);
    });

    it('reports a string rejection reason as the message', () => {
      const h = createScope();
      h.listeners.unhandledrejection({ reason: 'nope', preventDefault() {} });
      expect(h.posted[0].arguments[0]).toEqual({ message: 'nope', stack: '' });
    });

    it.each([undefined, null, 42])(
      'uses the generic message for an unusable rejection reason (%p)',
      reason => {
        const h = createScope();
        h.listeners.unhandledrejection({ reason, preventDefault() {} });
        expect(h.posted[0].arguments[0]).toEqual({
          message: 'Uncaught exception encountered - check your async code.',
          stack: '',
        });
      }
    );
  });

  describe('protocol violations', () => {
    it('reports a second run message and does not run the code again', () => {
      const h = createScope();
      h.run(`console.log('first')`);
      h.run(`console.log('second')`);
      expect(logsOf(h)[0]).toEqual(['log', 'first']);
      expect(h.posted).toHaveLength(2);
      expect(h.posted[1].logLevel).toBe('error');
      expect(h.posted[1].arguments[0].message).toMatch(/already received a run message/);
    });

    it.each([
      ['an unknown type', { type: 'stop' }, 'stop'],
      ['no type', {}, 'undefined'],
      ['a string', 'run', 'string'],
      ['null', null, 'object'],
    ])('reports %s', (_, data) => {
      const h = createScope();
      h.send(data);
      expect(h.posted).toHaveLength(1);
      expect(h.posted[0].logLevel).toBe('error');
      expect(h.posted[0].arguments[0].message).toMatch(/unknown message/);
    });

    it('reports non-string code and still counts the run as started', () => {
      const h = createScope();
      h.send({ type: 'run', code: 42, env: {} });
      expect(h.posted[0].arguments[0].message).toBe(
        'Code runner worker: "code" must be a string'
      );
      h.run(`console.log('x')`);
      expect(h.posted[1].arguments[0].message).toMatch(/already received/);
    });
  });

  describe('String.prototype.replaceAll polyfill', () => {
    it('is installed when the runtime lacks replaceAll', () => {
      const h = createScope({ withReplaceAll: false });
      expect(h.evaluate(`typeof String.prototype.replaceAll`)).toBe('undefined');
      h.run(`console.log('a.b.c'.replaceAll('.', '-'), 'aXbx'.replaceAll(/x/gi, '_'), 'x'.replaceAll('x', '$&$&'))`);
      expect(h.posted[0].arguments).toEqual(['a-b-c', 'a_b_', 'xx']);
    });

    it('is non-enumerable', () => {
      const h = createScope({ withReplaceAll: false });
      h.run(`const keys = []; for (const k in String.prototype) keys.push(k); console.log(keys.includes('replaceAll'))`);
      expect(h.posted[0].arguments).toEqual([false]);
    });

    it('leaves a native replaceAll untouched', () => {
      const h = createScope();
      const native = h.evaluate(`String.prototype.replaceAll`);
      h.run('');
      expect(h.evaluate(`String.prototype.replaceAll`)).toBe(native);
    });
  });
});
