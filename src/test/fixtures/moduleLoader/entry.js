const helper = require('./lib/helper');
const data = require('./lib/data.json');
const dirModule = require('./dir');
const pkgModule = require('./pkgdir');

module.exports = {
  helper,
  data,
  dirModule,
  pkgModule,
  filename: __filename,
  dirname: __dirname,
  thisIsExports: this === module.exports,
  exportsIsModuleExports: exports === module.exports,
};
