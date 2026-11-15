const path = require('path');

const isFunction = function(obj) {
  return !!(obj && obj.constructor && obj.call && obj.apply);
};

module.exports = async helper => {
  try {
    const { TQ_JAVASCRIPT_WORKSPACE_PATH } = helper.env;
    const programPath = path.join(
      TQ_JAVASCRIPT_WORKSPACE_PATH, 
      'laserFunction.js'
    );

    const exists = await helper.fs.existsAsync(programPath);
    if (!exists) {
      helper.fail(`
        We couldn't find your "laserFunction.js" script in your 
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
        target = getLaserSetting;
      } catch (error) {
        return { readError: { name: error.name, text: `${error}` } };
      }
      if (!isFunction(target)) {
        return { outcome: 'not-function' };
      }

      try {
        const result = target();
        if (result === undefined || result === null) {
          return { outcome: 'no-value' };
        }
        if (typeof result !== 'string') {
          return { outcome: 'not-string' };
        }
        if (result !== 'OFF') {
          return { outcome: 'wrong-value', shown: `${result}` };
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
          It looks like a <span class="highlight">getLaserSetting</span> 
          function was not defined in your
          code. At least, we didn't see it in the global scope of your script.
          <br/><br/>
          Did you name the function 
          "<span class="highlight">getLaserSetting</span>"? Maybe 
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
        <span class="highlight">getLaserSetting</span>, but it's not a
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

    if (tq.outcome === 'not-string') {
      return helper.fail(`
          It looks like your function is not returning a string value. Your
          function must return a string with the value
          <span class="highlight">"OFF"</span>.
        `);
    }

    if (tq.outcome === 'wrong-value') {
      return helper.fail(`
          Your function returned a string, but not the value we were looking 
          for. Your function returned the value 
          <span class="highlight">"${tq.shown}"</span>. The correct value is
          <span class="highlight">"OFF"</span>.
        `);
    }

    if (tq.outcome === 'call-error') {
      return helper.fail(`
        There was an error executing your getLaserSetting function. Please 
        ensure that you can exercise your function from the command line 
        successfully and try again. Use the starter code in the Help section if
        you are stuck. Here's the error we got from trying to call your 
        function: <br/><br/>
        <span class="highlight">${tq.error}</span>
      `);
    }

    helper.success(`
      Bingo! You successfully override the laser command function and gain
      access to the rest of the lab.
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
