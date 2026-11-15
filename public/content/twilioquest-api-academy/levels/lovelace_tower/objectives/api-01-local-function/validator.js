module.exports = async function (helper) {
  try {
    // The learner's code and the test cases run in a Web Worker (functions
    // cannot leave it), so the checks run there and a failed check is thrown as
    // an error. See docs/migration/validation-helper-worker.md.
    await helper.evaluateInQuestIdeUserCodeLocalScope(
      () => {
        const fail = (message) => {
          throw new Error(message);
        };

        const assertTestCase =
          (testFunction) => (input1, input2, input3, expected) => {
            const testResult = testFunction(input1, input2, input3);

            if (!Object.is(testResult, expected)) {
              fail(
                `Expected "${expected}" from input "${input1}", "${input2}", and "${input3}", but received "${testResult}".`
              );
            }
          };

        let learnerFunction;
        try {
          learnerFunction = swapStrings;
        } catch (error) {
          learnerFunction = undefined;
        }

        if (!learnerFunction) {
          fail("The function swapStrings is not defined!");
        }

        const test = assertTestCase(learnerFunction);

        test(
          "foo foo foo something something bar",
          "foo",
          "bar",
          "bar bar bar something something bar"
        );

        return { outcome: "ok" };
      },
      {},
      "api-01-local-function"
    );
  } catch (err) {
    helper.fail(err);
    return;
  }

  helper.success("Great job!");
};
