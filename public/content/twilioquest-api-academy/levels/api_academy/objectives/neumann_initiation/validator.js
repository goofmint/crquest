module.exports = async (helper) => {
  const answer1 = helper.getNormalizedInput("answer1");
  const answer2 = helper.getNormalizedInput("answer2");

  if (answer1 === "" || answer2 === "") {
    return helper.fail(`
      Please answer both questions!
    `);
  }

  if (answer1 !== "resource") {
    return helper.fail(`
      The first answer is incorrect - the name for an object that you can
      access via HTTP in a RESTful API is the "R" in "URL".
    `);
  }

  if (answer2 !== "post") {
    return helper.fail(`
      The second answer is incorrect - Craig talks about mapping "CRUD" 
      operations (Create, Read, Update, and Delete) in his video - check the
      video out one more time to see which HTTP method is associated with 
      creation.
    `);
  }

  return helper.success(`
    You've got it! You've opened the chest of knowledge for House Lovelace.
  `);
};
