module.exports = function viewCourtyard(world) {
  world.disablePlayerMovement();

  world.forEachEntities("viewpoint_mainhall1", async (viewpoint) => {
    await world.tweenCameraToPosition(
      {
        x: viewpoint.startX,
        y: viewpoint.startY,
      },
      { duration: 5000 }
    );
    await world.wait(400);

    world.forEachEntities("viewpoint_mainhall2", async (viewpoint) => {
      await world.tweenCameraToPosition(
        {
          x: viewpoint.startX,
          y: viewpoint.startY,
        },
        { duration: 5000 }
      );
      await world.wait(400);

      await world.tweenCameraToPlayer({ duration: 5000 });

      world.enablePlayerMovement();
    });
  });
};
