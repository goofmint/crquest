module.exports = async helper => {
  const answer1 = helper.getNormalizedInput("answer1");
  const answer2 = helper.getNormalizedInput("answer2");

  if (answer1 === "" || answer2 === "") {
    return helper.fail(
      helper.t("missingAnswers", "\n      Please answer both questions!\n    ")
    );
  }

  if (answer1 !== "false") {
    return helper.fail(
      helper.t(
        "incorrectFirst",
        "\n      The first answer is incorrect - remote APIs make use of computational\n      resources and code that may reside on other computers (servers) on a\n      network.\n    "
      )
    );
  }

  if (!answer2 || answer2 !== "rest") {
    return helper.fail(
      helper.t(
        "incorrectSecond",
        '\n      The second answer is incorrect - the expanded version of the acronym we \n      are looking for is "Respresentational State Transfer". Check Craig\'s \n      video one more time for the four-letter acronym.\n    '
      )
    );
  }

  return helper.success(
    helper.t(
      "success",
      "\n    You've got it! You've opened the chest of knowledge for House Hopper.\n  "
    )
  );
};
