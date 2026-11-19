import path from 'path';
import jetpack from 'fs-jetpack';
import {
  readFile,
  readDirectory,
  doesPathExist,
  resolveAbsolutePath,
  readLocalizedAsset,
  readLocalizedJson,
  readContentMessages,
  contentMessage,
  requireFromExtension,
  syncBundledAssets,
  isPathFromBundledExtension,
  getOwningExtensionName,
  getPathRelativeToOwningExtension,
} from '../../../js/app/common/assetLoader';
import {
  getExternalExtensionDirectories,
  BUNDLED_ASSET_DIRECTORY,
} from '../../../js/app/common/extensions';

import { staticFilePath } from '../../../js/app/common/fs_utils';
import { isDev } from '../../../js/app/platform/env';
import { isModuleCached } from '../../../js/app/common/moduleLoader';

vi.mock('../../../js/app/common/context');
vi.mock('../../../js/app/common/fs_utils');
vi.mock('../../../js/app/config/config');
vi.mock('../../../js/app/platform/env', () => ({ isDev: vi.fn() }));

import mockContextFactory from '../../utils/mockContextFactory';
import mockConfigFactory from '../../utils/mockConfigFactory';

const FIXTURES_PATH = path.resolve(__dirname, '..', '..', 'fixtures');
const EXTENSIONS_PATH = path.resolve(FIXTURES_PATH, 'extensions');
const PUBLIC_PATH = path.resolve(FIXTURES_PATH, 'public');

const mockExtensionsContext = mockContextFactory('extensions', {
  enabled: true,
  directory: EXTENSIONS_PATH,
});
const mockConfig = mockConfigFactory({
  bundledExtensionModules: ['twilioquest-base', 'owls-nest-extension'],
  vendoredExtensionModules: ['twilioquest-base'],
});

beforeAll(() => {
  // We need to mock the public file system that our test code is running in
  // to more closely resemble the one in production by using this path to our
  // test fixtures instead.
  staticFilePath.mockImplementation(relativePath => {
    return path.resolve(PUBLIC_PATH, relativePath);
  });
});

const consoleErrorFunction = console.error;

beforeEach(() => {
  // mock console error
  console.error = vi.fn();
});

afterEach(() => {
  // restore mocked console.error
  console.error = consoleErrorFunction;
});

describe('localized assets', () => {
  const assetPath = (file, language) =>
    readLocalizedAsset(file, absolutePath => absolutePath, { language });

  beforeEach(() => {
    mockConfig();
    mockExtensionsContext();
  });

  test('uses the translation in the extension that owns the original', async () => {
    expect(await assetPath('bundled-extension-file.md', 'ja'))
      .toBe(path.join(PUBLIC_PATH, 'content/twilioquest-base/bundled-extension-file.ja.md'));
  });

  test('uses the overriding extension’s English original when it has no translation', async () => {
    const asset = 'overridden-bundled-extension-file.md';
    const resolved = await assetPath(asset, 'ja');
    expect(resolved).toBe(await resolveAbsolutePath(asset));
    expect(resolved).toContain('bbb-minimal-config-extension');
  });

  test.each(['en', 'ja'])('falls back to the original when needed (%s)', async language => {
    const asset = 'bundled-file.txt';
    expect(await assetPath(asset, language))
      .toBe(await resolveAbsolutePath(asset));
  });

  test('uses the original when a localized file cannot be loaded', async () => {
    const asset = 'bundled-extension-file.md';
    const read = vi.fn().mockRejectedValueOnce(new Error('Invalid translation'))
      .mockResolvedValueOnce('English source');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await expect(readLocalizedAsset(asset, read, { language: 'ja' }))
        .resolves.toBe('English source');
      expect(read).toHaveBeenNthCalledWith(1, await assetPath(asset, 'ja'));
      expect(read).toHaveBeenNthCalledWith(2, await assetPath(asset, 'en'));
    } finally {
      warn.mockRestore();
    }
  });

  test('ignores directories with translation file names', async () => {
    const dir = jetpack.dir(path.join(FIXTURES_PATH, 'public/localization-directory'));
    try {
      dir.write('description.md', 'English');
      dir.dir('description.ja.md');
      const read = vi.fn().mockResolvedValue('English');
      const options = { language: 'ja', extensions: [{ absolutePath: dir.cwd() }] };
      await expect(readLocalizedAsset('description.md', read, options)).resolves.toBe('English');
      expect(read).toHaveBeenCalledExactlyOnceWith(dir.path('description.md'));
    } finally {
      dir.remove('.');
    }
  });

  test('overlays only allowed strings and matches named entries in the original order', async () => {
    const dir = jetpack.dir(path.join(FIXTURES_PATH, 'public/localization-fixture'));
    try {
      dir.write('objective.json', {
        title: 'Objective',
        validation_fields: [
          { name: 'answer', label: 'Answer', type: 'text' },
          { name: 'command', label: 'Command', type: 'text' },
        ],
      });
      dir.write('objective.ja.json', {
        title: '目標',
        validation_fields: [
          { name: 'command', label: 'コマンド' },
          { name: 'answer', label: '答え', type: 'tampered' },
          { name: 'new', label: '追加' },
        ],
      });
      const fields = { title: true, validation_fields: { label: true } };
      const options = { language: 'ja', extensions: [{ absolutePath: dir.cwd() }] };
      expect(await readLocalizedJson('objective.json', fields, options)).toEqual({
        title: '目標',
        validation_fields: [
          { name: 'answer', label: '答え', type: 'text' },
          { name: 'command', label: 'コマンド', type: 'text' },
        ],
      });
    } finally {
      dir.remove('.');
    }
  });

  test('reads messages next to the original and interpolates values as text', async () => {
    const dir = jetpack.dir(path.join(FIXTURES_PATH, 'public/messages-fixture'));
    try {
      dir.write('validator.js', '');
      dir.write('messages.ja.json', { ready: '準備完了 {{name}}' });
      const options = { language: 'ja', extensions: [{ absolutePath: dir.cwd() }] };
      const messages = await readContentMessages('validator.js', options);
      expect(contentMessage(messages, 'ready', 'Ready', { name: '<player>' }))
        .toBe('準備完了 <player>');
      expect(contentMessage(messages, 'missing', 'Hello {{name}}', { name: 'Player' }))
        .toBe('Hello Player');
    } finally {
      dir.remove('.');
    }
  });

  test('falls back when optional JSON is malformed', async () => {
    const dir = jetpack.dir(path.join(FIXTURES_PATH, 'public/invalid-localization-fixture'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      dir.write('level.json', { title: 'English' });
      dir.write('level.ja.json', '{oops');
      dir.write('messages.ja.json', ['not a message table']);
      const options = { language: 'ja', extensions: [{ absolutePath: dir.cwd() }] };
      await expect(readLocalizedJson('level.json', { title: true }, options))
        .resolves.toEqual({ title: 'English' });
      await expect(readContentMessages('level.json', options)).resolves.toEqual({});
    } finally {
      warn.mockRestore();
      dir.remove('.');
    }
  });
});

describe('readFile', () => {
  beforeEach(() => {
    mockConfig();
    mockExtensionsContext();
  });
  test('should return undefined if no extension has relative path', async () => {
    const fileContents = await readFile('file/does/not/exist.json');

    expect(fileContents).toBe(undefined);
  });

  test('should return undefined if only invalid extension has file', async () => {
    const fileContents = await readFile('invalid-extension.txt');

    expect(fileContents).toBe(undefined);
  });

  test('should return overridden file from first extension', async () => {
    const fileContents = await readFile('overriddenFile.js');

    expect(fileContents).toBe("console.log('hello from aaa');");
  });

  test('should return file from bundled extension', async () => {
    const fileContents = await readFile('bundled-extension-file.md');

    expect(fileContents).toBe('# Hi from bundled');
  });

  test('should return file from extension overriding bundled extension', async () => {
    const fileContents = await readFile('overridden-bundled-extension-file.md');

    expect(fileContents).toBe('# Hi from bbb');
  });

  test('should return file from first bundled extension', async () => {
    mockConfig({
      bundledExtensionModules: [
        'twilioquest-base',
        'twilioquest-aaa-bundled-two',
      ],
    });

    const fileContents = await readFile('bundled-file.txt');

    expect(fileContents).toBe('twilioquest-aaa-bundled-two');
  });

  test('should allow readFile options to be passed in', async () => {
    const fileContents = await readFile('overriddenFile.js', {});

    // Specifying an empty object of options should replace the default
    // encoding of utf8 and give us a Node.js Buffer.
    expect(fileContents).toBeInstanceOf(Buffer);
  });

  test('should allow extensions to be passed in', async () => {
    const externalExtensions = await getExternalExtensionDirectories();
    const bExtension = externalExtensions.find(
      extension => extension.name === 'bbb-minimal-config-extension'
    );

    const fileContents = await readFile('overriddenFile.js', undefined, [
      bExtension,
    ]);

    expect(fileContents).toBe("console.log('hello from bbb');");
  });
});

describe('readDirectory', () => {
  beforeEach(() => {
    mockConfig();
    mockExtensionsContext();
  });

  test('should combine files from multiple extensions', async () => {
    const files = await readDirectory('tilesets');

    // We do not want to expect an exact array because this function does
    // not guarantee a stable file order.
    expect(files.length).toBe(4);
    expect(files).toEqual(
      expect.arrayContaining([
        'a.png',
        'b.png',
        'tq-base.png',
        'overridden.png',
      ])
    );
  });

  test('should return undefined if directory does not exist', async () => {
    const files = await readDirectory('not/real/directory');

    // We do not want to expect an exact array because this function does
    // not guarantee a stable file order.
    expect(files).toBe(undefined);
  });

  test('should allow extensions to be passed in', async () => {
    const externalExtensions = await getExternalExtensionDirectories();
    const bExtension = externalExtensions.find(
      extension => extension.name === 'bbb-minimal-config-extension'
    );

    const files = await readDirectory('tilesets', [bExtension]);

    // We do not want to expect an exact array because this function does
    // not guarantee a stable file order.
    expect(files.length).toBe(1);
    expect(files).toEqual(expect.arrayContaining(['b.png']));
  });
});

describe('doesPathExist', () => {
  beforeEach(() => {
    mockConfig();
    mockExtensionsContext();
  });

  test('should return true for existing path', async () => {
    const result = await doesPathExist('overriddenFile.js');

    expect(result).toBe(true);
  });

  test('should return false if no path matches', async () => {
    const result = await doesPathExist('not/real/path.js');

    expect(result).toBe(false);
  });
});

describe('resolveAbsolutePath', () => {
  beforeEach(() => {
    mockConfig();
    mockExtensionsContext();
  });

  test('should find first matching path', async () => {
    const absolutePath = await resolveAbsolutePath('overriddenFile.js');

    const expectedPath = path.join(
      EXTENSIONS_PATH,
      'aaa-exhaustive-config-extension',
      'overriddenFile.js'
    );
    expect(absolutePath).toBe(expectedPath);
  });

  test('should return undefined if no path matches', async () => {
    const absolutePath = await resolveAbsolutePath('not/real/path.js');

    expect(absolutePath).toBe(undefined);
  });

  test('should check only passed in extensions', async () => {
    const externalExtensions = await getExternalExtensionDirectories();
    const bExtension = externalExtensions.find(
      extension => extension.name === 'bbb-minimal-config-extension'
    );

    const absolutePath = await resolveAbsolutePath('overriddenFile.js', [
      bExtension,
    ]);

    const expectedPath = path.join(
      EXTENSIONS_PATH,
      'bbb-minimal-config-extension',
      'overriddenFile.js'
    );
    expect(absolutePath).toBe(expectedPath);
  });
});

describe('bundled extension ownership', () => {
  beforeEach(() => {
    mockConfig();
    mockExtensionsContext();
  });

  const vendoredFile = path.join(
    PUBLIC_PATH,
    'content',
    'twilioquest-base',
    'objects',
    'collider',
    'config.js'
  );
  const npmFile = path.join(
    PUBLIC_PATH,
    'node_modules',
    'twilioquest-aaa-bundled-two',
    'objects',
    'collider',
    'config.js'
  );
  const externalFile = path.join(
    EXTENSIONS_PATH,
    'aaa-exhaustive-config-extension',
    'overriddenFile.js'
  );

  test('should recognize paths under both bundled roots', () => {
    expect(isPathFromBundledExtension(vendoredFile)).toBe(true);
    expect(isPathFromBundledExtension(npmFile)).toBe(true);
    expect(isPathFromBundledExtension(externalFile)).toBe(false);
  });

  test('should not treat a directory merely named content as a bundled root', () => {
    expect(
      isPathFromBundledExtension(
        path.join(EXTENSIONS_PATH, 'content', 'foo', 'config.js')
      )
    ).toBe(false);
  });

  test('should resolve the owning extension name and relative path', async () => {
    expect(await getOwningExtensionName(vendoredFile)).toBe('twilioquest-base');
    expect(await getOwningExtensionName(npmFile)).toBe(
      'twilioquest-aaa-bundled-two'
    );
    expect(await getOwningExtensionName(externalFile)).toBe(
      'aaa-exhaustive-config-extension'
    );
    expect(await getPathRelativeToOwningExtension(vendoredFile)).toBe(
      path.join(path.sep, 'objects', 'collider', 'config.js')
    );
  });
});

describe('requireFromExtension', () => {
  test('should throw an exception if no modulePath is provided', async () => {
    await expect(async () => {
      const foo = await requireFromExtension();
    }).rejects.toThrow();
  });

  test('should return null if there is no module at the given path', async () => {
    const foo = await requireFromExtension('monkey/rats/donkey/pajamas.js');
    expect(foo).toBe(null);
  });

  test('should return a valid CommonJS module from an extension', async () => {
    const testFoo = await requireFromExtension(
      'objectives/test_mission/test_objective/validator.js'
    );

    expect(testFoo).toBeDefined();
    expect(testFoo('alshd')).toBe(false);
    expect(testFoo('bar')).toBe(true);
  });

  describe('with the CommonJS loader', () => {
    const CASES = 'objectives/test_mission/loader_cases';
    const counterPath = path.join(
      EXTENSIONS_PATH,
      'aaa-exhaustive-config-extension',
      CASES,
      'counter.js'
    );

    beforeEach(() => {
      delete globalThis.__requireFromExtensionEvaluations;
      delete window.reloadExternalModules;
      isDev.mockReturnValue(false);
    });

    afterEach(() => {
      delete window.reloadExternalModules;
    });

    test('should return parsed JSON for a .json module', async () => {
      expect(await requireFromExtension(`${CASES}/tile.json`)).toEqual({
        tilesets: [{ source: 'a.json' }],
      });
    });

    test('should keep the cached module when not in development', async () => {
      const first = await requireFromExtension(`${CASES}/counter.js`);
      const second = await requireFromExtension(`${CASES}/counter.js`);

      expect(second).toBe(first);
      expect(isModuleCached(counterPath)).toBe(true);
    });

    test('should re-evaluate the module on every call in development', async () => {
      isDev.mockReturnValue(true);

      const first = await requireFromExtension(`${CASES}/counter.js`);
      const second = await requireFromExtension(`${CASES}/counter.js`);

      expect(second).toBe(first + 1);
    });

    test('should re-evaluate the module when window.reloadExternalModules is set', async () => {
      window.reloadExternalModules = true;

      const first = await requireFromExtension(`${CASES}/counter.js`);
      const second = await requireFromExtension(`${CASES}/counter.js`);

      expect(second).toBe(first + 1);
    });

    test('should reject with an explicit error for a module that is not allowlisted', async () => {
      await expect(
        requireFromExtension(`${CASES}/forbidden.js`)
      ).rejects.toMatchObject({ code: 'ERR_MODULE_NOT_ALLOWED' });
    });

    test('should reject with an explicit error for a non-literal require without a hint', async () => {
      await expect(
        requireFromExtension(`${CASES}/not_preloaded.js`)
      ).rejects.toMatchObject({ code: 'ERR_MODULE_NOT_PRELOADED' });
    });
  });
});

describe('syncBundledAssets', () => {
  const BUNDLED_PATH = path.join(EXTENSIONS_PATH, BUNDLED_ASSET_DIRECTORY);

  beforeEach(() => {
    mockConfig();
    mockExtensionsContext();
  });

  afterEach(() => {
    // remove .bundled directory
    jetpack.remove(BUNDLED_PATH);
  });

  test('should sync bundled tilesets', async () => {
    await syncBundledAssets();

    const BUNDLED_TILESETS_PATH = path.join(BUNDLED_PATH, 'tilesets');
    const bundledFiles = jetpack.list(BUNDLED_TILESETS_PATH);

    // bundledFiles will be undefined if the directory does not exist
    expect(bundledFiles).toBeDefined();
    expect(bundledFiles.length).toBe(2);
    expect(bundledFiles).toEqual(
      expect.arrayContaining(['tq-base.png', 'overridden.png'])
    );
  });

  test('should sync multiple bundled tilesets', async () => {
    mockConfig({
      bundledExtensionModules: [
        'twilioquest-base',
        'twilioquest-aaa-bundled-two',
      ],
    });

    await syncBundledAssets();

    const BUNDLED_TILESETS_PATH = path.join(BUNDLED_PATH, 'tilesets');
    const bundledFiles = jetpack.list(BUNDLED_TILESETS_PATH);

    const OVERRIDDEN_PATH = path.join(BUNDLED_TILESETS_PATH, 'overridden.png');
    const overriddenFile = jetpack.read(OVERRIDDEN_PATH);

    // bundledFiles will be undefined if the directory does not exist
    expect(bundledFiles).toBeDefined();
    expect(bundledFiles.length).toBe(3);
    expect(bundledFiles).toEqual(
      expect.arrayContaining(['tq-base.png', 'a-bundled.png', 'overridden.png'])
    );
    expect(overriddenFile).toEqual('twilioquest-aaa-bundled-two');
  });

  test('should sync bundled objects', async () => {
    await syncBundledAssets();

    const BUNDLED_TILESETS_PATH = path.join(BUNDLED_PATH, 'objects');
    const bundledFiles = jetpack.list(BUNDLED_TILESETS_PATH);

    // bundledFiles will be undefined if the directory does not exist
    expect(bundledFiles).toBeDefined();
    expect(bundledFiles.length).toBe(3);
    expect(bundledFiles).toEqual(
      expect.arrayContaining(['collider', 'exclamation', 'tile-object'])
    );

    // expect contents of object files to be present as well
    const colliderPath = path.join(
      BUNDLED_TILESETS_PATH,
      'collider',
      'config.js'
    );
    expect(jetpack.exists(colliderPath)).toBe('file');
  });

  test('should sync multiple bundled objects', async () => {
    mockConfig({
      bundledExtensionModules: [
        'twilioquest-base',
        'twilioquest-aaa-bundled-two',
      ],
    });

    await syncBundledAssets();

    const BUNDLED_TILESETS_PATH = path.join(BUNDLED_PATH, 'objects');
    const bundledFiles = jetpack.list(BUNDLED_TILESETS_PATH);

    // bundledFiles will be undefined if the directory does not exist
    expect(bundledFiles).toBeDefined();
    expect(bundledFiles.length).toBe(3);
    expect(bundledFiles).toEqual(
      expect.arrayContaining(['collider', 'exclamation', 'tile-object'])
    );

    // expect contents of object files to be present as well
    const colliderPath = path.join(
      BUNDLED_TILESETS_PATH,
      'collider',
      'config.js'
    );
    expect(jetpack.exists(colliderPath)).toBe('file');

    // collider config should come from overriding extension
    const colliderConfig = require(colliderPath);
    expect(colliderConfig).toBe('twilioquest-aaa-bundled-two-collider-config');
  });

  test('should clear bundled directory before syncing', async () => {
    const filePathToBeRemoved = path.join(BUNDLED_PATH, 'toBeRemoved.txt');

    jetpack.write(
      filePathToBeRemoved,
      'This file should be removed before syncing.'
    );

    await syncBundledAssets();

    expect(jetpack.exists(filePathToBeRemoved)).toBe(false);
  });
});
