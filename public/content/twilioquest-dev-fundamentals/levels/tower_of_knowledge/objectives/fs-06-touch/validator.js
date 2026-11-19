const path = require("path");

// Node's existsSync equivalent: helper.fs.existsAsync resolves false for a
// missing path, otherwise "dir" | "file" | "other".
const exists = async (helper, filePath) =>
  (await helper.fs.existsAsync(filePath)) !== false;

module.exports = async function (helper) {
  const { TQ_DEV_FUNDAMENTALS_FILE_SYSTEM_NEW_DIR } = helper.env;
  const newFileName = helper.getNormalizedInput("newFileName", {
    lowerCase: false,
  });
  const newFilePath = path.join(
    TQ_DEV_FUNDAMENTALS_FILE_SYSTEM_NEW_DIR,
    newFileName
  );

  try {
    if (!newFileName) {
      helper.fail(
        helper.t(
          "missingInput",
          "You must provide the name of your newly created file!"
        )
      );
      return;
    }

    if (!(await exists(helper, newFilePath))) {
      helper.fail(
        helper.t(
          "missingFile",
          'TwilioQuest could not find the file "{{newFileName}}" in "{{directory}}"! Make sure your newly created file is in the right directory!',
          { newFileName, directory: TQ_DEV_FUNDAMENTALS_FILE_SYSTEM_NEW_DIR }
        )
      );
      return;
    }

    const fileStats = await helper.fs.lstat(newFilePath);

    if (!fileStats.isFile()) {
      helper.fail(
        helper.t(
          "incorrectEntryType",
          'TwilioQuest found "{{newFileName}}" in "{{directory}}", but it isn\'t a file! Double check that you\'re using the right command when making your file!',
          { newFileName, directory: TQ_DEV_FUNDAMENTALS_FILE_SYSTEM_NEW_DIR }
        )
      );
      return;
    }
  } catch (err) {
    helper.fail(
      helper.t(
        "validationError",
        "TwilioQuest ran into an issue when checking for your newly created file!\n      \n      {{error}}",
        { error: err }
      )
    );
    return;
  }

  helper.success(
    helper.t(
      "success",
      "TwilioQuest was able to find your newly created file! Good job!"
    ),
    [
      {
        name: "DEV_FUNDAMENTALS_FILE_SYSTEM_NEW_FILE",
        value: newFilePath,
      },
    ]
  );
};
