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

// The real public/ directory of the repository (not a fixture): this test
// checks the content that actually ships with the game.
const PUBLIC_PATH = path.resolve(__dirname, '..', '..', '..', '..', 'public');
const BASE_NAME = 'twilioquest-base';
const BASE_PATH = path.join(
  PUBLIC_PATH,
  BUNDLED_EXTENSION_VENDORED_DIRECTORY,
  BASE_NAME
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

describe('vendored twilioquest-base layout', () => {
  test('is listed as both bundled and vendored', () => {
    expect(bundledExtensionModules).toContain(BASE_NAME);
    expect(vendoredExtensionModules).toContain(BASE_NAME);
  });

  test('every vendored extension is a bundled extension and is not an npm dependency any more', () => {
    const dependencies = jetpack.read(
      path.join(PUBLIC_PATH, 'package.json'),
      'json'
    ).dependencies;

    vendoredExtensionModules.forEach(name => {
      expect(bundledExtensionModules).toContain(name);
      expect(dependencies).not.toHaveProperty([name]);
      expect(jetpack.exists(path.join(PUBLIC_PATH, 'content', name))).toBe(
        'dir'
      );
    });
  });

  test('keeps the package metadata, license and the start level', () => {
    expect(jetpack.exists(path.join(BASE_PATH, 'LICENSE'))).toBe('file');
    expect(jetpack.exists(path.join(BASE_PATH, 'README.md'))).toBe('file');
    expect(jetpack.read(path.join(BASE_PATH, 'package.json'), 'json')).toEqual(
      expect.objectContaining({ name: BASE_NAME, version: '8.1.0' })
    );
    expect(jetpack.exists(path.join(BASE_PATH, 'levels', 'fog_owl', 'level.json'))).toBe('file');
    expect(jetpack.exists(path.join(BASE_PATH, 'levels', 'fog_owl', 'events.js'))).toBe('file');
    expect(
      jetpack.exists(path.join(BASE_PATH, 'levels', 'challenge-questions', 'level.json'))
    ).toBe('file');
  });

  test('is discovered by the real discovery code from content/', async () => {
    const base = getBundledExtensionDirectories().find(
      extension => extension.name === BASE_NAME
    );

    expect(base.absolutePath).toBe(BASE_PATH);

    const levels = await readDirectory('levels', [base]);
    expect(levels).toEqual(
      expect.arrayContaining(['fog_owl', 'challenge-questions'])
    );
  });
});

describe('moduleLoader with the vendored twilioquest-base', () => {
  // Every file the game requires at runtime (see module-loader-usage.md):
  // objects/*/config.js, levels/*/events.js and levels/**/validator.js.
  const base = jetpack.cwd(BASE_PATH);
  const runtimeEntries = [
    ...base.find({ matching: 'objects/*/config.js' }),
    ...base.find({ matching: 'levels/*/events.js' }),
    ...base.find({ matching: 'levels/**/validator.js' }),
  ]
    .map(relative => path.join(BASE_PATH, relative))
    .sort();

  test('finds the runtime entry files', () => {
    expect(runtimeEntries.length).toBeGreaterThan(100);
  });

  test('loads every runtime entry file with the real allowlist', async () => {
    const failures = [];

    for (const entry of runtimeEntries) {
      // One loader per entry so that a failure cannot influence another file.
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
          `${path.relative(BASE_PATH, entry).split(path.sep).join('/')}: ${error.code} ${error.message}`
        );
      }
    }

    // The only known gap: objects/tq-npc/builder.js does
    // require(`./animations/${npcName}`), a non-literal require that the
    // loader cannot preload (module-loader-usage.md, section 4). Tracked for
    // the switch-over ticket (#21); no node builtin outside the allowlist is
    // needed by twilioquest-base. Update this expectation when that is fixed.
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(
      /^objects\/tq-npc\/config\.js: ERR_MODULE_NOT_PRELOADED .*animations\/cedric/
    );
  });

  test('never requires the build-time scripts/extendTilesetIds.js (it needs fs)', () => {
    const base = jetpack.cwd(BASE_PATH);
    const referencing = base
      .find({ matching: ['**/*.js'] })
      .filter(file => file !== path.join('scripts', 'extendTilesetIds.js'))
      .filter(file => base.read(file).includes('extendTilesetIds'));

    expect(referencing).toEqual([]);
    expect(base.read('scripts/extendTilesetIds.js')).toContain('require("fs")');
  });
});

describe('moduleLoader with the vendored twilioquest-dev-fundamentals', () => {
  const DEV_PATH = path.join(
    PUBLIC_PATH,
    BUNDLED_EXTENSION_VENDORED_DIRECTORY,
    'twilioquest-dev-fundamentals'
  );
  const dev = jetpack.cwd(DEV_PATH);
  const runtimeEntries = [
    ...dev.find({ matching: 'objects/*/config.js' }),
    ...dev.find({ matching: 'levels/*/events.js' }),
    ...dev.find({ matching: 'levels/**/validator.js' }),
  ]
    .map(relative => path.join(DEV_PATH, relative))
    .sort();

  test('is vendored and no longer an npm dependency', () => {
    expect(vendoredExtensionModules).toContain('twilioquest-dev-fundamentals');
    expect(
      jetpack.read(path.join(DEV_PATH, 'package.json'), 'json')
    ).toEqual(
      expect.objectContaining({
        name: 'twilioquest-dev-fundamentals',
        version: '2.4.0',
      })
    );
    expect(jetpack.exists(path.join(DEV_PATH, 'LICENSE'))).toBe('file');
  });

  test('loads every runtime entry file with the real allowlist (no failures)', async () => {
    expect(runtimeEntries.length).toBeGreaterThanOrEqual(12);
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
          `${path.relative(DEV_PATH, entry).split(path.sep).join('/')}: ${error.code} ${error.message}`
        );
      }
    }

    expect(failures).toEqual([]);
  });

  test('requires no Node-only module and no process global in any JS file', () => {
    const offenders = dev
      .find({ matching: ['**/*.js'] })
      .filter(file => {
        const source = dev.read(file);
        return /require\((["'])(fs|child_process|vm|electron)\1\)|\bprocess\./.test(
          source
        );
      });

    expect(offenders).toEqual([]);
  });
});
