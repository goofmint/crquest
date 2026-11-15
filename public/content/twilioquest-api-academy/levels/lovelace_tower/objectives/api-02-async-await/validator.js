module.exports = async function (helper) {
  try {
    const testDirectory = `${__dirname}/houses`;
    const dir = await helper.fs.readdir(testDirectory);
    const lastEntry = dir[dir.length - 1];

    // The learner's code and the test case run in a Web Worker, which has no
    // `fs`: the listing read here is handed to the learner's
    // `require("fs").promises.readdir` (the `fs` mock; any other directory is
    // ENOENT). A failed check is thrown as an error. See
    // docs/migration/validation-helper-worker.md.
    await helper.evaluateInQuestIdeUserCodeLocalScope(
      async ({ testDirectory, lastEntry }) => {
        const fail = (message) => {
          throw new Error(message);
        };

        const assertTestCase = (testFunction) => async (input, expected) => {
          const testResult = await testFunction(input);

          if (!Object.is(testResult, expected)) {
            fail(`Expected "${expected}" but received "${testResult}".`);
          }
        };

        let learnerFunction;
        try {
          learnerFunction = findLastFileInDir;
        } catch (error) {
          learnerFunction = undefined;
        }

        if (!learnerFunction) {
          fail("The function findLastFileInDir is not defined!");
        }

        const test = assertTestCase(learnerFunction);

        await test(testDirectory, lastEntry);

        return { outcome: "ok" };
      },
      { testDirectory, lastEntry },
      "api-02-async-await",
      undefined,
      { fs: { directories: { [testDirectory]: dir } } }
    );
  } catch (err) {
    helper.fail(err);
    return;
  }

  helper.success("Great job!");
};
