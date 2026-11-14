/**
 * Allowlist of bare module specifiers that extension code may `require`
 * through the CommonJS loader (moduleLoader.js). Any other bare specifier
 * (including Node built-ins such as the file system, process and VM modules,
 * the Electron module and `twilio`) is rejected by the loader with an explicit error.
 *
 * Each entry maps the specifier to an implementation imported here.
 *
 * Evidence: the specifiers actually required by the bundled extensions
 * (twilioquest-* and owls-nest-extension) are inventoried in
 * docs/migration/module-loader-usage.md.
 *
 * TEMPORARY (Electron only): `path`, `assert` and `util` are Node built-ins
 * here, because no browser-safe equivalents (`path-browserify`, `assert`,
 * `util` from npm) are installed in this repository yet. Before the Tauri
 * webview can run this loader they must be replaced with those packages
 * (follow-up). Everything else is plain JavaScript and works in a webview.
 */
import path from 'path';
import assert from 'assert';
import util from 'util';
import merge from 'lodash.merge';
import isEqual from 'lodash.isequal';
// esprima is flagged __esModule without a default export: use the namespace.
import * as esprima from 'esprima';
import uuid from 'uuid';
import compareVersions from 'compare-versions';

const BUILT_IN_MODULES = Object.freeze({
  path,
  assert,
  util,
  'lodash.merge': merge,
  'lodash.isequal': isEqual,
  esprima,
  uuid,
  'compare-versions': compareVersions,
});

/**
 * @param {string} specifier
 * @returns {boolean}
 */
function isAllowedBuiltIn(specifier) {
  return Object.prototype.hasOwnProperty.call(BUILT_IN_MODULES, specifier);
}

/**
 * @param {string} specifier
 * @returns {*} the implementation registered for `specifier`
 */
function getBuiltIn(specifier) {
  if (!isAllowedBuiltIn(specifier)) {
    throw new Error(`"${specifier}" is not on the built-in module allowlist`);
  }

  return BUILT_IN_MODULES[specifier];
}

export { BUILT_IN_MODULES, isAllowedBuiltIn, getBuiltIn };
