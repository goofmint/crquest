module.exports = async helper => {
  const answer1 = helper.getNormalizedInput("answer1");
  const answer2 = helper.getNormalizedInput("answer2");
  const answer3 = helper.getNormalizedInput("answer3");

  if (answer1 === "" || answer2 === "" || answer3 === "") {
    return helper.fail(
      helper.t(
        "missingAnswers",
        "\n      Please answer all of the challenge questions!\n    "
      )
    );
  }

  // if (!answer1.includes('message') && !answer1.includes('media') && !answer1.includes('service')) {
  //   return helper.fail(`
  //     The first answer is incorrect.
  //   `);
  // }

  if (answer1 !== "software development kit") {
    return helper.fail(
      helper.t(
        "incorrectFirst",
        "\n      The correct answer to the first challenge question is Software Development Kit.\n    "
      )
    );
  }

  if (answer2 !== "b") {
    return helper.fail(
      helper.t(
        "incorrectSecond",
        "\n      The second challenge question is incorrect, Twilio does offer a server-side helper library for users of that programming language.\n    "
      )
    );
  }

  if (answer3 !== "true") {
    return helper.fail(
      helper.t(
        "incorrectThird",
        "\n      The third challenge question is ncorrect, libraries do make working with APIs easier by handling common and repetitive low-level interactions with the server.\n    "
      )
    );
  }

  // if (!answer2 || answer2 !== 'body') {
  //   return helper.fail(`
  //     The second answer is incorrect.
  //   `);
  // }

  return helper.success(
    helper.t(
      "success",
      "\n    You've got it! You've received your House Turing Key Spell Component!\n  "
    )
  );
};
