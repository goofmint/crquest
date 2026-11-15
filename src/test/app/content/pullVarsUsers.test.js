import path from 'path';
import jetpack from 'fs-jetpack';

// pullVarsFromUserCodeLocalScope / pullVarsFromQuestIdeUserCodeLocalScope run
// the learner's code in a Web Worker, so a requested variable must be DATA
// (structured cloneable): a function, class or symbol cannot leave the worker
// and makes the call reject. Validators that call the learner's functions use
// evaluateInUserCodeLocalScope / evaluateInQuestIdeUserCodeLocalScope instead
// (docs/migration/validation-helper-worker.md). This test lists every content
// file that still uses pullVars* and the variables it asks for: a new user, or
// a new variable, has to be added here on purpose, after checking it is data.

const CONTENT_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'public',
  'content'
);

const JAVASCRIPT_OBJECTIVES = 'twilioquest-javascript/levels/javascript/objectives';

// <validator under public/content>: the variables it pulls (all data)
const DATA_ONLY_PULL_VARS_USERS = {
  [`${JAVASCRIPT_OBJECTIVES}/arrays/validator.js`]: ['inventory'], // array of strings
  [`${JAVASCRIPT_OBJECTIVES}/js_declare_variable/validator.js`]: ['laserStatus'], // string
  [`${JAVASCRIPT_OBJECTIVES}/js_declare_variable_multiple/validator.js`]: [
    'accessLevel', // number
    'favoriteRobot', // string
    'verifiedUser', // boolean
  ],
};

const toPosix = file => file.split(path.sep).join('/');

const contentFiles = () =>
  jetpack
    .cwd(CONTENT_PATH)
    .find({ matching: ['**/*.js', '!**/node_modules/**'] })
    .map(toPosix)
    .sort();

const PULL_VARS_CALL = /\bpullVarsFrom\w*/g;
// pullVars...(<code expression>, [<names>]) and pullVars...([<names>], ...)
const PULL_VARS_KEYS = /\bpullVarsFrom\w*\(\s*(?:[^,[\]()]+,\s*)?\[([^\]]*)\]/g;

const requestedKeys = source =>
  [...source.matchAll(PULL_VARS_KEYS)].flatMap(match =>
    match[1]
      .split(',')
      .map(key => key.trim())
      .filter(key => key !== '')
      .map(key => {
        const quoted = key.match(/^(['"])([A-Za-z_$][\w$]*)\1$/);
        if (!quoted) {
          throw new Error(`pullVars key is not a string literal: ${key}`);
        }
        return quoted[2];
      })
  );

describe('pullVars* users in public/content', () => {
  const files = contentFiles();
  const users = files.filter(file =>
    /\bpullVarsFrom/.test(jetpack.cwd(CONTENT_PATH).read(file))
  );

  test('only the listed data-only validators call pullVars*', () => {
    expect(users).toEqual(Object.keys(DATA_ONLY_PULL_VARS_USERS).sort());
  });

  test.each(Object.keys(DATA_ONLY_PULL_VARS_USERS))(
    '%s pulls exactly the listed data variables, with literal names',
    file => {
      const source = jetpack.cwd(CONTENT_PATH).read(file);
      // every call is accounted for by the key extraction
      expect(source.match(PULL_VARS_CALL)).toHaveLength(
        [...source.matchAll(PULL_VARS_KEYS)].length
      );
      expect(requestedKeys(source)).toEqual(DATA_ONLY_PULL_VARS_USERS[file]);
    }
  );

  test('the validators that call the learner functions use the Worker evaluate API', () => {
    const callers = files.filter(file =>
      /\bevaluateIn(QuestIde)?UserCodeLocalScope\b/.test(
        jetpack.cwd(CONTENT_PATH).read(file)
      )
    );
    // 12 twilioquest-javascript, 10 twilioquest-base, 4 twilioquest-api-academy
    expect(callers).toHaveLength(26);
    expect(callers.filter(file => users.includes(file))).toEqual([]);
  });
});
