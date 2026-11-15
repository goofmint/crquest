const path = require("path");

function isFunction(obj) {
  return !!(obj && obj.constructor && obj.call && obj.apply);
}

function isClassDeclaration(obj) {
  return isFunction(obj) && obj.toString && obj.toString().includes("class");
}

module.exports = async (helper) => {
  const { TQ_JAVASCRIPT_WORLD_STATE } = helper.context.levelState;
  const isObjectiveReady =
    TQ_JAVASCRIPT_WORLD_STATE.northWing &&
    TQ_JAVASCRIPT_WORLD_STATE.northWing.hadSavedConversation;

  // The player needs to enable the other beams first
  if (!isObjectiveReady) {
    return helper.fail(`
      You can't restart this laser until you receive the physicist's 
      access code. See the objective tab for more information.
    `);
  }

  try {
    const { TQ_JAVASCRIPT_WORKSPACE_PATH } = helper.env;
    const programPath = path.join(
      TQ_JAVASCRIPT_WORKSPACE_PATH,
      "targetingSolution.js"
    );

    const exists = await helper.fs.existsAsync(programPath);
    if (!exists) {
      helper.fail(`
        We couldn't find your "targetingSolution.js" script in your 
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
      const isClassDeclaration = function(obj) {
        return isFunction(obj) && obj.toString && obj.toString().includes('class');
      };
      let target;
      try {
        target = TargetingSolution;
      } catch (error) {
        return { readError: { name: error.name, text: `${error}` } };
      }
      if (!isClassDeclaration(target)) {
        return { outcome: 'not-function' };
      }

      try {
        const result1 = new target({
          x: 32.891,
          y: 120.012,
          z: 345.12,
        });
        if (!isFunction(result1.target)) {
          return { outcome: 'no-target-function' };
        }
        const result1Target = result1.target().trim();
        if (result1Target !== "(32.891, 120.012, 345.12)") {
          return { outcome: 'wrong-format' };
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
          It looks like a <span class="highlight">TargetingSolution</span> 
          class was not defined in your
          code. At least, we didn't see it in the global scope of your script.
          <br/><br/>
          Did you name the class 
          "<span class="highlight">TargetingSolution</span>"? Maybe 
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
        <span class="highlight">TargetingSolution</span>, but it's not a
        class. Check the Help section for more guidance on creating
        a JavaScript class.
      `;

      return helper.fail(message);
    }

    if (tq.outcome === 'no-target-function') {
      return helper.fail(`
          Your TargetingSolution should have an "target" function.
        `);
    }

    if (tq.outcome === 'wrong-format') {
      return helper.fail(`
          The <span class="highlight">target</span> function of your
          <span class="highlight">TargetingSolution</span> class did not return
          a string in the specified format. It should be in the format
          <span class="highlight">(x, y, z)</span>, including the parens and
          commas.
        `);
    }

    if (tq.outcome === 'call-error') {
      return helper.fail(`
        There was an error executing your TargetingSolution constructor or functions. Please ensure that you can exercise your function from the command line 
        successfully and try again. Use the starter code in the Help section if
        you are stuck. Here's the error we got from trying to call your 
        function: <br/><br/>
        <span class="highlight">${tq.error}</span>
      `);
    }

    helper.success(`
      The laser uses your targeting solution class and emits a beam aimed at
      the center of the ducktypium crystal. Looks like this laser is back online!
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
