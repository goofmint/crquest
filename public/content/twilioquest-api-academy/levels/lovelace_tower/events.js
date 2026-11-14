const merge = require("lodash.merge");
const updateQuestLogWhenComplete = require("../../scripts/updateQuestLogWhenComplete");
const packageInfo = require("../../package.json");
const { LOVELACE_TOWER_STATE_KEY } = require("../../scripts/config");
const handleSpells = require("../../scripts/handleSpells");

const INITIAL_STATE = {
  destroyedEntities: [],
  unlockedTransitions: [],
  hiddenEntities: [],
  spelledEntities: [],
  insideLovelaceTower: {
    usedSpellOnLibraryDoor: false,
    entities: {
      "api-door-1": {
        spell: {
          unlock: {
            requirements: {
              enableLevelChange() {
                return true;
              },
            },
            successActions: {
              enableLevelChange({ event, world, worldState }) {
                world.enableTransitionAreas(
                  ({ instance }) => instance.key === "exit_to_lovelace_library"
                );
                worldState.insideLovelaceTower.usedSpellOnLibraryDoor = true;
              },
            },
          },
        },
      },
    },
  },
  insideLibrary: {
    usedSpellOnLibraryDoor: false,
    entities: {
      "api-door-1": {
        spell: {
          unlock: {
            requirements: {
              enableLevelChange() {
                return true;
              },
            },
            successActions: {
              enableLevelChange({ event, world, worldState }) {
                world.enableTransitionAreas(
                  ({ instance }) => instance.key === "exit_to_lovelace_corridor"
                );
                worldState.insideLibrary.usedSpellOnLibraryDoor = true;
              },
            },
          },
        },
      },
    },
  },
  obj4Complete: false,
  fredricNoteTriggered: false,
};

module.exports = async function (event, world) {
  const worldState = merge(
    INITIAL_STATE,
    world.getState(LOVELACE_TOWER_STATE_KEY)
  );

  // Taken fom https://github.com/TwilioQuest/twilioquest-dev-fundamentals/blob/main/levels/tower_of_knowledge/events.js#:~:text=%7D-,//%20Match%20objectives%20to%20shelves%20they%20should%20unlock%20when%20an,%7D,-//%20Hide%20entities
  const unlockPairs = [
    ["api-01-local-function", "api-hidden-door-1"],
    ["api-02-async-await", "api-hidden-door-2"],
    ["api-03-fetch", "api-hidden-door-3"],
  ];

  if (
    event.name === "objectiveCompleted" ||
    event.name === "objectiveCompletedAgain"
  ) {
    unlockPairs.forEach(([objectiveKey, hiddenDoorKey]) => {
      if (
        event.objective === objectiveKey &&
        !worldState.hiddenEntities.includes(hiddenDoorKey)
      ) {
        worldState.hiddenEntities.push(hiddenDoorKey);
      }
    });
  }

  worldState.hiddenEntities.forEach((hiddenEntityKey) => {
    world.hideEntities(hiddenEntityKey);
  });

  if (event.name === "mapDidLoad") {
    if (
      (event.mapName === "default" &&
        worldState.insideLovelaceTower.usedSpellOnLibraryDoor) ||
      (event.mapName === "library" &&
        worldState.insideLibrary.usedSpellOnLibraryDoor)
    ) {
      world.forEachEntities("api-door-1", (door) => {
        door.setInteractable(false);
        door.spellable = false;

        if (door.state && door.state.fsm) {
          door.state.fsm.action("open");
        }
      });

      world.destroyEntities(
        ({ instance }) => instance.key === "api-door-1-sparkle"
      );
    }
  }

  if (event.name === "playerDidInteract") {
    if (event.target.key === "inscription-fragment") {
      world.startConversation(
        event.target.conversation,
        event.target.conversationAvatar
      );
    }

    handleSpells(event, world, worldState);

    if (event.target.key === "api-door-1" && event.target.spellable) {
      world.destroyEntities("api-door-1-sparkle");
      event.target.setInteractable(false);
    }
  }

  // Operator observations on barriers
  if (
    event.name === "triggerAreaWasEntered" &&
    event.target.key === "lockedDoorLibrary" &&
    !world.isObjectiveCompleted("api-05-get-patch")
  ) {
    world.showNotification(
      "I should complete the last objective to clean up this mess!"
    );
  }

  if (
    event.name === "triggerAreaWasEntered" &&
    event.target.key === "objectiveBarrier1" &&
    !world.isObjectiveCompleted("api-01-local-function")
  ) {
    world.showNotification(
      "I need to complete the current objective before I can pass through to the next room."
    );
  }

  if (
    event.name === "triggerAreaWasEntered" &&
    event.target.key === "objectiveBarrier2" &&
    !world.isObjectiveCompleted("api-02-async-await")
  ) {
    world.showNotification(
      "I need to complete the current objective before I can pass through to the next room."
    );
  }

  if (
    event.name === "triggerAreaWasEntered" &&
    event.target.key === "objectiveBarrier3" &&
    !world.isObjectiveCompleted("api-03-fetch")
  ) {
    world.showNotification(
      "I need to complete the current objective before I can pass through to the next room."
    );
  }

  // Set obj4Complete and make door no longer interactable
  if (world.isObjectiveCompleted("api-04-remote-and-local")) {
    worldState.obj4Complete = true;
    world.destroyEntities(`library-door-locked`);
  }

  // Library door inside Lovelace Library interactable / not spellable before Obj 04 is complete / launches dialogue box
  if (event.name === "playerDidInteract") {
    if (event.target.key === "library-door-locked") {
      if (!world.isObjectiveCompleted("api-04-remote-and-local")) {
        console.log(event.target);
        world.startConversation(
          event.target.conversation,
          event.target.conversationAvatar
        );
      }
    }
  }

  // Make Fredric note interactable upon subsequent reentries into library
  if (worldState.fredricNoteTriggered === true) {
    world.forEachEntities("fredricNote", (note) => {
      note.interactable = true;
      disableBody = false;
    });
  }

  // if player interacts with note after initial trigger takes place
  if (
    event.name === "playerDidInteract" &&
    event.target.key === "fredricNote" &&
    worldState.fredricNoteTriggered === true
  ) {
    world.startConversation("fredric-threat-lovelace", "fredricNeutral.png");
  }

  // Once the final objective has been hacked and closed, hide books and empty shelves
  if (world.isObjectiveCompleted("api-05-get-patch")) {
    world.hideEntities(`badBook`);

    world.enableTransitionAreas("exit_to_library_corridor");

    // As player tries to leave, trigger Fredric conversation
    if (
      event.name === "triggerAreaWasEntered" &&
      event.target.key === "fredricTrigger" &&
      worldState.fredricNoteTriggered === false
    ) {
      world.startConversation("fredric-threat-lovelace", "fredricNeutral.png");
    }

    // When Fredric trigger closes, Fredric letter becomes interactable
    if (
      event.name === "conversationDidEnd" &&
      event.npc.conversation === "fredric-threat-lovelace"
    ) {
      world.forEachEntities("fredricNote", (note) => {
        note.interactable = true;
        note.disableBody = false;
      });
      worldState.fredricNoteTriggered = true;
    }
  }

  updateQuestLogWhenComplete({
    notification:
      'I\'ve completed everything in the <span class="highlight">API Academy House Gauntlet</span> for now!',
    log: "I've completed everything in the API Academy House Gauntlet for now!",
    event,
    world,
    worldStateKey: LOVELACE_TOWER_STATE_KEY,
    version: packageInfo.version,
  });

  world.setState(LOVELACE_TOWER_STATE_KEY, worldState);
};
