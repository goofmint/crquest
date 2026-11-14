const { DIVINATION_API_ENDPOINT } = require("../../../../scripts/config");
const assert = require("assert");

const assertTestCase = (testFunction, helper) => async (input, expected) => {
  const testResult = await testFunction(input);
  let failureMessage = `Expected "${expected}" authors from pageCount input of "${input}", but received "${testResult}" instead.`;
  const equality = helper.areArrayContentsEqual(testResult, expected);

  if (!equality) {
    assert.fail(failureMessage);
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

module.exports = async function (helper) {
  let context;

  try {
    context = await helper.pullVarsFromQuestIdeUserCodeLocalScope(
      ["getFilteredAuthors"],
      "api-04-remote-and-local"
    );

    assert(
      context.getFilteredAuthors,
      "The function getFilteredAuthors is not defined!"
    );

    const test = assertTestCase(context.getFilteredAuthors, helper);
    const response = await fetch(DIVINATION_API_ENDPOINT);
    const books = await response.json();
    console.log(books);
    await test(5, getAuthorNames(5, books));
    await test(100, getAuthorNames(100, books));
    await test(30, getAuthorNames(30, books));
    await test(15, getAuthorNames(15, books));
  } catch (err) {
    helper.fail(err);
    return;
  }

  helper.success("Good work!");
};
