const path = require("path");
const {
  executeCodeString,
} = require("../../../../scripts/objectiveValidation");

function correctDecrypt(number) {
  let output = "";

  if (number % 3 === 0) {
    output += "Java";
  }

  if (number % 5 === 0) {
    output += "Script";
  }

  if (!output) {
    output = String(number);
  }

  return output;
}

module.exports = async (helper) => {
  try {
    const { TQ_NODE_EXE, TQ_JAVASCRIPT_WORKSPACE_PATH } = helper.env;
    const programPath = path.join(TQ_JAVASCRIPT_WORKSPACE_PATH, "fizzBuzz.js");

    const exists = await helper.fs.existsAsync(programPath);
    if (!exists) {
      helper.fail(helper.t("fileMissing", `
        We couldn't find your "fizzBuzz.js" script in your 
        JavaScript code folder. Does the file below exist? <br/><br/>
        <span style="word-wrap:break-word">{{programPath}}</span>
      `, { programPath }));
      return;
    }

    const userCode = await helper.fs.readAsync(programPath);
    const testNumbers = [4, 24, 25, 30];
    let results = [];

    for (let i = 0, l = testNumbers.length; i < l; i++) {
      let result = await executeCodeString(
        helper, TQ_NODE_EXE, userCode, [testNumbers[i]]
      );
      let n = result.stdout ? result.stdout.trim() : "";
      results.push(n);
    }

    /*
    const promises = testNumbers.map(async (num) => {
      let result = await executeCodeString(TQ_NODE_EXE, userCode, [num]);
      return result.stdout ? result.stdout.trim() : "";
    });
    const results = await Promise.all(promises);
    */

    // Process results against solution
    for (let i = 0, l = results.length; i < l; i++) {
      let result = results[i];
      let correct = correctDecrypt(testNumbers[i]);
      if (result !== correct) {
        return helper.fail(helper.t("incorrectResult", `
          While testing your script, we passed in "{{value1}}" but got "{{result}}" instead
          of "{{correct}}". Please test your script again.
        `, { value1: testNumbers[i], result, correct }));
      }
    }

    helper.success(helper.t("success", `
      You did it! No job interview nonsense can fool you.
    `));
  } catch (e) {
    helper.fail(helper.t("executionError", `
      There was an error executing your JavaScript code. Please ensure that you
      can run it successfully and try again. Here's the error we got - sorry
      if the formatting is ugly: <br/><br/>
      {{e}}
    `, { e }));
  }
};
