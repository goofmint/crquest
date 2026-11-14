import EventEmitter from 'events';

/**
 * Web Worker based code runner (host side). The worker side lives in
 * public/code_runner/worker.js; the protocol is documented in
 * docs/migration/code-runner-worker.md.
 *
 * Public surface mirrors common/code_runner.js: `runCode(code, env)`,
 * `terminate()` and `log` events carrying `{ logLevel, arguments }`. It is not
 * wired into the app yet. This module must stay free of electron, fs, vm and
 * child_process so it can run unchanged in a Tauri webview.
 */

// Path of the worker script relative to the static root, for use with
// fs_utils `staticFileUrl` by whoever wires this module in.
export const WORKER_RELATIVE_PATH = 'code_runner/worker.js';

// Protocol constants (duplicated in public/code_runner/worker.js, which cannot import)
export const MESSAGE_RUN = 'run';
export const MESSAGE_LOG = 'log';
export const LOG_LEVELS = Object.freeze(['log', 'info', 'warn', 'error']);

const TERMINATED_MESSAGE = 'Terminated.';

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
