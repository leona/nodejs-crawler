'use strict';

var _crawler = require('./crawler');

var _crawler2 = _interopRequireDefault(_crawler);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var crawler = new _crawler2.default('http://bbc.com');

crawler.debug = true;
crawler.timeLimit = 1;
crawler.depth = 3;
crawler.asyncLimit = 10;
crawler.outputFile = 'output.json';

crawler.onComplete = function (hosts) {
    console.log('Finished callback called');
};

crawler.start();