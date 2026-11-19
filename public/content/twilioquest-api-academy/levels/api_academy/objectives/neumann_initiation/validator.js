module.exports = async helper => {
  const answer1 = helper.getNormalizedInput("answer1");
  const answer2 = helper.getNormalizedInput("answer2");

  if (answer1 === "" || answer2 === "") {
    return helper.fail(
      helper.t("missingAnswers", "\n      Please answer both questions!\n    ")
    );
  }

  if (answer1 !== "resource") {
    return helper.fail(
      helper.t(
        "incorrectFirst",
        '\n      The first answer is incorrect - the name for an object that you can\n      access via HTTP in a RESTful API is the "R" in "URL".\n    '
      )
    );
  }

  if (answer2 !== "post") {
    return helper.fail(
      helper.t(
        "incorrectSecond",
        '\n      The second answer is incorrect - Craig talks about mapping "CRUD" \n      operations (Create, Read, Update, and Delete) in his video - check the\n      video out one more time to see which HTTP method is associated with \n      creation.\n    '
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
