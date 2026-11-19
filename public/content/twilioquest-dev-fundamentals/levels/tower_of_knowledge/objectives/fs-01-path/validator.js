module.exports = async function (helper) {
  try {
    const filePath = helper.getNormalizedInput("filePath", {
      lowerCase: false,
    });

    if (!filePath) {
      helper.fail(
        helper.t(
          "missingInput",
          "You need to provide a file path in the Hack Interface!"
        )
      );
      return;
    }

    const pathParts = helper.getFilePathPartsArray(filePath);
    const expectedPathParts = ["cedric", "robot_thoughts", "youtube_video.mp4"];

    if (!helper.areArrayContentsEqual(pathParts, expectedPathParts)) {
      helper.fail(
        helper.t(
          "incorrectPath",
          'Your entered file path "{{filePath}}" did not match the expected path to Cedric\'s YouTube video file "{{expectedPath}}".',
          {
            filePath,
            expectedPath: helper.formatPathPartsForOs(...expectedPathParts),
          }
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
      "\n  You found Cedric's YouTube video! He'll be delighted to hear about this!\n"
    )
  );
};
