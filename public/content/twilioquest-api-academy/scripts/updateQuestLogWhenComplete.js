const compareVersions = require("compare-versions");

async function updateQuestLogWhenComplete({
  notification,
  log,
  event,
  world,
  worldStateKey,
  version,
  questKey,
  questTitle,
  minimumTargetVersion,
}) {
  const notValidEventTypes = [
    "levelDidLoad",
    "mapDidLoad",
    "objectiveDidClose",
  ];
  if (notValidEventTypes.includes(event.name)) {
    return;
  }

  if (!(await world.isLevelCompleted())) {
    return;
  }

  // Since this callback is happening async we need
  // to get the latest version of worldState. What we
  // have already above might be stale by now.
  const worldState = world.getState(worldStateKey);

  if (!hasMinimumTargetVersionLogged(worldState, minimumTargetVersion)) {
    world.showNotification(notification);
    world.updateQuestStatus(
      questKey || world.__internals.level.levelName,
      questTitle || world.__internals.level.levelProperties.questTitle,
      log,
      true
    );

    worldState.shownCompletionVersion = version;
    world.setState(worldStateKey, worldState);
  }
}

function hasMinimumTargetVersionLogged(worldState, minimumTargetVersion) {
  const { shownCompletionVersion } = worldState;

  // We have logged nothing yet
  if (!shownCompletionVersion) {
    return false;
  }

  // If no minimum target version is specified, we will
  // not make the version target check.
  if (!minimumTargetVersion) {
    return true;
  }

  // Have we saved a shownNotification for the minimum or greater version
  return compareVersions(shownCompletionVersion, minimumTargetVersion) >= 0;
}

module.exports = updateQuestLogWhenComplete;
