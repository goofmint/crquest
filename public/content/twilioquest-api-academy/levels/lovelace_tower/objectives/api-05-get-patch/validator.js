const { DIVINATION_API_ENDPOINT } = require("../../../../scripts/config");
const assert = require("assert");

const assertTestCase = (testFunction, helper) => async (input) => {
  await testFunction(input);

  // Marvel Johnson [12/14/2022] The fetchOverride method is temporary and used as a workaround to a bug in the endpoint
  // utilized for this objective. See the ValidationHelper class in the twilio/twilioquest repo for more info
  const response = await helper.fetchOverride(
    `${DIVINATION_API_ENDPOINT}?target=lovelace_secret_statue&guid=${input}`
  );
  let patchedInscription = await response.json();

  if (patchedInscription.errorMessage) {
    assert.fail(patchedInscription.errorMessage);
  }

  if (!patchedInscription.data.operational) {
    assert.fail(
      "Your patched inscription is still corrupted! Double check what you're sending and try again."
    );
  }
};

function generateRandomID() {
  // https://dev.to/rahmanfadhil/how-to-generate-unique-id-in-javascript-1b13#:~:text=const%20uid%20%3D%20()%20%3D%3E%0A%20%20String(%0A%20%20%20%20Date.now().toString(32)%20%2B%0A%20%20%20%20%20%20Math.random().toString(16)%0A%20%20).replace(/%5C./g%2C%20%27%27)
  let randomID =
    Date.now().toString(32) + Math.random().toString(16).replace(/\./g, "");

  return randomID;
}

module.exports = async function (helper) {
  let context;

  try {
    context = await helper.pullVarsFromQuestIdeUserCodeLocalScope(
      ["getAndPatchCorruptedInscription"],
      "api-05-get-patch"
    );

    assert(
      context.getAndPatchCorruptedInscription,
      "The function getAndPatchCorruptedInscription is not defined!"
    );

    const test = assertTestCase(
      context.getAndPatchCorruptedInscription,
      helper
    );
    const randomID = generateRandomID();
    await test(randomID);
  } catch (err) {
    helper.fail(err);
    return;
  }

  helper.success("Nice going!");
};
