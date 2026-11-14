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
    const tq = await helper.pullVarsFromUserCodeLocalScope(
      userCode,
      ['Materializer']
    );

    if (tq._error) {
      console.log(tq._error);
      if (tq._error.name === 'ReferenceError') {
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
          ${tq._error}
        `);
      }
    }

    // Check type of the function
    if (!isClassDeclaration(tq.Materializer)) {
      let message = `
        We found a variable called 
        <span class="highlight">Materializer</span>, but it's not a
        class. Check the Help section for more guidance on creating
        a JavaScript class.
      `;

      return helper.fail(message);
    }

    // Check functionality
    try {
      const result1 = new tq.Materializer('Gene');
      const result2 = new tq.Materializer('Irene');

      if (result1.target !== 'Gene') {
        return helper.fail(`
          It looks like your Materializer is not correctly reading it's target from the constructor function.
        `);
      }

      if (result1.activated !== false) {
        return helper.fail(`
          Your Materializer should start with a property of "activated" that is
          set to false.
        `);
      }

      if (!isFunction(result1.activate)) {
        return helper.fail(`
          Your Materializer should have an "activate" function.
        `);
      }

      if (!isFunction(result1.materialize)) {
        return helper.fail(`
          Your Materializer should have an "materialize" function.
        `);
      }

      result1.activate();

      if (result1.activated !== true) {
        return helper.fail(`
          Your Materializer "activate" function should set activated to
          true when it's executed.
        `);
      }

      const result1Target = result1.materialize();

      if (result1Target !== 'Gene') {
        return helper.fail(`
          Your Materializer "materialize" function should return your target, "Gene" when it is activated.
        `);
      }

      const result2Target = result2.materialize();

      if (result2Target !== undefined) {
        return helper.fail(`
          Your Materializer "materialize" function should return undefined when it is not activated.
        `);
      }
    } catch (ee) {
      return helper.fail(`
        There was an error executing your Materialize constructor or functions. Please ensure that you can exercise your function from the command line 
        successfully and try again. Use the starter code in the Help section if
        you are stuck. Here's the error we got from trying to call your 
        function: <br/><br/>
        <span class="highlight">${ee}</span>
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
