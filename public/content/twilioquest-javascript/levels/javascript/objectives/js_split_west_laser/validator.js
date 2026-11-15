const path = require("path");

module.exports = async (helper) => {
  const { TQ_JAVASCRIPT_WORLD_STATE } = helper.context.levelState;
  const isObjectiveReady =
    TQ_JAVASCRIPT_WORLD_STATE.beamTwoOnline &&
    TQ_JAVASCRIPT_WORLD_STATE.beamThreeOnline &&
    TQ_JAVASCRIPT_WORLD_STATE.beamFourOnline;

  // The player needs to enable the other beams first
  if (!isObjectiveReady) {
    return helper.fail(`
      You can't restart this laser until the other three beams are enabled.
      See the objective tab for more information.
    `);
  }

  try {
    const { TQ_JAVASCRIPT_WORKSPACE_PATH } = helper.env;
    const programPath = path.join(
      TQ_JAVASCRIPT_WORKSPACE_PATH,
      "ducktypium.js"
    );

    const exists = await helper.fs.existsAsync(programPath);
    if (!exists) {
      helper.fail(`
        We couldn't find your "ducktypium.js" script in your 
        JavaScript code folder. Does the file below exist? <br/><br/>
        <span style="word-wrap:break-word">${programPath}</span>
      `);
      return;
    }

    const userCode = await helper.fs.readAsync(programPath);
    // The learner's code and the test cases run in a Web Worker (classes
    // cannot leave it), so the checks below run there and only their outcome
    // comes back. See docs/migration/validation-helper-worker.md.
    const tq = await helper.evaluateInUserCodeLocalScope(userCode, () => {
      function isFunction(obj) {
        return !!(obj && obj.constructor && obj.call && obj.apply);
      }

      function isClassDeclaration(obj) {
        return isFunction(obj) && obj.toString && obj.toString().includes("class");
      }

      let target;
      try {
        target = Ducktypium;
      } catch (error) {
        return { readError: { name: error.name, text: `${error}` } };
      }

      // Check type of the function
      if (!isClassDeclaration(target)) {
        return { outcome: "not-class" };
      }

      // Check functionality
      try {
        // First ensure it errors out on an incorrect input
        try {
          const badColor = new target("mauve");

          // If we get to this point, it's actually a failure
          return { outcome: "accepts-bad-color" };
        } catch (colorError) {
          // This is actually what we want, so continue...
        }

        // Create a test instance
        const dt = new target("blue");

        if (dt.color !== "blue") {
          return { outcome: "color" };
        }

        if (!dt.calibrationSequence || dt.calibrationSequence.length !== 0) {
          return { outcome: "calibration-sequence" };
        }

        // Ensure functions are defined
        if (!dt.refract || !isFunction(dt.refract)) {
          return { outcome: "no-refract" };
        }

        if (!dt.calibrate || !isFunction(dt.calibrate)) {
          return { outcome: "no-calibrate" };
        }

        // Check functionality of methods
        if (dt.refract("blue") !== "blue") {
          return { outcome: "refract-same-color" };
        }

        if (dt.refract("yellow") !== "green") {
          return { outcome: "refract-combination" };
        }

        dt.color = "red";
        if (dt.refract("yellow") !== "orange") {
          return { outcome: "refract-combination" };
        }

        dt.color = "yellow";
        if (dt.refract("blue") !== "green") {
          return { outcome: "refract-combination" };
        }

        dt.calibrate([10, 20, 1]);

        if (
          dt.calibrationSequence[0] !== 3 ||
          dt.calibrationSequence[1] !== 30 ||
          dt.calibrationSequence[2] !== 60
        ) {
          return { outcome: "calibrate" };
        }
      } catch (ee) {
        return { outcome: "call-error", error: `${ee}` };
      }
      return { outcome: "ok" };
    });

    if (tq.readError) {
      console.log(tq.readError.text);
      if (tq.readError.name === "ReferenceError") {
        return helper.fail(`
          It looks like a <span class="highlight">Ducktypium</span> 
          class was not defined in your
          code. At least, we didn't see it in the global scope of your script.
          <br/><br/>
          Did you name the class 
          "<span class="highlight">Ducktypium</span>"? Maybe 
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

    if (tq.outcome === "not-class") {
      let message = `
        We found a variable called 
        <span class="highlight">Ducktypium</span>, but it's not a
        class. Check the Help section for more guidance on creating
        a JavaScript class.
      `;

      return helper.fail(message);
    }

    if (tq.outcome === "accepts-bad-color") {
      return helper.fail(`
          Your constructor should only accept "red", "yellow", or "blue" as
          arguments.
        `);
    }

    if (tq.outcome === "color") {
      return helper.fail(`
          Your constructor should set the "color" property of the new
          Ducktypium instance to the first argument to the constructor.
        `);
    }

    if (tq.outcome === "calibration-sequence") {
      return helper.fail(`
          Your constructor should set the "calibrationSequence" property of the 
          new Ducktypium instance to an empty array.
        `);
    }

    if (tq.outcome === "no-refract") {
      return helper.fail(`
          Your Ducktypium object does not have a "refract" instance method.
        `);
    }

    if (tq.outcome === "no-calibrate") {
      return helper.fail(`
          Your Ducktypium object does not have a "calibrate" instance method.
        `);
    }

    if (tq.outcome === "refract-same-color") {
      return helper.fail(`
          The refract method should return the Ducktypium object's color
          property if the same color is passed in to the method.
        `);
    }

    if (tq.outcome === "refract-combination") {
      return helper.fail(`
          The refract method should return color you get when its "color"
          property is combined with another primary color. See the color
          combinations in the "Objective" tab.
        `);
    }

    if (tq.outcome === "calibrate") {
      return helper.fail(`
          The calibrate method should set the "calibrationSequence" property of
          the Ducktypium instance to an array as described in the objective tab.
        `);
    }

    if (tq.outcome === "call-error") {
      console.log(tq.error);
      return helper.fail(`
        There was an error executing your Ducktypium constructor or functions. 
        Please ensure that you can exercise your function from the command line 
        successfully and try again. Use the starter code in the Help section if
        you are stuck. Here's the error we got from trying to call your 
        function: <br/><br/>
        <span class="highlight">${tq.error}</span>
      `);
    }

    helper.success(`
      The final laser flashes to life! You can feel reality bend and twist around
      you, and darkness creeps in from the corners of your eyes to cloud your 
      vision. In a moment, the darkness fades, and you take a look around...
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
