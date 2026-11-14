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
      helper.fail("You must provide the name of your newly created file!");
      return;
    }

    if (!(await exists(helper, newFilePath))) {
      helper.fail(
        `TwilioQuest could not find the file "${newFileName}" in "${TQ_DEV_FUNDAMENTALS_FILE_SYSTEM_NEW_DIR}"! Make sure your newly created file is in the right directory!`
      );
      return;
    }

    const fileStats = await helper.fs.lstat(newFilePath);

    if (!fileStats.isFile()) {
      helper.fail(
        `TwilioQuest found "${newFileName}" in "${TQ_DEV_FUNDAMENTALS_FILE_SYSTEM_NEW_DIR}", but it isn't a file! Double check that you're using the right command when making your file!`
      );
      return;
    }
  } catch (err) {
    helper.fail(
      `TwilioQuest ran into an issue when checking for your newly created file!
      
      ${err}`
    );
    return;
  }

  helper.success(
    "TwilioQuest was able to find your newly created file! Good job!",
    [
      {
        name: "DEV_FUNDAMENTALS_FILE_SYSTEM_NEW_FILE",
        value: newFilePath,
      },
    ]
  );
};
