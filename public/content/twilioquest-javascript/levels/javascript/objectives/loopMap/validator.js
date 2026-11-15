const path = require("path");

const isFunction = function (obj) {
  return !!(obj && obj.constructor && obj.call && obj.apply);
};

module.exports = async (helper) => {
  try {
    const { TQ_JAVASCRIPT_WORKSPACE_PATH } = helper.env;
    const programPath = path.join(
      TQ_JAVASCRIPT_WORKSPACE_PATH,
      "freightTransformer.js"
    );

    const exists = await helper.fs.existsAsync(programPath);
    if (!exists) {
      helper.fail(`
        We couldn't find your "freightTransformer.js" script in your 
        JavaScript code folder. Does the file below exist? <br/><br/>
        <span style="word-wrap:break-word">${programPath}</span>
      `);
      return;
    }

    const userCode = await helper.fs.readAsync(programPath);
    // The learner's code and the test cases run in a Web Worker (functions and
    // classes cannot leave it), so the checks below run there and only their
    // outcome comes back. See docs/migration/validation-helper-worker.md.
    const tq = await helper.evaluateInUserCodeLocalScope(userCode, () => {
      const isFunction = function(obj) {
        return !!(obj && obj.constructor && obj.call && obj.apply);
      };
      let target;
      try {
        target = transform;
      } catch (error) {
        return { readError: { name: error.name, text: `${error}` } };
      }
      if (!isFunction(target)) {
        return { outcome: 'not-function' };
      }

      try {
        const result = target([]);
        const result2 = target(["loud", "noises"]);

        if (result === undefined || result === null) {
          return { outcome: 'no-value' };
        }
        if (!Array.isArray(result)) {
          return { outcome: 'not-array' };
        }
        if (
          result.length !== 0 ||
          result2.length !== 2 ||
          result2[0] !== "LOUD" ||
          result2[1] !== "NOISES"
        ) {
          return { outcome: 'wrong-array' };
        }
      } catch (ee) {
        return { outcome: 'call-error', error: `${ee}` };
      }
      return { outcome: 'ok' };
    });

    if (tq.readError) {
      console.log(tq.readError.text);
      if (tq.readError.name === "ReferenceError") {
        return helper.fail(`
          It looks like a <span class="highlight">transform</span> 
          function was not defined in your
          code. At least, we didn't see it in the global scope of your script.
          <br/><br/>
          Did you name the function 
          "<span class="highlight">transform</span>"? Maybe 
          double-check your spelling?
        `);
      } else {
        return helper.fail(`
          There was a problem validating your code. The error we got was:
          <br/><br/>
          ${tq.readError.text}
        `);
      }
    }

    // Check type of the function
    if (tq.outcome === 'not-function') {
      let message = `
        We found a variable called 
        <span class="highlight">transform</span>, but it's not a
        callable function. Check the Help section for more guidance on creating
        a JavaScript function.
      `;

      return helper.fail(message);
    }

    if (tq.outcome === 'no-value') {
      return helper.fail(`
          It looks like your function is not yet returning a value. The final
          line of code in your function before the "}" should use the
          <span class="highlight">return</span> keyword to pass back a value of
          some kind as a result of executing the function. See the example code
          in the Help section.
        `);
    }

    if (tq.outcome === 'not-array') {
      return helper.fail(`
          It looks like your function is not returning an array. Your
          function must return an array of transformed strings.
        `);
    }

    if (tq.outcome === 'wrong-array') {
      return helper.fail(`
          Your function returned an array, but not the array we were looking 
          for. Check the Help and Objective tabs to ensure you are returning
          the right contents in your output array.
        `);
    }

    if (tq.outcome === 'call-error') {
      return helper.fail(`
        There was an error executing your transform function. Please 
        ensure that you can exercise your function from the command line 
        successfully and try again. Use the starter code in the Help section if
        you are stuck. Here's the error we got from trying to call your 
        function: <br/><br/>
        <span class="highlight">${tq.error}</span>
      `);
    }

    helper.success(`
      That did it! You hack the security node, and an index for the 
      <span class="highlight">fourth character</span> in the Infinite Loop's 
      master password appears:<br/><br/>
      <span class="highlight">[3][4]</span>
      <br/><br/>
      This is one of six indexes total you will need to discover the password.
    `);
  } catch (e) {
    helper.fail(`
      There was an error executing your JavaScript code. Please ensure that you
      can run it from the command line successfully and try again. Here's the 
      error we got: <br/><br/>
      <span class="highlight">${e}</span>
    `);
  }
};
