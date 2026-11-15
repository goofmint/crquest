const path = require('path');

function isFunction(obj) {
  return !!(obj && obj.constructor && obj.call && obj.apply);
}

function isClassDeclaration(obj) {
  return isFunction(obj) && obj.toString && obj.toString().includes('class');
}

module.exports = async helper => {
  try {
    const { TQ_JAVASCRIPT_WORKSPACE_PATH } = helper.env;
    const programPath = path.join(TQ_JAVASCRIPT_WORKSPACE_PATH, 'classes.js');

    const exists = await helper.fs.existsAsync(programPath);
    if (!exists) {
      helper.fail(`
        We couldn't find your "classes.js" script in your 
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
        target = Materializer;
      } catch (error) {
        return { readError: { name: error.name, text: `${error}` } };
      }
      if (!isClassDeclaration(target)) {
        return { outcome: 'not-function' };
      }

      try {
        const result1 = new target('Gene');
        const result2 = new target('Irene');

        if (result1.target !== 'Gene') {
          return { outcome: 'wrong-target' };
        }
        if (result1.activated !== false) {
          return { outcome: 'wrong-activated' };
        }
        if (!isFunction(result1.activate)) {
          return { outcome: 'no-activate' };
        }
        if (!isFunction(result1.materialize)) {
          return { outcome: 'no-materialize' };
        }
        result1.activate();
        if (result1.activated !== true) {
          return { outcome: 'activate-failed' };
        }
        const result1Target = result1.materialize();
        if (result1Target !== 'Gene') {
          return { outcome: 'wrong-materialize' };
        }
        const result2Target = result2.materialize();
        if (result2Target !== undefined) {
          return { outcome: 'wrong-unmaterialized' };
        }
      } catch (ee) {
        return { outcome: 'call-error', error: `${ee}` };
      }
      return { outcome: 'ok' };
    });

    if (tq.readError) {
      console.log(tq.readError.text);
      if (tq.readError.name === 'ReferenceError') {
        return helper.fail(`
          It looks like a <span class="highlight">Materializer</span> 
          class was not defined in your
          code. At least, we didn't see it in the global scope of your script.
          <br/><br/>
          Did you name the class 
          "<span class="highlight">Materializer</span>"? Maybe 
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
        <span class="highlight">Materializer</span>, but it's not a
        class. Check the Help section for more guidance on creating
        a JavaScript class.
      `;

      return helper.fail(message);
    }

    if (tq.outcome === 'wrong-target') {
      return helper.fail(`
          It looks like your Materializer is not correctly reading it's target from the constructor function.
        `);
    }

    if (tq.outcome === 'wrong-activated') {
      return helper.fail(`
          Your Materializer should start with a property of "activated" that is
          set to false.
        `);
    }

    if (tq.outcome === 'no-activate') {
      return helper.fail(`
          Your Materializer should have an "activate" function.
        `);
    }

    if (tq.outcome === 'no-materialize') {
      return helper.fail(`
          Your Materializer should have an "materialize" function.
        `);
    }

    if (tq.outcome === 'activate-failed') {
      return helper.fail(`
          Your Materializer "activate" function should set activated to
          true when it's executed.
        `);
    }

    if (tq.outcome === 'wrong-materialize') {
      return helper.fail(`
          Your Materializer "materialize" function should return your target, "Gene" when it is activated.
        `);
    }

    if (tq.outcome === 'wrong-unmaterialized') {
      return helper.fail(`
          Your Materializer "materialize" function should return undefined when it is not activated.
        `);
    }

    if (tq.outcome === 'call-error') {
      return helper.fail(`
        There was an error executing your Materialize constructor or functions. Please ensure that you can exercise your function from the command line 
        successfully and try again. Use the starter code in the Help section if
        you are stuck. Here's the error we got from trying to call your 
        function: <br/><br/>
        <span class="highlight">${tq.error}</span>
      `);
    }

    helper.success(`
      That did it! The matter instantiator console comes back to life, restoring
      partial functionality to the chamber in the center of the room.
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
