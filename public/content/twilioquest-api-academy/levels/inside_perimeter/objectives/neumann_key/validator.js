function isValidAnswer1Option(answer1, answer1OptionsMap) {
  return Object.keys(answer1OptionsMap).some(
    option =>
      option === answer1 || answer1OptionsMap[option].toLowerCase() === answer1
  );
}

module.exports = async helper => {
  const answer1 = helper.getNormalizedInput("answer1");
  const answer2 = helper.getNormalizedInput("answer2");
  const answer3 = helper.getNormalizedInput("answer3");
  const answer1OptionsMap = {
    a: "GET",
    b: "POST",
    c: "UPDATE",
    d: "DELETE",
  };

  if (!answer1 || !answer2 || !answer3) {
    return helper.fail(
      helper.t("missingAnswers", "\n      Please answer all questions!\n    ")
    );
  }

  if (!isValidAnswer1Option(answer1, answer1OptionsMap)) {
    return helper.fail(
      helper.t(
        "invalidFirst",
        '"{{answer1}}" is not a valid answer! Please choose between "a", "b", "c", and "d"!',
        { answer1 }
      )
    );
  }

  if (answer1 !== "c" && answer1 !== "update") {
    // Because of the "isValidAnswer1Option" check, we know that the player either entered a single letter answer
    // or one of the labels (i.e. GET, POST, UPDATE, DELETE). If the player typed in a letter, it'll get the correct
    // verb mapping, otherwise it'll uppercase the input.
    return helper.fail(
      helper.t(
        "incorrectFirst",
        '\n      Uh oh, the first challenge question is incorrect, "{{method}}" <b>is</b> an HTTP Method. Visit the <a href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods">MDN documentation to learn more about HTTP methods</a> or check out the information provided here in the hack interface.\n    ',
        { method: answer1OptionsMap[answer1] || answer1.toUpperCase() }
      )
    );
  }

  if (answer2 !== "get") {
    let failMessage = "";

    if (answer2 === "post")
      failMessage = helper.t(
        "postHint",
        "POST is used to submit new information to the server sent in the request payload."
      );
    if (answer2 === "put")
      failMessage = helper.t(
        "putHint",
        "PUT is used to replace a target resource on the server with new data sent in the request."
      );
    if (answer2 === "read") {
      failMessage = helper.t("readHint", "READ isn't a valid HTTP method.");
    }

    return helper.fail(
      helper.t(
        "incorrectSecond",
        '\n      The second challenge question is not quite right! {{hint}} Visit the <a href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods">MDN documentation to learn more about HTTP methods</a> or check out the information provided here in the hack interface.\n    ',
        { hint: failMessage }
      )
    );
  }

  if (answer3 !== "post") {
    return helper.fail(
      helper.t(
        "incorrectThird",
        '\n      The third challenge question is incorrect, but you can check the <a href="https://www.twilio.com/docs/sms/api/message-resource#create-a-message-resource">Twilio Programmable SMS documentation on creating a message</a> to find the answer!\n  '
      )
    );
  }

  return helper.success(
    helper.t(
      "success",
      "\n    You've got it! You've demonstrated how to achieve your goals and solve problems efficiently by using the correct HTTP method and have earned the Neumann Key Spell Component .\n  "
    )
  );
};
