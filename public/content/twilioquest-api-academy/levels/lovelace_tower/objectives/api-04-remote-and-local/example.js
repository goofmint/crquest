async function getFilteredAuthors(pageCount) {
  // API https://twilio.com/quest/magic/divination
  // TODO: get and filter the authors!
}

async function runTests() {
  console.log("Test case 1:");
  console.log((await getFilteredAuthors(5)).toString());

  console.log("Test case 2:");
  console.log((await getFilteredAuthors(1)).toString());

  console.log("Test case 3:");
  console.log((await getFilteredAuthors(12)).toString());

  console.log("Test case 4:");
  console.log((await getFilteredAuthors(100)).toString());

  console.log("Test case 5:");
  console.log((await getFilteredAuthors(32)).toString());

  console.log("Test case 6:");
  console.log((await getFilteredAuthors(24)).toString());
}

runTests();
