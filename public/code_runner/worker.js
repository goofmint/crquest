// Web Worker side of the QuestIDE code runner (see docs/migration/code-runner-worker.md).
//
// This is a plain classic-worker script: it is NOT compiled by Babel and must
// stay free of imports, `require` and Node APIs. It is loaded with
// `new Worker(url)` by src/js/app/common/codeRunnerWorker.js, and by the unit
// tests, which evaluate it against a fake worker scope.
//
// Protocol (postMessage, structured clone):
//   host   -> worker  { type: 'run', code: string, env: { [name]: string } }   (exactly once per worker)
//   worker -> host    { type: 'log', logLevel: 'log'|'info'|'warn'|'error', arguments: any[] }
// Variable extraction (validators, ValidationHelper.pullVarsFromUserCodeLocalScope);
// like 'run' it is accepted exactly once per worker, in place of 'run':
//   host   -> worker  { type: 'pull', code: string, keys: string[], env: { [name]: string } }
//   worker -> host    { type: 'vars', vars: { [key]: value, _error?: Error } }
//                     { type: 'vars-error', error: { name, message, stack } }
// Test-case evaluation (validators, ValidationHelper.evaluateInUserCodeLocalScope);
// also accepted exactly once per worker, in place of 'run':
//   host   -> worker  { type: 'evaluate', code: string, test: string, args: JSON value, env: { [name]: string },
//                       mocks?: { fetch?: string, fs?: { directories: { [path]: string[] } } } }
//   worker -> host    { type: 'result', value }
//                     { type: 'result-error', error: { name, message, stack } }
// `test` is the source text of a function expression. It is evaluated in the
// same script as `code`, right after it, so it sees the top-level variables,
// functions and classes of the user's code, and is called with `args`. It may
// return a Promise. Its (awaited) result must be structured-cloneable, else
// 'result-error' is sent; so is an error thrown by `code` or `test`.
// `mocks` (optional, 'evaluate' only) installs stand-ins for host services
// BEFORE `code` runs, so the user's code (also its top-level statements) sees
// them. Nothing else is ever installed, and an unknown key is an error:
//   mocks.fetch  source text of a factory `realFetch => fetchLike`; the function
//                it returns replaces the global `fetch` (state lives in the
//                factory's closure). `realFetch` is the worker's own fetch.
//   mocks.fs     a read-only virtual file system: installs a global `require`
//                that knows only 'fs' and 'fs/promises' with `readdir(path)`,
//                which resolves the listed directories (a trailing separator
//                is ignored; options: none, 'utf8' or { encoding: 'utf8' }) and rejects with ENOENT
//                for any other path. Any other module is 'Cannot find module'.
// 'vars' values must be structured-cloneable; a requested variable that is not
// (a function, a class, a symbol, an object containing one) is reported with
// 'vars-error', never silently dropped or converted.
// Errors are reported as logLevel 'error' messages whose argument is a plain
// `{ message, stack }` object, the shape QuestIDE.jsx already recognises.
(function(scope) {
  'use strict';

  const LOG_LEVELS = ['log', 'info', 'warn', 'error'];
  const MESSAGE_RUN = 'run';
  const MESSAGE_LOG = 'log';
  const MESSAGE_PULL = 'pull';
  const MESSAGE_VARS = 'vars';
  const MESSAGE_VARS_ERROR = 'vars-error';
  const MESSAGE_EVALUATE = 'evaluate';
  const MESSAGE_RESULT = 'result';
  const MESSAGE_RESULT_ERROR = 'result-error';
  const PULL_HOLDER = '__TQ';
  const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
  const SOURCE_URL = 'script.js';
  const MAX_SERIALIZE_DEPTH = 20;
  const MAX_SERIALIZE_NODES = 100000;
  const TRUNCATED = '[Truncated: too many nodes]';
  const UNCAUGHT_FALLBACK_MESSAGE =
    'Uncaught exception encountered - check your async code.';

  // ---------------------------------------------------------------------
  // Serialization: every console argument is converted into a plain,
  // structured-clone-safe tree before it is posted.
  //   string, number, boolean, null, undefined  -> unchanged
  //   bigint                                    -> "123n"
  //   symbol                                    -> "Symbol(description)"
  //   function                                  -> "[Function: name]" / "[Function (anonymous)]"
  //   Error                                     -> { message, stack }
  //   Date                                      -> ISO string ("Invalid Date" if invalid)
  //   RegExp                                    -> its source text, e.g. "/a/g"
  //   Map                                       -> array of [key, value] pairs
  //   Set / typed array                         -> array of values
  //   ArrayBuffer                               -> "[ArrayBuffer: N bytes]"
  //   Array                                     -> array of serialized items
  //   any other object                          -> plain object of its own enumerable string-keyed properties
  //   object already on the current path        -> "[Circular]"
  //   nesting deeper than MAX_SERIALIZE_DEPTH   -> "[Max depth exceeded]"
  //   property whose getter throws              -> "[Getter threw: <message>]"
  //   value whose inspection throws (Proxy trap)-> "[Unserializable: <message>]"
  //   more than MAX_SERIALIZE_NODES nodes per console call -> "[Truncated: too many nodes]"
  // Built-in methods are used instead of the value's own, so user code cannot
  // break logging by overriding `map`, `toString`, `name` and the like.
  // ---------------------------------------------------------------------
  function isError(value) {
    return Object.prototype.toString.call(value) === '[object Error]' ||
      value instanceof Error;
  }

  // Indirect eval labels the user's top level (and anonymous functions) as
  // "at eval (script.js:L:C)"; vm.runInThisContext printed "at script.js:L:C",
  // which is what QuestIDE.jsx looks for. Rewrite those frames, and drop the
  // runner's own frames (eval/run/onMessage) below the last user frame so the
  // worker's file URL never reaches the learner.
  function cleanStack(stack) {
    if (typeof stack !== 'string') {
      return '';
    }
    const frame = `${SOURCE_URL}:`;
    const lines = stack
      .split('\n')
      .map(line => line.replace(/\beval \((script\.js:\d+:\d+)\)/, '$1'));
    let last = -1;
    lines.forEach((line, index) => {
      if (line.indexOf(frame) !== -1) {
        last = index;
      }
    });
    return (last === -1 ? lines : lines.slice(0, last + 1)).join('\n');
  }

  function serializeError(error) {
    return {
      message: String(error.message),
      stack: cleanStack(error.stack),
    };
  }

  // Built-in accessors captured once, so user code that shadows methods or
  // properties on its own values cannot influence serialization.
  const dateGetTime = Date.prototype.getTime;
  const dateToISOString = Date.prototype.toISOString;
  const regExpToString = RegExp.prototype.toString;
  const mapEntries = Map.prototype.entries;
  const setValues = Set.prototype.values;
  const mapIteratorNext = Object.getPrototypeOf(new Map().entries()).next;
  const setIteratorNext = Object.getPrototypeOf(new Set().values()).next;
  const arrayBufferByteLength = Object.getOwnPropertyDescriptor(
    ArrayBuffer.prototype,
    'byteLength'
  ).get;
  const typedArrayLength = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(Uint8Array.prototype),
    'length'
  ).get;

  function safeMessage(e) {
    try {
      return String(e && e.message);
    } catch (inner) {
      return 'unknown error';
    }
  }

  function describeFunction(fn) {
    let name = '';
    try {
      name = fn.name;
    } catch (e) {
      name = '';
    }
    return typeof name === 'string' && name
      ? `[Function: ${name}]`
      : '[Function (anonymous)]';
  }

  // Serializes `items` (an array-like of `length`) into a NEW plain array with
  // an index loop; nothing from the input value is called for transformation.
  function serializeItems(read, length, next, budget) {
    const result = [];
    for (let i = 0; i < length; i++) {
      if (budget.remaining <= 0) {
        result.push(TRUNCATED);
        break;
      }
      try {
        result.push(next(read(i)));
      } catch (e) {
        // A failed read still costs one node (successful reads are counted by
        // serialize itself), so throwing getters cannot evade the budget.
        budget.remaining--;
        result.push(`[Getter threw: ${safeMessage(e)}]`);
      }
    }
    return result;
  }

  // Pulls elements lazily from a built-in iterator, checking the shared budget
  // BEFORE each pull, so a huge Map/Set is never copied into a temporary array.
  function serializeIterator(iterator, iteratorNext, next, budget) {
    const result = [];
    for (;;) {
      if (budget.remaining <= 0) {
        result.push(TRUNCATED);
        break;
      }
      const step = iteratorNext.call(iterator);
      if (step.done) {
        break;
      }
      result.push(next(step.value));
    }
    return result;
  }

  function serializeObject(value, ancestors, depth, budget) {
    if (isError(value)) {
      return serializeError(value);
    }
    if (value instanceof Date) {
      const time = dateGetTime.call(value);
      return Number.isNaN(time) ? 'Invalid Date' : dateToISOString.call(value);
    }
    if (value instanceof RegExp) {
      return regExpToString.call(value);
    }
    if (value instanceof ArrayBuffer) {
      return `[ArrayBuffer: ${arrayBufferByteLength.call(value)} bytes]`;
    }

    const path = ancestors.concat([value]);
    const next = item => serialize(item, path, depth + 1, budget);

    if (Array.isArray(value)) {
      return serializeItems(i => value[i], value.length, next, budget);
    }
    if (value instanceof Map) {
      return serializeIterator(mapEntries.call(value), mapIteratorNext, next, budget);
    }
    if (value instanceof Set) {
      return serializeIterator(setValues.call(value), setIteratorNext, next, budget);
    }
    if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
      return serializeItems(i => value[i], typedArrayLength.call(value), next, budget);
    }

    const result = {};
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i++) {
      if (budget.remaining <= 0) {
        result['…'] = TRUNCATED;
        break;
      }
      try {
        result[keys[i]] = next(value[keys[i]]);
      } catch (e) {
        result[keys[i]] = `[Getter threw: ${safeMessage(e)}]`;
      }
    }
    return result;
  }

  // `budget` is one counter object per console call, shared by every node of
  // every argument, so shared (non-cyclic) references cannot blow up.
  function serialize(value, ancestors, depth, budget) {
    if (budget.remaining <= 0) {
      return TRUNCATED;
    }
    budget.remaining--;

    switch (typeof value) {
      case 'string':
      case 'number':
      case 'boolean':
      case 'undefined':
        return value;
      case 'bigint':
        return `${value}n`;
      case 'symbol':
        return value.toString();
      case 'function':
        return describeFunction(value);
      default:
        break;
    }

    if (value === null) {
      return null;
    }

    if (ancestors.indexOf(value) !== -1) {
      return '[Circular]';
    }
    if (depth >= MAX_SERIALIZE_DEPTH) {
      return '[Max depth exceeded]';
    }

    try {
      return serializeObject(value, ancestors, depth, budget);
    } catch (e) {
      // e.g. a Proxy trap threw
      return `[Unserializable: ${safeMessage(e)}]`;
    }
  }

  // ---------------------------------------------------------------------
  // Host communication
  // ---------------------------------------------------------------------
  function send(logLevel, args) {
    let serialized;
    try {
      const budget = { remaining: MAX_SERIALIZE_NODES };
      serialized = args.map(arg => serialize(arg, [], 0, budget));
    } catch (e) {
      // Serialization itself failed (e.g. a Proxy trap threw): say so
      // explicitly instead of dropping the log call.
      logLevel = 'error';
      serialized = [
        {
          message: `Could not serialize console arguments: ${e && e.message}`,
          stack: (e && e.stack) || '',
        },
      ];
    }
    scope.postMessage({
      type: MESSAGE_LOG,
      logLevel,
      arguments: serialized,
    });
  }

  function installConsole() {
    LOG_LEVELS.forEach(logLevel => {
      const original = scope.console[logLevel];
      scope.console[logLevel] = function() {
        const args = Array.prototype.slice.call(arguments);
        // Keep the worker's own devtools console working, as runner.js did.
        original.apply(scope.console, args);
        send(logLevel, args);
      };
    });
  }

  // Same normalisation as runner.js `___cr___.uncaught`, but tolerant of
  // `null` / `undefined` being thrown.
  function reportUncaught(reason) {
    const hasObject = reason !== null && reason !== undefined;
    let message = hasObject ? reason.message : undefined;
    if (!message) {
      message =
        typeof reason === 'string' ? reason : UNCAUGHT_FALLBACK_MESSAGE;
    }
    scope.console.error({
      message,
      stack: hasObject ? cleanStack(reason.stack) : '',
    });
  }

  // `process.env` shim: Node's `process` does not exist in a Worker, so the env
  // sent by the host is exposed as a plain (mutable) `process.env` copy.
  function installEnv(env) {
    if (env === null || typeof env !== 'object' || Array.isArray(env)) {
      throw new TypeError('env must be a plain object');
    }
    const copy = {};
    Object.keys(env).forEach(name => {
      if (typeof env[name] !== 'string') {
        throw new TypeError(`env.${name} must be a string`);
      }
      copy[name] = env[name];
    });
    Object.defineProperty(scope, 'process', {
      value: { env: copy },
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }

  // Polyfill kept from runner.js; only installed when the runtime lacks it
  // (Electron 11 / Chromium 87 and Tauri webviews already have it).
  function installReplaceAllPolyfill() {
    if (String.prototype.replaceAll) {
      return;
    }
    Object.defineProperty(String.prototype, 'replaceAll', {
      value: function(str, newStr) {
        if (
          Object.prototype.toString.call(str).toLowerCase() === '[object regexp]'
        ) {
          return this.replace(str, newStr);
        }
        // Unlike the runner.js polyfill, a string pattern is matched literally,
        // as native replaceAll does.
        return this.replace(
          new RegExp(String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
          newStr
        );
      },
      writable: true,
      configurable: true,
    });
  }

  // ---------------------------------------------------------------------
  // Mocks of host services (evaluate only)
  // ---------------------------------------------------------------------
  const MOCK_KEYS = ['fetch', 'fs'];

  function isPlainObject(value) {
    if (value === null || typeof value !== 'object') {
      return false;
    }
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function defineGlobal(name, value) {
    Object.defineProperty(scope, name, {
      value,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }

  function installFetchMock(source) {
    if (typeof source !== 'string' || source.trim() === '') {
      throw new TypeError('mocks.fetch must be the source text of a function');
    }
    const factory = (0, eval)(`(${source}\n)`);
    if (typeof factory !== 'function') {
      throw new TypeError('mocks.fetch must be the source text of a function');
    }
    const realFetch =
      typeof scope.fetch === 'function' ? scope.fetch.bind(scope) : undefined;
    const mock = factory(realFetch);
    if (typeof mock !== 'function') {
      throw new TypeError('mocks.fetch must be a factory that returns a function');
    }
    defineGlobal('fetch', mock);
  }

  function installFsMock(fsMock) {
    if (
      !isPlainObject(fsMock) ||
      Object.keys(fsMock).some(key => key !== 'directories') ||
      !isPlainObject(fsMock.directories) ||
      !Object.keys(fsMock.directories).every(
        dir =>
          Array.isArray(fsMock.directories[dir]) &&
          fsMock.directories[dir].every(name => typeof name === 'string')
      )
    ) {
      throw new TypeError(
        'mocks.fs must be { directories: { [path]: string[] } }'
      );
    }
    // `dir` and `dir/` name the same directory (as with the real fs); a root
    // ('/', 'C:\\') keeps one separator.
    function normalizeDirectory(dirPath) {
      if (dirPath !== '' && /^(?:[A-Za-z]:)?[\\/]*$/.test(dirPath)) {
        const drive = /^[A-Za-z]:/.test(dirPath) ? dirPath.slice(0, 2) : '';
        return `${drive}/`;
      }
      return dirPath.replace(/[\\/]+$/, '');
    }
    const directories = Object.create(null);
    Object.keys(fsMock.directories).forEach(dir => {
      directories[normalizeDirectory(dir)] = fsMock.directories[dir];
    });

    // The names are always utf8 strings: no options, null, 'utf8' / 'utf-8' or
    // { encoding } with one of those are accepted, like the real readdir.
    function isDefaultEncoding(encoding) {
      return (
        encoding === undefined ||
        encoding === null ||
        (typeof encoding === 'string' &&
          ['utf8', 'utf-8'].indexOf(encoding.toLowerCase()) !== -1)
      );
    }
    function isSupportedOptions(options) {
      if (isDefaultEncoding(options)) {
        return true;
      }
      return (
        isPlainObject(options) &&
        Object.keys(options).every(key => key === 'encoding') &&
        isDefaultEncoding(options.encoding)
      );
    }

    function readdir(dirPath, options) {
      if (typeof dirPath !== 'string') {
        return Promise.reject(
          new TypeError('The "path" argument must be of type string')
        );
      }
      if (!isSupportedOptions(options)) {
        return Promise.reject(
          new TypeError('readdir options are not supported in the validator worker')
        );
      }
      const key = normalizeDirectory(dirPath);
      if (!(key in directories)) {
        const error = new Error(
          `ENOENT: no such file or directory, scandir '${dirPath}'`
        );
        error.code = 'ENOENT';
        error.syscall = 'scandir';
        error.path = dirPath;
        return Promise.reject(error);
      }
      return Promise.resolve(directories[key].slice());
    }

    const promises = Object.freeze({ readdir });
    const modules = {
      fs: Object.freeze({ promises }),
      'fs/promises': promises,
    };
    defineGlobal('require', function require(name) {
      if (Object.prototype.hasOwnProperty.call(modules, name)) {
        return modules[name];
      }
      const error = new Error(`Cannot find module '${name}'`);
      error.code = 'MODULE_NOT_FOUND';
      throw error;
    });
  }

  function installMocks(mocks) {
    if (mocks === undefined) {
      return;
    }
    if (!isPlainObject(mocks)) {
      throw new TypeError('mocks must be a plain object');
    }
    Object.keys(mocks).forEach(key => {
      if (MOCK_KEYS.indexOf(key) === -1) {
        throw new TypeError(
          `Unknown mock "${key}" (supported: ${MOCK_KEYS.join(', ')})`
        );
      }
    });
    if (mocks.fetch !== undefined) {
      installFetchMock(mocks.fetch);
    }
    if (mocks.fs !== undefined) {
      installFsMock(mocks.fs);
    }
  }

  // ---------------------------------------------------------------------
  // Running the user's code
  // ---------------------------------------------------------------------
  let started = false;

  // `throw null` / `throw 'text'` have no .message: describe the thrown value
  function thrownMessage(e) {
    return e !== null && e !== undefined && e.message ? e.message : String(e);
  }

  function run(code, env) {
    installEnv(env);
    installReplaceAllPolyfill();

    try {
      // Indirect eval: runs in the global scope like vm.runInThisContext did.
      // The sourceURL makes stack frames read "script.js:LINE:COL", which
      // QuestIDE.jsx uses to trim the stack.
      (0, eval)(`${code}\n//# sourceURL=${SOURCE_URL}`);
    } catch (e) {
      scope.console.error('There was a problem executing your code:', {
        message: thrownMessage(e),
        stack: e !== null && e !== undefined ? cleanStack(e.stack) : '',
      });
    }
  }


  // ---------------------------------------------------------------------
  // Pulling top-level variables out of the user's code
  // ---------------------------------------------------------------------
  function describeValue(value) {
    if (typeof value === 'function') {
      return /^class[\s{]/.test(Function.prototype.toString.call(value))
        ? 'class'
        : 'function';
    }
    return typeof value;
  }

  // postMessage throws a DataCloneError synchronously for values that cannot
  // be structured-cloned; a throw-away MessagePort lets us test one value
  // without sending anything (structuredClone is missing in Chromium 87).
  function assertCloneable(label, value) {
    const channel = new MessageChannel();
    try {
      channel.port1.postMessage(value);
    } catch (e) {
      throw new TypeError(
        `${label} (${describeValue(value)}) cannot be returned from the code ` +
          `runner worker: only structured-cloneable values are supported ` +
          `(functions, classes and symbols are not): ${safeMessage(e)}`
      );
    } finally {
      channel.port1.close();
      channel.port2.close();
    }
  }

  // `primitiveName` is the `name` reported for a thrown value that has none
  // (`throw 'text'`, `throw null`). An empty name makes the host's
  // `String(error)` the bare message, as when the former vm based runner threw
  // the value itself.
  function postVarsError(error, type = MESSAGE_VARS_ERROR, primitiveName = 'Error') {
    const isObject = error !== null && error !== undefined;
    scope.postMessage({
      type,
      error: {
        name: isObject && error.name ? String(error.name) : primitiveName,
        message: thrownMessage(error),
        stack: isObject ? cleanStack(error.stack) : '',
      },
    });
  }

  function pull(code, keys, env) {
    if (
      !Array.isArray(keys) ||
      !keys.every(key => typeof key === 'string' && IDENTIFIER.test(key))
    ) {
      throw new TypeError('"keys" must be an array of variable names');
    }
    installEnv(env);
    installReplaceAllPolyfill();

    // No prototype: a requested `__proto__` is then an ordinary own property
    // and is reported like any other variable.
    const holder = Object.create(null);
    Object.defineProperty(scope, PULL_HOLDER, {
      value: holder,
      writable: true,
      configurable: true,
      enumerable: false,
    });

    // The user's code and the reads are one script so that top-level `let`,
    // `const` and `class` declarations (scoped to the eval) are visible to
    // the reads. A read that throws (e.g. ReferenceError) is stored in
    // `_error` like the former vm based implementation did.
    const reads = keys
      .map(key => `${PULL_HOLDER}[${JSON.stringify(key)}] = ${key};`)
      .join('\n');
    const source =
      `${code};\n` +
      `try {\n${reads}\n} catch (error) {\n${PULL_HOLDER}._error = error;\n}\n` +
      `//# sourceURL=${SOURCE_URL}`;

    try {
      (0, eval)(source);
    } catch (e) {
      // An error thrown by the user's code itself is reported as such
      postVarsError(e);
      return;
    }

    try {
      Object.keys(holder).forEach(key => {
        assertCloneable(
          key === '_error' ? 'The read error' : `Variable "${key}"`,
          holder[key]
        );
      });
      scope.postMessage({ type: MESSAGE_VARS, vars: holder });
    } catch (e) {
      postVarsError(e);
    }
  }

  // Runs `code`, then calls the function expression `test` (source text) with
  // `args` in the same script, so that `test` can use the top-level `let`,
  // `const`, `class` and function declarations of `code`. The result (a
  // Promise is awaited) is posted back after checking it can be cloned.
  function evaluate(code, test, args, env, mocks) {
    if (typeof test !== 'string' || test.trim() === '') {
      throw new TypeError('"test" must be the source text of a function');
    }
    installEnv(env);
    installReplaceAllPolyfill();
    installMocks(mocks);

    const holder = Object.create(null);
    holder.args = args;
    Object.defineProperty(scope, PULL_HOLDER, {
      value: holder,
      writable: true,
      configurable: true,
      enumerable: false,
    });

    // The newline after `test` keeps a trailing line comment in it from
    // swallowing the call.
    const source =
      `${code};\n` +
      `${PULL_HOLDER}.result = (${test}\n)(${PULL_HOLDER}.args);\n` +
      `//# sourceURL=${SOURCE_URL}`;

    let returned;
    try {
      (0, eval)(source);
      returned = holder.result;
    } catch (e) {
      postVarsError(e, MESSAGE_RESULT_ERROR, '');
      return;
    }

    Promise.resolve(returned).then(
      value => {
        // The real send is the clone check: cloning twice would run getters
        // of the result twice.
        try {
          scope.postMessage({ type: MESSAGE_RESULT, value });
        } catch (e) {
          postVarsError(
            e && e.name === 'DataCloneError'
              ? new TypeError(
                  `The result of the test function (${describeValue(value)}) cannot be ` +
                    `returned from the code runner worker: only structured-cloneable ` +
                    `values are supported (functions, classes and symbols are not): ` +
                    safeMessage(e)
                )
              : e,
            MESSAGE_RESULT_ERROR,
            ''
          );
        }
      },
      e => postVarsError(e, MESSAGE_RESULT_ERROR, '')
    );
  }

  function reportProtocolError(message) {
    scope.console.error({ message, stack: '' });
  }

  function onMessage(event) {
    const data = event.data;
    if (
      data === null ||
      typeof data !== 'object' ||
      (data.type !== MESSAGE_RUN &&
        data.type !== MESSAGE_PULL &&
        data.type !== MESSAGE_EVALUATE)
    ) {
      reportProtocolError(
        `Code runner worker received an unknown message: ${
          data && typeof data === 'object' ? String(data.type) : typeof data
        }`
      );
      return;
    }
    if (started) {
      reportProtocolError('Code runner worker already received a run message');
      return;
    }
    started = true;

    if (typeof data.code !== 'string') {
      if (data.type === MESSAGE_PULL) {
        postVarsError(new TypeError('Code runner worker: "code" must be a string'));
        return;
      }
      if (data.type === MESSAGE_EVALUATE) {
        postVarsError(
          new TypeError('Code runner worker: "code" must be a string'),
          MESSAGE_RESULT_ERROR
        );
        return;
      }
      reportProtocolError('Code runner worker: "code" must be a string');
      return;
    }

    try {
      if (data.type === MESSAGE_PULL) {
        pull(data.code, data.keys, data.env);
      } else if (data.type === MESSAGE_EVALUATE) {
        evaluate(data.code, data.test, data.args, data.env, data.mocks);
      } else {
        run(data.code, data.env);
      }
    } catch (e) {
      if (data.type === MESSAGE_PULL) {
        postVarsError(e);
      } else if (data.type === MESSAGE_EVALUATE) {
        postVarsError(e, MESSAGE_RESULT_ERROR, '');
      } else {
        reportProtocolError(`Code runner worker: ${e.message}`);
      }
    }
  }

  installConsole();

  scope.addEventListener('message', onMessage);
  scope.addEventListener('error', event => {
    reportUncaught(event.error || event.message);
    event.preventDefault();
  });
  scope.addEventListener('unhandledrejection', event => {
    reportUncaught(event.reason);
    event.preventDefault();
  });
})(self);
