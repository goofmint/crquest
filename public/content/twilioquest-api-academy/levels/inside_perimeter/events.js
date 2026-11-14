const merge = require("lodash.merge");
const { PRE_ACADEMY_STATE_KEY } = require("../../scripts/config");
const handleSpells = require("../../scripts/handleSpells");
const helperFunctions = require("../../scripts/helperFunctions");

const LEVEL_STATE = {
  destroyedEntities: [],
  unlockedEntities: [],
  unlockedTransitions: [],
  unhackableEntities: [],
  spellsEarned: [],
  sortedHouse: null,
  houses: [
    { name: "hopper", id: 1, magicScore: 0 },
    { name: "lovelace", id: 2, magicScore: 0 },
    { name: "turing", id: 3, magicScore: 0 },
    { name: "neumann", id: 4, magicScore: 0 },
  ],
  insidePerimeter: {
    hasWand: false,
    enteredPerimeterFirstTime: false,
    entities: {
      bramble_path: {
        spell: {
          disappear: {
            preRequirementCheckCallback({ event, world }) {
              world.forEachEntities(
                ({ instance }) => instance.group === event.target.group,
                (bramble) => {
                  bramble.setInteractable(false);
                }
              );
            },
            postRequirementCheckCallback({
              event,
              world,
              allRequirementsAreMet,
            }) {
              if (allRequirementsAreMet) {
                return;
              }

              world.forEachEntities(
                ({ instance }) => instance.group === event.target.group,
                (bramble) => {
                  bramble.setInteractable(true);
                }
              );
            },
            requirements: {
              hasWand({ worldState }) {
                return worldState.insidePerimeter.hasWand;
              },
              hasDisappearSpell({ event, worldState }) {
                return worldState.spellsEarned.includes(
                  event.target.spell_type
                );
              },
            },
            failureActions: {
              hasWand({ world }) {
                world.showNotification(
                  "I should go find the toolshed and see if there is an extra wand inside!"
                );
              },
              hasDisappearSpell({ world }) {
                world.showNotification(
                  "I think I need to learn a spell later to do anything here!"
                );
              },
            },
          },
        },
      },
    },
  },
  insideCatacombs: {
    keySpellsObtained: [],
    hasCredentials: false,
    hasKey: false,
    openedScrollRoomDoor: false,
    hasPledgeScroll: false,
    tweenRunning: false,
  },
};

const CLEAR_STATE = {
  destroyedEntities: [],
  unlockedEntities: ["magic_key"],
  unlockedTransitions: [],
  unhackableEntities: [],
  spellsEarned: ["disappear"],
  sortedHouse: null,
  houses: [
    { name: "hopper", id: 1, magicScore: 0 },
    { name: "lovelace", id: 2, magicScore: 0 },
    { name: "turing", id: 3, magicScore: -1 },
    { name: "neumann", id: 4, magicScore: 0 },
  ],
  insidePerimeter: {
    hasWand: true,
    enteredPerimeterFirstTime: true,
  },
  insideCatacombs: {
    keySpellsObtained: [
      "lovelace_flame",
      "hopper_flame",
      "turing_flame",
      "neumann_flame",
    ],
    hasCredentials: false,
    hasKey: false,
    hasPledgeScroll: false,
    tweenRunning: false,
  },
};

module.exports = async function (event, world) {
  const worldState = merge(LEVEL_STATE, world.getState(PRE_ACADEMY_STATE_KEY));

  const { unlockObject, destroyObject, unhackObject, openDoor } =
    helperFunctions(event, world, worldState);

  /*
   *
   * INTERACTION FUNCTION DEFINITIONS
   *
   */
  const runObjectNotification = ({ target: { key = "default" } }) => {
    world.startConversation(key, key + ".png");
  };

  const npcChecks = {
    ghost: () => checkCredentials(),
  };

  const checkCredentials = () => {
    const { env } = world.getContext();

    if (
      env.hasOwnProperty("TQ_TWILIO_ACCOUNT_SID") &&
      env.hasOwnProperty("TQ_TWILIO_AUTH_TOKEN")
    )
      twilioApiSetupComplete();
  };

  const runNpcChecks = (event) => {
    npcChecks[event.target.key]();
  };

  const openScrollRoomDoor = async () => {
    if (worldState.insideCatacombs.hasKey) {
      if (!event.target.interactable) {
        return;
      }

      worldState.insideCatacombs.openedScrollRoomDoor = true;

      world.disablePlayerMovement();
      world.useTool("wand");
      world.forEachEntities("scroll_room_door", (door) => {
        door.setInteractable(false);
      });
      await world.wait(1000);
      openDoor("scroll_room_door");
      world.stopUsingTool();
      await world.wait(1000);
      world.enablePlayerMovement();
    } else {
      world.showNotification(
        "I need the magic key to unlock the Scroll Room. I should activate all the house statues inside these Catacombs before returning."
      );
    }
  };

  /*
   *
   * OBJECTIVE COMPLETE FUNCTION DEFINITIONS
   *
   */
  const objectives = {
    twilio_api_setup: () => twilioApiSetupComplete(),
    obtain_wand: () => obtainWandComplete(),
    lovelace_key: () => obtainKeySpellComplete("lovelace_flame"),
    hopper_key: () => obtainKeySpellComplete("hopper_flame"),
    neumann_key: () => obtainKeySpellComplete("neumann_flame"),
    turing_key: () => obtainKeySpellComplete("turing_flame"),
  };

  const twilioApiSetupComplete = () => {
    worldState.insideCatacombs.hasCredentials = true;
    unhackObject("statue_credentials");
    // destroyObject('catacombs_barrier');

    // TODO: make this work, get rid of destroy object
    openDoor("catacombs_barrier");
  };

  const obtainWandComplete = () => {
    worldState.insidePerimeter.hasWand = true;
  };

  const obtainKeySpellComplete = (object) => {
    unlockObject(object);
    if (!worldState.insideCatacombs.keySpellsObtained.includes(object))
      worldState.insideCatacombs.keySpellsObtained.push(object);

    if (worldState.insideCatacombs.keySpellsObtained.length == 4) {
      world.grantItems(["magic_key"]);
      unlockObject("magic_key");
      world.forEachEntities("magic_key", (magicKey) => {
        magicKey.setInteractable(true);
      });
    }
  };

  const runObjectiveEffects = ({ objective }) => {
    if (objectives[objective]) {
      objectives[objective]();
    }
  };

  const runUpdateMagicScore = ({ objective }) => {
    worldState.houses.map((house) => {
      if (objective.includes(house.name)) {
        house.magicScore += 1;
      }

      return house;
    });
  };

  /*
   *
   * ITEM RELATED FUNCTION DEFINITIONS
   *
   */
  const items = {
    magic_key: (event) => addMagicKey(event),
    pledge_scroll: (event) => addPledgeScroll(event),
  };

  const addMagicKey = (event) => {
    if (!event.target.interactable) {
      return;
    }

    worldState.insideCatacombs.hasKey = true;
    if (!worldState.spellsEarned.includes("unlock"))
      worldState.spellsEarned.push("unlock");
    destroyObject("magic_key");
    world.showNotification(
      "I've obtained the magic key. I should go and claim my pledge scroll!"
    );

    // TODO: actually add item to inventory
    tweenToScroll();
  };

  const addPledgeScroll = (event) => {
    worldState.insideCatacombs.hasPledgeScroll = true;
    destroyObject("pledge_scroll");
    world.showNotification(
      "I've obtained my pledge scroll. Time to head to the Main Hall and choose my house."
    );

    world.grantItems(["pledge_scroll"]);
    determineHouse();
  };

  const determineHouse = () => {
    const bestScore = Math.min(
      ...worldState.houses.map((house) => house.magicScore)
    );
    const bestHouses = worldState.houses.filter(
      (house) => house.magicScore == bestScore
    );
    const randomIndex = Math.floor(Math.random() * bestHouses.length);
    const chosenHouse = bestHouses[randomIndex];

    worldState.sortedHouse = chosenHouse.name;

    // After assigning house, tell player they've completed the
    // current content. They'll learn their house later.
    // TODO: Update this notification on future release version.
    world.showNotification(
      "I got my pledge scroll! I should head to the Main Hall to choose my house now!"
    );
    world.updateQuestStatus(
      world.__internals.level.levelName,
      world.__internals.level.levelProperties.questTitle,
      "I got my pledge scroll! I should head to the Main Hall to choose my house now!",
      true
    );
  };

  const runAddItem = (event) => {
    items[event.target.key](event);
  };

  const tweenToScroll = () => {
    if (worldState.insideCatacombs.tweenRunning) {
      return;
    }

    worldState.insideCatacombs.tweenRunning = true;

    world.forEachEntities("scroll_viewpoint", async (viewpoint) => {
      world.disablePlayerMovement();

      await world.tweenCameraToPosition({
        x: viewpoint.startX,
        y: viewpoint.startY,
      });

      await world.wait(3000);
      await world.tweenCameraToPlayer();

      world.enablePlayerMovement();
      worldState.insideCatacombs.tweenRunning = false;
    });
  };

  /*
   *
   * EVENT HANDLING
   *
   */

  /*
   * Handles returning level to last object state
   */
  if (event.name === "mapDidLoad") {
    if (worldState.insideCatacombs.keySpellsObtained.length == 4) {
      world.forEachEntities("magic_key", (magicKey) => {
        magicKey.setInteractable(true);
      });
    }

    if (
      worldState.insideCatacombs.hasPledgeScroll &&
      !worldState.unlockedTransitions.includes("exit_to_courtyard")
    ) {
      worldState.unlockedTransitions.push("exit_to_courtyard");
    }

    // destroy all previously destroyed objects
    world.destroyEntities(({ instance }) =>
      worldState.destroyedEntities.includes(instance.group || instance.key)
    );

    // show all previously unlocked objects
    world.showEntities(({ instance }) =>
      worldState.unlockedEntities.includes(instance.group || instance.key)
    );

    // show all previously unlocked transitions
    world.enableTransitionAreas(({ instance }) =>
      worldState.unlockedTransitions.includes(instance.name)
    );

    // change hack status of all no longer hackable items
    world.forEachEntities(
      ({ instance }) =>
        worldState.unhackableEntities.includes(instance.group || instance.key),
      (entity) => {
        entity.hackable = false;
      }
    );

    // for first run though
    if (worldState.insideCatacombs.hasCredentials) {
      // destroyObject("catacombs_barrier");
      openDoor("catacombs_barrier");
      unhackObject("statue_credentials");
    }

    if (worldState.insideCatacombs.openedScrollRoomDoor) {
      openDoor("scroll_room_door");

      world.forEachEntities("scroll_room_door", (door) => {
        door.setInteractable(false);
      });
    }

    // Adjust object dimensions
    world.forEachEntities(
      ({ instance }) => instance.layer === "upper",
      (object) => {
        // To force "upper" layer objects to render above objects
        // they're placed on top of, we must hack their physics
        // body size.
        //
        // To do this, we're going to add a hard coded 1000 pixels
        // to the height of these objects. This is not perfect,
        // but should function fine for this mission.
        object.sprite.body.height += 1000;

        // These sprites will all have their bodies disabled.
        // This new tall sprite body will impede a lot of player
        // movement space otherwise.
        object.sprite.body.enable = false;
      }
    );
  }

  /*
   * Handles object interactions
   */
  if (event.name === "playerDidInteract") {
    handleSpells(event, world, worldState);
    if (event.target.notify) runObjectNotification(event);
    if (event.target.npc) runNpcChecks(event);
    if (event.target.item) runAddItem(event);
    if (event.target.key === "scroll_room_door") await openScrollRoomDoor();
  }

  /*
   * Handles objective completions & failures
   */
  if (
    event.name === "objectiveCompleted" ||
    event.name === "objectiveCompletedAgain"
  ) {
    runObjectiveEffects(event);
  }

  if (event.name === "objectiveFailed") {
    runUpdateMagicScore(event);
  }

  /**
   * Handles Trigger Areas
   */
  if (event.name === "triggerAreaWasEntered") {
    if (
      event.target.key === "triggerGroundskeeperConversation" &&
      !worldState.insidePerimeter.groundskeeper_introduction
    ) {
      world.startConversation("groundskeeper", "groundskeeper.png");
    }
  }

  if (worldState.insideCatacombs.hasPledgeScroll) {
    world.updateQuestStatus(
      world.__internals.level.levelName,
      world.__internals.level.levelProperties.questTitle,
      "I got my pledge scroll! I should head to the Main Hall to choose my house now!",
      true
    );
  }

  world.setState(PRE_ACADEMY_STATE_KEY, worldState);
};
