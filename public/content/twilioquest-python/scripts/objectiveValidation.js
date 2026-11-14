const path = require("path");

// Directory (below the OS application data directory) that houses our python
// code validator. Resolved lazily because it needs the validation helper.
function getPythonValidatorCodePath(helper) {
  const appDataPath = path.resolve(helper.getAppDataPath(), "TwilioQuest");
  return path.join(appDataPath, "python_validator", "validate.py");
}

// An error wrapper we can assume to have a nice human readable error message
class NiceError extends Error {
  constructor(message) {
    super(message);
    this.name = "NiceError";
  }
}

// Helper to double check both the python EXE and code path for validation
async function checkSetup(helper, py, programPath) {
  const programExists = await helper.fs.existsAsync(programPath);
  if (!programExists) {
    throw new NiceError(`
      Whoops! This trial asked you to create a file at this location:<br/>
      <em style="display:block;padding:5px;overflow-wrap:break-word;">
      ${programPath}</em>
      However, this file doesn't exist at that location - please write your code
      in this file. If you need to change 
      the location of the code folder, go to the 
      Settings UI ("O" key) and under "Variables", change "TQ_PYTHON_CODE_PATH" 
      to a different folder.
    `);
  }

  // Naive check for the Python EXE
  if (!py) {
    throw new NiceError(`
      It looks like you don't have a Python executable path saved in your game
      configuration. Go back to the very first barrier of this area and repeat
      that challenge. It will set up your Python executable for you.
    `);
  }
}

// Reject if the promise doesn't settle within the given time. Like the
// original timers, this does not kill the child process.
function withTimeout(promise, milliseconds, createError) {
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(createError()), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Execute a Python program at the path provided and capture the output
async function executeScript(helper, pythonPath, codePath, args = []) {
  const run = async () => {
    const { code, stdout, stderr } = await helper.exec(
      pythonPath,
      [codePath].concat(args)
    );

    if (code === 0) {
      return stdout;
    }

    const err = new NiceError(`
          We tried executing your code, but we encountered an error. In the same
          directory as your script, look for a file called 
          <span class="highlight">error.txt</span>. It will
          contain further details about the error we saw.
        `);
    err.bufferedStderr = stderr;
    console.error(stderr);

    // Write error file
    await writeFile(helper, codePath, "error.txt", args, stderr);
    throw err;
  };

  return withTimeout(
    run(),
    30000,
    () =>
      new NiceError(`
          Your script didn't return a response in time - we waited for five
          seconds, but it didn't finish executing in that time.
        `)
  );
}

// Helper to write script output to a file
async function writeFile(helper, codePath, fileName, args, output) {
  const p = path.dirname(codePath);
  const t = path.join(p, fileName);
  const text =
    `Executing script: ${codePath}\n` +
    `Script arguments: ${args}\n` +
    `Output:\n${output}\n`;
  await helper.fs.writeAsync(t, text);
}

// Execute the given chunk of validation Python code
async function executePythonCode(helper, code, args = []) {
  const py = helper.env.TQ_PYTHON_EXE;
  const pythonValidatorCodePath = getPythonValidatorCodePath(helper);
  await helper.fs.writeAsync(pythonValidatorCodePath, code);

  const run = async () => {
    let result;
    try {
      result = await helper.exec(py, [pythonValidatorCodePath].concat(args));
    } catch (e) {
      throw new NiceError(`
        There was a problem validating your Python code. Please try again.
      `);
    }

    // We don't care about success or failure - let the validation code sort
    // that out
    return {
      exitCode: result.code,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  };

  return withTimeout(run(), 5000, () => {
    console.warn("Python validation code timed out.");
    return new NiceError(`
          There was a problem validating your Python code - please try again.
        `);
  });
}

// Export public interface
module.exports = {
  NiceError,
  executeScript,
  checkSetup,
  executePythonCode,
  writeFile,
};
