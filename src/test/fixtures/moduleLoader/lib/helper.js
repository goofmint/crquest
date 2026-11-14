const path = require('path');
const nested = require('./nested');

module.exports = {
  name: 'helper',
  nested,
  joined: path.join('a', 'b'),
  parentDir: require('../dir/index').marker,
};
