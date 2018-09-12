'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _async = require('async');

var _async2 = _interopRequireDefault(_async);

var _request = require('request');

var _request2 = _interopRequireDefault(_request);

var _url = require('url');

var _url2 = _interopRequireDefault(_url);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _robotsTxtParser = require('robots-txt-parser');

var _robotsTxtParser2 = _interopRequireDefault(_robotsTxtParser);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var robots = (0, _robotsTxtParser2.default)({
    userAgent: 'Googlebot',
    allowOnNeutral: false
});

var Crawler = function () {
    _createClass(Crawler, [{
        key: 'runTime',
        get: function get() {
            return Math.floor(Date.now() / 1000 - this.startTime);
        }
    }, {
        key: 'timeLimit',
        get: function get() {
            return this._timeLimit;
        },
        set: function set(minutes) {
            this._timeLimit = minutes * 1000 * 60;
        }
    }]);

    function Crawler(startUrl) {
        _classCallCheck(this, Crawler);

        this.startTime = null;
        this.startUrl = null;
        this.outputFile = null;
        this.asyncLimit = 30;
        this.depthLimit = 3;
        this.restTime = 100;
        this.timeout = 5000;
        this.debug = false;
        this.linkQueue = [];
        this.hosts = {};
        this.isRunning = true;
        this.counter = {
            hosts: 0,
            paths: 0
        };

        this.startUrl = startUrl;
    }

    _createClass(Crawler, [{
        key: 'start',
        value: function start() {
            this.startTime = Date.now() / 1000;
            this.addToQueue(this.startUrl);
            this._startBatchLoop();

            if (this.timeLimit) {
                setTimeout(this.stop.bind(this), this.timeLimit);
            }
        }
    }, {
        key: 'stop',
        value: function stop() {
            this._dprint('Ran for:', this.runTime, "seconds");
            this.isRunning = false;

            if (this.outputFile) {
                Crawler.outputResults(this.outputFile, this.hosts);
            }

            this.onComplete(this.hosts);
        }
    }, {
        key: 'onComplete',
        value: function onComplete() {
            this._dprint('Completed search but no callback found.');
        }
    }, {
        key: 'addToQueue',
        value: function addToQueue(uri) {
            var link = Crawler.parseUrl(uri);

            if (!this.hosts.hasOwnProperty(link.host)) {
                this.counter.hosts++;
                this.hosts[link.host] = {
                    protocol: link.protocol,
                    depthCount: 0,
                    crawledPaths: []
                };
            }

            if (this.hosts[link.host].depthCount < this.depthLimit && this.hosts[link.host].crawledPaths.indexOf(link.path) === -1) {
                this.linkQueue.push(link);
                this.hosts[link.host].depthCount++;
                this.counter.paths++;
            }
        }
    }, {
        key: '_startBatchLoop',
        value: function _startBatchLoop() {
            var _this = this;

            var batchStartTime = Date.now();

            var batchComplete = function batchComplete() {
                var runTime = Math.floor(Date.now() - batchStartTime);
                _this._dprint('Hosts:', _this.counter.hosts, 'Paths:', _this.counter.paths, 'Queue:', _this.linkQueue.length, 'Took', runTime + 'ms');

                if (_this.isRunning && _this.linkQueue.length > 0) {
                    batchStartTime = Date.now();
                    setTimeout(_this._processBatch.bind(_this, batchComplete), _this.restTime);
                }
            };

            this._processBatch(batchComplete);
        }
    }, {
        key: '_processBatch',
        value: function _processBatch(callback) {
            var _this2 = this;

            var batch = this._getUsableBatch();

            _async2.default.eachLimit(batch, this.asyncLimit, async function (link) {
                await robots.useRobotsFor(link.protocol + '//' + link.host).then(Crawler.fetchPageLinks.bind(_this2, link, _this2.timeout)).then(_this2._queuePageLinks.bind(_this2)).catch(function (reason) {
                    _this2.dprint('Error with link:', link.full, 'Reason:', reason);
                });
            }, callback);
        }
    }, {
        key: '_queuePageLinks',
        value: function _queuePageLinks(links) {
            var _this3 = this;

            return new Promise(function (resolve, reject) {
                if (links) {
                    links.map(function (link) {
                        _this3.addToQueue(link);
                    });
                }

                resolve();
            });
        }
    }, {
        key: '_getUsableBatch',
        value: function _getUsableBatch() {
            var _this4 = this;

            if (this.linkQueue.length >= this.asyncLimit) {
                var queue = this.linkQueue.slice(0, this.asyncLimit);
                this.linkQueue = this.linkQueue.slice(this.asyncLimit);
            } else {
                var queue = this.linkQueue;
                this.linkQueue = [];
            }

            queue.map(function (value, index) {
                if (_this4.hosts[value.host].crawledPaths.indexOf(value.path) === -1) {
                    _this4.hosts[value.host].crawledPaths.push(value.path);
                }
            });

            return queue;
        }
    }, {
        key: '_dprint',
        value: function _dprint() {
            if (this.debug == true) {
                console.log(Array.prototype.slice.call(arguments));
            }
        }
    }], [{
        key: 'fetchPageLinks',
        value: function fetchPageLinks(uri, timeout) {
            return new Promise(function (resolve, reject) {
                if (!robots.canCrawlSync(uri.full)) {
                    return reject(Crawler.errors.NOCRAWL);
                }

                (0, _request2.default)({ uri: uri.full, timeout: timeout }, function (error, response, body) {
                    if (error) {
                        return reject(error);
                    }

                    var links = Crawler.pullLinks(body);

                    resolve(links);
                });
            });
        }
    }, {
        key: 'outputResults',
        value: function outputResults(file, hosts) {
            _fs2.default.writeFileSync(file, JSON.stringify(hosts));
        }
    }, {
        key: 'pullLinks',
        value: function pullLinks(body) {
            return body.match(/(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig);
        }
    }, {
        key: 'parseUrl',
        value: function parseUrl(uri) {
            var link = _url2.default.parse(uri);

            if (link.host.slice(0, 4) == 'www.') {
                link.host = link.host.substr(4);
            }

            var path = (link.pathname || '') + (link.search || '') + (link.hash || '');

            return {
                protocol: link.protocol,
                path: path,
                host: link.host,
                full: link.protocol + '//' + link.host + path
            };
        }
    }]);

    return Crawler;
}();

Crawler.errors = {
    NOCRAWL: 'Denied by robots.txt'
};
exports.default = Crawler;