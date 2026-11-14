exports.early = 'a-early';
const b = require('./b');
exports.bSawA = b.sawA;
exports.late = 'a-late';
