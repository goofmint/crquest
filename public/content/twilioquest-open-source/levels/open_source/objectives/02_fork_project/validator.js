module.exports = async helper => {
  const { TQ_GITHUB_USERNAME } = helper.env;

  try {
    const response = await fetch(
      `https://api.github.com/repos/${TQ_GITHUB_USERNAME}/open-pixel-art`
    );

    if (response.status === 200) {
      return helper.success(
        helper.t("found", "We found your fork of the Open Pixel Art respository! Good job!")
      );
    } else {
      helper.fail(
        helper.t(
          "notFound",
          "We couldn't find a repository named \"open-pixel-art\" owned by the GitHub user, {{TQ_GITHUB_USERNAME}}. Is your fork named correctly?",
          { TQ_GITHUB_USERNAME }
        )
      );
    }
  } catch (err) {
    helper.fail(
      helper.t("error", `Something went wrong when we tried to validate your Open Pixel Art fork!
      
      {{err}}`, { err })
    );
  }
};
