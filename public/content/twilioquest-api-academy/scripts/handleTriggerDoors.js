/**
 * Gets the comma delimited keys specified in the "assignedDoors" property belonging to a Tiled object and returns them in an array
 * For example, "hello, world, foo, bar" would return ["hello", "world", "foo", "bar"]
 * @param {object} entity - A Tiled object
 * @returns An array of all the doors assigned to the specified Tiled object.
 */
function getEntityAssignedDoors(entity) {
  return entity.assignedDoors
    ? entity.assignedDoors
        .replace(/\s/g, "")
        .split(",")
        .filter((assignedDoor) => !!assignedDoor)
    : [];
}

function runDoorAction(world, assignedDoors, action) {
  world.forEachEntities(
    ({ instance }) => {
      return assignedDoors.some((doorKey) => instance.key === doorKey);
    },
    (door) => {
      console.log(`Opening door: ${door}`);
      door.state.fsm.action(action);
    }
  );
}

module.exports = function handleDoorControls(event, world, worldState) {
  if (
    event.name === "triggerAreaWasEntered" ||
    event.name === "triggerAreaWasExited"
  ) {
    const assignedDoors = getEntityAssignedDoors(event.target);
    const doorFSMAction =
      event.name === "triggerAreaWasEntered" ? "open" : "close";
    runDoorAction(world, assignedDoors, doorFSMAction);
  }
};
