const { STATE_KEY, NAV_MAP_ARROW_KEY } = require("./config");

// In-progress guard (module scope, never persisted). events.js calls
// handleTutorial without awaiting it, and levelDidLoad / mapDidLoad arrive back
// to back, before hasSeenTutorial is set. Released in `finally` so a failed run
// can be retried by a later event.
let isTutorialRunning = false;

/**
 * Handle scripting and interaction for the fog owl tutorial.
 *
 * @param {LifecycleEvent} event - lifecycle event emitted by TQ
 * @param {WorldAPI} world - TQ World API
 * @param {object} worldState - current game world state (mutate to change)
 */
async function handleTutorial(event, world, worldState) {
  if (worldState.hasSeenTutorial || isTutorialRunning) {
    return;
  }
  isTutorialRunning = true;

  try {
    await runTutorial(world, worldState);
  } finally {
    isTutorialRunning = false;
  }
}

async function runTutorial(world, worldState) {
  await world.wait(1000);

  world.disablePlayerMovement();
  await world.tweenCameraToPosition({
    x: 528,
    y: 336,
  });
  world.showNotification(`
    <i>
      So this is the Fog Owl!<br/><br/>That platform looks like the <em>navigation 
      system</em> - I should be able to use it to travel to different parts of
      The Cloud.
    </i>
  `);
  await world.wait(6000);

  await world.tweenCameraToPosition({
    x: 732,
    y: 610,
  });
  world.showNotification(`
    <i>
      This area looks like some kind of VR training simulator.<br/><br/> I bet there are
      some training sims that can help <em>build my technical skills</em>!
    </i>
  `);
  await world.wait(6000);

  await world.tweenCameraToPlayer();
  world.showNotification(`
    <i>
      Time to get started!<br/><br/> I might want to say hi to Cedric and the crew as well.
    </i>
  `);
  world.enablePlayerMovement();

  worldState.showNavMapArrow = true;
  world.showEntities(NAV_MAP_ARROW_KEY);

  worldState.hasSeenTutorial = true;

  // Persist right away, on top of the latest state so that changes committed
  // to this key while the tutorial was running are not overwritten.
  world.setState(STATE_KEY, {
    ...world.getState(STATE_KEY),
    showNavMapArrow: true,
    hasSeenTutorial: true,
  });

  // Analytics won't exist if we're working on this locally
  world.analytics &&
    world.analytics.event(
      "Tutorial",
      "Finished Fog Owl Orientation",
      "Fog Owl",
      null,
      "/maps/fog_owl/default",
      "Fog Owl Default Map"
    );
}

module.exports = handleTutorial;
