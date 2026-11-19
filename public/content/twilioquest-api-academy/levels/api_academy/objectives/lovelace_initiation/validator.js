module.exports = async helper => {
  const answer1 = helper.getNormalizedInput("answer1");
  const answer2 = helper.getNormalizedInput("answer2");

  if (answer1 === "" || answer2 === "") {
    return helper.fail(
      helper.t("missingAnswers", "\n      Please answer both questions!\n    ")
    );
  }

  if (answer1 !== "http") {
    return helper.fail(
      helper.t(
        "incorrectFirst",
        "\n      The first answer is incorrect - the acronym for this protocol is the first\n      four letters you type into the address bar when you enter the URL for a\n      website in your browser.\n    "
      )
    );
  }

  if (answer2.indexOf("header") < 0) {
    return helper.fail(
      helper.t(
        "incorrectSecond",
        '\n      The second answer is incorrect - the name for these extra pieces of \n      information that go along with web requests is perhaps the opposite of \n      "footer".\n    '
      )
    );
  }

  return helper.success(
    helper.t(
      "success",
      "\n    You've got it! You've opened the chest of knowledge for House Lovelace.\n  "
    )
  );
};
