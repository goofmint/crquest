/**
 * File system contract.
 *
 * Two families that must NOT be unified, because callers depend on the
 * difference in how a missing path is reported:
 *
 * 1. Node `fs` family: a missing path is a failure (`ENOENT`), except
 *    `existsSync`, which never throws and returns `false` for a missing path.
 * 2. fs-jetpack 2.2.2 family: for the read / exists / list style methods
 *    (`read`, `readAsync`, `exists`, `existsAsync`, `list`, `listAsync`) a
 *    missing path is a normal value (`undefined` / `false`). This is decided
 *    per method, not per library: `copyAsync` with a missing source rejects
 *    with `code: 'ENOENT'` (fs-jetpack 2.2.2, lib/copy.js), and `remove` /
 *    `removeAsync` of a missing path is a no-op.
 *
 * Any I/O failure other than a "missing path" normal value above is a throw
 * (sync) or a rejection (async), unchanged. Synchronous methods block the
 * event loop.
 *
 * Out of scope: how assetLoader.js resolves extension-relative paths and how
 * fs_utils.js computes static paths (the platform layer only receives final
 * paths); the unhandled rejection of `readDirectory` in assetLoader.js; and
 * callers' own error handling.
 *
 * Existing usage: `promises.readFile` (assetLoader.js, ValidationHelper.js),
 * `promises.stat` and `promises.readdir` (assetLoader.js), `readFileSync`
 * (components/context_provider/system.js, reads /proc/cpuinfo and relies on
 * the throw when absent), `existsSync` (ValidationHelper.js); jetpack `read`
 * (InteractionTextService.js, Game.jsx), `exists` (Game.jsx,
 * loadItemsFromDisk.js), `existsAsync` and `listAsync` (extensions.js, QuestIDE),
 * `readAsync` / `writeAsync` (QuestIDE.jsx, code_runner.js), `copyAsync` and
 * `removeAsync` (assetLoader.js), `remove` (ClearDataButton.jsx).
 *
 * @typedef {Object} PlatformFsStats
 * @property {() => boolean} isFile - Node `fs.Stats#isFile` is a method. The
 *   contract only relies on a Stats object being returned, as callers use it
 *   for existence checks.
 *
 * @typedef {Object} PlatformFsReadOptions
 * @property {string} [encoding] - e.g. 'utf8'. With an encoding the result is
 *   a string, otherwise a Buffer.
 *
 * @typedef {Object} PlatformFsCopyOptions
 * @property {boolean} [overwrite] - replace existing destination files.
 *
 * @typedef {Object} PlatformFs
 *
 * Node `fs` family (missing path => failure):
 * @property {(path: string, options?: PlatformFsReadOptions | string) => Promise<string | Buffer>} readFile
 *   Rejects on any failure, including `ENOENT`; the Node error (with `code`)
 *   is preserved.
 * @property {(path: string, options?: PlatformFsReadOptions | string) => string | Buffer} readFileSync
 *   Throws on any failure, including `ENOENT`.
 * @property {(path: string) => Promise<string[]>} readdir
 *   Resolves with entry names. Rejects on failure, including `ENOENT`.
 * @property {(path: string) => Promise<PlatformFsStats>} stat
 *   Resolves with the Node Stats object. Rejects on failure; `error.code`
 *   (for example `ENOENT`) is preserved so callers can branch on it.
 * @property {(path: string) => boolean} existsSync
 *   Never throws. Exists (instead of jetpack.exists) because jetpack relies on
 *   fs.stat, which fails for Windows Store apps under `WindowsApps`
 *   (nodejs/node#33024); ValidationHelper.js depends on this.
 *
 * fs-jetpack family (missing path => normal value):
 * @property {(path: string, returnAs?: 'json' | 'utf8' | 'buffer' | 'jsonWithDates') => *} read
 *   Synchronous. Returns `undefined` if the file does not exist. With
 *   'json' the parsed value is returned (invalid JSON throws).
 * @property {(path: string, returnAs?: 'json' | 'utf8' | 'buffer' | 'jsonWithDates') => Promise<*>} readAsync
 *   Like `read`; resolves `undefined` if missing. Default is a utf8 string.
 * @property {(path?: string) => string[] | undefined} list
 *   Synchronous. Entry names, or `undefined` if the directory does not exist.
 * @property {(path?: string) => Promise<string[] | undefined>} listAsync
 *   Resolves entry names, or `undefined` if the directory does not exist.
 * @property {(path: string) => false | 'dir' | 'file' | 'other'} exists
 *   Synchronous. `false` if missing, otherwise the entry kind.
 * @property {(path: string) => Promise<false | 'dir' | 'file' | 'other'>} existsAsync
 * @property {(path: string, data: string | Buffer | Object) => Promise<void>} writeAsync
 *   Creates missing parent directories. Objects are written as JSON.
 * @property {(from: string, to: string, options?: PlatformFsCopyOptions) => Promise<void>} copyAsync
 *   Without `overwrite: true` an existing destination is an error.
 * @property {(path: string) => void} remove
 *   Synchronous. Removing a missing target is not an error.
 * @property {(path: string) => Promise<void>} removeAsync
 *   Removing a missing target is not an error.
 */

export {};
