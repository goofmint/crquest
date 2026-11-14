module.exports = async helper => {
  const { TQ_GITHUB_USERNAME, TQ_OPEN_PIXEL_ART_BRANCH } = helper.env;

  try {
    const response = await fetch(
      `https://api.github.com/repos/${TQ_GITHUB_USERNAME}/open-pixel-art/branches/${TQ_OPEN_PIXEL_ART_BRANCH}`
    );

    if (response.status === 200) {
      return helper.success(
        `We found your branch "${TQ_OPEN_PIXEL_ART_BRANCH}" on your remote repository for the user "${TQ_GITHUB_USERNAME}"!`
      );
    } else {
      helper.fail(
        `We could not find your branch "${TQ_OPEN_PIXEL_ART_BRANCH}" on your remote repository "open-pixel-art" for the user "${TQ_GITHUB_USERNAME}"!`
      );
    }
  } catch (err) {
    helper.fail(
      `Something went wrong when we tried to validate your Open Pixel Art branch!
      
      ${err}`
    );
  }
};
