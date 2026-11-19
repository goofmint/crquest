const { DIVINATION_API_ENDPOINT } = require("../../../../scripts/config");

module.exports = async function(helper) {
  try {
    // The books are fetched here (as before); the learner's code and the test
    // cases run in a Web Worker (functions cannot leave it), where the learner's
    // own `fetch` is the worker's. Failed checks return their details. See
    // docs/migration/validation-helper-worker.md.
    const response = await fetch(DIVINATION_API_ENDPOINT);
    const books = await response.json();
    console.log(books);

    const result = await helper.evaluateInQuestIdeUserCodeLocalScope(
      async ({ books }) => {
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

        const assertTestCase = testFunction => async (input, expected) => {
          const testResult = await testFunction(input);
          const equality = areArrayContentsEqual(testResult, expected);

          if (!equality) {
            return {
              expected: String(expected),
              input,
              actual: String(testResult),
            };
          }
        };

        function getBooksByPageCount(pageCountThreshold, books) {
          const filteredBooks = books.filter(
            book => book.metadata.pageCount > pageCountThreshold
          );
          return filteredBooks;
        }

        function getAuthorNames(pageCountThreshold, books) {
          const filteredBooks = getBooksByPageCount(pageCountThreshold, books);
          const authorNames = filteredBooks.map(book => book.author.name);
          return authorNames;
        }

        let learnerFunction;
        try {
          learnerFunction = getFilteredAuthors;
        } catch (error) {
          learnerFunction = undefined;
        }

        if (!learnerFunction) {
          return { missing: true };
        }

        const test = assertTestCase(learnerFunction);

        for (const pageCount of [5, 100, 30, 15]) {
          const mismatch = await test(
            pageCount,
            getAuthorNames(pageCount, books)
          );
          if (mismatch) {
            return { mismatch };
          }
        }
        return {};
      },
      { books },
      "api-04-remote-and-local"
    );
    if (result.missing) {
      return helper.fail(
        helper.t(
          "missingFunction",
          "The function getFilteredAuthors is not defined!"
        )
      );
    }
    if (result.mismatch) {
      return helper.fail(
        helper.t(
          "unexpectedResult",
          'Expected "{{expected}}" authors from pageCount input of "{{input}}", but received "{{actual}}" instead.',
          result.mismatch
        )
      );
    }
  } catch (err) {
    helper.fail(err);
    return;
  }

  helper.success(helper.t("success", "Good work!"));
};
