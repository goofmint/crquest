const LEVEL = "tower_exterior";
const TITLE = `Entering the Tower`;

// Based on the current level state, determine what
function updateQuestStatus({
  event,
  world,
  worldState,
  TOOLBOX_COUNT_TO_FIND,
}) {
  let description = world.t("questFindEntrance", `
    Find the entrance to the Tower of Infinite Knowledge!
  `);
  let complete = false;

  if (worldState.towerExterior.hasStartedInitialTowerTween) {
    description = world.t("questFindWayInside", `
      Figure out how to get inside the tower.
    `);
  }

  if (worldState.towerExterior.toolboxesFound.length > 0) {
    description = world.t("questFindToolboxes", `
      Find the rest of the toolboxes!
    `);
  }

  console.log({
    worldState,
    len: worldState.towerExterior.toolboxesFound.length,
  });
  if (worldState.towerExterior.toolboxesFound.length >= TOOLBOX_COUNT_TO_FIND) {
    description = world.t("questTalkToExplorer", `
      Talk to the Cloud Explorer again.
    `);
  }

  if (worldState.towerExterior.openedPainPointCollector) {
    description = world.t("questEnterTower", `
      It's time to enter the tower!
    `);
    complete = true;
  }

  world.updateQuestStatus(LEVEL, world.t("questTitle", TITLE), description, complete);
}

module.exports = updateQuestStatus;
