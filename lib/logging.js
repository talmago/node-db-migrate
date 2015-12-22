var fs = require('fs');
var log4js = require('log4js');
var path = require('path');

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
exports.getLogger = function(name, level) {
    var logger = log4js.getLogger(name);
    logger.setLevel(level || "INFO");
    return logger;
};