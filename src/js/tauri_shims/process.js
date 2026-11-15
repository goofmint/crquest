/**
 * `process` for the Tauri build (vite.config.mjs aliases the Node builtin to
 * this file in `--mode tauri` only). It is not a Node process: it has what
 * bundled code reads at load time, and no host information. There is
 * deliberately no OS name here (`platform` is undefined, not a made-up
 * value): the app reads it through platform/env (docs/migration/
 * tauri-runtime.md, W7). The bare global `process` is not defined either.
 */
export const env = {};
export const browser = true;
export const version = '';
export const versions = {};
export const argv = [];
export const platform = undefined;

/** Runs `callback` after the current task, before rendering (like nextTick). */
export function nextTick(callback, ...args) {
  queueMicrotask(() => callback(...args));
}

export function cwd() {
  throw new Error('process.cwd() is not available in the Tauri build');
}

export default { env, browser, version, versions, argv, platform, nextTick, cwd };
