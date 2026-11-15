const { DIVINATION_API_ENDPOINT } = require("../../../../scripts/config");

module.exports = async function (helper) {
  try {
    // The books are fetched here (as before); the learner's code and the test
    // cases run in a Web Worker (functions cannot leave it), where the learner's
    // own `fetch` is the worker's. A failed check is thrown as an error. See
    // docs/migration/validation-helper-worker.md.
    const response = await fetch(DIVINATION_API_ENDPOINT);
    const books = await response.json();
    console.log(books);

    await helper.evaluateInQuestIdeUserCodeLocalScope(
      async ({ books }) => {
        const fail = (message) => {
          throw new Error(message);
        };

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

        const assertTestCase = (testFunction) => async (input, expected) => {
          const testResult = await testFunction(input);
          let failureMessage = `Expected "${expected}" authors from pageCount input of "${input}", but received "${testResult}" instead.`;
          const equality = areArrayContentsEqual(testResult, expected);

          if (!equality) {
            fail(failureMessage);
          }
        };

        function getBooksByPageCount(pageCountThreshold, books) {
          const filteredBooks = books.filter(
            (book) => book.metadata.pageCount > pageCountThreshold
          );
          return filteredBooks;
        }

        function getAuthorNames(pageCountThreshold, books) {
          const filteredBooks = getBooksByPageCount(pageCountThreshold, books);
          const authorNames = filteredBooks.map((book) => book.author.name);
          return authorNames;
        }

        let learnerFunction;
        try {
          learnerFunction = getFilteredAuthors;
        } catch (error) {
          learnerFunction = undefined;
        }

        if (!learnerFunction) {
          fail("The function getFilteredAuthors is not defined!");
        }

        const test = assertTestCase(learnerFunction);

        await test(5, getAuthorNames(5, books));
        await test(100, getAuthorNames(100, books));
        await test(30, getAuthorNames(30, books));
        await test(15, getAuthorNames(15, books));

        return { outcome: "ok" };
      },
      { books },
      "api-04-remote-and-local"
    );
  } catch (err) {
    helper.fail(err);
    return;
  }

  helper.success("Good work!");
};
