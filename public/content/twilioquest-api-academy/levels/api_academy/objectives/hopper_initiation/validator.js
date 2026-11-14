module.exports = async (helper) => {
  const answer1 = helper.getNormalizedInput('answer1');
  const answer2 = helper.getNormalizedInput('answer2');

  if (answer1 === '' || answer2 === '') {
    return helper.fail(`
      Please answer both questions!
    `);
  }

  if (answer1 !== 'false') {
    return helper.fail(`
      The first answer is incorrect - remote APIs make use of computational
      resources and code that may reside on other computers (servers) on a
      network.
    `);
  }

  if (!answer2 || answer2 !== 'rest') {
    return helper.fail(`
      The second answer is incorrect - the expanded version of the acronym we 
      are looking for is "Respresentational State Transfer". Check Craig's 
      video one more time for the four-letter acronym.
    `);
  }

  return helper.success(`
    You've got it! You've opened the chest of knowledge for House Hopper.
  `);
};
