module.exports = {
  works: true,
  fail: () => require('./does-not-exist'),
};
