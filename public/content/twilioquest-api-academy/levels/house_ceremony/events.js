const merge = require("lodash.merge");
const handleTriggerDoors = require("../../scripts/handleTriggerDoors");
const { HOUSE_CEREMONY_STATE_KEY } = require("../../scripts/config");
const helperFunctions = require("../../scripts/helperFunctions");
const viewCourtyard = require("./events/viewCourtyard");

const INITIAL_STATE = {
  playerHouse: undefined,
  heapsortConversationHasEnded: false,
  houseLovelaceComplete: false,
  hasStartedInitialCourtyardTween: false,
  displayNames: {
    lovelace: "Lovelace",
    turing: "Turing",
    neumann: "von Neumann",
    hopper: "Hopper",
  },
};

module.exports = async function (event, world) {
  const worldState = merge(
    INITIAL_STATE,
    world.getState(HOUSE_CEREMONY_STATE_KEY)
  );

  handleTriggerDoors(event, world, worldState);
  const { applyFadeInTween } = helperFunctions(event, world, worldState);

  // Lovelace Tower not accessible until player has selected a house
  world.disableTransitionAreas("exit_to_lovelace_corridor");
  world.disableTransitionAreas("secret_library_door_exit");
  world.disableTransitionAreas("secret_library_door_anim_trigger");

  // If Heapsort convo has happened, triggers get disabled
  if (worldState.heapsortConversationHasEnded) {
    world.forEachEntities("triggerInterruptingHeapsort", (heapsortTrigger) => {
      heapsortTrigger.key = "";
    });
    world.showEntities(`heapsort-avatar`);
  }

  // Once the player has selected their house, the fire is no longer interactable; Lovelace tower opens;
  // the fires change color
  if (worldState.playerHouse) {
    world.forEachEntities("fire-convo", (fire) => {
      fire.isConversationDisabled = true;
      fire.interactable = false;
    });
    world.showEntities(`${worldState.playerHouse}-fire`);

    // Give avatar item based on chosen house
    world.grantItems([
      `academy_jacket_${worldState.playerHouse}`,
      "academy_pleated_skirt",
      "academy_slacks",
    ]);

    // When house-fire convo closes, pledge scroll fade animation is triggered - half second delay; should only play once and then be hidden again
    if (
      event.name === "conversationDidEnd" &&
      event.npc.conversation === "house-fire"
    ) {
      world.showEntities(`pledge-scroll`);
      world.forEachEntities(`pledge-scroll`, async (scroll) => {
        await applyFadeInTween(`pledge-scroll`, 500);
        await world.wait(1000);
        await scroll.playAnimation("idle");
        world.hideEntities(`pledge-scroll`);
      });
    }

    // Change Operator Observations on locked doors depending on progress
    world.enableTransitionAreas("exit_to_lovelace_corridor");
    if (
      event.name === "triggerAreaWasEntered" &&
      event.target.key === "lockedDoor" &&
      worldState.houseLovelaceComplete === false
    ) {
      world.showNotification(
        "Lovelace Tower is the first house in the House Gauntlet. I should find the House Lovelace corridor!"
      );
    }

    // After choosing the house and entering triggers, camera jumps to Heapsort and dialogue begins
    // Heapsort NPC becomes visible and interactable
    if (
      event.name === "triggerAreaWasEntered" &&
      event.target.key === "triggerInterruptingHeapsort"
    ) {
      world.showEntities(`heapsort-avatar`);
      world.forEachEntities("heapsort", async (heapsort) => {
        world.disablePlayerMovement();
        await world.tweenCameraToPosition({
          x: heapsort.startX,
          y: heapsort.startY,
        });
        world.startConversation("interrupting-heapsort", "professor1.png");
      });
    }

    // When the Heapsort dialogue ends, camera jumps back to player
    if (
      event.name === "conversationDidEnd" &&
      event.npc.conversation === "interrupting-heapsort"
    ) {
      world.tweenCameraToPlayer().then(() => {
        world.enablePlayerMovement();
        worldState.heapsortConversationHasEnded = true;
        world.updateQuestStatus(
          world.__internals.level.levelName,
          world.__internals.level.levelProperties.questTitle,
          "I should head to Lovelace Tower to start the House Gauntlet.",
          true
        );
      });
    }
  }

  if (
    event.name === "triggerAreaWasEntered" &&
    event.target.key === "triggerViewCourtyard" &&
    !worldState.hasStartedInitialCourtyardTween
  ) {
    worldState.hasStartedInitialCourtyardTween = true;
    viewCourtyard(world);
  }

  if (event.name === "playerDidInteract" && event.target.key === "telescope") {
    viewCourtyard(world);
  }

  if (world.isObjectiveCompleted("api-05-get-patch", "lovelace_tower")) {
    world.enableTransitionAreas("secret_library_door_exit");
  } else {
    world.destroyEntities("secret_library_door_anim_trigger");
  }

  world.setState(HOUSE_CEREMONY_STATE_KEY, worldState);
};
