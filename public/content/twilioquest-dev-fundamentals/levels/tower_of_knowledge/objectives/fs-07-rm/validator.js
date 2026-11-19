const path = require("path");

// Node's existsSync equivalent: helper.fs.existsAsync resolves false for a
// missing path, otherwise "dir" | "file" | "other".
const exists = async (helper, filePath) =>
  (await helper.fs.existsAsync(filePath)) !== false;

module.exports = async function (helper) {
  const {
    TQ_DEV_FUNDAMENTALS_FILE_SYSTEM_NEW_DIR,
    TQ_DEV_FUNDAMENTALS_FILE_SYSTEM_NEW_FILE,
  } = helper.env;
  const fileName = path.basename(TQ_DEV_FUNDAMENTALS_FILE_SYSTEM_NEW_FILE);

  try {
    if (await exists(helper, TQ_DEV_FUNDAMENTALS_FILE_SYSTEM_NEW_FILE)) {
      helper.fail(
        helper.t(
          "fileStillExists",
          '"{{fileName}}" still exists in your "{{directory}}" directory! Make sure to delete the file with "rm"!',
          { fileName, directory: TQ_DEV_FUNDAMENTALS_FILE_SYSTEM_NEW_DIR }
        )
      );
      return;
    }
  } catch (err) {
    helper.fail(
      helper.t(
        "validationError",
        'An error occurred while TwilioQuest was checking for the deletion of "{{fileName}}" in "{{directory}}".\n    \n    {{error}}',
        {
          fileName,
          directory: TQ_DEV_FUNDAMENTALS_FILE_SYSTEM_NEW_DIR,
          error: err,
        }
      )
    );
    return;
  }

  helper.success(
    helper.t(
      "success",
      "TwiloQuest was able to confirm that your file was deleted. Great Work!"
    )
  );
};
