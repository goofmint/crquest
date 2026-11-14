const path = require('path');

const configPath = path.join(
  __dirname,
  '..',
  '..',
  'src',
  'js',
  'app',
  'config'
);
const bundledModulePath = path.join(configPath, 'bundledExtensionModules.json');
const vendoredModulePath = path.join(configPath, 'vendoredExtensionModules.json');
const publicPath = path.join(__dirname, '..', '..', 'public');
const vendoredPath = path.join(publicPath, 'content');
const nodeModulesPath = path.join(publicPath, 'node_modules');

function getBundledExtensionNames() {
  return require(bundledModulePath);
}

/**
 * Names of bundled extensions that are checked into the repository under
 * public/content instead of being installed from npm.
 */
function getVendoredExtensionNames() {
  return require(vendoredModulePath);
}

/**
 * Names of bundled extensions that are still installed from npm.
 */
function getNpmExtensionNames() {
  const vendored = getVendoredExtensionNames();

  return getBundledExtensionNames().filter(name => !vendored.includes(name));
}

function getBundledExtensionPaths() {
  const vendored = getVendoredExtensionNames();

  return getBundledExtensionNames().map(extensionName =>
    path.join(
      vendored.includes(extensionName) ? vendoredPath : nodeModulesPath,
      extensionName
    )
  );
}

module.exports = {
  getBundledExtensionNames,
  getVendoredExtensionNames,
  getNpmExtensionNames,
  getBundledExtensionPaths,
};
