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

    const gitDirPath = path.join(TQ_JAVASCRIPT_WORKSPACE_PATH, '.git');
    const gitRepoExists = await helper.fs.existsAsync(gitDirPath);

    if (gitRepoExists !== 'dir') {
      helper.fail(
        `We didn't find a .git directory in your JavaScript workspace directory! -> ${gitDirPath}`
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
