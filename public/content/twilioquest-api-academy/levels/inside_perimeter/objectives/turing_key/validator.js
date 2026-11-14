module.exports = async (helper) => {
  const answer1 = helper.getNormalizedInput('answer1');
  const answer2 = helper.getNormalizedInput('answer2');
  const answer3 = helper.getNormalizedInput('answer3');

  if (answer1 === '' || answer2 === '' || answer3 === '') {
    return helper.fail(`
      Please answer all of the challenge questions!
    `);
  }

  // if (!answer1.includes('message') && !answer1.includes('media') && !answer1.includes('service')) {
  //   return helper.fail(`
  //     The first answer is incorrect.
  //   `);
  // }

  if (answer1 !== 'software development kit') {
    return helper.fail(`
      The correct answer to the first challenge question is Software Development Kit.
    `);
  }

  if (answer2 !== 'b') {
    return helper.fail(`
      The second challenge question is incorrect, Twilio does offer a server-side helper library for users of that programming language.
    `);
  }

  if (answer3 !== 'true') {
    return helper.fail(`
      The third challenge question is ncorrect, libraries do make working with APIs easier by handling common and repetitive low-level interactions with the server.
    `);
  }



  // if (!answer2 || answer2 !== 'body') {
  //   return helper.fail(`
  //     The second answer is incorrect.
  //   `);
  // }

  return helper.success(`
    You've got it! You've received your House Turing Key Spell Component!
  `);
};
