async function getMagicalPhrase() {
  // API endpoint: https://twilio.com/quest/magic
  // TODO: fetch the magical phrase from the endpoint!
}

async function runTests() {
  console.log("Test case data:");
  console.log((await getMagicalPhrase()).toString());
}

runTests();
