const assert = require("assert");

// The message SID is only checked for its format. It is NOT looked up through
// the Twilio API (the game no longer depends on the `twilio` package or on
// network access to Twilio for this objective).
const MESSAGE_SID_FORMAT = /^(SM|MM)[0-9a-f]{32}$/i;

module.exports = async (helper) => {
  const answer1 = helper.getNormalizedInput('answer1');
  const answer2 = helper.getNormalizedInput('answer2');
  const { answer3:messageSid } = helper.validationFields;

  if (answer1 === '' || answer2 === '' || !messageSid) {
    return helper.fail(`
      Please answer all the challenge questions!
    `);
  }

  if (answer1 !== "true") {
    return helper.fail(`
      The first challenge question is true: requests to the Twilio Programmable SMS API do require authentication. To make a request, you must include your Account SID and your Auth Token.
    `);
  }

  if (answer2 !== 'to' ) {
    return helper.fail(`
      You've almost got the second challenge question! The third required parameter to create a message with Twilio Programmable SMS is \`To\`. This parameter lets the API know who the message should be sent to.
    `);
  }

  if (!MESSAGE_SID_FORMAT.test(messageSid)) {
    return helper.fail(`Uh oh: that doesn't look like a message SID. A message SID starts with "SM" or "MM" followed by 32 hexadecimal characters.`);
  }

  return helper.success(`
    You've got it! You've wielded the power of APIs to create a message with Twilio Programmable SMS and cURL! You've obtained the Lovelace Key Spell Component.
  `);
};
