const path = require("path");
const {
  executeCodeString,
} = require("../../../../scripts/objectiveValidation");

module.exports = async (helper) => {
  try {
    const { TQ_NODE_EXE, TQ_JAVASCRIPT_WORKSPACE_PATH } = helper.env;
    const programPath = path.join(TQ_JAVASCRIPT_WORKSPACE_PATH, "sortOrder.js");

    const { TQ_JAVASCRIPT_WORLD_STATE } = helper.context.levelState;
    const isObjectiveReady =
      TQ_JAVASCRIPT_WORLD_STATE.eastWing &&
      TQ_JAVASCRIPT_WORLD_STATE.southWing.hadSavedConversation;

    // The player needs to enable the other beams first
    if (!isObjectiveReady) {
      return helper.fail(helper.t("accessCodeMissing", `
        You can't restart this laser until you receive the botanist's 
        access code. See the objective tab for more information.
      `));
    }

    const exists = await helper.fs.existsAsync(programPath);
    if (!exists) {
      helper.fail(helper.t("fileMissing", `
        We couldn't find your "sortOrder.js" script in your 
        JavaScript code folder. Does the file below exist? <br/><br/>
        <span style="word-wrap:break-word">{{programPath}}</span>
      `, { programPath }));
      return;
    }

    const userCode = await helper.fs.readAsync(programPath);

    let result = await executeCodeString(helper, TQ_NODE_EXE, userCode, ["a", "b"]);

    if (!result.stdout || result.stdout.trim() !== "-1") {
      helper.fail(helper.t("firstBeforeSecond", `
        Your script must print "-1" when the first argument passed to it
        appears alphabetically sooner than the second argument.
      `));
      return;
    }

    result = await executeCodeString(helper, TQ_NODE_EXE, userCode, [
      "apples",
      "Ability",
    ]);

    if (!result.stdout || result.stdout.trim() !== "1") {
      helper.fail(helper.t("firstAfterSecond", `
        Your script must print "1" when the first argument passed to it
        appears alphabetically later than the second argument.
      `));
      return;
    }

    result = await executeCodeString(helper, TQ_NODE_EXE, userCode, [
      "apples",
      "APPleS",
    ]);

    if (!result.stdout || result.stdout.trim() !== "0") {
      helper.fail(helper.t("sameArguments", `
        Your script must print "0" when the first argument passed to it
        is the same (ignoring letter case) as the second argument.
      `));
      return;
    }

    helper.success(helper.t("success", `
      Your comparison script appears to be working - Stasis Beam 2 flashes to
      life!
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
