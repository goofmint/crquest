/**
 * Command execution contract.
 *
 * Same semantics as `util.promisify(child_process.exec)` on Node v12.18.3.
 * Existing call site: ValidationHelper.js, which calls
 * `exec(`"${path}" ${args.join(' ')}`, {}, callback)` and only uses whether an
 * error occurred (stdout / stderr are not read today).
 *
 * The command string is interpreted by a shell and the platform layer does NOT
 * escape or quote anything. Building the string (quoting the executable path,
 * joining arguments with a space) is the caller's responsibility, and callers
 * must never pass untrusted input, since that allows shell injection.
 *
 * No cancellation or timeout mechanism is defined here beyond options that
 * Node's `exec` itself accepts. Out of scope: the validation-tuple conversion
 * in ValidationHelper.js, the development scripts under tasks/, and the IPC
 * based execution in code_runner.js.
 *
 * @typedef {Object} PlatformExecOptions
 * @property {string} [cwd]
 * @property {Object<string, string>} [env]
 * @property {number} [timeout]
 * @property {number} [maxBuffer]
 * @property {string} [encoding]
 *
 * @typedef {Object} PlatformExecResult
 * @property {string} stdout
 * @property {string} stderr
 *
 * @typedef {Object} PlatformExec
 * @property {(command: string, options?: PlatformExecOptions) => Promise<PlatformExecResult>} exec
 *   Resolves with `{ stdout, stderr }` on exit code 0. On a non-zero exit,
 *   spawn failure, timeout or kill, rejects with the Node Error unchanged; it
 *   carries `code`, `stdout` and `stderr`.
 */
