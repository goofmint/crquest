module.exports = async helper => {
  const { TQ_OPEN_PIXEL_ART_PR_NUMBER } = helper.env;

  try {
    const response = await fetch(
      `https://api.github.com/repos/twilio-labs/open-pixel-art/pulls/${TQ_OPEN_PIXEL_ART_PR_NUMBER}`
    );

    if (response.status !== 200) {
      helper.fail(
        helper.t(
          "notFound",
          "We could not find the Pull Request #{{TQ_OPEN_PIXEL_ART_PR_NUMBER}} on the Open Pixel Art remote repository\"!",
          { TQ_OPEN_PIXEL_ART_PR_NUMBER }
        )
      );
      return;
    }

    const parsedResponseBody = await response.json();
    const isPrClosed = parsedResponseBody.state === 'closed';
    const isPrMerged = parsedResponseBody.merged === true;

    if (isPrClosed && !isPrMerged) {
      helper.fail(
        helper.t(
          "closed",
          "We found the Pull Request #{{TQ_OPEN_PIXEL_ART_PR_NUMBER}} on the Open Pixel Art remote repository, but it was closed without being merged!",
          { TQ_OPEN_PIXEL_ART_PR_NUMBER }
        )
      );
      return;
    }

    if (!isPrMerged) {
      helper.fail(
        helper.t(
          "unmerged",
          "We found the Pull Request #{{TQ_OPEN_PIXEL_ART_PR_NUMBER}} on the Open Pixel Art remote repository, but it has not been merged yet!",
          { TQ_OPEN_PIXEL_ART_PR_NUMBER }
        )
      );
      return;
    }

    return helper.success(
      helper.t(
        "merged",
        "We found the Pull Request #{{TQ_OPEN_PIXEL_ART_PR_NUMBER}} on the Open Pixel Art remote repository and it has been merged! Congratulations on your open source contribution!",
        { TQ_OPEN_PIXEL_ART_PR_NUMBER }
      )
    );
  } catch (err) {
    helper.fail(
      helper.t("error", `Something went wrong when we tried to validate if your Open Pixel Art pull request was merged!
      
      {{err}}`, { err })
    );
  }
};
