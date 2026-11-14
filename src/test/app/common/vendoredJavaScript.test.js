import path from 'path';
import jetpack from 'fs-jetpack';
import * as fsPlatform from '../../../js/app/platform/fs';
import { createModuleLoader } from '../../../js/app/common/moduleLoader';
import {
  getBuiltIn,
  isAllowedBuiltIn,
} from '../../../js/app/common/moduleAllowlist';
import { normalize } from '../../../js/app/common/modulePath';
import bundledExtensionModules from '../../../js/app/config/bundledExtensionModules.json';
import vendoredExtensionModules from '../../../js/app/config/vendoredExtensionModules.json';

// The real public/ directory of the repository (not a fixture).
const PUBLIC_PATH = path.resolve(__dirname, '..', '..', '..', '..', 'public');
const NAME = 'twilioquest-javascript';
const PACKAGE_PATH = path.join(PUBLIC_PATH, 'content', NAME);

describe('vendored twilioquest-javascript layout', () => {
  test('is bundled, vendored and no longer an npm dependency', () => {
    expect(bundledExtensionModules).toContain(NAME);
    expect(vendoredExtensionModules).toContain(NAME);

    const { dependencies } = jetpack.read(
      path.join(PUBLIC_PATH, 'package.json'),
      'json'
    );
    expect(dependencies).not.toHaveProperty([NAME]);
    // Required at runtime by the vendored scripts and allowlisted: they must
    // be direct dependencies of public/package.json (not only transitive).
    expect(dependencies).toHaveProperty(['uuid']);
    expect(dependencies).toHaveProperty(['lodash.merge']);

    const lock = jetpack.read(
      path.join(PUBLIC_PATH, 'package-lock.json'),
      'json'
    );
    expect(lock.dependencies).not.toHaveProperty([NAME]);
  });

  test('keeps the package metadata, license and the level', () => {
    expect(jetpack.exists(path.join(PACKAGE_PATH, 'LICENSE'))).toBe('file');
    expect(jetpack.exists(path.join(PACKAGE_PATH, 'README.md'))).toBe('file');
    expect(
      jetpack.read(path.join(PACKAGE_PATH, 'package.json'), 'json')
    ).toEqual(expect.objectContaining({ name: NAME, version: '1.1.7' }));
    expect(
      jetpack.exists(path.join(PACKAGE_PATH, 'levels', 'javascript', 'level.json'))
    ).toBe('file');
  });

  test('no runtime JS requires a Node-only module or uses process/vm', () => {
    const pkg = jetpack.cwd(PACKAGE_PATH);
    const forbidden = /require\((["'])(fs|fs-jetpack|vm|child_process|electron|twilio|command-exists|esprima|http|https|got)\1\)/;
    const offenders = pkg
      .find({ matching: ['levels/**/*.js', 'objects/**/*.js', 'scripts/**/*.js'] })
      .filter(file => forbidden.test(pkg.read(file)) || /\bprocess\./.test(pkg.read(file)));

    expect(offenders).toEqual([]);
  });

  test('the green-keycard objective no longer mentions or requires Twilio', () => {
    const dir = path.join(
      PACKAGE_PATH,
      'levels',
      'javascript',
      'objectives',
      'green-keycard'
    );
    ['validator.js', 'walkthrough.md', 'description.md', 'objective.json'].forEach(
      file => {
        expect(jetpack.read(path.join(dir, file)).toLowerCase()).not.toContain(
          'twilio'
        );
      }
    );
  });

  test('every objective in level.json has a validator and nothing else is dropped', () => {
    const level = jetpack.read(
      path.join(PACKAGE_PATH, 'levels', 'javascript', 'level.json'),
      'json'
    );
    level.objectives.forEach(objective => {
      expect(
        jetpack.exists(
          path.join(
            PACKAGE_PATH,
            'levels',
            'javascript',
            'objectives',
            objective,
            'validator.js'
          )
        )
      ).toBe('file');
    });
    // green-keycard stays in the package (unreferenced upstream as well).
    expect(
      jetpack.exists(
        path.join(
          PACKAGE_PATH,
          'levels',
          'javascript',
          'objectives',
          'green-keycard',
          'objective.json'
        )
      )
    ).toBe('file');
  });
});

describe('moduleLoader with the vendored twilioquest-javascript', () => {
  const pkg = jetpack.cwd(PACKAGE_PATH);
  const runtimeEntries = [
    ...pkg.find({ matching: 'objects/*/config.js' }),
    ...pkg.find({ matching: 'levels/*/events.js' }),
    ...pkg.find({ matching: 'levels/**/validator.js' }),
  ]
    .map(relative => path.join(PACKAGE_PATH, relative))
    .sort();

  test('finds the runtime entry files', () => {
    expect(runtimeEntries.length).toBeGreaterThan(30);
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
          `${path.relative(PACKAGE_PATH, entry).split(path.sep).join('/')}: ${error.code} ${error.message}`
        );
      }
    }

    expect(failures).toEqual([]);
  });
});
