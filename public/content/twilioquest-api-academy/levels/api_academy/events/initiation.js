function processInitiationEvents(event, world, worldState) {
  if (event.name === "mapDidLoad" && event.mapName === "maze") {
    worldState.enteredMazeFirstTime = true;
  }

  // If we've not entered the maze yet, we shouldn't start processing
  // initiation events.
  if (!worldState.enteredMazeFirstTime) {
    return;
  }

  if (
    event.name === "levelDidLoad" ||
    event.name === "mapDidLoad" ||
    event.name === "objectiveCompleted" ||
    event.name === "objectiveCompletedAgain"
  ) {
    const completedHouses = [];

    if (world.isObjectiveCompleted("hopper_initiation")) {
      world.showEntities("hopper_initiation_flame");
      completedHouses.push(world.t("hopper", "Hopper"));
    }

    if (world.isObjectiveCompleted("neumann_initiation")) {
      world.showEntities("neumann_initiation_flame");
      completedHouses.push(world.t("neumann", "Neumann"));
    }

    if (world.isObjectiveCompleted("lovelace_initiation")) {
      world.showEntities("lovelace_initiation_flame");
      completedHouses.push(world.t("lovelace", "Lovelace"));
    }

    if (world.isObjectiveCompleted("turing_initiation")) {
      world.showEntities("turing_initiation_flame");
      completedHouses.push(world.t("turing", "Turing"));
    }

    if (
      worldState.initiation.lastShownHouseNotification !==
      completedHouses.length
    ) {
      let completedHousesNotification;
      if (completedHouses.length === 0) {
        completedHousesNotification = world.t(
          "findChests",
          "I need to search for 4 chests in these woods to gain entrance to the API Academy!"
        );
      } else if (completedHouses.length === 4) {
        completedHousesNotification = world.t(
          "allCeremoniesCompleted",
          "I completed all the houses' ceremonies! I should head back to the castle gates now!"
        );
      } else {
        const houses = new Intl.ListFormat(world.getLanguage()).format(completedHouses);
        const remaining = 4 - completedHouses.length;
        completedHousesNotification = completedHouses.length === 1
          ? world.t(
              "oneCeremonyCompleted",
              "I have completed the initiation ceremonies for the house <i>{{houses}}</i>. {{remaining}} more to go!",
              { houses, remaining }
            )
          : world.t(
              "multipleCeremoniesCompleted",
              "I have completed the initiation ceremonies for the houses <i>{{houses}}</i>. {{remaining}} more to go!",
              { houses, remaining }
            );
      }

      world.showNotification(completedHousesNotification);

      worldState.initiation.lastShownHouseNotification = completedHouses.length;
    }
  }
}

module.exports = processInitiationEvents;
