const merge = require("lodash.merge");
const updateQuestStatus = require("./events/updateQuestStatus");
const viewTower = require("./events/viewTower");

const WORLD_STATE_KEY = "com.twilioquest.developer-fundamentals";
const TOOLBOX_COUNT_TO_FIND = 3;
const toolBoxContents = [
  ["toolboxFileTree", 'This box contains a diagram labeled "file tree". Maybe there will be a nice forest inside the tower?'],
  ["toolboxTerminal", 'This box contains a weird bunch of text called a "terminal". This must be how the dinosaurs used computers!'],
  ["toolboxShells", 'This box contains a list of "shells". I wonder if they\'ll be sold over by the seashore.'],
];

const INITIAL_STATE = {
  towerExterior: {
    hasStartedInitialTowerTween: false,
    playerWantsToLearn: "",
    toolboxesFound: [],
    openedPainPointCollector: false,
  },
};

module.exports = function (event, world) {
  const worldState = merge(INITIAL_STATE, world.getState(WORLD_STATE_KEY));

  if (event.name === "playerDidInteract" && event.target.key === "telescope") {
    viewTower(world);
  }

  if (
    event.name === "triggerAreaWasEntered" &&
    event.target.key === "triggerViewTower" &&
    !worldState.towerExterior.hasStartedInitialTowerTween
  ) {
    worldState.towerExterior.hasStartedInitialTowerTween = true;

    viewTower(world);
  }

  if (
    event.name === "playerDidInteract" &&
    event.target.key &&
    event.target.key.includes("toolbox")
  ) {
    // If new toolbox, add to toolBoxes found
    // Hide toolbox entity
    const toolBoxKey = event.target.key;

    if (!worldState.towerExterior.toolboxesFound.includes(toolBoxKey)) {
      worldState.towerExterior.toolboxesFound.push(toolBoxKey);
    }

    const toolboxCountFound = worldState.towerExterior.toolboxesFound.length;
    const content = toolBoxContents[toolboxCountFound - 1];
    const summary = content ? world.t(...content) + " <br/><br/> " : "";
    if (toolboxCountFound >= TOOLBOX_COUNT_TO_FIND) {
      // There are 6 toolboxes, player can find more than 3.
      world.showNotification(
        summary + world.t(
          "toolboxesComplete",
          'I\'ve found all the toolboxes I needed to fix the <span class="highlight">New Developer Pain Point Collector!</span>'
        )
      );
    } else {
      const remainingToolBoxes = TOOLBOX_COUNT_TO_FIND - toolboxCountFound;
      const remainingMessage = remainingToolBoxes === 1
        ? world.t(
            "toolboxRemaining",
            '<span class="highlight">I still need to find {{count}} more toolbox!</span>',
            { count: remainingToolBoxes }
          )
        : world.t(
            "toolboxesRemaining",
            '<span class="highlight">I still need to find {{count}} more toolboxes!</span>',
            { count: remainingToolBoxes }
          );
      world.showNotification(summary + remainingMessage);
    }
  }

  // Hide all found toolboxes
  worldState.towerExterior.toolboxesFound.forEach((toolBoxKey) => {
    world.hideEntities(toolBoxKey);
  });

  const toolboxCountFound = worldState.towerExterior.toolboxesFound.length;
  if (toolboxCountFound >= TOOLBOX_COUNT_TO_FIND) {
    // All toolboxes found, replace cloud explorer with new conversation
    world.destroyEntities("space-explorer-initial");
    // TODO: This destroy causes some console errors since destroy is not cleaning up onComplete event listeners properly for animations. We should address this in the twilioquest repository.
    // We cannot use hide since interactable is still true when hidden.
    world.showEntities("space-explorer-pain-point");
  } else {
    world.showEntities("space-explorer-initial");
    // TODO: See above if statement (this hide does nothing for interactions
    // since other npc copy is rendered on top and takes precedence, still
    // need to hide in case animations diverge.
    world.hideEntities("space-explorer-pain-point");
  }

  if (
    event.name === "playerDidInteract" &&
    event.target.key === "door-dev-tower"
  ) {
    if (worldState.towerExterior.openedPainPointCollector) {
      world.showNotification(world.t("towerOpen", "The tower is open now!"));
    } else if (toolboxCountFound >= TOOLBOX_COUNT_TO_FIND) {
      world.showNotification(
        world.t(
          "speakToExplorer",
          'I should speak to the <span class="highlight">Cloud Explorer</span> now that the <span class="highlight">New Developer Pain Point Collector</span> is fixed!'
        )
      );
    } else {
      world.showNotification(
        world.t(
          "towerLocked",
          "The tower doors won't budge... I should keep looking around and see if there's a way to open them."
        )
      );
    }
  }

  if (worldState.towerExterior.openedPainPointCollector) {
    world.forEachEntities("door-dev-tower", (door) => {
      door.state && door.state.fsm && door.state.fsm.action("open");
      door.interactable = false;
    });
  }

  updateQuestStatus({ event, world, worldState, TOOLBOX_COUNT_TO_FIND });

  world.setState(WORLD_STATE_KEY, worldState);
};
