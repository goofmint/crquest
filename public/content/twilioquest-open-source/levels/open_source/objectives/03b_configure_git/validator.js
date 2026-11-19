const { execGitWithArgs } = require("../../../../scripts/objectiveValidation");

module.exports = async (helper) => {
  try {
    const gitConfigList = await execGitWithArgs(helper, ["config", "--list"]);

    if (!gitConfigList.stdout.includes("user.email=")) {
      helper.fail(helper.t("email", "We did not find your email configured correctly!"));
      return;
    }

    if (!gitConfigList.stdout.includes("user.name=")) {
      helper.fail(helper.t("name", "We did not find your user name configured correctly!"));
      return;
    }

    const gitConfigOptions = gitConfigList.stdout.split("\n");
    const gitUserNameOption = gitConfigOptions.find((option) =>
      option.includes("user.name=")
    );
    const [, userName] = gitUserNameOption.trim().split("=");

    helper.success(
      helper.t("configured", "It looks like your email and user name are configured correctly!"),
      [{ name: "LOCAL_GIT_USER_NAME", value: userName }]
    );
  } catch (err) {
    helper.fail(helper.t("error", `Something went wrong while trying to validate your git configuration!
    
    {{error}}`, { error: err.message }));
    console.error(err);
  }
};
