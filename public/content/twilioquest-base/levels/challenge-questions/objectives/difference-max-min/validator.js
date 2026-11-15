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

        const assertTestCase = (testFunction) => (input, expected) => {
          const testResult = testFunction(input);
          const message = `Expected "${expected}" from input "${input}", but received "${testResult}".`;

          if (!Object.is(testResult, expected)) {
            fail(message);
          }
        };

        let learnerFunction;
        try {
          learnerFunction = differenceMinMax;
        } catch (error) {
          learnerFunction = undefined;
        }

        if (!learnerFunction) {
          fail("The function differenceMinMax is not defined!");
        }

        const test = assertTestCase(learnerFunction);

        test([1, 2, 3, 4, 5], 4);
        test([100, 0], 100);
        test([3.3, 5, -2, 5], 7);
        test([8, 1.2, 5, 9], 7.8);

        return { outcome: "ok" };
      },
      {},
      "difference-max-min"
    );
  } catch (err) {
    helper.fail(err);
    return;
  }

  helper.success("You did it!");
};
