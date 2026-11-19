module.exports = async helper => {
  const answer1 = helper.getNormalizedInput("answer1");
  const answer2 = helper.getNormalizedInput("answer2");

  if (!answer1 || !answer2) {
    return helper.fail(
      helper.t("missingAnswers", "Please provide an answer to both questions!")
    );
  }

  if (answer1 !== "interface") {
    return helper.fail(
      helper.t("incorrectFirst", "The first answer is incorrect.")
    );
  }

  if (answer2.indexOf("touppercase") !== 0) {
    return helper.fail(
      helper.t(
        "incorrectSecond",
        '\n      The second answer is incorrect - In JavaScript, a function is invoked by \n      using the "." operator after a\n      variable that references an object, and then is invoked with an open \n      and closed parentheses "()". Objects provide an API through these kinds\n      of functions. What is the name of the API function used in the example,\n      which translates the string to all uppercase characters?\n    '
      )
    );
  }

  return helper.success(
    helper.t(
      "success",
      "\n    You've got it! You've opened the chest of knowledge for House Turing.\n  "
    )
  );
};
