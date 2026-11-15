import EventEmitter from 'events';

/**
 * Web Worker based code runner (host side). The worker side lives in
 * public/code_runner/worker.js; the protocol is documented in
 * docs/migration/code-runner-worker.md.
 *
 * Public surface mirrors common/code_runner.js: `runCode(code, env)`,
 * `terminate()` and `log` events carrying `{ logLevel, arguments }`. This
 * module must stay free of electron, fs, vm and child_process so it can run
 * unchanged in a Tauri webview.
 */

// Path of the worker script relative to the static root, for use with
// fs_utils `staticFileUrl` by whoever wires this module in.
export const WORKER_RELATIVE_PATH = 'code_runner/worker.js';

// Protocol constants (duplicated in public/code_runner/worker.js, which cannot import)
export const MESSAGE_RUN = 'run';
export const MESSAGE_PULL = 'pull';
export const MESSAGE_VARS = 'vars';
export const MESSAGE_VARS_ERROR = 'vars-error';
export const MESSAGE_EVALUATE = 'evaluate';
export const MESSAGE_RESULT = 'result';
export const MESSAGE_RESULT_ERROR = 'result-error';
export const MESSAGE_LOG = 'log';
export const LOG_LEVELS = Object.freeze(['log', 'info', 'warn', 'error']);

const TERMINATED_MESSAGE = 'Terminated.';

// Upper bound for one pullVarsInWorker / evaluateInWorker run; the worker is terminated afterwards
export const PULL_VARS_TIMEOUT_MS = 10000;

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function assertValidRun(code, env) {
  if (typeof code !== 'string') {
    throw new TypeError('runCode: code must be a string');
  }
  if (!isPlainObject(env)) {
    throw new TypeError('runCode: env must be a plain object');
  }
  Object.keys(env).forEach(name => {
    if (typeof env[name] !== 'string') {
      throw new TypeError(`runCode: env.${name} must be a string`);
    }
  });
}

function createDefaultWorker(url) {
  if (typeof Worker === 'undefined') {
    throw new Error('Web Workers are not available in this environment');
  }
  return new Worker(url);
}

function errorLog(message, stack = '') {
  return { logLevel: 'error', arguments: [{ message, stack }] };
}

/**
 * @param {Object} options
 * @param {string} options.workerUrl absolute URL of worker.js (e.g. a file: URL)
 * @param {function(string): Worker} [options.createWorker] worker factory, injectable for tests
 */
export function createCodeRunnerWorker({
  workerUrl,
  createWorker = createDefaultWorker,
} = {}) {
  if (typeof workerUrl !== 'string' || workerUrl === '') {
    throw new TypeError('createCodeRunnerWorker: workerUrl is required');
  }

  const runner = new EventEmitter();
  let currentWorker = null;

  function emitLog(payload) {
    runner.emit('log', payload);
  }

  function stopWorker(worker) {
    if (currentWorker === worker) {
      currentWorker = null;
    }
    worker.terminate();
  }

  function attach(worker) {
    // Everything below ignores events from a worker that is no longer current
    const ifCurrent = handler => event => {
      if (worker === currentWorker) {
        handler(event);
      }
    };

    worker.addEventListener(
      'message',
      ifCurrent(event => {
        const data = event.data;
        const valid =
          data !== null &&
          typeof data === 'object' &&
          data.type === MESSAGE_LOG &&
          LOG_LEVELS.indexOf(data.logLevel) !== -1 &&
          Array.isArray(data.arguments);
        if (!valid) {
          emitLog(errorLog('Code runner received an unexpected message from the worker'));
          return;
        }
        emitLog({ logLevel: data.logLevel, arguments: data.arguments });
      })
    );

    worker.addEventListener(
      'error',
      ifCurrent(event => {
        // Script load/parse failure or an exception that escaped the worker
        const detail = event.filename
          ? ` (${event.filename}:${event.lineno}:${event.colno})`
          : '';
        emitLog(
          errorLog(`Code runner worker failed: ${event.message || 'unknown error'}${detail}`)
        );
        stopWorker(worker);
      })
    );

    worker.addEventListener(
      'messageerror',
      ifCurrent(() => {
        emitLog(errorLog('Code runner could not deserialize a message from the worker'));
      })
    );
  }

  // Run `code` in a fresh worker; any previous run is stopped silently.
  runner.runCode = function runCode(code, env) {
    assertValidRun(code, env);

    if (currentWorker) {
      stopWorker(currentWorker);
    }

    const worker = createWorker(workerUrl);
    currentWorker = worker;
    attach(worker);

    try {
      worker.postMessage({ type: MESSAGE_RUN, code, env });
    } catch (e) {
      stopWorker(worker);
      throw e;
    }
  };

  // Kill the running worker (if any) and report it like the BrowserWindow
  // runner did, which always printed "Terminated.".
  runner.terminate = function terminate() {
    if (currentWorker) {
      stopWorker(currentWorker);
    }
    emitLog({ logLevel: 'log', arguments: [TERMINATED_MESSAGE] });
  };

  return runner;
}

// Sends `message` to a fresh worker and settles with the first reply of
// `successType` (value taken by `readSuccess`, which returns `{ value }` or
// null for a malformed reply) or `errorType` (an Error keeping the name,
// message and stack of the error thrown in the worker). Console output is
// discarded; a worker failure, an unexpected message or exceeding `timeoutMs`
// reject. The worker is terminated afterwards.
function exchangeWithWorker({
  workerUrl,
  createWorker,
  timeoutMs,
  message,
  successType,
  errorType,
  readSuccess,
}) {
  return new Promise((resolve, reject) => {
    const worker = createWorker(workerUrl);
    let timer = null;

    const finish = settle => value => {
      clearTimeout(timer);
      worker.terminate();
      settle(value);
    };
    const succeed = finish(resolve);
    const fail = finish(reject);

    timer = setTimeout(
      () => fail(new Error(`Running the code timed out after ${timeoutMs} ms`)),
      timeoutMs
    );

    worker.addEventListener('message', event => {
      const data = event.data;
      if (data !== null && typeof data === 'object') {
        if (data.type === successType) {
          const read = readSuccess(data);
          if (read) {
            succeed(read.value);
            return;
          }
        } else if (data.type === errorType && data.error && typeof data.error === 'object') {
          const error = new Error(data.error.message);
          error.name = data.error.name;
          error.stack = data.error.stack;
          fail(error);
          return;
        } else if (data.type === MESSAGE_LOG) {
          // console output of the code is intentionally discarded
          return;
        }
      }
      fail(new Error('Code runner received an unexpected message from the worker'));
    });
    worker.addEventListener('error', event => {
      const detail = event.filename
        ? ` (${event.filename}:${event.lineno}:${event.colno})`
        : '';
      fail(new Error(`Code runner worker failed: ${event.message || 'unknown error'}${detail}`));
    });
    worker.addEventListener('messageerror', () => {
      fail(new Error('Code runner could not deserialize a message from the worker'));
    });

    try {
      worker.postMessage(message);
    } catch (e) {
      fail(e);
    }
  });
}

/**
 * Runs `code` in a throw-away worker (never the QuestIDE runner's worker) and
 * resolves with the values of the top-level variables named in `keys`, e.g.
 * `{ a: 1, b: [1, 2] }`. If reading a variable throws (for example a
 * ReferenceError), the result also has an `_error` property holding that error.
 *
 * Values cross the worker boundary by structured clone. A requested variable
 * that cannot be cloned (a function, a class, a symbol, or an object holding
 * one) makes the promise reject with an explicit error naming the variable;
 * class instances arrive as plain objects. An error thrown by `code` itself,
 * a worker failure, an unexpected message or exceeding `timeoutMs` also
 * reject. Console output of the code is discarded.
 *
 * @param {Object} options
 * @param {string} options.workerUrl absolute URL of worker.js
 * @param {string} options.code
 * @param {string[]} options.keys identifiers of top-level variables to read
 * @param {Object<string, string>} [options.env] exposed as `process.env`
 * @param {number} [options.timeoutMs]
 * @param {function(string): Worker} [options.createWorker]
 * @returns {Promise<Object>}
 */
export function pullVarsInWorker({
  workerUrl,
  code,
  keys,
  env = {},
  timeoutMs = PULL_VARS_TIMEOUT_MS,
  createWorker = createDefaultWorker,
} = {}) {
  if (typeof workerUrl !== 'string' || workerUrl === '') {
    return Promise.reject(new TypeError('pullVarsInWorker: workerUrl is required'));
  }
  if (typeof code !== 'string') {
    return Promise.reject(new TypeError('pullVarsInWorker: code must be a string'));
  }
  if (!Array.isArray(keys) || !keys.every(key => typeof key === 'string')) {
    return Promise.reject(
      new TypeError('pullVarsInWorker: keys must be an array of strings')
    );
  }
  try {
    assertValidRun(code, env);
  } catch (e) {
    return Promise.reject(e);
  }

  return exchangeWithWorker({
    workerUrl,
    createWorker,
    timeoutMs,
    message: { type: MESSAGE_PULL, code, keys, env },
    successType: MESSAGE_VARS,
    errorType: MESSAGE_VARS_ERROR,
    readSuccess: data =>
      data.vars !== null && typeof data.vars === 'object'
        ? { value: data.vars }
        : null,
  });
}

function describeArgsPath(path) {
  return path === '' ? 'args' : `args${path}`;
}

// `args` is sent to the worker as data the test function receives; only JSON
// values are accepted so that nothing (a function, a class instance, undefined,
// NaN, a cycle) is silently changed or dropped on the way.
function assertJsonValue(value, path, ancestors) {
  const where = describeArgsPath(path);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${where} must be JSON compatible (${value} is not)`);
    }
    return;
  }
  if (typeof value !== 'object') {
    throw new TypeError(`${where} must be JSON compatible (found ${typeof value})`);
  }
  if (ancestors.indexOf(value) !== -1) {
    throw new TypeError(`${where} must be JSON compatible (it contains a cycle)`);
  }
  const nested = ancestors.concat([value]);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonValue(item, `${path}[${index}]`, nested));
    return;
  }
  if (!isPlainObject(value)) {
    throw new TypeError(`${where} must be JSON compatible (found a non-plain object)`);
  }
  Object.keys(value).forEach(key =>
    assertJsonValue(value[key], `${path}.${key}`, nested)
  );
}

const NATIVE_CODE = /\{\s*\[native code\]\s*\}\s*$/;

// Source text of the function that runs in the worker
function testSource(test) {
  if (typeof test === 'function') {
    const source = Function.prototype.toString.call(test);
    if (NATIVE_CODE.test(source)) {
      throw new TypeError(
        'evaluateInWorker: test must be a plain function, not a native or bound function'
      );
    }
    return source;
  }
  if (typeof test === 'string' && test.trim() !== '') {
    return test;
  }
  throw new TypeError(
    'evaluateInWorker: test must be a function or the source text of one'
  );
}

/**
 * Runs `code` in a throw-away worker, then calls `test` INSIDE that worker with
 * `args`, and resolves with whatever `test` returns (a returned Promise is
 * awaited). This is how a validator exercises functions and classes defined by
 * the user's code: they cannot cross the worker boundary, so the test cases go
 * to them and only data comes back.
 *
 * `test` is serialized with `Function.prototype.toString` (or given as source
 * text) and evaluated right after `code` in the same script, so it can refer to
 * the user's top-level `var`, `let`, `const`, function and class declarations
 * by name. It has no access to the host: it must not use variables of the
 * scope it was written in (those are `ReferenceError`s in the worker); pass
 * data as `args` instead. `args` must be JSON compatible (string, finite
 * number, boolean, null, arrays and plain objects of those); anything else
 * rejects before a worker is started.
 *
 * The promise rejects with an Error that keeps the name, message and stack
 * when `code` or `test` throws (or `test` rejects), when the result cannot be
 * structured-cloned (a function, a class, a symbol, or an object holding one),
 * when the worker fails, or after `timeoutMs`. Console output of the code is
 * discarded.
 *
 * @param {Object} options
 * @param {string} options.workerUrl absolute URL of worker.js
 * @param {string} options.code the user's code
 * @param {function|string} options.test function (or its source text) that runs in the worker
 * @param {*} [options.args] JSON compatible data handed to `test`
 * @param {Object<string, string>} [options.env] exposed as `process.env`
 * @param {number} [options.timeoutMs]
 * @param {function(string): Worker} [options.createWorker]
 * @returns {Promise<*>}
 */
export function evaluateInWorker({
  workerUrl,
  code,
  test,
  args = {},
  env = {},
  timeoutMs = PULL_VARS_TIMEOUT_MS,
  createWorker = createDefaultWorker,
} = {}) {
  if (typeof workerUrl !== 'string' || workerUrl === '') {
    return Promise.reject(new TypeError('evaluateInWorker: workerUrl is required'));
  }
  if (typeof code !== 'string') {
    return Promise.reject(new TypeError('evaluateInWorker: code must be a string'));
  }
  let source;
  try {
    source = testSource(test);
    assertJsonValue(args, '', []);
    assertValidRun(code, env);
  } catch (e) {
    return Promise.reject(e);
  }

  return exchangeWithWorker({
    workerUrl,
    createWorker,
    timeoutMs,
    message: { type: MESSAGE_EVALUATE, code, test: source, args, env },
    successType: MESSAGE_RESULT,
    errorType: MESSAGE_RESULT_ERROR,
    readSuccess: data => ('value' in data ? { value: data.value } : null),
  });
}
