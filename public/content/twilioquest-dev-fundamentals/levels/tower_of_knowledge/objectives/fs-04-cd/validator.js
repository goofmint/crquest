module.exports = async function (helper) {
  try {
    const pwd1 = helper.getNormalizedInput("pwd1", {
      lowerCase: false,
    });
    const pwd2 = helper.getNormalizedInput("pwd2", {
      lowerCase: false,
    });

    if (!pwd1) {
      helper.fail(
        helper.t(
          "missingFirstPath",
          "You need to provide a file path for the <em>first</em> present working directory in the Hack Interface!"
        )
      );
      return;
    }

    if (!pwd2) {
      helper.fail(
        helper.t(
          "missingSecondPath",
          "You need to provide a file path for the <em>second</em> present working directory in the Hack Interface!"
        )
      );
      return;
    }

    const pathParts1 = helper.getFilePathPartsArray(pwd1);
    const expectedPathParts1 = ["cedric", "robot_thoughts"];

    if (!helper.areArrayContentsEqual(pathParts1, expectedPathParts1)) {
      helper.fail(
        helper.t(
          "incorrectFirstPath",
          'Your entered file path "{{pwd1}}" did not match the expected path after changing to the "robot_thoughts" directory.',
          { pwd1 }
        )
      );
      return;
    }

    const pathParts2 = helper.getFilePathPartsArray(pwd2);
    const expectedPathParts2 = ["cedric"];

    if (!helper.areArrayContentsEqual(pathParts2, expectedPathParts2)) {
      helper.fail(
        helper.t(
          "incorrectSecondPath",
          'Your entered file path "{{pwd2}}" did not match the expected path after trying to change to the "fog_owl_computations.csv" file.',
          { pwd2 }
        )
      );
      return;
    }
  } catch (err) {
    helper.fail(err);
    return;
  }

  helper.success(
    helper.t(
      "success",
      "\n    Hurray! You figured out the new present working directories correctly!\n"
    )
  );
};
