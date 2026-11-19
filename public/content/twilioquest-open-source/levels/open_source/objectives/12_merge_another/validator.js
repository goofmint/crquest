module.exports = async (helper) => {
  const { prNumber, repositoryOwner, repository } = helper.validationFields;
  const { TQ_GITHUB_USERNAME } = helper.env;

  if (!repository) {
    helper.fail(
      helper.t(
        "missingOwner",
        "Don't forget to enter the name of the repository owner who's project you contributed to!"
      )
    );
    return;
  }

  if (!repository) {
    helper.fail(
      helper.t("missingRepo", "Don't forget to enter the name of the repository you contributed to!")
    );
    return;
  }

  if (!prNumber) {
    helper.fail(
      helper.t("missingNumber", "Don't forget to enter the number of the Pull Request you contributed with!")
    );
    return;
  }

  if (repositoryOwner === "twilio-labs" && repository === "open-pixel-art") {
    helper.fail(helper.t("previousRepo", "You can't count your Open Pixel Art contribution again!"));
    return;
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${repositoryOwner}/${repository}/pulls/${prNumber}`
    );

    if (response.status !== 200) {
      helper.fail(
        helper.t(
          "notFound",
          "We could not find the Pull Request #{{prNumber}} on {{repositoryOwner}}'s repository \"{{repository}}\"!",
          { prNumber, repositoryOwner, repository }
        )
      );
      return;
    }

    const parsedResponseBody = await response.json();
    const isPrClosed = parsedResponseBody.state === "closed";
    const isPrMerged = parsedResponseBody.merged === true;
    const prOwner = parsedResponseBody.user.login;

    if (prOwner.toLowerCase() !== TQ_GITHUB_USERNAME.toLowerCase()) {
      helper.fail(
        helper.t(
          "wrongOwner",
          "We found the Pull Request #{{prNumber}} on {{repositoryOwner}}'s repository \"{{repository}}\", but it doesn't belong to your GitHub user \"{{TQ_GITHUB_USERNAME}}\"!",
          { prNumber, repositoryOwner, repository, TQ_GITHUB_USERNAME }
        )
      );
      return;
    }

    if (isPrClosed && !isPrMerged) {
      helper.fail(
        helper.t(
          "closed",
          "We found the Pull Request #{{prNumber}} on {{repositoryOwner}}'s repository \"{{repository}}\", but it was closed without being merged!",
          { prNumber, repositoryOwner, repository }
        )
      );
      return;
    }

    if (!isPrMerged) {
      helper.fail(
        helper.t(
          "unmerged",
          "We found the Pull Request #{{prNumber}} on {{repositoryOwner}}'s repository \"{{repository}}\", but it has not been merged yet!",
          { prNumber, repositoryOwner, repository }
        )
      );
      return;
    }

    return helper.success(
      helper.t(
        "merged",
        "We found the Pull Request #{{prNumber}} on {{repositoryOwner}}'s repository \"{{repository}}\" and it has been merged! Congratulations on your open source contribution!",
        { prNumber, repositoryOwner, repository }
      )
    );
  } catch (err) {
    helper.fail(
      helper.t("error", `Something went wrong when we tried to validate if your pull request was merged!
      
      {{err}}`, { err })
    );
  }
};
