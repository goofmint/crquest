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
const NAME = 'twilioquest-api-academy';
const PACKAGE_PATH = path.join(PUBLIC_PATH, 'content', NAME);
const LEVELS_PATH = path.join(PACKAGE_PATH, 'levels');

const validatorPath = (level, objective) =>
  path.join(LEVELS_PATH, level, 'objectives', objective, 'validator.js');
const requireValidator = (level, objective) =>
  // eslint-disable-next-line global-require, import/no-dynamic-require
  require(validatorPath(level, objective));

describe('vendored twilioquest-api-academy layout', () => {
  test('is bundled, vendored and no longer an npm dependency', () => {
    expect(bundledExtensionModules).toContain(NAME);
    expect(vendoredExtensionModules).toContain(NAME);

    const { dependencies } = jetpack.read(
      path.join(PUBLIC_PATH, 'package.json'),
      'json'
    );
    expect(dependencies).not.toHaveProperty([NAME]);
    // Previously satisfied only transitively through the npm package.
    expect(dependencies).toHaveProperty(['compare-versions']);
    expect(dependencies).toHaveProperty(['lodash.merge']);
  });

  test('keeps the package metadata and license', () => {
    expect(jetpack.exists(path.join(PACKAGE_PATH, 'LICENSE'))).toBe('file');
    expect(jetpack.exists(path.join(PACKAGE_PATH, 'README.md'))).toBe('file');
    expect(
      jetpack.read(path.join(PACKAGE_PATH, 'package.json'), 'json')
    ).toEqual(expect.objectContaining({ name: NAME, version: '3.0.2' }));
    ['api_academy', 'house_ceremony', 'inside_perimeter', 'lovelace_tower'].forEach(
      level => {
        expect(jetpack.exists(path.join(LEVELS_PATH, level, 'level.json'))).toBe(
          'file'
        );
      }
    );
  });

  test('does not depend on twilio any more (lock file and sources)', () => {
    const lock = jetpack.read(path.join(PUBLIC_PATH, 'package-lock.json'), 'json');
    // lockfileVersion 3 lists packages under "packages", keyed by install path
    expect(lock.packages).not.toHaveProperty([`node_modules/${NAME}`]);

    const requiring = jetpack
      .cwd(PACKAGE_PATH)
      .find({ matching: ['**/*.js'] })
      .filter(file =>
        /require\((["'])twilio\1\)/.test(jetpack.cwd(PACKAGE_PATH).read(file))
      );
    expect(requiring).toEqual([]);
  });
});

describe('moduleLoader with the vendored twilioquest-api-academy', () => {
  const pkg = jetpack.cwd(PACKAGE_PATH);
  const runtimeEntries = [
    ...pkg.find({ matching: 'objects/*/config.js' }),
    ...pkg.find({ matching: 'levels/*/events.js' }),
    ...pkg.find({ matching: 'levels/**/validator.js' }),
  ]
    .map(relative => path.join(PACKAGE_PATH, relative))
    .sort();

  test('finds the runtime entry files', () => {
    expect(runtimeEntries.length).toBeGreaterThan(20);
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

describe('inside_perimeter / twilio_api_setup (format check only)', () => {
  const validate = requireValidator('inside_perimeter', 'twilio_api_setup');
  const accountSid = `AC${'0123456789abcdef'.repeat(2)}`;
  const authToken = 'fedcba9876543210'.repeat(2);

  const run = validationFields => {
    const callback = jest.fn();
    validate({ validationFields }, callback);
    return callback;
  };

  test('accepts credentials in the expected format and stores them as env', () => {
    const callback = run({ accountSid, authToken });

    expect(callback).toHaveBeenCalledTimes(1);
    const [err, feedback] = callback.mock.calls[0];
    expect(err).toBeNull();
    expect(feedback.env).toEqual([
      { name: 'TWILIO_ACCOUNT_SID', value: accountSid },
      { name: 'TWILIO_AUTH_TOKEN', value: authToken, concealed: true },
    ]);
  });

  test('rejects missing values', () => {
    expect(run({ accountSid, authToken: '' }).mock.calls[0][0].message).toMatch(
      /required/
    );
    expect(run({ accountSid: '', authToken }).mock.calls[0][0].message).toMatch(
      /required/
    );
  });

  test('rejects a malformed account SID', () => {
    const callback = run({ accountSid: `XX${accountSid.slice(2)}`, authToken });
    expect(callback.mock.calls[0]).toHaveLength(1);
    expect(callback.mock.calls[0][0].message).toMatch(/account SID/);
    expect(run({ accountSid: 'AC123', authToken }).mock.calls[0][0].message).toMatch(
      /account SID/
    );
  });

  test('rejects a malformed auth token', () => {
    const callback = run({ accountSid, authToken: 'not-a-token' });
    expect(callback.mock.calls[0]).toHaveLength(1);
    expect(callback.mock.calls[0][0].message).toMatch(/auth token/);
  });
});

describe('inside_perimeter / hopper_key', () => {
  const validate = requireValidator('inside_perimeter', 'hopper_key');
  const makeHelper = answers => ({
    getNormalizedInput: key => (answers[key] || '').trim().toLowerCase(),
    fail: jest.fn(),
    success: jest.fn(),
  });

  test('succeeds with the right answers (no helper.env needed)', async () => {
    const helper = makeHelper({
      answer1: 'confirm',
      answer2: 'false',
      answer3: 'Authorization',
      answer4: 'B',
    });
    await validate(helper);
    expect(helper.fail).not.toHaveBeenCalled();
    expect(helper.success).toHaveBeenCalledTimes(1);
  });

  test('fails with a wrong answer', async () => {
    const helper = makeHelper({
      answer1: 'confirm',
      answer2: 'true',
      answer3: 'authorization',
      answer4: 'b',
    });
    await validate(helper);
    expect(helper.success).not.toHaveBeenCalled();
    expect(helper.fail.mock.calls[0][0]).toMatch(/second challenge question/);
  });
});

describe('inside_perimeter / lovelace_key (message SID format check only)', () => {
  const validate = requireValidator('inside_perimeter', 'lovelace_key');
  const sid = `SM${'0123456789abcdef'.repeat(2)}`;
  const makeHelper = answers => ({
    getNormalizedInput: key => (answers[key] || '').trim().toLowerCase(),
    validationFields: { answer3: answers.answer3 },
    fail: jest.fn(),
    success: jest.fn(),
  });

  test('succeeds with the right answers and an SM or MM message SID', async () => {
    for (const messageSid of [sid, `MM${sid.slice(2)}`]) {
      const helper = makeHelper({ answer1: 'True', answer2: 'To', answer3: messageSid });
      await validate(helper);
      expect(helper.fail).not.toHaveBeenCalled();
      expect(helper.success).toHaveBeenCalledTimes(1);
    }
  });

  test('fails when the message SID is not in the expected format', async () => {
    const helper = makeHelper({ answer1: 'true', answer2: 'to', answer3: 'SM123' });
    await validate(helper);
    expect(helper.success).not.toHaveBeenCalled();
    expect(helper.fail.mock.calls[0][0]).toMatch(/message SID/);
  });

  test('fails when an answer is wrong', async () => {
    const helper = makeHelper({ answer1: 'false', answer2: 'to', answer3: sid });
    await validate(helper);
    expect(helper.success).not.toHaveBeenCalled();
    expect(helper.fail.mock.calls[0][0]).toMatch(/first challenge question/);
  });
});

describe('lovelace_tower / api-02-async-await (helper.fs.readdir)', () => {
  const validate = requireValidator('lovelace_tower', 'api-02-async-await');
  const housesDirectory = path.join(
    LEVELS_PATH,
    'lovelace_tower',
    'objectives',
    'api-02-async-await',
    'houses'
  );

  const makeHelper = findLastFileInDir => ({
    fs: { readdir: jest.fn(fsPlatform.readdir) },
    pullVarsFromQuestIdeUserCodeLocalScope: jest.fn(async () => ({
      findLastFileInDir,
    })),
    fail: jest.fn(),
    success: jest.fn(),
  });

  test('succeeds when the learner function returns the last entry (listed via helper.fs.readdir)', async () => {
    const entries = await fsPlatform.readdir(housesDirectory);
    const helper = makeHelper(async () => entries[entries.length - 1]);

    await validate(helper);

    expect(helper.fs.readdir).toHaveBeenCalledWith(housesDirectory);
    expect(helper.fail).not.toHaveBeenCalled();
    expect(helper.success).toHaveBeenCalledWith('Great job!');
  });

  test('fails when the learner function returns something else', async () => {
    const helper = makeHelper(async () => 'wrong');

    await validate(helper);

    expect(helper.success).not.toHaveBeenCalled();
    expect(helper.fail.mock.calls[0][0].message).toMatch(/Expected/);
  });

  test('fails when the function is not defined', async () => {
    const helper = makeHelper(undefined);

    await validate(helper);

    expect(helper.fail.mock.calls[0][0].message).toMatch(/not defined/);
  });
});

describe('progression that depends on the Twilio-related objectives', () => {
  const insidePerimeter = path.join(LEVELS_PATH, 'inside_perimeter');
  const objectiveNames = jetpack.list(path.join(insidePerimeter, 'objectives'));

  test('every objective of level.json still has a validator and objective.json', () => {
    const level = jetpack.read(path.join(insidePerimeter, 'level.json'), 'json');
    expect(level.objectives).toEqual(
      expect.arrayContaining(['hopper_key', 'lovelace_key', 'twilio_api_setup'])
    );
    level.objectives.forEach(name => {
      expect(objectiveNames).toContain(name);
      expect(
        jetpack.exists(path.join(insidePerimeter, 'objectives', name, 'validator.js'))
      ).toBe('file');
    });
  });

  test('events.js still maps the objectives that open the catacombs and unlock the key spells', () => {
    const events = jetpack.read(path.join(insidePerimeter, 'events.js'));
    expect(events).toMatch(/twilio_api_setup: \(\) => twilioApiSetupComplete\(\)/);
    expect(events).toMatch(/lovelace_key: \(\) => obtainKeySpellComplete\("lovelace_flame"\)/);
    expect(events).toMatch(/hopper_key: \(\) => obtainKeySpellComplete\("hopper_flame"\)/);
  });

  test('the env names the ghost NPC check looks for are the ones twilio_api_setup stores', () => {
    const events = jetpack.read(path.join(insidePerimeter, 'events.js'));
    const validate = requireValidator('inside_perimeter', 'twilio_api_setup');
    const callback = jest.fn();
    validate(
      {
        validationFields: {
          accountSid: `AC${'a'.repeat(32)}`,
          authToken: 'b'.repeat(32),
        },
      },
      callback
    );

    // Validator.jsx prefixes names that do not start with TQ_ with "TQ_".
    const keys = callback.mock.calls[0][1].env.map(({ name }) => `TQ_${name}`);
    keys.forEach(key => expect(events).toContain(`"${key}"`));
  });
});
