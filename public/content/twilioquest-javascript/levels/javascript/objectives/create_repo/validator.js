const path = require('path');

module.exports = async helper => {
  try {
    const { TQ_JAVASCRIPT_WORKSPACE_PATH } = helper.env;

    try {
      if (!(await helper.commandExists('git'))) {
        throw new Error('not found: git');
      }
    } catch (err) {
      helper.fail(`
        We tried to find a local "git" installation on your computer, but we could not!

        ${err}
      `);
      return;
    }

    // `git rev-parse` instead of an fs check of "<workspace>/.git": the fs scope
    // granted for a chosen folder does not match a leading-dot name.
    let gitDir;
    let gitDetail = '';
    try {
      const revParse = await helper.exec('git', ['rev-parse', '--git-dir'], {
        cwd: TQ_JAVASCRIPT_WORKSPACE_PATH,
      });
      if (revParse.code === 0) {
        gitDir = revParse.stdout.trim();
      } else if (!/not a git repository/i.test(revParse.stderr)) {
        // "not a git repository" is the ordinary "not initialized yet" case;
        // anything else (for example "dubious ownership") explains itself.
        gitDetail = revParse.stderr.trim();
      }
    } catch (err) {
      gitDetail = String(err);
    }

    if (gitDir !== '.git') {
      helper.fail(
        `We didn't find a .git directory in your JavaScript workspace directory! -> ${path.join(
          TQ_JAVASCRIPT_WORKSPACE_PATH,
          '.git'
        )}${gitDetail ? `\n\n${gitDetail}` : ''}`
      );
      return;
    }

    const gitStatus = await helper.exec('git', ['status'], {
      cwd: TQ_JAVASCRIPT_WORKSPACE_PATH,
    });

    // A non-zero exit rejected before (child_process.exec); keep that.
    if (gitStatus.code !== 0) {
      throw new Error(`Command failed: git status\n${gitStatus.stderr}`);
    }

    const status = gitStatus.stdout;

    if (status.includes('No commits yet')) {
      helper.fail(`
        It looks like your git repository doesn't have an initial commit yet. Add all the files in your repository with "git add -A" and then commit them with "git commit".
      `);
      return;
    }

    helper.success(`
      You've succesfully created and enabled a git repository for your JavaScript workspace. Be sure to keep commiting your work as you go so you can look back on it!
    `);
  } catch (e) {
    helper.fail(`
      Something went wrong when we tried to validate your git repository exists!

      ${e}
    `);
  }
};
