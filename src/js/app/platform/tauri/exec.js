/**
 * Command execution platform module (Tauri). Same exports as ../exec.js, on
 * the Rust commands `run_command` / `command_exists` (src-tauri/src/exec.rs).
 * Which programs may run is decided by the capability scope, see
 * docs/migration/tauri-platform.md (security model).
 *
 * - `run(program, args, options)`: same contract as Electron. Resolves
 *   `{ code, stdout, stderr }` for any exit code. Rejects with an Error that
 *   has `code` (`ENOENT`, `EACCES`, ... for spawn failures; `null` for kills),
 *   `killed`, `signal`, `stdout`, `stderr` and `kind` (the Rust failure kind:
 *   notAllowed, invalidArgument, spawn, timeout, maxBuffer, signal).
 *   `options`: `cwd`, `env`, `timeout`, `maxBuffer` (like Electron).
 * - `commandExists(name)`: only names allowed by the scope are accepted
 *   (a name that is not allowed rejects with kind `notAllowed`).
 * - `exec(command, options)`: there is NO shell. The one shape that exists
 *   (`isExecutableValid`: `"<path>" arg arg`) is parsed strictly and run via
 *   `run_command`; anything else rejects without running. A non-zero exit
 *   rejects like Node's `exec` (`Error: Command failed: ...`, with `code`,
 *   `stdout`, `stderr`).
 * - `pathExists(path)`: resolves `true` / `false` through an asynchronous
 *   `stat` (platform/fs `existsAsync`). Only ENOENT means "does not exist":
 *   any other failure rejects, in particular a path outside the fs read
 *   scope (src-tauri/capabilities/platform.json), which is not silently
 *   reported as missing. The Windows Store (`WindowsApps`) `stat` problem noted
 *   in ../exec.js is not verified on Tauri.
 */
import { invoke } from '@tauri-apps/api/core';
import { existsAsync } from './fs';

const KILL_SIGNAL = 'SIGKILL';

function failureToError(failure) {
  if (failure instanceof Error) {
    return failure;
  }
  if (failure === null || typeof failure !== 'object' || !failure.kind) {
    // Not one of our failures (for example the command was not permitted by
    // the ACL, which rejects with a string).
    return new Error(
      typeof failure === 'string' ? failure : `Unexpected rejection: ${JSON.stringify(failure)}`
    );
  }
  const error = new Error(failure.message);
  error.kind = failure.kind;
  error.code = failure.code === undefined ? null : failure.code;
  error.killed = failure.killed === true;
  error.signal = failure.killed ? KILL_SIGNAL : null;
  error.stdout = failure.stdout;
  error.stderr = failure.stderr;
  return error;
}

async function invokeCommand(name, args) {
  try {
    return await invoke(name, args);
  } catch (failure) {
    throw failureToError(failure);
  }
}

export const run = (program, args = [], options = {}) => {
  const { cwd, env, timeout, maxBuffer } = options;
  return invokeCommand('run_command', {
    program,
    args,
    cwd,
    env,
    timeoutMs: timeout,
    maxBuffer,
  });
};

export const commandExists = async name => {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new Error('commandExists requires a non-empty command name');
  }
  return invokeCommand('command_exists', { name });
};

// Characters allowed in an argument of the supported shell-string form. No
// quote, whitespace, escape or shell metacharacter is accepted.
const SAFE_ARGUMENT = /^[A-Za-z0-9_@%+=:,./-]+$/;

function parseQuotedCommand(command) {
  if (typeof command !== 'string' || !command.startsWith('"')) {
    throw new Error(
      'platform exec on Tauri only supports: "<program path>" <arguments>'
    );
  }
  const end = command.indexOf('"', 1);
  if (end < 2) {
    throw new Error('platform exec on Tauri: unterminated or empty program path');
  }
  const program = command.slice(1, end);
  const rest = command.slice(end + 1);
  if (rest !== '' && !/^\s/.test(rest)) {
    throw new Error('platform exec on Tauri: unexpected text after the program path');
  }
  const args = rest.trim() === '' ? [] : rest.trim().split(/\s+/);
  for (const arg of args) {
    if (!SAFE_ARGUMENT.test(arg)) {
      throw new Error(`platform exec on Tauri: unsupported argument "${arg}" (no shell)`);
    }
  }
  return { program, args };
}

export const exec = async (command, options = {}) => {
  const { program, args } = parseQuotedCommand(command);
  const { code, stdout, stderr } = await run(program, args, options);
  if (code !== 0) {
    const error = new Error(`Command failed: ${command}\n${stderr}`);
    error.code = code;
    error.killed = false;
    error.signal = null;
    error.cmd = command;
    error.stdout = stdout;
    error.stderr = stderr;
    throw error;
  }
  return { stdout, stderr };
};

export const pathExists = async path => (await existsAsync(path)) !== false;
