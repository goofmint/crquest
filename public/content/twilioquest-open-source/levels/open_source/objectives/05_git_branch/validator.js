const { execGitWithArgs } = require("../../../../scripts/objectiveValidation");

module.exports = async (helper) => {
  const { TQ_OPEN_PIXEL_ART_DIR } = helper.env;
  const { branchName } = helper.validationFields;

  if (!branchName) {
    helper.fail(helper.t("missingBranch", "Don't forget to provide the name of the branch you created!"));
    return;
  }

  try {
    const gitBranchList = await execGitWithArgs(
      helper,
      ["branch", "--list", branchName],
      {
        cwd: TQ_OPEN_PIXEL_ART_DIR,
      }
    );

    const branches = gitBranchList.stdout
      .split("\n")
      .map((branch) => branch.trim());

    const branchCheckedOutName = `* ${branchName}`;

    if (
      !branches.includes(branchName) &&
      !branches.includes(branchCheckedOutName)
    ) {
      helper.fail(
        helper.t(
          "branchNotFound",
          "We couldn't find the branch named \"{{branchName}}\" in your respository!",
          { branchName }
        )
      );
      return;
    }

    if (!branches.includes(branchCheckedOutName)) {
      helper.fail(
        helper.t(
          "branchNotActive",
          "We found your branch \"{{branchName}}\" but it looks like you haven't checked it out yet!",
          { branchName }
        )
      );
      return;
    }

    helper.success(
      helper.t(
        "created",
        "It looks like you created and checked out the branch \"{{branchName}}\" correctly!",
        { branchName }
      ),
      [{ name: "OPEN_PIXEL_ART_BRANCH", value: branchName }]
    );
  } catch (err) {
    helper.fail(
      helper.t("error", `We ran into a problem trying to validate your branch was created!
      
      {{err}}`, { err })
    );
  }
};
