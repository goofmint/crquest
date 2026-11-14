module.exports = async (helper) => {
  const answer1 = helper.getNormalizedInput('answer1');
  const answer2 = helper.getNormalizedInput('answer2');

  if (!answer1 || !answer2) {
    return helper.fail('Please provide an answer to both questions!');
  }

  if (answer1 !== 'interface') {
    return helper.fail('The first answer is incorrect.');
  }

  if (answer2.indexOf('touppercase') !== 0) {
    return helper.fail(`
      The second answer is incorrect - In JavaScript, a function is invoked by 
      using the "." operator after a
      variable that references an object, and then is invoked with an open 
      and closed parentheses "()". Objects provide an API through these kinds
      of functions. What is the name of the API function used in the example,
      which translates the string to all uppercase characters?
    `);
  }

  return helper.success(`
    You've got it! You've opened the chest of knowledge for House Turing.
  `);
};
