module.exports = async (helper) => {
  try {
    const { gitPath } = helper.validationFields;

    const args = ["--version"];
    const [isExecutableValid, errorMessage] = await helper.isExecutableValid(
      gitPath,
      args
    );

    if (!isExecutableValid) {
      helper.fail(errorMessage);
      return;
    }

    const { code, stdout } = await helper.exec(gitPath, args);

    if (code === 0) {
      helper.success(
        helper.t("installed", `
        Awesome! Looks like you have this version installed: <br/>
        <span class="highlight">{{stdout}}</span> <br/><br/>
        Please proceed to the next security checkpoint.
      `, { stdout }),
        [{ name: "GIT_EXE", value: gitPath }]
      );
    } else {
      helper.fail(helper.t("nonzero", `
        We received a non-zero exit code when it tried to validate the provided git version. Double check the path and try again.
      `));
    }
  } catch (e) {
    helper.fail(helper.t("error", `
    Sorry! We couldn't validate your Git installation. We saw an unexpected error.

    {{error}}
    `, { error: e.message }));
    console.error(e);
  }
};
