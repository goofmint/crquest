const { NiceError } = require("../../../../scripts/objectiveValidation");

module.exports = async (helper) => {
  try {
    const { workspacePath } = helper.validationFields;

    if (!workspacePath) {
      throw new NiceError(helper.t("workspaceRequired", `
        Please provide a path to your Node.js workspace directory!
      `));
    }

    const exists = await helper.fs.existsAsync(workspacePath);
    if (!exists) {
      throw new NiceError(helper.t("invalidWorkspace", `
        We couldn't find a directory at the path you provided. 
        Please double check that the directory path you pasted in 
        the text field is correct.
      `));
    }

    helper.success(
      helper.t("success", `
      JavaScript workspace confirmed. Lab access granted - please proceed
      through the security gate.
    `),
      [
        {
          name: "JAVASCRIPT_WORKSPACE_PATH",
          value: workspacePath,
        },
      ]
    );
  } catch (e) {
    console.log(e);
    if (e.name === "NiceError") {
      helper.fail(e.message);
    } else if (e.code === "EACCES" || e.code === "EPERM") {
      helper.fail(helper.t("scopeDenied", `
        The folder may exist, but the game is not allowed to look at it.
        Click "Choose Folder" and select the folder again with the button
        (a path that is only pasted in is not enough), then click HACK.
      `));
    } else {
      helper.fail(helper.t("workspaceMissing", `
        Sorry! We couldn't successfully find your Node.js workspace path.
      `));
    }
  }
};
