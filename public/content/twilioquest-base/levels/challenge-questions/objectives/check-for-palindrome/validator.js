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
          learnerFunction = isPalindrome;
        } catch (error) {
          learnerFunction = undefined;
        }

        if (!learnerFunction) {
          fail(undefinedFunction);
        }

        const test = assertTestCase(learnerFunction);

        test("tacocat", true);
        test("", true);
        test("heLLo", false);
        test("Never odd or even", true);

        return { outcome: "ok" };
      },
      {
        mismatch: helper.t("mismatch", 'Expected "{{expected}}" from input "{{input}}", but received "{{received}}".'),
        undefinedFunction: helper.t("undefinedFunction", "The function isPalindrome is not defined!"),
      },
      "check-for-palindrome"
    );
  } catch (err) {
    helper.fail(err);
    return;
  }

  helper.success(helper.t("success", "You did it!"));
};
