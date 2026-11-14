const { MAGIC_API_ENDPOINT } = require("../../../../scripts/config");

module.exports = async function (helper) {
  try {
    const { magicalPhrase } = helper.validationFields;
    const response = await fetch(MAGIC_API_ENDPOINT);
    const correctMagicPhrase = await response.text();

    if (!magicalPhrase) {
      return helper.fail(
        "TwilioQuest couldn't find your magical phrase! Make sure it's pasted in the input and try again!"
      );
    }

    if (magicalPhrase.toLowerCase() !== correctMagicPhrase.toLowerCase()) {
      return helper.fail(
        `The magical phrase "${magicalPhrase}" does not match the "${correctMagicPhrase}" that was expected. Make sure you're fetching from the correct endpoint and try again!`
      );
    }

    helper.success(
      "TwilioQuest found your magical phrase and verified it's authenticity with the academy. Great work!"
    );
  } catch (err) {
    helper.fail(err);
    return;
  }
};
