const { DIVINATION_API_ENDPOINT } = require("../../../../scripts/config");

// Marvel Johnson [12/14/2022] A workaround to a validation bug which lives in
// the TwilioQuest-Server's /magic route. It fakes the requests that include the
// queried divination endpoint and treats all others normally (i.e. by using the
// regular fetch implementation). It used to be `ValidationHelper.fetchOverride`
// (which the learner's `fetch` and this validator went through); it now lives
// here because the learner's code runs in a Web Worker, where it is installed as
// the global `fetch` BEFORE the learner's code runs (the `fetch` mock of
// `evaluateInQuestIdeUserCodeLocalScope`). The body is the former
// implementation, unchanged except that `this.fakeFetch` is a variable of the
// factory and `fetch(...arguments)` is `realFetch(...arguments)`.
//
// It runs in the worker, so it must be self-contained.
function createFetchOverride(realFetch) {
  let fakeFetch;

  return async function fetchOverride(
    input,
    init = { method: "GET", body: {} }
  ) {
    if (
      input &&
      input.includes(
        "https://twilio.com/quest/magic/divination?target=lovelace_secret_statue"
      )
    ) {
      if (!fakeFetch) {
        fakeFetch = {};
      }

      const response = {
        body: {
          data: {
            inscription: "",
            operational: false,
          },
        },
        // Only adding this because the player will have been introduced to it in a previous objective
        async text() {
          return this.body;
        },
        async json() {
          return this.body;
        },
      };

      const inscriptionIsCorrect = inscription => {
        const inscriptionLowercased = inscription
          .replace(/[^A-z ]/g, "")
          .toLowerCase();

        return (
          inscriptionLowercased.includes("creators of the cloud") &&
          inscriptionLowercased.includes("formed through a simple") &&
          inscriptionLowercased.includes("strung together") &&
          inscriptionLowercased.includes("requests may return") &&
          inscriptionLowercased.includes("the towers supply") &&
          inscriptionLowercased.includes("stay locked until i am able to") &&
          inscriptionLowercased.includes("magical eye")
        );
      };

      if (input.includes("guid=")) {
        const inscription = fakeFetch.inscription ? fakeFetch.inscription : "";

        if (inscriptionIsCorrect(inscription)) {
          response.body.data.operational = true;
        } else {
          response.body = {
            errorMessage:
              "The inscription is still corrupted! Double check your work and try again.",
          };
        }
      } else {
        const method = init.method.toLowerCase();

        switch (method) {
          case "patch":
            try {
              JSON.parse(init.body);
            } catch (_) {
              response.body = {
                errorMessage:
                  'Your request "body" is not JSON parsable! Double check the objective description on how to send the patch request and try again.',
              };

              return response;
            }

            const jsonBody = JSON.parse(init.body);

            if (
              jsonBody.guid === undefined ||
              jsonBody.data === undefined ||
              jsonBody.data.inscription === undefined
            ) {
              response.body = {
                errorMessage: `Your patch is missing the "${
                  jsonBody.guid === undefined
                    ? "guid"
                    : jsonBody.data === undefined
                    ? "data"
                    : jsonBody.data.inscription === undefined
                    ? "data.inscription"
                    : ""
                }" property! Double check that your formatting matches what is shown in the objective description and try again.`,
              };
            } else if (!inscriptionIsCorrect(jsonBody.data.inscription)) {
              response.body = {
                errorMessage:
                  "The inscription is still corrupted! Double check your work and try again.",
              };
            } else {
              fakeFetch.inscription = jsonBody.data.inscription;
              response.body = {
                message: "Your patch was received!",
              };
            }
            break;
          case "get":
            response.body.data.inscription = `Oh, great adGRTgfhuwef, let me apply\n\
This divination spell, newly *77hjfslkefWSghu3 phrase,\n\
Anvnteu398gtEWRbkyrU thanks to a most helpful API,\n\n\
That my LIUH4f92nfsDBHerWAGYito the knowledge I seek\n\
To open my mind to JHBUfRRE#234ijgyREvd\n\
Of resources both clear and covert.\n\n\
For the final door shall 99234jtgeRasER$TGWE49 scry\n\
The programmable answers that will remove this haze\n\
From my querent and OOIJBUe11239sdSBs.`;
            break;
          default:
            response.body = {
              errorMessage: `TwilioQuest did not expect "${method}" as the request method! Make sure you're using "PATCH" and try again.`,
            };
        }
      }

      return response;
    } else {
      return realFetch(...arguments);
    }
  };
}

function generateRandomID() {
  // https://dev.to/rahmanfadhil/how-to-generate-unique-id-in-javascript-1b13#:~:text=const%20uid%20%3D%20()%20%3D%3E%0A%20%20String(%0A%20%20%20%20Date.now().toString(32)%20%2B%0A%20%20%20%20%20%20Math.random().toString(16)%0A%20%20).replace(/%5C./g%2C%20%27%27)
  let randomID =
    Date.now().toString(32) +
    Math.random()
      .toString(16)
      .replace(/\./g, "");

  return randomID;
}

module.exports = async function(helper) {
  try {
    // The learner's code and the test case run in a Web Worker (functions
    // cannot leave it). Return validation failures to the host for translation.
    const result = await helper.evaluateInQuestIdeUserCodeLocalScope(
      async ({ endpoint, guid }) => {
        const assertTestCase = testFunction => async input => {
          await testFunction(input);

          // Marvel Johnson [12/14/2022] The fetch override is temporary and used as a workaround to a bug in the endpoint
          // utilized for this objective (see createFetchOverride in this file's validator).
          const response = await globalThis.fetch(
            `${endpoint}?target=lovelace_secret_statue&guid=${input}`
          );
          let patchedInscription = await response.json();

          if (patchedInscription.errorMessage) {
            return { apiError: String(patchedInscription.errorMessage) };
          }

          if (!patchedInscription.data.operational) {
            return { notOperational: true };
          }
          return {};
        };

        let learnerFunction;
        try {
          learnerFunction = getAndPatchCorruptedInscription;
        } catch (error) {
          learnerFunction = undefined;
        }

        if (!learnerFunction) {
          return { missing: true };
        }

        const test = assertTestCase(learnerFunction);

        return test(guid);
      },
      { endpoint: DIVINATION_API_ENDPOINT, guid: generateRandomID() },
      "api-05-get-patch",
      undefined,
      { fetch: createFetchOverride }
    );
    if (result.missing) {
      return helper.fail(
        helper.t(
          "missingFunction",
          "The function getAndPatchCorruptedInscription is not defined!"
        )
      );
    }
    if (result.notOperational) {
      return helper.fail(
        helper.t(
          "notOperational",
          "Your patched inscription is still corrupted! Double check what you're sending and try again."
        )
      );
    }
    if (result.apiError) {
      const corrupted =
        "The inscription is still corrupted! Double check your work and try again.";
      return helper.fail(
        result.apiError === corrupted
          ? helper.t("corrupted", corrupted)
          : result.apiError
      );
    }
  } catch (err) {
    helper.fail(err);
    return;
  }

  helper.success(helper.t("success", "Nice going!"));
};
