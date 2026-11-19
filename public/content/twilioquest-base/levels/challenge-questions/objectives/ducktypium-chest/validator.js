module.exports = async function (helper) {
  try {
    const words = helper.getNormalizedInput("words");
    const correctWordOrder = ["jah", "vuh", "skrept"];
    const validWords = ["skrept", "jah", "vuh"];
    const playerWords = words.split(" ");

    if (playerWords.length === 1 && playerWords[0] === "") {
      helper.fail(helper.t(
        "missingWords",
        "There does not seem to be any words here! There should be a single string separated by spaces. Like this: '{{words}}'.",
        { words: validWords.join(" ") }
      ));
      return;
    }

    if (playerWords.length !== correctWordOrder.length) {
      helper.fail(helper.t(
        "missingSomeWords",
        "One or more words is missing! You must use all three of the following words: {{words}}",
        { words: validWords.join(", ") }
      ));
      return;
    }
    
    // Checking to see if any words provided by the player are invalid
    if (playerWords.some(word => !validWords.includes(word))) {
      helper.fail(helper.t(
        "invalidWords",
        "Not all of your words are valid! The only valid words are: {{words}}.",
        { words: validWords.join(" ") }
      ));
        return;
    }

    if (!correctWordOrder.every((word, idx) => word === playerWords[idx])) {
      helper.fail(helper.t("incorrectOrder", "The words do not seem to be in the correct order!"));
      return;
    }
  } catch (err) {
    helper.fail(err);
    return;
  }

  helper.success(helper.t("success", "You did it!"));
};
