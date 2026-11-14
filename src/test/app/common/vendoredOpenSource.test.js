import path from 'path';
import jetpack from 'fs-jetpack';
import * as fsPlatform from '../../../js/app/platform/fs';
import { createModuleLoader } from '../../../js/app/common/moduleLoader';
import {
  getBuiltIn,
  isAllowedBuiltIn,
} from '../../../js/app/common/moduleAllowlist';
import { normalize } from '../../../js/app/common/modulePath';
import vendoredExtensionModules from '../../../js/app/config/vendoredExtensionModules.json';
import bundledExtensionModules from '../../../js/app/config/bundledExtensionModules.json';

const PUBLIC_PATH = path.resolve(__dirname, '..', '..', '..', '..', 'public');
const NAME = 'twilioquest-open-source';
const PACKAGE_PATH = path.join(PUBLIC_PATH, 'content', NAME);
const OBJECTIVES = path.join(PACKAGE_PATH, 'levels', 'open_source', 'objectives');

const validator = name => require(path.join(OBJECTIVES, name, 'validator.js'));

describe('vendored twilioquest-open-source layout', () => {
  test('is bundled, vendored, present and no longer an npm dependency', () => {
    expect(bundledExtensionModules).toContain(NAME);
    expect(vendoredExtensionModules).toContain(NAME);
    expect(
      jetpack.read(path.join(PUBLIC_PATH, 'package.json'), 'json').dependencies
    ).not.toHaveProperty([NAME]);
    expect(jetpack.read(path.join(PACKAGE_PATH, 'package.json'), 'json')).toEqual(
      expect.objectContaining({ name: NAME, version: '2.0.1' })
    );
    expect(jetpack.exists(path.join(PACKAGE_PATH, 'LICENSE'))).toBe('file');
    expect(jetpack.exists(path.join(PACKAGE_PATH, 'README.md'))).toBe('file');
    expect(
      jetpack.exists(path.join(PACKAGE_PATH, 'levels', 'open_source', 'level.json'))
    ).toBe('file');
  });
});

describe('moduleLoader with the vendored twilioquest-open-source', () => {
  const pkg = jetpack.cwd(PACKAGE_PATH);
  const runtimeEntries = [
    ...pkg.find({ matching: 'objects/*/config.js' }),
    ...pkg.find({ matching: 'levels/*/events.js' }),
    ...pkg.find({ matching: 'levels/**/validator.js' }),
  ]
    .map(relative => path.join(PACKAGE_PATH, relative))
    .sort();

  test('finds the runtime entry files', () => {
    expect(runtimeEntries.length).toBeGreaterThan(10);
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

  test('no runtime JS requires a Node-only module', () => {
    const offenders = pkg
      .find({ matching: '**/*.js' })
      .filter(file =>
        /require\(\s*['"`](fs|fs-jetpack|child_process|got|command-exists|util|electron|vm)['"`]\s*\)/.test(
          pkg.read(file)
        )
      );

    expect(offenders).toEqual([]);
  });
});

// A fake validation helper: records the callback results and fakes fs / exec.
const createHelper = ({
  env = {},
  validationFields = {},
  fsEntries = {},
  execResults = [],
  executableValid = [true, undefined],
} = {}) => {
  const helper = {
    env,
    validationFields,
    success: jest.fn(),
    fail: jest.fn(),
    getNormalizedInput: (key, { lowerCase = true } = {}) => {
      const value = (validationFields[key] || '').trim();
      return lowerCase ? value.toLowerCase() : value;
    },
    isExecutableValid: jest.fn().mockResolvedValue(executableValid),
    fs: {
      existsAsync: jest.fn(async p => (p in fsEntries ? fsEntries[p].type : false)),
      readAsync: jest.fn(async p => fsEntries[p].content),
    },
    exec: jest.fn(),
  };
  execResults.forEach(result => {
    if (result instanceof Error) {
      helper.exec.mockRejectedValueOnce(result);
    } else {
      helper.exec.mockResolvedValueOnce(result);
    }
  });
  return helper;
};

const ok = stdout => ({ code: 0, stdout, stderr: '' });
const response = (status, body, statusText = '') => ({
  status,
  statusText,
  json: async () => body,
});

beforeEach(() => {
  global.fetch = jest.fn();
});
afterEach(() => {
  delete global.fetch;
});

describe('GitHub API validators (got -> fetch)', () => {
  test('01_create_github: 200 succeeds and sets GITHUB_USERNAME', async () => {
    fetch.mockResolvedValue(response(200, {}));
    const helper = createHelper({ validationFields: { username: ' Octo ' } });
    await validator('01_create_github')(helper);
    expect(fetch).toHaveBeenCalledWith('https://api.github.com/users/Octo');
    expect(helper.success).toHaveBeenCalledWith(
      'We found your GitHub user, Octo. Good job!',
      [{ name: 'GITHUB_USERNAME', value: 'Octo' }]
    );
  });

  test('01_create_github: 404 fails with the not-found message', async () => {
    fetch.mockResolvedValue(response(404, {}));
    const helper = createHelper({ validationFields: { username: 'nobody' } });
    await validator('01_create_github')(helper);
    expect(helper.fail).toHaveBeenCalledWith(
      "We couldn't find the GitHub user, nobody. Is there a typo in the username?"
    );
  });

  test('01_create_github: a network error is reported, not thrown', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const helper = createHelper({ validationFields: { username: 'octo' } });
    await validator('01_create_github')(helper);
    expect(helper.fail.mock.calls[0][0]).toMatch(
      /^Something went wrong when we tried to validate your GitHub username![\s\S]*TypeError: Failed to fetch/
    );
  });

  test('01_create_github: empty username fails before any request', async () => {
    const helper = createHelper();
    await validator('01_create_github')(helper);
    expect(fetch).not.toHaveBeenCalled();
    expect(helper.fail).toHaveBeenCalledWith(
      'Please enter the username of your GitHub account!'
    );
  });

  test('02_fork_project: 200 succeeds, 404 fails', async () => {
    const env = { TQ_GITHUB_USERNAME: 'octo' };
    fetch.mockResolvedValueOnce(response(200, {}));
    let helper = createHelper({ env });
    await validator('02_fork_project')(helper);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/octo/open-pixel-art'
    );
    expect(helper.success).toHaveBeenCalledTimes(1);

    fetch.mockResolvedValueOnce(response(404, {}));
    helper = createHelper({ env });
    await validator('02_fork_project')(helper);
    expect(helper.fail.mock.calls[0][0]).toMatch(/couldn't find a repository named "open-pixel-art"/);
  });

  test('08_push_upstream: 200 succeeds, 404 fails', async () => {
    const env = { TQ_GITHUB_USERNAME: 'octo', TQ_OPEN_PIXEL_ART_BRANCH: 'b1' };
    fetch.mockResolvedValueOnce(response(200, {}));
    let helper = createHelper({ env });
    await validator('08_push_upstream')(helper);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/octo/open-pixel-art/branches/b1'
    );
    expect(helper.success).toHaveBeenCalledTimes(1);

    fetch.mockResolvedValueOnce(response(404, {}));
    helper = createHelper({ env });
    await validator('08_push_upstream')(helper);
    expect(helper.fail.mock.calls[0][0]).toMatch(/could not find your branch "b1"/);
  });

  test('09_make_pr: owner match succeeds, other owner and 404 fail', async () => {
    const env = { TQ_GITHUB_USERNAME: 'Octo' };
    const fields = { prNumber: '12' };
    fetch.mockResolvedValueOnce(response(200, { user: { login: 'octo' } }));
    let helper = createHelper({ env, validationFields: fields });
    await validator('09_make_pr')(helper);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/twilio-labs/open-pixel-art/pulls/12'
    );
    expect(helper.success.mock.calls[0][1]).toEqual([
      { name: 'OPEN_PIXEL_ART_PR_NUMBER', value: '12' },
    ]);

    fetch.mockResolvedValueOnce(response(200, { user: { login: 'someone' } }));
    helper = createHelper({ env, validationFields: fields });
    await validator('09_make_pr')(helper);
    expect(helper.fail.mock.calls[0][0]).toMatch(/doesn't belong to your GitHub user/);

    fetch.mockResolvedValueOnce(response(404, {}));
    helper = createHelper({ env, validationFields: fields });
    await validator('09_make_pr')(helper);
    expect(helper.fail.mock.calls[0][0]).toMatch(/could not find the Pull Request #12/);
  });

  test('11_check_merge: merged succeeds; open and closed-unmerged fail', async () => {
    const env = { TQ_OPEN_PIXEL_ART_PR_NUMBER: '5' };
    fetch.mockResolvedValueOnce(response(200, { state: 'closed', merged: true }));
    let helper = createHelper({ env });
    await validator('11_check_merge')(helper);
    expect(helper.success).toHaveBeenCalledTimes(1);

    fetch.mockResolvedValueOnce(response(200, { state: 'open', merged: false }));
    helper = createHelper({ env });
    await validator('11_check_merge')(helper);
    expect(helper.fail.mock.calls[0][0]).toMatch(/has not been merged yet/);

    fetch.mockResolvedValueOnce(response(200, { state: 'closed', merged: false }));
    helper = createHelper({ env });
    await validator('11_check_merge')(helper);
    expect(helper.fail.mock.calls[0][0]).toMatch(/closed without being merged/);
  });

  test('12_merge_another: merged own PR succeeds; missing PR and invalid JSON fail', async () => {
    const env = { TQ_GITHUB_USERNAME: 'octo' };
    const fields = { prNumber: '3', repositoryOwner: 'acme', repository: 'tool' };
    fetch.mockResolvedValueOnce(
      response(200, { state: 'closed', merged: true, user: { login: 'octo' } })
    );
    let helper = createHelper({ env, validationFields: fields });
    await validator('12_merge_another')(helper);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/acme/tool/pulls/3'
    );
    expect(helper.success).toHaveBeenCalledTimes(1);

    fetch.mockResolvedValueOnce(response(404, {}));
    helper = createHelper({ env, validationFields: fields });
    await validator('12_merge_another')(helper);
    expect(helper.fail.mock.calls[0][0]).toMatch(/could not find the Pull Request #3/);

    fetch.mockResolvedValueOnce({
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    });
    helper = createHelper({ env, validationFields: fields });
    await validator('12_merge_another')(helper);
    expect(helper.fail.mock.calls[0][0]).toMatch(/Something went wrong[\s\S]*SyntaxError/);
  });
});

describe('git validators (child_process -> helper.exec)', () => {
  const GIT = '/usr/bin/git';

  test('03_install_git: exit 0 succeeds with the version and GIT_EXE', async () => {
    const helper = createHelper({
      validationFields: { gitPath: GIT },
      execResults: [ok('git version 2.40.0\n')],
    });
    await validator('03_install_git')(helper);
    expect(helper.exec).toHaveBeenCalledWith(GIT, ['--version']);
    expect(helper.success.mock.calls[0][0]).toContain('git version 2.40.0');
    expect(helper.success.mock.calls[0][1]).toEqual([{ name: 'GIT_EXE', value: GIT }]);
  });

  test('03_install_git: non-zero exit fails, invalid executable fails', async () => {
    let helper = createHelper({
      validationFields: { gitPath: GIT },
      execResults: [{ code: 1, stdout: '', stderr: 'boom' }],
    });
    await validator('03_install_git')(helper);
    expect(helper.fail.mock.calls[0][0]).toMatch(/non-zero exit code/);

    helper = createHelper({
      validationFields: { gitPath: GIT },
      executableValid: [false, 'The path you provided does not exist!'],
    });
    await validator('03_install_git')(helper);
    expect(helper.exec).not.toHaveBeenCalled();
    expect(helper.fail).toHaveBeenCalledWith('The path you provided does not exist!');
  });

  test('03b_configure_git: config --list with user.name and user.email', async () => {
    const helper = createHelper({
      env: { TQ_GIT_EXE: GIT },
      execResults: [ok('user.name=Octo Cat\nuser.email=o@example.com\n')],
    });
    await validator('03b_configure_git')(helper);
    expect(helper.exec).toHaveBeenCalledWith(GIT, ['config', '--list'], {});
    expect(helper.success.mock.calls[0][1]).toEqual([
      { name: 'LOCAL_GIT_USER_NAME', value: 'Octo Cat' },
    ]);
  });

  test('03b_configure_git: missing email fails; non-zero exit is reported', async () => {
    let helper = createHelper({
      env: { TQ_GIT_EXE: GIT },
      execResults: [ok('user.name=Octo\n')],
    });
    await validator('03b_configure_git')(helper);
    expect(helper.fail).toHaveBeenCalledWith(
      'We did not find your email configured correctly!'
    );

    helper = createHelper({
      env: { TQ_GIT_EXE: GIT },
      execResults: [{ code: 128, stdout: '', stderr: 'fatal: bad' }],
    });
    await validator('03b_configure_git')(helper);
    expect(helper.fail.mock.calls[0][0]).toMatch(
      /Something went wrong while trying to validate your git configuration![\s\S]*Command failed: "\/usr\/bin\/git" config --list\nfatal: bad/
    );
  });

  test('objectiveValidation: refuses a missing or quoted TQ_GIT_EXE', async () => {
    const { execGitWithArgs } = require(path.join(
      PACKAGE_PATH,
      'scripts',
      'objectiveValidation.js'
    ));
    await expect(execGitWithArgs(createHelper(), ['status'])).rejects.toThrow(
      /do not have a value for the environment variable/
    );
    await expect(
      execGitWithArgs(createHelper({ env: { TQ_GIT_EXE: '"/usr/bin/git"' } }), ['status'])
    ).rejects.toThrow(/no longer requires you to surround/);
  });

  test('05_git_branch: checked-out branch succeeds; not checked out and missing fail', async () => {
    const env = { TQ_GIT_EXE: GIT, TQ_OPEN_PIXEL_ART_DIR: '/repo' };
    const fields = { branchName: 'feat' };
    let helper = createHelper({ env, validationFields: fields, execResults: [ok('* feat\n')] });
    await validator('05_git_branch')(helper);
    expect(helper.exec).toHaveBeenCalledWith(GIT, ['branch', '--list', 'feat'], { cwd: '/repo' });
    expect(helper.success.mock.calls[0][1]).toEqual([
      { name: 'OPEN_PIXEL_ART_BRANCH', value: 'feat' },
    ]);

    helper = createHelper({ env, validationFields: fields, execResults: [ok('  feat\n')] });
    await validator('05_git_branch')(helper);
    expect(helper.fail.mock.calls[0][0]).toMatch(/haven't checked it out yet/);

    helper = createHelper({ env, validationFields: fields, execResults: [ok('')] });
    await validator('05_git_branch')(helper);
    expect(helper.fail.mock.calls[0][0]).toMatch(/couldn't find the branch named "feat"/);
  });

  test('06b_commit_hash: author present succeeds, absent fails', async () => {
    const env = { TQ_GIT_EXE: GIT, TQ_OPEN_PIXEL_ART_DIR: '/repo', TQ_LOCAL_GIT_USER_NAME: 'Octo' };
    let helper = createHelper({
      env,
      validationFields: { commitHash: 'abc123' },
      execResults: [ok('commit abc123\nAuthor: Octo <o@x>\n')],
    });
    await validator('06b_commit_hash')(helper);
    expect(helper.exec).toHaveBeenCalledWith(GIT, ['show', 'abc123'], { cwd: '/repo' });
    expect(helper.success).toHaveBeenCalledTimes(1);

    helper = createHelper({
      env,
      validationFields: { commitHash: 'abc123' },
      execResults: [ok('Author: Other\n')],
    });
    await validator('06b_commit_hash')(helper);
    expect(helper.fail.mock.calls[0][0]).toMatch(/does not have your local git user "Octo"/);
  });

  test('07b_merge_master: master commit contained in the branch succeeds', async () => {
    const env = { TQ_GIT_EXE: GIT, TQ_OPEN_PIXEL_ART_DIR: '/repo', TQ_OPEN_PIXEL_ART_BRANCH: 'feat' };
    let helper = createHelper({ env, execResults: [ok('deadbeef'), ok('* feat\n  master\n')] });
    await validator('07b_merge_master')(helper);
    expect(helper.exec).toHaveBeenNthCalledWith(
      1,
      GIT,
      ['log', 'master', '-n', '1', '--pretty=format:%H'],
      { cwd: '/repo' }
    );
    expect(helper.exec).toHaveBeenNthCalledWith(
      2,
      GIT,
      ['branch', '--contains', 'deadbeef'],
      { cwd: '/repo' }
    );
    expect(helper.success).toHaveBeenCalledTimes(1);

    helper = createHelper({ env, execResults: [ok('deadbeef'), ok('  master\n')] });
    await validator('07b_merge_master')(helper);
    expect(helper.fail.mock.calls[0][0]).toMatch(/wasn't found in your branch "feat"/);
  });

  describe('07_sync_master (git remote + GitHub API)', () => {
    const env = { TQ_GIT_EXE: GIT, TQ_OPEN_PIXEL_ART_DIR: '/repo', TQ_GITHUB_USERNAME: 'octo' };
    const remotes = ok(
      'upstream\thttps://github.com/twilio-labs/open-pixel-art.git (fetch)\nupstream\thttps://github.com/twilio-labs/open-pixel-art.git (push)\n'
    );

    test('same sha succeeds, different sha fails', async () => {
      fetch
        .mockResolvedValueOnce(response(200, { commit: { sha: 'a' } }))
        .mockResolvedValueOnce(response(200, { commit: { sha: 'a' } }));
      let helper = createHelper({ env, execResults: [remotes] });
      await validator('07_sync_master')(helper);
      expect(helper.exec).toHaveBeenCalledWith(GIT, ['remote', '-v'], { cwd: '/repo' });
      expect(helper.success).toHaveBeenCalledTimes(1);

      fetch
        .mockResolvedValueOnce(response(200, { commit: { sha: 'a' } }))
        .mockResolvedValueOnce(response(200, { commit: { sha: 'b' } }));
      helper = createHelper({ env, execResults: [remotes] });
      await validator('07_sync_master')(helper);
      expect(helper.fail.mock.calls[0][0]).toMatch(/are out of sync/);
    });

    test('player repository missing fails with the status', async () => {
      fetch
        .mockResolvedValueOnce(response(200, { commit: { sha: 'a' } }))
        .mockResolvedValueOnce(response(404, {}, 'Not Found'));
      const helper = createHelper({ env, execResults: [remotes] });
      await validator('07_sync_master')(helper);
      expect(helper.fail.mock.calls[0][0]).toMatch(
        /couldn't find the "open-pixel-art" repository for your user "octo"![\s\S]*404 Not Found/
      );
    });

    test('missing upstream remote fails before any request', async () => {
      const helper = createHelper({ env, execResults: [ok('origin\thttps://x (fetch)\n')] });
      await validator('07_sync_master')(helper);
      expect(fetch).not.toHaveBeenCalled();
      expect(helper.fail.mock.calls[0][0]).toMatch(/didn't find a local remote named "upstream"/);
    });
  });
});

describe('file validators (fs-jetpack -> helper.fs)', () => {
  const REPO = path.join('/repo');
  const PKG = path.join(REPO, 'package.json');
  const PIXELS = path.join(REPO, '_data', 'pixels.json');

  test('04_git_clone: open-pixel-art repository succeeds', async () => {
    const helper = createHelper({
      validationFields: { repositoryFilePath: REPO },
      fsEntries: {
        [REPO]: { type: 'dir' },
        [PKG]: { type: 'file', content: { name: 'open-pixel-art' } },
      },
    });
    await validator('04_git_clone')(helper);
    expect(helper.fs.readAsync).toHaveBeenCalledWith(PKG, 'json');
    expect(helper.success).toHaveBeenCalledWith(
      "It looks like you've cloned the Open Pixel Art repository correctly!",
      [{ name: 'OPEN_PIXEL_ART_DIR', value: REPO }]
    );
  });

  test('04_git_clone: missing directory, missing package and wrong package fail', async () => {
    let helper = createHelper({ validationFields: { repositoryFilePath: REPO } });
    await validator('04_git_clone')(helper);
    expect(helper.fail.mock.calls[0][0]).toMatch(/could not find a directory at the path/);

    helper = createHelper({
      validationFields: { repositoryFilePath: REPO },
      fsEntries: { [REPO]: { type: 'dir' } },
    });
    await validator('04_git_clone')(helper);
    expect(helper.fail.mock.calls[0][0]).toMatch(/could not find the package file/);

    helper = createHelper({
      validationFields: { repositoryFilePath: REPO },
      fsEntries: {
        [REPO]: { type: 'dir' },
        [PKG]: { type: 'file', content: { name: 'other' } },
      },
    });
    await validator('04_git_clone')(helper);
    expect(helper.fail.mock.calls[0][0]).toMatch(/not for the correct project/);
  });

  test('06_make_edits: pixel present and committed succeeds', async () => {
    const helper = createHelper({
      env: {
        TQ_GIT_EXE: '/usr/bin/git',
        TQ_OPEN_PIXEL_ART_DIR: REPO,
        TQ_LOCAL_GIT_USER_NAME: 'Octo Cat',
        TQ_GITHUB_USERNAME: 'octo',
      },
      fsEntries: {
        [PIXELS]: { type: 'file', content: { data: [{ username: 'OCTO' }] } },
      },
      execResults: [ok('commit 1\nAuthor: octo cat <o@x>\n')],
    });
    await validator('06_make_edits')(helper);
    expect(helper.exec).toHaveBeenCalledWith(
      '/usr/bin/git',
      ['log', '_data/pixels.json'],
      { cwd: REPO }
    );
    expect(helper.success).toHaveBeenCalledWith(
      "It looks like you've correctly added and committed your new pixel!"
    );
  });

  test('06_make_edits: missing pixel, missing file and missing commit fail', async () => {
    const env = {
      TQ_GIT_EXE: '/usr/bin/git',
      TQ_OPEN_PIXEL_ART_DIR: REPO,
      TQ_LOCAL_GIT_USER_NAME: 'Octo Cat',
      TQ_GITHUB_USERNAME: 'octo',
    };
    let helper = createHelper({ env });
    await validator('06_make_edits')(helper);
    expect(helper.fail.mock.calls[0][0]).toMatch(/could not find the pixels.json file/);

    helper = createHelper({
      env,
      fsEntries: { [PIXELS]: { type: 'file', content: { data: [{ username: 'x' }] } } },
    });
    await validator('06_make_edits')(helper);
    expect(helper.fail.mock.calls[0][0]).toMatch(/didn't find a pixel in the _data\/pixels.json/);

    helper = createHelper({
      env,
      fsEntries: { [PIXELS]: { type: 'file', content: { data: [{ username: 'octo' }] } } },
      execResults: [ok('Author: somebody else\n')],
    });
    await validator('06_make_edits')(helper);
    expect(helper.fail.mock.calls[0][0]).toMatch(/didn't find a commit with your git username/);
  });
});
