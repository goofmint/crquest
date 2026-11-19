module.exports = async function (helper) {
  try {
    const instructions = helper.getNormalizedInput("instructions");

    const validInstructions = ["up", "down", "left", "right"];
    const playerInstructions = instructions.split(" ");
    const correctInstructions = [
      "left",
      "left",
      "down",
      "down",
      "left",
      "left",
      "left",
      "left",
      "up",
      "up",
      "up",
    ];

    if (playerInstructions.length === 1 && playerInstructions[0] === "") {
      helper.fail(helper.t(
        "missingInstructions",
        "There do not seem to be any instructions here! They should be in a single string separated by spaces. Like this: 'left left left'."
      ));
      return;
    }

    if (
      playerInstructions.some(
        (instruction) => !validInstructions.includes(instruction)
      )
    ) {
      // Check if any player instruction is invalid
      helper.fail(helper.t(
        "invalidInstructions",
        "Not all of your instructions are valid! The only valid instructions are: {{instructions}}.",
        { instructions: validInstructions.join(" ") }
      ));
      return;
    }

    for (let i = 0; i < correctInstructions.length; i += 1) {
      if (playerInstructions[i] !== correctInstructions[i]) {
        const isFirstInstruction = i === 0;

        // This is an invalid instruction
        let message = helper.t(
          "didNotReachDoor",
          "Your instructions for Cedric did not get him to the temple door!"
        );

        if (isFirstInstruction) {
          message += helper.t(
            "wrongFirst",
            " The first instruction was wrong. It should be 'left', not '{{instruction}}'.",
            { instruction: playerInstructions[i] }
          );
        } else {
          message += helper.t(
            "firstCorrect",
            " Your first {{count}} instructions were correct. Here's what they were: '{{instructions}}'.",
            { count: i, instructions: playerInstructions.slice(0, i).join(" ") }
          );
        }

        helper.fail(message);
        return;
      }
    }
  } catch (err) {
    helper.fail(err);
    return;
  }

  helper.success(helper.t("success", "You did it!"));
};
