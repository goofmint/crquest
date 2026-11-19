const assert = require("assert");

module.exports = async helper => {
  const answer1 = helper.getNormalizedInput("answer1");
  const answer2 = helper.getNormalizedInput("answer2");
  const answer3 = helper.getNormalizedInput("answer3");
  const answer4 = helper.getNormalizedInput("answer4");

  if (answer1 === "" || answer2 === "" || answer3 === "" || answer4 === "") {
    return helper.fail(
      helper.t(
        "missingAnswers",
        "\n      Please answer all the challenge questions!\n    "
      )
    );
  }

  if (answer1 !== "confirm") {
    return helper.fail(
      helper.t(
        "confirmPostman",
        "\n      Please type 'confirm' for the first challenge question to confirm you've successfully created a Postman account and opened the web interface or the app. If you're having trouble, checkout the linked video or blog content.\n    "
      )
    );
  }

  if (answer2 !== "false") {
    return helper.fail(
      helper.t(
        "incorrectSecond",
        '\n      The second challenge question is false - a Postman "collection" is a group of related HTTP requests that you can reuse easily.\n    '
      )
    );
  }

  if (answer3 !== "authorization") {
    return helper.fail(
      helper.t(
        "incorrectThird",
        "\n      The third challenge question is not quite right. Maybe the statue in the hallway can help you with this one...\n    "
      )
    );
  }

  if (answer4 !== "b") {
    return helper.fail(
      helper.t(
        "incorrectFourth",
        "\n      The fourth challenge question is incorrect. Try again.\n    "
      )
    );
  }

  return helper.success(
    helper.t(
      "success",
      "\n    You've got it! You've demonstrated how to use Postman to test APIs! You've obtained the Hopper Key Component.\n  "
    )
  );
};
