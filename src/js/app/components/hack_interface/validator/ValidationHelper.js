import path from 'path';
import ga from '../../../common/analytics';
import World from '../../../common/world';
import config from '../../../config/config';
import { getContext } from '../../../common/context';
import * as platformFs from '../../../platform/fs';
import * as platformExec from '../../../platform/exec';
import * as platformPaths from '../../../platform/paths';
import { getPlatform } from '../../../platform/env';
import { staticFileUrl } from '../../../common/fs_utils';
import { contentMessage } from '../../../common/assetLoader';
import { getLanguage, t } from '../../../i18n';
import {
  evaluateInWorker,
  pullVarsInWorker,
  WORKER_RELATIVE_PATH,
} from '../../../common/codeRunnerWorker';

/**
 * File system API exposed to validators as `helper.fs`. Every member is the
 * platform/fs function of the same name, unwrapped (no path rewriting, no
 * error translation). Everything is asynchronous. Missing paths: `readFile`,
 * `readdir`, `stat` reject with ENOENT; `existsAsync` resolves `false`,
 * `listAsync` / `readAsync` resolve `undefined`.
 *
 * existsAsync(path)            -> false | 'dir' | 'file' | 'other'
 * readAsync(path, returnAs)    -> 'utf8' (default) | 'json' | 'buffer' | 'jsonWithDates'
 * listAsync(path)              -> string[] | undefined
 * readFile(path, options)      -> Buffer, or string with an encoding
 * readdir(path)                -> string[]
 * stat(path)                   -> fs.Stats
 * lstat(path)                  -> fs.Stats (does not follow a symbolic link)
 * writeAsync(path, data)       -> creates missing parent directories
 * copyAsync(from, to, options) -> rejects with ENOENT if `from` is missing
 * removeAsync(path)            -> no-op if the path is missing
 */
const validatorFs = Object.freeze({
  readFile: platformFs.readFile,
  readdir: platformFs.readdir,
  stat: platformFs.stat,
  lstat: platformFs.lstat,
  existsAsync: platformFs.existsAsync,
  listAsync: platformFs.listAsync,
  readAsync: platformFs.readAsync,
  writeAsync: platformFs.writeAsync,
  copyAsync: platformFs.copyAsync,
  removeAsync: platformFs.removeAsync,
});

export default class ValidationHelper {
  constructor(validationContext, callback, level, messages = {}) {
    // Instance variables
    this.validationCallback = callback;
    this.validationFields = {};
    this.context = validationContext.context;
    this.env = validationContext.env;
    this.language = getLanguage();
    this.messages = messages;
    this.analyticsId = ga.analyticsId;
    this.world = new World(level);
    this.fs = validatorFs;
    // Operating system the game runs on (Node's platform names, e.g.
    // 'win32', 'darwin', 'linux'), for validators that branch per OS.
    this.platform = getPlatform();

    // Process validation fields
    Object.keys(validationContext.validationFields).forEach(key => {
      const val = validationContext.validationFields[key].trim();
      this.validationFields[key] = val;
    });
  }

  t(key, fallbackEnglish, vars) {
    return contentMessage(this.messages, key, fallbackEnglish, vars);
  }

  getNormalizedInput(key, { lowerCase = true, trim = true } = {}) {
    let val = this.validationFields[key];

    if (!val) return '';

    if (trim) {
      val = val.trim();
    }

    if (lowerCase) {
      val = val.toLowerCase();
    }

    return val;
  }

  // Helper to invoke the validation callback with a success message
  success(message, env = []) {
    this.validationCallback(null, { message, env });
  }

  // Helper to invoke the validation callback with an error message
  fail(error, errorCodeMessage) {
    let message = error;
    if (typeof error !== 'string') {
      message = error.message;
      if (error.code && errorCodeMessage && errorCodeMessage[error.code]) {
        message = errorCodeMessage[error.code];
      }
    }
    this.validationCallback({ message });
  }

  /**
   * Runs `program` with `args` (array, no shell, no quoting needed).
   * Resolves `{ code, stdout, stderr }` for any exit code (a non-zero exit is
   * data, not an error). Rejects if the program cannot be spawned (e.g. ENOENT,
   * EACCES), is killed by a signal, times out or exceeds maxBuffer.
   *
   * @param {String} program
   * @param {String[]} [args]
   * @param {{cwd?: String, timeout?: Number}} [options] timeout in ms: the process is
   *   killed and the promise rejects (error.killed) when it runs longer
   * @returns {Promise<{code: Number, stdout: String, stderr: String}>}
   */
  exec(program, args = [], { cwd, timeout } = {}) {
    const options = {};
    if (cwd !== undefined) options.cwd = cwd;
    if (timeout !== undefined) options.timeout = timeout;
    return platformExec.run(program, args, options);
  }

  /**
   * Resolves true if `name` is an executable found on the PATH, else false.
   * Rejects if the lookup cannot be run.
   *
   * @param {String} name
   * @returns {Promise<Boolean>}
   */
  commandExists(name) {
    return platformExec.commandExists(name);
  }

  /**
   * The operating system's per-user application data directory
   * (Electron `app.getPath('appData')`, e.g. `~/Library/Application Support`
   * on macOS), unmodified. Throws if it is unavailable.
   *
   * @returns {String}
   */
  getAppDataPath() {
    return platformPaths.getAppDataPath();
  }

  /**
   * @typedef {Array} ValidationTuple
   * @property {Boolean} ValidationTuple.0 - isValid - True if the executable can be executed without error, false otherwise.
   * @property {String} ValidationTuple.1 - message - Returns a message with more information if an error occurs while attempting to validate the executable.
   */

  /**
   * Determines if an executable can be executed and used by TwilioQuest.
   *
   * @param {String} path - file path to the executable under test
   * @param {String[]} args - an array of strings that will be joined by a space character representing the command line arguments needed to determine if the executable under test can be executed. This is usually something like: ['--version'].
   * @returns {ValidationTuple}
   * @throws This function will catch may common exe validation errors. If an unexpected error occurs, this function will still throw that error.
   */
  async isExecutableValid(path, args) {
    if (path === undefined || path.trim() === '') {
      return [false, t('ui.executable.pathRequired', { lng: this.language })];
    }

    /**
     * platform/exec pathExists uses Node fs.existsSync on Electron instead of
     * jetpack.exists due to a bug in their implementation. Jetpack's function
     * relies on fs.stat which does not work for Windows Store installed apps that land in the `WindowsApp`
     * directory.
     *
     * This looks like it will be fixed in some future version of Node.js.
     *
     * Source issues: https://github.com/nodejs/node/issues/33024
     *                https://github.com/microsoft/vscode/issues/95828
     * This is true as of: 8/26/2020.
     */
    if (!(await platformExec.pathExists(path))) {
      return [false, t('ui.executable.pathMissing', { lng: this.language, path })];
    }

    try {
      await platformExec.exec(`"${path}" ${args.join(' ')}`);
    } catch (err) {
      // EPERM is an access error that comes from child_process.spawn.
      // When a user doesn't have permissions for child_process.exec, the
      // error message contains some permutation of "access denied".
      if (
        err.message.includes('EPERM') ||
        (err.message.toLowerCase().includes('access') &&
          err.message.toLowerCase().includes('denied'))
      ) {
        return [false, t('ui.executable.notExecutable', { lng: this.language, path })];
      }

      return [
        false,
        t('ui.executable.validationFailed', {
          lng: this.language,
          path,
          error: String(err),
        }),
      ];
    }

    return [true, undefined];
  }

  async getQuestIdeUserCode(objective, mission) {
    if (!mission) {
      // use current mission by default
      mission = getContext('currentLevel').levelName;
    }

    const savedCodePath = path.join(
      config.codeStoragePath,
      mission,
      objective,
      config.codeStorageFileName
    );

    const userCode = await platformFs.readFile(savedCodePath, 'utf8');

    return userCode;
  }

  async pullVarsFromQuestIdeUserCodeLocalScope(keys = [], objective, mission) {
    const userCode = await this.getQuestIdeUserCode(objective, mission);

    return this.pullVarsFromUserCodeLocalScope(userCode, keys);
  }

  /**
   * Same as pullVarsFromQuestIdeUserCodeLocalScope, but for code the validator
   * already has as a string (for example a script the learner saved in their
   * own workspace directory). Runs `userCode` in a Web Worker, then returns the
   * values of the top-level variables named in `keys`. If a variable cannot be
   * read, the returned object has an `_error` property holding the thrown error
   * (for example a ReferenceError); an error thrown by `userCode` itself is
   * thrown (the promise rejects).
   *
   * The values cross the worker boundary by structured clone, so this is for
   * DATA only (strings, numbers, booleans, arrays, plain objects). Asking for a
   * function, a class or a symbol (or an object holding one) rejects with an
   * error naming the variable; use evaluateInUserCodeLocalScope to call the
   * learner's functions. `process.env` is `{}`; there is no `require`, `window`
   * or Node API, and the code runs once.
   *
   * @param {String} userCode
   * @param {String[]} [keys] identifiers of top-level variables
   * @returns {Promise<Object>}
   */
  async pullVarsFromUserCodeLocalScope(userCode, keys = []) {
    return pullVarsInWorker({
      workerUrl: staticFileUrl(WORKER_RELATIVE_PATH),
      code: userCode,
      keys,
    });
  }

  /**
   * Worker based replacement for pullVarsFromQuestIdeUserCodeLocalScope when
   * the validator needs to call the learner's functions or classes; see
   * evaluateInUserCodeLocalScope. The saved QuestIDE code is `userCode`.
   *
   * @param {Function|String} test runs in the worker; see evaluateInUserCodeLocalScope
   * @param {*} args JSON compatible data handed to `test`
   * @param {String} objective
   * @param {String} [mission] defaults to the current level
   * @param {Object} [mocks] see evaluateInUserCodeLocalScope
   * @returns {Promise<*>}
   */
  async evaluateInQuestIdeUserCodeLocalScope(
    test,
    args,
    objective,
    mission,
    mocks
  ) {
    const userCode = await this.getQuestIdeUserCode(objective, mission);

    return this.evaluateInUserCodeLocalScope(userCode, test, args, mocks);
  }

  /**
   * Runs `userCode` in a Web Worker, then runs the function `test` in that
   * same worker with `args`, and resolves with its result. Use this instead of
   * pullVarsFromUserCodeLocalScope when the validator has to call functions or
   * construct classes defined by the learner: functions and classes cannot
   * leave the worker, so the test cases go in and only data comes back.
   *
   *   const verdict = await helper.evaluateInUserCodeLocalScope(
   *     userCode,
   *     ({ input, expected }) => {
   *       // runs in the worker; the learner's top-level `scan` is in scope
   *       let scan_;
   *       try { scan_ = scan; } catch (error) { return { missing: true }; }
   *       return { passed: scan_(input) === expected };
   *     },
   *     { input: ['a'], expected: 1 }
   *   );
   *
   * - `test` (a function, or its source text) is serialized with
   *   `Function.prototype.toString`, so it must be self-contained: no closure
   *   over validator variables, `helper`, `require` or imports (they are
   *   ReferenceErrors in the worker), and it must be a function expression
   *   (arrow, `function`, `async`), not an object method shorthand. Put every
   *   helper it needs inside it. It may be async.
   * - `args` (default `{}`) must be JSON compatible (string, finite number,
   *   boolean, null, arrays and plain objects of those) or this rejects with a
   *   TypeError before anything runs.
   * - The result must be structured cloneable. Decide pass or fail inside
   *   `test` and return the facts the message needs (strings, numbers,
   *   booleans, plain objects, arrays); return `String(value)` rather than a
   *   value that may be a function or a class.
   * - Rejects with an Error (same name, message and stack) when `userCode` or
   *   `test` throws, with an explicit error when the result is not cloneable,
   *   and after 10 seconds (infinite loops are killed).
   * - `process.env` is `{}` and `fetch` is the worker's own; there is no
   *   `require`, `window` or Node API.
   * - `mocks` (optional) installs stand-ins BEFORE the learner's code runs:
   *   `{ fetch: factory, fs: { directories: { [path]: string[] } } }`. `fetch`
   *   is a self-contained factory `realFetch => fetchLike` whose result
   *   replaces the global `fetch` (a fake server; state lives in the factory's
   *   closure, and `realFetch` passes other requests through). `fs` lets the
   *   learner's `require('fs').promises.readdir(path)` list the given
   *   directories (anything else rejects with ENOENT). Unknown keys reject. See
   *   evaluateInWorker and docs/migration/validation-helper-worker.md.
   *
   * @param {String} userCode
   * @param {Function|String} test
   * @param {*} [args]
   * @param {Object} [mocks]
   * @returns {Promise<*>}
   */
  evaluateInUserCodeLocalScope(userCode, test, args = {}, mocks) {
    const options = {
      workerUrl: staticFileUrl(WORKER_RELATIVE_PATH),
      code: userCode,
      test,
      args,
    };
    if (mocks !== undefined) {
      options.mocks = mocks;
    }
    return evaluateInWorker(options);
  }

  getFilePathPartsArray(filePath) {
    const parts = filePath.split(path.sep);

    return parts;
  }

  areArrayContentsEqual(arrayA, arrayB, comparatorFn = (a, b) => a === b) {
    if (arrayA.length !== arrayB.length) {
      return false;
    }

    return arrayA.every((itemA, index) => {
      return comparatorFn(itemA, arrayB[index]);
    });
  }

  formatPathPartsForOs(...parts) {
    return parts.join(path.sep);
  }

  /**
   * Creates a string out of the input's value and wraps it in symbols which denote it's type
   * @param {*} input - The input to be wrapped and stringified
   */
  formatByType(input) {
    let output = input;

    if (typeof input === 'string') output = `"${input}"`;
    else if (Array.isArray(input)) output = `[${input}]`;
    else if (typeof input === 'object') output = JSON.stringify(input);

    return output;
  }
}
