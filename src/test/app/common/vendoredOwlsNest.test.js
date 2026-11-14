import path from 'path';
import jetpack from 'fs-jetpack';
import * as fsPlatform from '../../../js/app/platform/fs';
import {
  getBundledExtensionDirectories,
  BUNDLED_EXTENSION_VENDORED_DIRECTORY,
} from '../../../js/app/common/extensions';
import { readDirectory } from '../../../js/app/common/assetLoader';
import { staticFilePath } from '../../../js/app/common/fs_utils';
import { createModuleLoader } from '../../../js/app/common/moduleLoader';
import {
  getBuiltIn,
  isAllowedBuiltIn,
} from '../../../js/app/common/moduleAllowlist';
import { normalize } from '../../../js/app/common/modulePath';
import bundledExtensionModules from '../../../js/app/config/bundledExtensionModules.json';
import vendoredExtensionModules from '../../../js/app/config/vendoredExtensionModules.json';
import mockConfigFactory from '../../utils/mockConfigFactory';

jest.mock('../../../js/app/common/context');
jest.mock('../../../js/app/common/fs_utils');
jest.mock('../../../js/app/config/config');

const PUBLIC_PATH = path.resolve(__dirname, '..', '..', '..', '..', 'public');
const NAME = 'owls-nest-extension';
const START_LEVEL = 'owls_nest';
const PACKAGE_PATH = path.join(
  PUBLIC_PATH,
  BUNDLED_EXTENSION_VENDORED_DIRECTORY,
  NAME
);

const mockConfig = mockConfigFactory({
  bundledExtensionModules,
  vendoredExtensionModules,
});

beforeAll(() => {
  staticFilePath.mockImplementation(relativePath =>
    path.resolve(PUBLIC_PATH, relativePath)
  );
  mockConfig();
});

describe('vendored owls-nest-extension layout', () => {
  test('is bundled, vendored, present and no longer an npm dependency', () => {
    expect(bundledExtensionModules).toContain(NAME);
    expect(vendoredExtensionModules).toContain(NAME);
    expect(
      jetpack.read(path.join(PUBLIC_PATH, 'package.json'), 'json').dependencies
    ).not.toHaveProperty([NAME]);
    expect(jetpack.read(path.join(PACKAGE_PATH, 'package.json'), 'json')).toEqual(
      expect.objectContaining({ name: NAME, version: '1.0.10' })
    );
    expect(jetpack.exists(path.join(PACKAGE_PATH, 'README.md'))).toBe('file');
    expect(
      jetpack.exists(path.join(PACKAGE_PATH, 'levels', START_LEVEL, 'level.json'))
    ).toBe('file');
  });

  test('is discovered by the real discovery code and provides the start level', async () => {
    const extension = getBundledExtensionDirectories().find(
      candidate => candidate.name === NAME
    );

    expect(extension.absolutePath).toBe(PACKAGE_PATH);
    expect(extension.isValid).toBe(true);
    expect(await readDirectory('levels', [extension])).toContain(START_LEVEL);
  });
});

describe('start level configuration', () => {
  // config.js cannot be imported in tests (see brief); read its source instead.
  const configSource = jetpack.read(
    path.resolve(__dirname, '..', '..', '..', 'js', 'app', 'config', 'config.js')
  );

  test('the prologue level the app starts in is the one this package provides', () => {
    expect(configSource).toContain(`defaultLevelNamePrologue: '${START_LEVEL}'`);
    expect(configSource).toContain(
      `prologueMissionStateKey: 'com.terminalquest.${START_LEVEL}'`
    );
  });

  test('skipping the prologue warps to a level that is provided by twilioquest-base', () => {
    const skip = jetpack.read(
      path.join(PACKAGE_PATH, 'levels', START_LEVEL, 'events', 'handleSkipPrologue.js')
    );
    expect(skip).toContain('world.warp("fog_owl")');
    expect(
      jetpack.exists(
        path.join(PUBLIC_PATH, 'content', 'twilioquest-base', 'levels', 'fog_owl', 'level.json')
      )
    ).toBe('file');
  });
});

describe('moduleLoader with the vendored owls-nest-extension', () => {
  const pkg = jetpack.cwd(PACKAGE_PATH);
  const runtimeEntries = [
    ...pkg.find({ matching: 'objects/*/config.js' }),
    ...pkg.find({ matching: 'levels/*/events.js' }),
    ...pkg.find({ matching: 'levels/**/validator.js' }),
  ]
    .map(relative => path.join(PACKAGE_PATH, relative))
    .sort();

  test('finds the runtime entry files', () => {
    expect(runtimeEntries.length).toBeGreaterThanOrEqual(8);
  });

  test('loads every runtime entry file with the real allowlist', async () => {
    const failures = [];

    for (const entry of runtimeEntries) {
      const loader = createModuleLoader({
        readFile: fsPlatform.readFile,
        stat: fsPlatform.stat,
        isAllowed: isAllowedBuiltIn,
        getAllowed: getBuiltIn,
      });

      try {
        await loader.load(normalize(entry));
      } catch (error) {
        failures.push(
          `${path.relative(PACKAGE_PATH, entry)}: ${error.code} ${error.message}`
        );
      }
    }

    expect(failures).toEqual([]);
  });

  test('requires nothing but relative files (no bare modules at all)', () => {
    const bare = pkg
      .find({ matching: '**/*.js' })
      .filter(file =>
        /require\(\s*['"`][^./]/.test(pkg.read(file))
      );

    expect(bare).toEqual([]);
  });
});
