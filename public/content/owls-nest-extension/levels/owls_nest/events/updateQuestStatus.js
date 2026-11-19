const LEVEL = 'owls_nest';
const TITLE = `Leaving the Owl's Nest`;

// Based on the current level state, determine what 
function updateQuestStatus(event, world, worldState) {
  let description = world.t('flipSwitch', `
    Use WASD or arrow keys to move, spacebar to interact. Flip the blue switch!
  `);
  let complete = false;

  if (worldState.movementSwitch) {
    description = world.t('findTool', `
      Get the hacking tool from the pedestal and use it to bypass the security
      terminal.
    `);
  }

  if (worldState.firstObjectiveHacked) {
    description = world.t('takeCommand', `
      Talk to Kevin and Cedric, then take command of the Fog Owl!
    `);
  }

  if (worldState.fredricThreatReceived) {
    description = world.t('findRyan', `
      Get the self-destruct override codes from Ryan! You'll need a fire 
      extinguisher.
    `);
  }

  if (worldState.ryanSaved) {
    description = world.t('stopCountdown', `
      Use the override codes to abort the Fog Owl's self-destruct sequence!
    `);
  }

  if (worldState.missionComplete) {
    description = world.t('beginAdventure', `
      Board the Fog Owl and begin your adventure!
    `);
    complete = true;
  }

  world.updateQuestStatus(LEVEL, world.t('questTitle', TITLE), description, complete);
}

module.exports = updateQuestStatus
