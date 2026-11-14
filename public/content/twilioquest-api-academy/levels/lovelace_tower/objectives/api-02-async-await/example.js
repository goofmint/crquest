const { readdir } = require("fs").promises;

async function findLastFileInDir(dirPath) {
  // TODO: return the last file in dirPath!
}

async function runTests() {
  console.log("Test case data:");
  console.log(await findLastFileInDir("."));
  // console.log(await findLastFileInDir("REPLACE_THIS_WITH_FILE_PATH"));
}

runTests();
