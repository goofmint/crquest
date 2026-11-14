const SPELL_TYPE = {
  RED: 0,
  YELLOW: 32,
  GREEN: 64,
  BLUE: 96,
  PURPLE: 128,
};

/**
 * Makes the player character cast a spell of "spellType"
 * @param {object} world - The world object
 * @param {SPELL_TYPE} spellType - The type of spell that should be cast
 * @returns A promise that resolves once the player character is finished casting the spell
 */
function useWand(world, spellType) {
  const { game, player } = world.__internals.level;
  let sprite, frames;

  if (player.sprite.directionFrame === player.directionFrames.UP) {
    sprite = game.add.sprite(
      player.sprite.x,
      player.sprite.y - 32,
      "twilioQuestSpellUpDown"
    );

    frames = [80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95];
  }

  if (player.sprite.directionFrame === player.directionFrames.DOWN) {
    sprite = game.add.sprite(
      player.sprite.x,
      player.sprite.y,
      "twilioQuestSpellUpDown"
    );

    frames = [64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79];
  }

  if (player.sprite.directionFrame === player.directionFrames.LEFT) {
    sprite = game.add.sprite(
      player.sprite.x - 32,
      player.sprite.y,
      "twilioQuestSpellLeftRight"
    );

    frames = [80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95];
  }

  if (player.sprite.directionFrame === player.directionFrames.RIGHT) {
    sprite = game.add.sprite(
      player.sprite.x,
      player.sprite.y,
      "twilioQuestSpellLeftRight"
    );

    frames = [64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79];
  }

  const offsetFrames = frames.map((frame) => frame + spellType);
  // Adding the "empty" frame after offsetting
  offsetFrames.push(32);

  const animation = sprite.animations.add("cast", offsetFrames, 8);

  return new Promise(async (resolve) => {
    animation.onComplete.addOnce(() => {
      world.stopUsingTool();
      world.enablePlayerMovement();
      sprite.destroy();
      resolve();
    });

    world.disablePlayerMovement();
    world.useTool("wand");
    // Wait for the want to be raised
    await world.wait(700);
    sprite.animations.play("cast");
  });
}

module.exports = { useWand, SPELL_TYPE };
