module.exports = async function(helper) {
  try {
    // The learner's code and the test cases run in a Web Worker (functions
    // cannot leave it). Return the details of a failed check for translation.
    const result = await helper.evaluateInQuestIdeUserCodeLocalScope(
      () => {
        const assertTestCase = testFunction => (
          input1,
          input2,
          input3,
          expected
        ) => {
          const testResult = testFunction(input1, input2, input3);

          if (!Object.is(testResult, expected)) {
            return {
              mismatch: {
                expected,
                input1,
                input2,
                input3,
                actual: String(testResult),
              },
            };
          }
          return {};
        };

        let learnerFunction;
        try {
          learnerFunction = swapStrings;
        } catch (error) {
          learnerFunction = undefined;
        }

        if (!learnerFunction) {
          return { missing: true };
        }

        const test = assertTestCase(learnerFunction);

        return test(
          "foo foo foo something something bar",
          "foo",
          "bar",
          "bar bar bar something something bar"
        );
      },
      {},
      "api-01-local-function"
    );
    if (result.missing) {
      return helper.fail(
        helper.t("missingFunction", "The function swapStrings is not defined!")
      );
    }
    if (result.mismatch) {
      return helper.fail(
        helper.t(
          "unexpectedResult",
          'Expected "{{expected}}" from input "{{input1}}", "{{input2}}", and "{{input3}}", but received "{{actual}}".',
          result.mismatch
        )
      );
    }
  } catch (err) {
    helper.fail(err);
    return;
  }

  helper.success(helper.t("success", "Great job!"));
};
