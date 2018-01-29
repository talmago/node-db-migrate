var _ = require('lodash');
var fs = require('fs');
var log4js = require('log4js');
var config = require('./config');

exports = module.exports = {};

log4js.configure({
    replaceConsole: false,
    appenders: [{ type: "console" }]
});

/**
 * Get a log4js logger instance.
 *
 * @param name: String, name.
 * @returns {Logger}
 */
exports.getLogger = function(name) {
    var logger = log4js.getLogger(name);
    logger.setLevel(_.get(config, "logging.level", "INFO"));
    return logger;
};
