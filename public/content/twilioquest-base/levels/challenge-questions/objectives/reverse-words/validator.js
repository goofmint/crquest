module.exports = async function (helper) {
  try {
    // The learner's code and the test cases run in a Web Worker (functions
    // cannot leave it), so the checks run there and a failed check is thrown as
    // an error. See docs/migration/validation-helper-worker.md.
    await helper.evaluateInQuestIdeUserCodeLocalScope(
      ({ mismatch, undefinedFunction }) => {
        const fail = (message) => {
          throw new Error(message);
        };

        const assertTestCase = (testFunction) => (input, expected) => {
          const testResult = testFunction(input);
          const values = { expected, input, received: testResult };
          const message = mismatch.replace(/\{\{(expected|input|received)\}\}/g,
            (_, key) => String(values[key]));

          if (!Object.is(testResult, expected)) {
            fail(message);
          }
        };

        let learnerFunction;
        try {
          learnerFunction = reverseSentence;
        } catch (error) {
          learnerFunction = undefined;
        }

        if (!learnerFunction) {
          fail(undefinedFunction);
        }

        const test = assertTestCase(learnerFunction);

        test("You did it!", "It did you!");
        test("Apple fell far from the tree.", "Tree the from far fell apple.");
        test("Tacos in Mexico are tasty.", "Tasty are Mexico in tacos.");
        test("Hurray!", "Hurray!");

        return { outcome: "ok" };
      },
      {
        mismatch: helper.t("mismatch", 'Expected "{{expected}}" from input "{{input}}", but received "{{received}}".'),
        undefinedFunction: helper.t("undefinedFunction", "The function reverseSentence is not defined!"),
      },
      "reverse-words"
    );
  } catch (err) {
    helper.fail(err);
    return;
  }

  helper.success(helper.t("success", "You did it!"));
};
