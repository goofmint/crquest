module.exports = async (helper) => {
  const answer1 = helper.getNormalizedInput('answer1');
  const answer2 = helper.getNormalizedInput('answer2');

  if (answer1 === '' || answer2 === '') {
    return helper.fail(`
      Please answer both questions!
    `);
  }

  if (answer1 !== 'http') {
    return helper.fail(`
      The first answer is incorrect - the acronym for this protocol is the first
      four letters you type into the address bar when you enter the URL for a
      website in your browser.
    `);
  }

  if (answer2.indexOf('header') < 0) {
    return helper.fail(`
      The second answer is incorrect - the name for these extra pieces of 
      information that go along with web requests is perhaps the opposite of 
      "footer".
    `);
  }

  return helper.success(`
    You've got it! You've opened the chest of knowledge for House Lovelace.
  `);
};
