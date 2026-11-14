/**
 * Command execution platform module (Electron implementation, Node
 * `child_process` / `fs`).
 *
 * Exports:
 *
 * - `exec(command, options)`: same semantics as
 *   `util.promisify(child_process.exec)`. The command string is interpreted by
 *   a shell and the platform layer does NOT escape or quote anything; building
 *   the string is the caller's responsibility and callers must never pass
 *   untrusted input (shell injection). Resolves with `{ stdout, stderr }` on
 *   exit code 0; on a non-zero exit, spawn failure, timeout or kill it rejects
 *   with the Node Error unchanged (it carries `code`, `stdout`, `stderr`).
 *   Used by `isExecutableValid`, which relies on the shell and on the error
 *   message text.
 *
 * - `run(program, args, options)`: runs `program` with the `args` array
 *   WITHOUT a shell (`child_process.execFile`), so no quoting or injection
 *   concerns. Resolves with `{ code, stdout, stderr }` once the process has
 *   exited, whatever the exit code: a non-zero exit is data (`code` is the
 *   exit code). Rejects with the Node Error unchanged when the process could
 *   not be spawned (for example `ENOENT`, `EACCES`, `EPERM`), was killed by a
 *   signal, timed out, or exceeded `maxBuffer`.
 *
 * - `commandExists(name)`: resolves `true` if `name` resolves to an executable
 *   on the PATH, `false` if not (`command -v` on POSIX, `where` on Windows).
 *   Rejects if the lookup itself cannot be run or `name` is not a non-empty
 *   string.
 *
 * - `pathExistsSync(path)`: Node `fs.existsSync`. Deliberately NOT fs-jetpack
 *   `exists`: jetpack relies on `fs.stat`, which fails for Windows Store apps
 *   under `WindowsApps`
 *   (https://github.com/nodejs/node/issues/33024,
 *   https://github.com/microsoft/vscode/issues/95828, as of 8/26/2020).
 *   Synchronous (blocks the event loop); migrate when the Tauri layer exists.
 *
 * No cancellation mechanism is defined beyond options that Node accepts.
 *
 * @typedef {Object} PlatformExecOptions
 * @property {string} [cwd]
 * @property {Object<string, string>} [env]
 * @property {number} [timeout]
 * @property {number} [maxBuffer]
 *
 * `encoding` is intentionally not part of the options: no caller sets it, and
 * `encoding: 'buffer'` would make stdout / stderr a Buffer instead of a string.
 *
 * @typedef {Object} PlatformExecResult
 * @property {string} stdout
 * @property {string} stderr
 *
 * @typedef {Object} PlatformRunResult
 * @property {number} code - process exit code
 * @property {string} stdout
 * @property {string} stderr
 *
 * @typedef {Object} PlatformExec
 * @property {(command: string, options?: PlatformExecOptions) => Promise<PlatformExecResult>} exec
 * @property {(program: string, args?: string[], options?: PlatformExecOptions) => Promise<PlatformRunResult>} run
 * @property {(name: string) => Promise<boolean>} commandExists
 * @property {(path: string) => boolean} pathExistsSync
 */

import { exec as nodeExec, execFile as nodeExecFile } from 'child_process';
import { existsSync } from 'fs';

export const exec = (command, options = {}) =>
  new Promise((resolve, reject) => {
    nodeExec(command, options, (error, stdout, stderr) => {
      if (error) {
        // Same as the promisified child_process.exec: keep the output on the
        // rejected error so callers can read error.stdout / error.stderr.
        error.stdout = stdout;
        error.stderr = stderr;
        return reject(error);
      }
      return resolve({ stdout, stderr });
    });
  });

export const run = (program, args = [], options = {}) =>
  new Promise((resolve, reject) => {
    nodeExecFile(program, args, options, (error, stdout, stderr) => {
      if (error && (error.killed || typeof error.code !== 'number')) {
        // spawn failure (string code), signal kill, timeout (error.killed is
        // set even if the child trapped the signal and exited with a number),
        // maxBuffer;
        // keep any output captured so far on the error, like exec above.
        error.stdout = stdout;
        error.stderr = stderr;
        return reject(error);
      }
      return resolve({ code: error ? error.code : 0, stdout, stderr });
    });
  });

export const commandExists = async name => {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new Error('commandExists requires a non-empty command name');
  }
  const { code } =
    process.platform === 'win32'
      ? await run('where', [name])
      : await run('/bin/sh', ['-c', 'command -v -- "$1"', 'sh', name]);
  return code === 0;
};

export const pathExistsSync = existsSync;
