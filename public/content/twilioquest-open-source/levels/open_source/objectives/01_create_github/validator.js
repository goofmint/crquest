module.exports = async (helper) => {
  const username = helper.getNormalizedInput("username", { lowerCase: false });

  if (!username) {
    return helper.fail(helper.t("missingUsername", "Please enter the username of your GitHub account!"));
  }

  try {
    const response = await fetch(`https://api.github.com/users/${username}`);

    if (response.status === 200) {
      return helper.success(
        helper.t("found", "We found your GitHub user, {{username}}. Good job!", { username }),
        [{ name: "GITHUB_USERNAME", value: username }]
      );
    } else {
      helper.fail(
        helper.t(
          "notFound",
          "We couldn't find the GitHub user, {{username}}. Is there a typo in the username?",
          { username }
        )
      );
    }
  } catch (err) {
    helper.fail(
      helper.t("error", `Something went wrong when we tried to validate your GitHub username!
      
      {{err}}`, { err })
    );
  }
};
