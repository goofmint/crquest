/**
 * File system platform module.
 *
 * A thin re-export layer. Every function is the original Node `fs.promises`
 * or fs-jetpack function under the same name, so arguments, return values,
 * sync/async nature and error propagation are exactly those of the original.
 * Nothing is wrapped: no try/catch, defaults, normalization, retries or path
 * resolution. Depends only on Node `fs` and `fs-jetpack` (never on app
 * modules, so no circular import is possible).
 *
 * Two families that must NOT be unified, because callers depend on the
 * difference in how a missing path is reported:
 *
 * 1. Node `fs.promises` (`stat`, `readFile`, `readdir`): a missing path
 *    rejects with `ENOENT`.
 * 2. fs-jetpack 2.2.2 `exists` / `list` / `read` (and their `Async` forms): a
 *    missing path is a normal value (`false` / `undefined`). `copyAsync` with
 *    a missing source rejects with `code: 'ENOENT'`, and `removeAsync` of a
 *    missing path is a no-op. Synchronous methods block the event loop.
 *
 * Exported names: `stat`, `lstat`, `readFile`, `readdir` (Node
 * `fs.promises`), `existsAsync`, `listAsync`, `readAsync`, `writeAsync`,
 * `copyAsync`, `removeAsync` (jetpack, async). There are no synchronous
 * members: Tauri cannot provide them, so every caller uses the asynchronous
 * forms.
 *
 * Differences from the earlier JSDoc-only contract: the contract also listed
 * synchronous `exists` / `list` / `read` / `remove` / `readFileSync` and
 * `existsSync`; they are not exported (no caller is left). `readFile` is the
 * async `fs.promises` form only.
 *
 * @typedef {Object} PlatformFs
 * @property {(path: string, options?: string | {encoding?: string}) => Promise<string | Buffer>} readFile
 *   Buffer without an encoding, string with one. Rejects on any failure.
 * @property {(path: string) => Promise<string[]>} readdir
 *   Rejects on failure, including `ENOENT`.
 * @property {(path: string) => Promise<import('fs').Stats>} stat
 *   Rejects on failure; `error.code` is preserved.
 * @property {(path: string) => Promise<import('fs').Stats>} lstat
 *   Like `stat`, but does not follow a symbolic link.
 * @property {(path: string) => Promise<false | 'dir' | 'file' | 'other'>} existsAsync
 * @property {(path?: string) => Promise<string[] | undefined>} listAsync
 * @property {(path: string, returnAs?: 'json' | 'utf8' | 'buffer' | 'jsonWithDates') => Promise<*>} readAsync
 * @property {(path: string, data: string | Buffer | Object) => Promise<void>} writeAsync
 *   Creates missing parent directories.
 * @property {(from: string, to: string, options?: {overwrite?: boolean}) => Promise<void>} copyAsync
 * @property {(path: string) => Promise<void>} removeAsync
 */

import { promises as nodeFs } from 'fs';
import * as jetpack from 'fs-jetpack';

export const stat = nodeFs.stat;
export const lstat = nodeFs.lstat;
export const readFile = nodeFs.readFile;
export const readdir = nodeFs.readdir;

export const existsAsync = jetpack.existsAsync;
export const listAsync = jetpack.listAsync;
export const readAsync = jetpack.readAsync;
export const writeAsync = jetpack.writeAsync;
export const copyAsync = jetpack.copyAsync;
export const removeAsync = jetpack.removeAsync;
