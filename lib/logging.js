var fs = require('fs');
var log4js = require('log4js');
var path = require('path');

exports = module.exports = {};

log4js.configure({
    replaceConsole: true,
    appenders: [{ type: "console" }]
});

exports.getLogger = function(name, level) {
    var logger = exports.logger = log4js.getLogger(name);
    logger.setLevel(level || "INFO");
    return logger;
};