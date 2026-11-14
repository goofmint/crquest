function joinStringsWithOxfordComma(strings) {
  switch (strings.length) {
    case 0:
      return "";
    case 1:
      return strings[0];
    case 2:
      return `${strings[0]} and ${strings[1]}`;
    case 3:
    default:
      const stringsCopy = [...strings];
      const lastValue = stringsCopy.pop();

      return stringsCopy.join(", ") + `, and ${lastValue}`;
  }
}

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
      completedHouses.push("Hopper");
    }

    if (world.isObjectiveCompleted("neumann_initiation")) {
      world.showEntities("neumann_initiation_flame");
      completedHouses.push("Neumann");
    }

    if (world.isObjectiveCompleted("lovelace_initiation")) {
      world.showEntities("lovelace_initiation_flame");
      completedHouses.push("Lovelace");
    }

    if (world.isObjectiveCompleted("turing_initiation")) {
      world.showEntities("turing_initiation_flame");
      completedHouses.push("Turing");
    }

    if (
      worldState.initiation.lastShownHouseNotification !==
      completedHouses.length
    ) {
      // Default message if not all have been found
      let completedHousesNotification = `
        I have completed the initiation ceremonies for the ${
          completedHouses.length > 1 ? "houses" : "house"
        } <i>${joinStringsWithOxfordComma(completedHouses)}</i>. ${
        4 - completedHouses.length
      } more to go!
      `;

      // Initial message before any chests have been found
      if (completedHouses.length === 0) {
        completedHousesNotification = `I need to search for 4 chests in these woods to gain entrance to the API Academy!`;
      }

      if (completedHouses.length === 4) {
        // Victory message once all chests found
        completedHousesNotification = `I completed all the houses' ceremonies! I should head back to the castle gates now!`;
      }

      world.showNotification(completedHousesNotification);

      worldState.initiation.lastShownHouseNotification = completedHouses.length;
    }
  }
}

module.exports = processInitiationEvents;
