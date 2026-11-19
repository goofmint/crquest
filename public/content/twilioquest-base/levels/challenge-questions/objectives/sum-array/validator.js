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
          learnerFunction = sumArray;
        } catch (error) {
          learnerFunction = undefined;
        }

        if (!learnerFunction) {
          fail(undefinedFunction);
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
      {
        mismatch: helper.t("mismatch", 'Expected "{{expected}}" from input "{{input}}", but received "{{received}}".'),
        undefinedFunction: helper.t("undefinedFunction", "The function sumArray is not defined!"),
      },
      "sum-array"
    );
  } catch (err) {
    helper.fail(err);
    return;
  }

  helper.success(helper.t("success", "You did it!"));
};
