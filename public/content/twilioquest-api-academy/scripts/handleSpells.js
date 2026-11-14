const helperFunctions = require("./helperFunctions");
const { useWand, SPELL_TYPE } = require("./useWand");

function getFormattedWorldStateMapName(levelName) {
  return (
    levelName
      // Uppercases the first character in levelName so long as it's not
      // part of the word "inside". This is important because of the current
      // naming convention used in worldState properties
      .replace(/^(.)(?!nside)/g, (_, $1) => $1.toUpperCase())
      // Removes underscores and uppercases the character immediately after them
      .replace(/_(.)/g, (_, $1) => $1.toUpperCase())
  );
}

function getWorldStateMapName(world) {
  let worldStateMapName = "";
  const levelName = world.getCurrentLevelName();
  const mapName = world.getCurrentMapName();

  // The current naming convention when the map is "default" is "inside{LevelName}", otherwise "inside{MapName}"
  if (mapName === "default") {
    worldStateMapName = getFormattedWorldStateMapName(levelName);
  } else {
    worldStateMapName = getFormattedWorldStateMapName(mapName);
  }

  // Prepend "inside" to the final map name if it isn't already there
  if (!worldStateMapName.includes("inside")) {
    worldStateMapName = "inside" + worldStateMapName;
  }

  return worldStateMapName;
}

module.exports = async function handleSpells(event, world, worldState) {
  if (!event.target.spellable || !event.target.interactable) {
    return;
  }

  const {
    applyDisappearTween,
    destroyObject,
    unlockObject,
    unlockTransition,
    openDoor,
  } = helperFunctions(event, world, worldState);
  const worldStateMapName = getWorldStateMapName(world);

  /*
   *
   * SPELL FUNCTION DEFINITIONS
   *
   */
  const spells = {
    disappear: (event) => disappear(event),
    move: (event) => move(event),
    unlock: (event) => unlock(event),
  };

  const disappear = (event) => {
    applyDisappearTween(event.target.group || event.target.key).then(() => {
      destroyObject(event.target.group || event.target.key);

      if (event.target.unlocksObject) {
        unlockObject(event.target.unlocksObject);
      }
      if (event.target.unlocksTransition) {
        unlockTransition(event.target.unlocksTransition);
      }
    });
  };

  const move = (event) => {}; // coming soon

  const unlock = (event) => {
    openDoor(event.target.group || event.target.key);
  };

  const allObstacleSpellRequirementsAreMet = (group) => {
    const worldStateMap = worldState[worldStateMapName];

    if (!worldStateMap) {
      console.warn(
        `No "${worldStateMapName}" property found! Make sure one exists in your event.js file's worldState.`
      );

      return true;
    }

    const entities = worldStateMap.entities;

    if (!entities) {
      console.warn(
        `No "${worldStateMap}.entities" property could be found in your event.js file's worldState!`
      );

      return true;
    }

    const entity = entities[group];

    if (!entity) {
      console.warn(
        `No "${group}" entity could be found in "${worldStateMapName}.entities" as part of your event.js file's worldState! Make sure it shares the name of the Tiled Object's "group" property (or "key" property if you're not using "group").`
      );

      return true;
    }

    const entitySpell = entity.spell[event.target.spell_type];

    if (!entitySpell) {
      console.warn(
        `No "${event.target.spell_type}" property found in "${worldStateMapName}.entities["${group}"].spell!`
      );

      return true;
    }

    const entitySpellRequirementEntries = Object.entries(
      entitySpell.requirements
    );
    let allRequirementsAreMet = true;

    if (entitySpell.preRequirementCheckCallback) {
      // Used to execute logic prior to the requirements check, that has no bearing on whether the requirements are met or not
      entitySpell.preRequirementCheckCallback({ event, world, worldState });
    }

    // Invokes all of the requirement predicate functions for the target entity and calls the
    // associated success/failure method for each one if they exist
    for (let i = 0; i < entitySpellRequirementEntries.length; i++) {
      const [key, predicate] = entitySpellRequirementEntries[i];
      const requirementMet = predicate({ event, world, worldState });
      const actions = requirementMet ? "successActions" : "failureActions";

      if (entitySpell[actions] && entitySpell[actions][key]) {
        entitySpell[actions][key]({ event, world, worldState });
      }

      if (!requirementMet) {
        allRequirementsAreMet = false;
        break;
      }
    }

    if (entitySpell.postRequirementCheckCallback) {
      // Used to execute logic following the requirements check, that has no bearing on whether the requirements are met or not
      entitySpell.postRequirementCheckCallback({
        event,
        world,
        worldState,
        allRequirementsAreMet,
      });
    }

    return allRequirementsAreMet;
  };

  const runSpell = async (event) => {
    if (
      !allObstacleSpellRequirementsAreMet(
        event.target.group || event.target.key
      )
    ) {
      return;
    }

    const targetSpellColor = event.target.spell_color
      ? SPELL_TYPE[event.target.spell_color.trim().toUpperCase()]
      : SPELL_TYPE.RED;
    await useWand(world, targetSpellColor);
    spells[event.target.spell_type](event);
  };

  runSpell(event);
};
