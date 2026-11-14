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
// Errors are reported as logLevel 'error' messages whose argument is a plain
// `{ message, stack }` object, the shape QuestIDE.jsx already recognises.
(function(scope) {
  'use strict';

  const LOG_LEVELS = ['log', 'info', 'warn', 'error'];
  const MESSAGE_RUN = 'run';
  const MESSAGE_LOG = 'log';
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
        result.push(`[Getter threw: ${safeMessage(e)}]`);
      }
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
      const entries = Array.from(mapEntries.call(value));
      return serializeItems(i => entries[i], entries.length, next, budget);
    }
    if (value instanceof Set) {
      const values = Array.from(setValues.call(value));
      return serializeItems(i => values[i], values.length, next, budget);
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

  function reportProtocolError(message) {
    scope.console.error({ message, stack: '' });
  }

  function onMessage(event) {
    const data = event.data;
    if (data === null || typeof data !== 'object' || data.type !== MESSAGE_RUN) {
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
      reportProtocolError('Code runner worker: "code" must be a string');
      return;
    }

    try {
      run(data.code, data.env);
    } catch (e) {
      reportProtocolError(`Code runner worker: ${e.message}`);
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
