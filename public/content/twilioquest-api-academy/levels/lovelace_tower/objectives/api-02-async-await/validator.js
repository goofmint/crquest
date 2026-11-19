module.exports = async function(helper) {
  try {
    const testDirectory = `${__dirname}/houses`;
    const dir = await helper.fs.readdir(testDirectory);
    const lastEntry = dir[dir.length - 1];

    // The learner's code and the test case run in a Web Worker, which has no
    // `fs`: the listing read here is handed to the learner's
    // `require("fs").promises.readdir` (the `fs` mock; any other directory is
    // ENOENT). Failed checks return their details for translation. See
    // docs/migration/validation-helper-worker.md.
    const result = await helper.evaluateInQuestIdeUserCodeLocalScope(
      async ({ testDirectory, lastEntry }) => {
        const assertTestCase = testFunction => async (input, expected) => {
          const testResult = await testFunction(input);

          if (!Object.is(testResult, expected)) {
            return { mismatch: { expected, actual: String(testResult) } };
          }
          return {};
        };

        let learnerFunction;
        try {
          learnerFunction = findLastFileInDir;
        } catch (error) {
          learnerFunction = undefined;
        }

        if (!learnerFunction) {
          return { missing: true };
        }

        const test = assertTestCase(learnerFunction);

        return test(testDirectory, lastEntry);
      },
      { testDirectory, lastEntry },
      "api-02-async-await",
      undefined,
      { fs: { directories: { [testDirectory]: dir } } }
    );
    if (result.missing) {
      return helper.fail(
        helper.t(
          "missingFunction",
          "The function findLastFileInDir is not defined!"
        )
      );
    }
    if (result.mismatch) {
      return helper.fail(
        helper.t(
          "unexpectedResult",
          'Expected "{{expected}}" but received "{{actual}}".',
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
