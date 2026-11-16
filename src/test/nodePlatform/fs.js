// Node-backed platform/fs for the Vitest run (see vitest.config.mjs): the tests
// of the shared code read real files (vendored content, fixtures, ...), which
// the Tauri implementation cannot do outside a webview. The functions have the
// semantics that the Tauri implementation (platform/tauri/fs.js) reproduces:
// the `fs.promises` ones and the fs-jetpack ones.
import { promises as nodeFs } from 'node:fs';
import jetpack from 'fs-jetpack';

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
