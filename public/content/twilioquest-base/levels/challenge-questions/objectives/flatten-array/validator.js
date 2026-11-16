module.exports = async function (helper) {
  try {
    // The learner's code and the test cases run in a Web Worker (functions
    // cannot leave it), so the checks run there and a failed check is thrown as
    // an error. See docs/migration/validation-helper-worker.md.
    await helper.evaluateInQuestIdeUserCodeLocalScope(
      () => {
        const ARRAY_ELEMENT_DIFFERENT_ERROR_MESSAGE =
          "One or more array elements are different or have different types.";

        const fail = (message) => {
          throw new Error(message);
        };

        // The same as helper.areArrayContentsEqual and helper.formatByType
        const areArrayContentsEqual = (
          arrayA,
          arrayB,
          comparatorFn = (a, b) => a === b
        ) => {
          if (arrayA.length !== arrayB.length) {
            return false;
          }

          return arrayA.every((itemA, index) => {
            return comparatorFn(itemA, arrayB[index]);
          });
        };

        const formatByType = (input) => {
          let output = input;

          if (typeof input === "string") output = `"${input}"`;
          else if (Array.isArray(input)) output = `[${input}]`;
          else if (typeof input === "object") output = JSON.stringify(input);

          return output;
        };

        const createDefaultErrorMessage = (expected, input, testResult) => {
          const expectedFormatted = formatByType(expected);
          const inputFormatted = formatByType(input);
          const testResultFormatted = formatByType(testResult);

          return `Expected ${expectedFormatted} from input ${inputFormatted}, but received ${testResultFormatted}.`;
        };

        const assertTestCase = (testFunction) => (input, expected) => {
          const testResult = testFunction(input);

          // Checks for 'value' equality. This should only be true if both are 'Pure Ducktypium!'
          // (#108: not when an array is expected, e.g. a joined string)
          const areEqualStrings =
            !Array.isArray(expected) &&
            Object.is(
              String(testResult).toLowerCase(),
              String(expected).toLowerCase()
            );

          // Checks for equal types, lengths, and element values
          const areEqualArrays =
            Array.isArray(expected) &&
            Array.isArray(testResult) &&
            areArrayContentsEqual(
              expected,
              testResult,
              (element, otherElement) => {
                if (!Object.is(element, otherElement))
                  fail(ARRAY_ELEMENT_DIFFERENT_ERROR_MESSAGE);

                return true;
              }
            );

          if (!areEqualStrings && !areEqualArrays) {
            fail(createDefaultErrorMessage(expected, input, testResult));
          }
        };

        let learnerFunction;
        try {
          learnerFunction = flattenArray;
        } catch (error) {
          learnerFunction = undefined;
        }

        if (!learnerFunction) {
          fail("The function flattenArray is not defined!");
        }

        const test = assertTestCase(learnerFunction);

        test([], "Pure Ducktypium!");
        test([1, "two", 3, "four"], [1, "two", 3, "four"]);
        test([1, 3, 3, 7, ["legacy wuz here"]], [1, 3, 3, 7, "legacy wuz here"]);
        test(
          ["python", ["javascript", ["api", ["messaging"]]]],
          ["python", "javascript", "api", "messaging"]
        );

        return { outcome: "ok" };
      },
      {},
      "flatten-array"
    );
  } catch (err) {
    helper.fail(err);
    return;
  }

  helper.success("You did it!");
};
