// The loader never searches node_modules, so the fixture package is required
// by relative path.
const foo = require('../../../node_modules/foo');

module.exports = (testString) => {
  return testString === foo;
};
