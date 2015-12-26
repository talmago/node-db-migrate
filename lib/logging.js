var _ = require('lodash');
var fs = require('fs');
var log4js = require('log4js');
var config = require('./config');

exports = module.exports = {};

log4js.configure({
    replaceConsole: true,
    appenders: [{ type: "console" }]
});

/**
 * Get a log4js logger instance.
 *
 * @param name: String, name.
 * @param level: String ["INFO", "DEBUG", "ERROR", "WARN"]
 * @returns {Logger}
 */
exports.getLogger = function(name) {
    var logger = log4js.getLogger(name);
    logger.setLevel(_.get(config, "logging.level", "INFO"));
    logger.levels = log4js.levels;
    return logger;
};