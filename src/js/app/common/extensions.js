import path from 'path';
import * as yup from 'yup';
import { staticFilePath } from './fs_utils';
import { getContext } from './context';
import config from '../config/config';
import { omitKey } from './utils';
import { listAsync, existsAsync, readAsync } from '../platform/fs';

const BUNDLED_ASSET_DIRECTORY = '.bundled';
// Bundled extensions live in one of two roots, both relative to the static
// root (`public/`). Which one is decided per extension by
// `config.vendoredExtensionModules` (see docs/migration/content-layout.md).
// Vendored extensions are checked into the repository under `content/`;
// every other bundled extension is still an npm dependency in `node_modules/`
// (transition state until all packages are vendored).
const BUNDLED_EXTENSION_VENDORED_DIRECTORY = 'content';
const BUNDLED_EXTENSION_NPM_DIRECTORY = 'node_modules';
const BUNDLED_EXTENSION_DIRECTORIES = [
  BUNDLED_EXTENSION_VENDORED_DIRECTORY,
  BUNDLED_EXTENSION_NPM_DIRECTORY,
];

/**
 * @typedef {Object} Extension
 * @property {absolutePath} - absolute file path to the root directory of this extension
 * @property {name} - identifier of this extension
 * @property {isValid} - is this extension in a valid format
 */

/**
 * Get all valid extension directories.
 *
 * @returns {Extension[]}
 */
async function getAllValidExtensions() {
  let externalDirectories = [];

  if (areExtensionsReady()) {
    externalDirectories = await getExternalExtensionDirectories();
  }

  const bundledDirectories = getBundledExtensionDirectories();

  return [...externalDirectories, ...bundledDirectories].filter(
    extension => extension.isValid
  );
}

/**
 * Reads a given directory and returns an array of parsed {@link Extension}s.
 *
 * @param {string} directoryPath - path to a directory containing extensions
 * @returns {Extension[]}
 */
async function parseExtensionsDirectory(directoryPath) {
  const potentialExtensions = await listAsync(directoryPath);

  if (!potentialExtensions) {
    // directory path was invalid
    return [];
  }

  const extensionValidationPromises = potentialExtensions.map(
    async potentialExtension => {
      const absolutePath = path.join(directoryPath, potentialExtension);

      return {
        isValid: await isExtensionValid(absolutePath),
        isDir: (await existsAsync(absolutePath)) === 'dir',
        absolutePath,
        name: potentialExtension,
      };
    }
  );
  const extensions = (await Promise.all(extensionValidationPromises))
    // Non-directories are not passed along as invalid extensions.
    // This prevents us from seeing files like .DS_Store.
    .filter(extension => extension.isDir)
    .filter(extension => extension.name !== BUNDLED_ASSET_DIRECTORY)
    .map(omitKey('isDir'));

  // Intentionally mutate extensions array with .sort
  extensions.sort((a, b) => a.name.localeCompare(b.name));

  return extensions;
}

/**
 * Get the {@link Extension}s for external extensions.
 *
 * @returns {Extension[]} - extension directory file path
 */
async function getExternalExtensionDirectories() {
  const extensionDirectoryPath = getExtensionDirectory();

  if (!extensionDirectoryPath) {
    return [];
  }

  return await parseExtensionsDirectory(extensionDirectoryPath);
}

/**
 * Get the {@link Extension}s for extensions bundled with TerminalQuest.
 *
 * @returns {Extension[]} - extension directory file path
 */
function getBundledExtensionDirectories() {
  const { bundledExtensionModules, vendoredExtensionModules } = config;

  vendoredExtensionModules.forEach(module => {
    if (!bundledExtensionModules.includes(module)) {
      throw new Error(
        `"${module}" is listed in vendoredExtensionModules but not in bundledExtensionModules.`
      );
    }
  });

  const extensions = bundledExtensionModules.map(module => {
    const distributionDirectory = vendoredExtensionModules.includes(module)
      ? BUNDLED_EXTENSION_VENDORED_DIRECTORY
      : BUNDLED_EXTENSION_NPM_DIRECTORY;
    const absolutePath = path.join(
      staticFilePath(distributionDirectory),
      module
    );

    return {
      absolutePath,
      name: module,
      isValid: true,
    };
  });

  // Intentionally mutate extensions array with .sort
  extensions.sort((a, b) => a.name.localeCompare(b.name));

  return extensions;
}

/**
 * Checks if the user has enabled external extensions.
 *
 * @returns {boolean}
 */
function areExtensionsEnabled() {
  const { enabled } = getContext('extensions');

  return enabled;
}

/**
 * Determines if the extension at the provided path is a valid one.
 *
 * @param {String} extensionPath - absolute path to a
 * @returns {boolean}
 */
async function isExtensionValid(extensionPath) {
  if ((await existsAsync(extensionPath)) !== 'dir') {
    // extensions must be a directory
    return false;
  }

  const configPath = path.join(extensionPath, 'package.json');

  try {
    const configString = await readAsync(configPath);

    if (configString === undefined) {
      // package.json does not exist!
      return false;
    }

    const config = JSON.parse(configString);

    const configSchema = yup.object().shape({
      name: yup.string().required(),
      description: yup.string(),
      version: yup.string().required(),
      engines: yup.object().shape({
        twilioquest: yup.string(),
      }),
    });

    /**
     * This function throws Validation errors if the format of the provided
     * input does not match the schema.
     */

    configSchema.validateSync(config);
  } catch (err) {
    console.error(err);
    return false;
  }

  return true;
}

/**
 * Get the path to the public extensions directory.
 *
 * @returns {string}
 */
function getExtensionDirectory() {
  const { directory } = getContext('extensions');

  return directory;
}

/**
 * Checks if external extensions can be used.
 *
 * @returns {boolean}
 */
function areExtensionsReady() {
  return areExtensionsEnabled() && getExtensionDirectory() !== null;
}

export {
  getAllValidExtensions,
  getBundledExtensionDirectories,
  getExternalExtensionDirectories,
  getExtensionDirectory,
  areExtensionsReady,
  areExtensionsEnabled,
  BUNDLED_ASSET_DIRECTORY,
  BUNDLED_EXTENSION_VENDORED_DIRECTORY,
  BUNDLED_EXTENSION_NPM_DIRECTORY,
  BUNDLED_EXTENSION_DIRECTORIES,
};
