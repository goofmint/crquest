const { execGitWithArgs } = require("../../../../scripts/objectiveValidation");

module.exports = async (helper) => {
  const { TQ_GITHUB_USERNAME, TQ_OPEN_PIXEL_ART_DIR } = helper.env;

  if (!TQ_GITHUB_USERNAME) {
    helper.fail(
      helper.t(
        "missingGitHubUser",
        "You do not have the environment variable <span class=\"highlight\">TQ_GITHUB_USERNAME</span> set. Return to a previous objective to make sure its set correctly!"
      )
    );
    return;
  }

  if (!TQ_OPEN_PIXEL_ART_DIR) {
    helper.fail(
      helper.t(
        "missingDirectory",
        "You do not have the environment variable <span class=\"highlight\">TQ_OPEN_PIXEL_ART_DIR</span> set. Return to a previous objective to make sure its set correctly!"
      )
    );
    return;
  }

  try {
    const gitRemote = await execGitWithArgs(helper, ["remote", "-v"], {
      cwd: TQ_OPEN_PIXEL_ART_DIR,
    });

    const remoteStrings = gitRemote.stdout.trim().split("\n");
    const remotes = remoteStrings.map((remoteString) =>
      remoteString.split(/\s+/)
    );

    const upstreamRemotes = remotes.filter(([name]) => name === "upstream");

    if (upstreamRemotes.length === 0) {
      helper.fail(
        helper.t("missingRemote", "We didn't find a local remote named \"upstream\"! Did you create one yet?")
      );
      return;
    }

    const isUpstreamUrlCorrect = remotes.find(
      ([, url]) =>
        url === "https://github.com/twilio-labs/open-pixel-art.git" ||
        url === "git@github.com:twilio-labs/open-pixel-art.git"
    );

    if (!isUpstreamUrlCorrect) {
      helper.fail(
        helper.t("wrongRemote", `We found your "upstream" remote, but it doesn't seem to have the correct URL.
        
        It should look like this:
        https://github.com/twilio-labs/open-pixel-art.git
        
        Run git remote -v in your terminal to verify it!`)
      );
      return;
    }

    const openPixelArtResponse = await fetch(
      `https://api.github.com/repos/twilio-labs/open-pixel-art/branches/master`
    );

    if (openPixelArtResponse.status !== 200) {
      helper.fail(helper.t("upstreamUnavailable", `We couldn't connect to the Open Pixel Art repository!
      
      {{status}} {{statusText}}`, { status: openPixelArtResponse.status, statusText: openPixelArtResponse.statusText }));
      return;
    }

    const playerResponse = await fetch(
      `https://api.github.com/repos/${TQ_GITHUB_USERNAME}/open-pixel-art/branches/master`
    );

    if (playerResponse.status !== 200) {
      helper.fail(helper.t("forkUnavailable", `We couldn't find the "open-pixel-art" repository for your user "{{TQ_GITHUB_USERNAME}}"!
      
      {{status}} {{statusText}}`, { TQ_GITHUB_USERNAME, status: playerResponse.status, statusText: playerResponse.statusText }));
      return;
    }

    if (
      (await playerResponse.json()).commit.sha !==
      (await openPixelArtResponse.json()).commit.sha
    ) {
      helper.fail(
        helper.t(
          "outOfSync",
          "The Open Pixel Art repository and the \"open-pixel-art\" repository for your user \"{{TQ_GITHUB_USERNAME}} are out of sync\"! New changes may've been added since your last sync. Try syncing again!",
          { TQ_GITHUB_USERNAME }
        )
      );
      return;
    }

    return helper.success(
      helper.t(
        "synced",
        "The Open Pixel Art repository and the \"open-pixel-art\" repository for your user \"{{TQ_GITHUB_USERNAME}} are in sync! These may get out of sync in the future as other users make changes to the repository!",
        { TQ_GITHUB_USERNAME }
      )
    );
  } catch (err) {
    helper.fail(
      helper.t("error", `Something went wrong when we tried to validate if your Open Pixel Art fork was synchronized!
      
      {{err}}`, { err })
    );
  }
};
