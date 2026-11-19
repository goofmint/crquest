const path = require("path");

// Node's existsSync equivalent: helper.fs.existsAsync resolves false for a
// missing path, otherwise "dir" | "file" | "other".
const exists = async (helper, filePath) =>
  (await helper.fs.existsAsync(filePath)) !== false;

// https://stackoverflow.com/questions/37521893/determine-if-a-path-is-subdirectory-of-another-in-node-js
function isPathParent(parent, potentialChild) {
  const relative = path.relative(parent, potentialChild);

  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

module.exports = async function (helper) {
  const { TQ_DEV_FUNDAMENTALS_FILE_SYSTEM_PWD } = helper.env;
  const newDirPath = helper.getNormalizedInput("newDirPath", {
    lowerCase: false,
  });

  try {
    if (!newDirPath) {
      helper.fail(
        helper.t(
          "missingInput",
          "You need to provide the path to your new directory in the Hack Interface!"
        )
      );
      return;
    }

    if (!(await exists(helper, newDirPath))) {
      helper.fail(
        helper.t(
          "missingDirectory",
          'TwilioQuest cannot locate a directory at the path you entered, "{{newDirPath}}".',
          { newDirPath }
        )
      );
      return;
    }

    if (!isPathParent(TQ_DEV_FUNDAMENTALS_FILE_SYSTEM_PWD, newDirPath)) {
      helper.fail(
        helper.t(
          "outsideWorkingDirectory",
          'TwilioQuest found your new directory "{{newDirPath}}", but it should be created within the present working directory you made previously "{{workingDirectory}}".',
          { newDirPath, workingDirectory: TQ_DEV_FUNDAMENTALS_FILE_SYSTEM_PWD }
        )
      );
      return;
    }

    const entryStats = await helper.fs.lstat(newDirPath);

    if (!entryStats.isDirectory()) {
      helper.fail(
        helper.t(
          "incorrectEntryType",
          "TwilioQuest found \"{{newDirPath}}\", but it's not a directory! Double check that you're using the correct command when making your directory!",
          { newDirPath }
        )
      );
      return;
    }
  } catch (err) {
    helper.fail(
      helper.t(
        "validationError",
        "An error occurred while TwilioQuest was trying to validate your present working directory.\n    \n    {{error}}",
        { error: err }
      )
    );
    return;
  }

  helper.success(
    helper.t(
      "success",
      "TwiloQuest was able to find your new directory! Good job!"
    ),
    [
      {
        name: "DEV_FUNDAMENTALS_FILE_SYSTEM_NEW_DIR",
        value: newDirPath,
      },
    ]
  );
};
