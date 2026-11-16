// Node-backed platform/exec for the Vitest run (see vitest.config.mjs): the
// same four functions as platform/tauri/exec.js, on child_process.
import { exec as nodeExec, execFile as nodeExecFile } from 'node:child_process';
import { existsSync } from 'node:fs';

export const exec = (command, options = {}) =>
  new Promise((resolve, reject) => {
    nodeExec(command, options, (error, stdout, stderr) => {
      if (error) {
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

export const pathExists = async path => existsSync(path);
