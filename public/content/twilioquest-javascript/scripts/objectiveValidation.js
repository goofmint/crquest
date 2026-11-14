const path = require("path");
const { v4 } = require("uuid");

// An error wrapper we can assume to have a nice human readable error message
class NiceError extends Error {
  constructor(message) {
    super(message);
    this.name = "NiceError";
  }
}

// Execute the given chunk of validation JavaScript code with the learner's
// Node.js executable. The code is passed with `node -e`; the placeholder
// argument takes the place of the script path, so the first of `args` is still
// the third entry of the program's argument vector, as it was when the code ran
// from a script file.
const EXECUTION_TIMEOUT_MS = 5000;
const SCRIPT_PATH_PLACEHOLDER = "validate.js";

async function executeCodeString(helper, node, code, args = []) {
  try {
    // We don't care about success or failure - let the validation code sort
    // that out. A program that runs longer than the timeout is killed.
    const { code: exitCode, stdout, stderr } = await helper.exec(
      node,
      ["-e", code, SCRIPT_PATH_PLACEHOLDER].concat(args.map(String)),
      { timeout: EXECUTION_TIMEOUT_MS }
    );
    return { exitCode, stdout, stderr };
  } catch (e) {
    if (e && e.killed) {
      console.warn("Node.js validation code timed out.");
      throw new NiceError(`
          There was a problem validating your Node.js code - please try again.
        `);
    }
    throw new NiceError(`
        There was a problem validating your JavaScript code. Please try again.
      `);
  }
}

function throwAssertionError(message) {
  const assertionError = new Error(message);
  assertionError.name = "AssertionError";

  throw assertionError;
}

function doesFunctionExist(functionName) {
  try {
    eval(functionName);
  } catch (err) {
    throwAssertionError(`The function "${functionName}" does not exist!`);
  }
}

function expectFunctionResultToBe(
  functionName,
  expectedValue,
  parameters = [],
  customErrorMessage
) {
  doesFunctionExist(functionName);

  const functionUnderTest = eval(functionName);

  const actualValue = functionUnderTest(...parameters);

  console.log(expectedValue, actualValue);

  let comparisonFn;

  if (Array.isArray(expectedValue)) {
    if (!Array.isArray(actualValue)) {
      const errorMessage = `"${functionName}" did not return an array as expected!`;

      throwAssertionError(errorMessage);
    }

    // check array contents comparison, with order respected
    comparisonFn = (expected, actual) =>
      expected.every((val, index) => actual[index] === val);
  } else {
    // basic equality comparisonFn
    comparisonFn = (expected, actual) => expected === actual;
  }

  if (!comparisonFn(expectedValue, actualValue)) {
    const errorMessage =
      customErrorMessage ||
      `"${functionName}" returned "${actualValue}" instead of expected value "${expectedValue}" when called with parameters: ${parameters}.`;

    throwAssertionError(errorMessage);
  }
}

async function evaluteAssertions(helper, fileName, assertionsString) {
  const { TQ_NODE_EXE, TQ_JAVASCRIPT_WORKSPACE_PATH } = helper.env;
  const programPath = path.join(TQ_JAVASCRIPT_WORKSPACE_PATH, fileName);

  const exists = await helper.fs.existsAsync(programPath);
  if (!exists) {
    helper.fail(
      `We couldn't find your "${fileName}" script in your JavaScript workspace. Does the file "${programPath}" exist?`
    );
    return false;
  }

  const VALIDATION_UUID = v4();

  const VALIDATION_CODE = `
    ${throwAssertionError.toString()}
    ${doesFunctionExist.toString()}
    ${expectFunctionResultToBe.toString()}

    ${assertionsString}
    console.log('${VALIDATION_UUID}');
  `;

  const userCode = await helper.fs.readAsync(programPath);
  const testCode = `${userCode}\n\n${VALIDATION_CODE}`;

  const { stdout, stderr } = await executeCodeString(helper, TQ_NODE_EXE, testCode);

  if (stderr.includes("AssertionError")) {
    // `node file.js` prints "Error [AssertionError]: ...", `node -e` prints
    // "AssertionError: ...".
    const [, errorMessage] = stderr.match(/AssertionError\]?: (.*)/);

    helper.fail(`
      ${errorMessage}
    `);
    return false;
  }

  if (stderr) {
    const [, errorMessage] = stderr.match(/Error: (.*)/);
    helper.fail(`
      An unexpected error occured!
      
      "${errorMessage}"
    `);
    return false;
  }

  if (!stdout.includes(VALIDATION_UUID)) {
    helper.fail(`
      Validation script could not succesfully terminate and emit Validation UUID: "${VALIDATION_UUID}".
    `);
    return false;
  }

  return true;
}

// Export public interface
module.exports = {
  NiceError,
  executeCodeString,
  throwAssertionError,
  doesFunctionExist,
  expectFunctionResultToBe,
  evaluteAssertions,
};
