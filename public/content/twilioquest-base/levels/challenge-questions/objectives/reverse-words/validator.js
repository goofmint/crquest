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
          learnerFunction = reverseSentence;
        } catch (error) {
          learnerFunction = undefined;
        }

        if (!learnerFunction) {
          fail("The function reverseSentence is not defined!");
        }

        const test = assertTestCase(learnerFunction);

        test("You did it!", "It did you!");
        test("Apple fell far from the tree.", "Tree the from far fell apple.");
        test("Tacos in Mexico are tasty.", "Tasty are Mexico in tacos.");
        test("Hurray!", "Hurray!");

        return { outcome: "ok" };
      },
      {},
      "reverse-words"
    );
  } catch (err) {
    helper.fail(err);
    return;
  }

  helper.success("You did it!");
};
