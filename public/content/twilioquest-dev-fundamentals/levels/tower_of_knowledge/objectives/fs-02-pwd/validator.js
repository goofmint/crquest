// Node's existsSync equivalent: helper.fs.existsAsync resolves false for a
// missing path, otherwise "dir" | "file" | "other".
const exists = async (helper, filePath) =>
  (await helper.fs.existsAsync(filePath)) !== false;

module.exports = async function (helper) {
  const pwd = helper.getNormalizedInput("pwd", {
    lowerCase: false,
  });

  try {
    if (!pwd) {
      helper.fail(
        helper.t(
          "missingInput",
          "You need to provide your present working directory in the Hack Interface!"
        )
      );
      return;
    }

    if (!(await exists(helper, pwd))) {
      helper.fail(
        helper.t(
          "missingPath",
          'TwilioQuest cannot locate the path you entered, "{{pwd}}", on your computer.',
          { pwd }
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
      "TwiloQuest was able to verify your present working directory! Well done!"
    ),
    [
      {
        name: "DEV_FUNDAMENTALS_FILE_SYSTEM_PWD",
        value: pwd,
      },
    ]
  );
};
