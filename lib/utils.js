var _ = require('lodash');
var Promise = require('bluebird');
var fs = Promise.promisifyAll(require('fs'));
var path = require('path');
var util = require('util');
var logging = require('./logging');
var logger = logging.getLogger('Util');


/**
 * Get file extension.
 *
 * Examples
 * ----------
 * getFileExtension("hello.world") => ".world"
 * getFileExtension("hello.JSON") => ".json"
 *
 * @param filename: String
 * @returns: String
 */
function getFileExtension(filename) {
    return path.extname(filename).toLowerCase();
}


/**
 * Parse version.
 *
 * A version must have the following structure:
 * - One or more numeric parts.
 * - Separated by a dot (.) or an underscore (_).
 * - Underscores are replaced by dots at runtime.
 * - Leading zeroes are ignored in each part.
 *
 * Examples
 * ---------
 * parseVersion("1")    ---> "1"
 * parseVersion("001")  ---> "1"
 * parseVersion("5.2")  ---> "5.2"
 * parseVersion("5_2")  ---> "5.2"
 * parseVersion("1.2.3.4.5.6.7.8.9") --> "1.2.3.4.5.6.7.8.9"
 *
 * @param version: String.
 * @returns String.
 */

function parseVersion(version) {

    if (!version || !_.isString(version)) {
        throw new Error("Bad version: " + version);
    }

    if (version[0].toLowerCase() == "v") {
        version = version.slice(1);
    }

    version = version.replace(/\_/g, '.');

    if (/^\d?([\d\.]+)?\d$/.test(version) == false) {
        throw new Error(
            "Invalid version having a non-numeric value: " + version
        );
    }

    if (version.startsWith(".")) {
        throw new Error(
            "Invalid version starting with a dot (.) " +
            "instead of a digit or a letter: " + version
        );
    }

    while (version.startsWith("0")) {
        version = version.slice(1);
    }

    return version;
}

/**
 * Parse file name to extract details about the migration, such as its version and description.
 *
 * Examples
 * ------------

 parseScriptName("V01_1__My_Migration_Script.sql") -->

 {
    "script": 'V01_1__My_Migration_Script.sql',
    "path": '/path/to/lib/V01_1__My_Migration_Script.sql',
    "type": 'sql',
    "version": '1.1',
    "description": 'My Migration Script'
 }

 * @param migrationScript: String.
 * @returns: Object, see the example above.
 */

function parseFilename(migrationScript) {

    var raw, pos,
        basename,
        extension,
        version,
        description;

    basename = path.basename(migrationScript);
    extension = getFileExtension(basename);

    if ([".sql", ".js"].indexOf(extension) < 0) {
        throw new Error(
            "Invalid migration script type, file extension " +
            "was expected to be .sql / .js but got: " + extension
        );
    }

    pos = basename.indexOf("__");
    if (pos < 0) {
        raw = basename;
        description = "";
    } else {
        raw = basename.substr(0, pos);
        description = basename.substring(pos + 2, basename.length - extension.length).replace("_", " ");
    }

    version = parseVersion(raw);

    return {
        "script": basename,
        "path": path.resolve(migrationScript),
        "type": extension.slice(1),
        "version": version,
        "description": description
    };
}

/**
 * Discover migration scripts.
 *
 *
 * @param discoveryPath: String, path to directory.
 *                       `discover` will raise an error under the following circumstances:
 *                          - `discoveryPath` does not exist.
 *                          - `discoveryPath` is not a directory.
 *                          - `discoveryPath` has no privileges;
 *
 * @param baseVersion: Optional. If `baseVersion` was passed, the result
 *                     will include only migration scripts with version > `baseVersion`.
 *
 * @param targetVersion: Optional. If `targetVersion` was passed, the result
 *                       will include only migration scripts with version = `targetVersion`.
 *
 * @results: Array, sorted by version, each element will contain details regarding the migration script.
 */

function discovery(discoveryPath, baseVersion, targetVersion) {
    return fs.lstatAsync(discoveryPath)
        .then(function (stats) {
            return stats.isDirectory() ?
                fs.readdirAsync(discoveryPath) :
                Promise.reject(discoveryPath + ' is not a directory.');
        })
        .map(function (script) {
            return Promise.resolve(parseFilename(script))
                .then(function (migration) {
                    var version = _.get(migration, 'version', '');
                    if (baseVersion && version < baseVersion) {
                        throw new Error(util.format(
                            "migration version (%s) is lower " +
                            "then base version (%s).", version, baseVersion)
                        );
                    }
                    if (targetVersion && version != targetVersion) {
                        throw new Error(util.format(
                            "migration version (%s) is different " +
                            "from target version (%s).", version, targetVersion)
                        );
                    }
                    return migration;
                })
                .catch(function (e) {
                    logger.warn(e);
                    return Promise.resolve(null);
                });
        })
        .then(_.compact)
        .then(_.partialRight(_.sortBy, 'version'))
        .catch(function (e) {
            logger.error(e);
            throw new Error(
                "Destination path for discovery is either not a directory " +
                "or does not exist or has insufficient privileges: " + discoveryPath
            );
        });
}

module.exports = {
    parseVersion: parseVersion,
    discovery: discovery
};