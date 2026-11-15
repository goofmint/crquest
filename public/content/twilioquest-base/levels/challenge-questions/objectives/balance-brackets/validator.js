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
          learnerFunction = balanceBrackets;
        } catch (error) {
          learnerFunction = undefined;
        }

        if (!learnerFunction) {
          fail("The function balanceBrackets is not defined!");
        }

        const test = assertTestCase(learnerFunction);

        test(["{", "}"], true);
        test(["[", "(", "]", ")"], false);
        test([], true);
        test(["{", "[", "}"], false);
        test(["]", "(", ")", "["], false);
        test(["(", ")", "[", "(", "{", "}", ")", "]"], true);

        return { outcome: "ok" };
      },
      {},
      "balance-brackets"
    );
  } catch (err) {
    helper.fail(err);
    return;
  }

  helper.success("You did it!");
};
