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
          learnerFunction = sumArray;
        } catch (error) {
          learnerFunction = undefined;
        }

        if (!learnerFunction) {
          fail("The function sumArray is not defined!");
        }

        const test = assertTestCase(learnerFunction);

        test([1, 2, 3], 6);
        test([-1, 0, 1], 0);
        test([1.2, 2.3, 4], 7.5);
        test([1, 1, 2, 3, 5, 8, 13], 33);
        test([], 0);
        test([3], 3);

        return { outcome: "ok" };
      },
      {},
      "sum-array"
    );
  } catch (err) {
    helper.fail(err);
    return;
  }

  helper.success("You did it!");
};
