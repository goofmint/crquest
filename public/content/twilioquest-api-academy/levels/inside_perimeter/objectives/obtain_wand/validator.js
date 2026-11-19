module.exports = async helper => {
  const answer1 = helper.getNormalizedInput("answer1");
  const answer2 = helper.getNormalizedInput("answer2");

  if (answer1 === "" || answer2 === "") {
    return helper.fail(
      helper.t(
        "missingAnswers",
        "\n      Please answer both challenge questions!\n    "
      )
    );
  }

  if (
    !answer1.includes("message") &&
    !answer1.includes("media") &&
    !answer1.includes("service")
  ) {
    return helper.fail(
      helper.t(
        "incorrectFirst",
        "\n      The first challenge question is incorrect.\n    "
      )
    );
  }

  if (!answer2 || answer2 !== "body") {
    return helper.fail(
      helper.t(
        "incorrectSecond",
        "\n      The second challenge question is incorrect.\n    "
      )
    );
  }

  return helper.success(
    helper.t(
      "success",
      "\n    You've got it! You've opened the chest and received your wand, you can now learn spells and perform them around the grounds of the API Academy!\n  "
    )
  );
};
